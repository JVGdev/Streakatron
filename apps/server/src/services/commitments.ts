// Commitments (D31, plan.md §4.6): routines with their own measure, target, period and schedule,
// filled by entries (a tick, +N, typed minutes, or a focus session on them). Each entry logs
// `commitment_logged`; the entry that reaches the target logs `commitment_met`, which earns its XP
// once per commitment per period (D15). The views carry where each one stands today and its streak,
// read by the shared rules from the entries summed per day.

import {
  COMMITMENT_LIMITS,
  commitmentDay,
  commitmentShapeProblem,
  commitmentStreak,
  normalizeSchedule,
  recentDays,
  type CommitmentRules,
  type DayTotals,
} from '@streakatron/shared/commitments';
import { commitmentPeriodKey } from '@streakatron/shared/game';
import { newId } from '@streakatron/shared/ids';
import type { CommitmentCreate, CommitmentPatch, EntryCreate } from '@streakatron/shared/schemas';
import { userDay, type DateString } from '@streakatron/shared/time';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { commitmentEntries, commitments, focusSessions, projects } from '../db/schema';
import {
  conflict,
  defined,
  edgeOrder,
  invalid,
  notFound,
  richColumns,
  type Conn,
  type Tx,
} from './common';
import { daySettings, logActivity } from './game';
import { writeLinks } from './links';
import { ownedProject } from './projects';

type CommitmentRow = typeof commitments.$inferSelect;
type Settings = Awaited<ReturnType<typeof daySettings>>;

/** Days of history the sheet shows. */
export const HISTORY_DAYS = 28;

const rules = (c: CommitmentRow): CommitmentRules => ({
  measure: c.measure,
  target: c.target,
  period: c.period,
  schedule: c.schedule,
});

// --- Reading ---------------------------------------------------------------------------------

/** Each commitment's entries summed per day. */
async function totalsFor(conn: Conn, ids: string[]) {
  const by = new Map<string, Map<DateString, number>>(ids.map((id) => [id, new Map()]));
  if (!ids.length) return by;
  const rows = await conn
    .select({
      commitmentId: commitmentEntries.commitmentId,
      day: commitmentEntries.localDate,
      amount: sql<number>`sum(${commitmentEntries.amount})::int`,
    })
    .from(commitmentEntries)
    .where(inArray(commitmentEntries.commitmentId, ids))
    .groupBy(commitmentEntries.commitmentId, commitmentEntries.localDate);
  for (const r of rows) by.get(r.commitmentId)!.set(r.day, r.amount);
  return by;
}

async function todaysEntries(conn: Conn, ids: string[], today: DateString) {
  if (!ids.length) return [];
  return conn
    .select({
      id: commitmentEntries.id,
      commitmentId: commitmentEntries.commitmentId,
      amount: commitmentEntries.amount,
      source: commitmentEntries.source,
      createdAt: commitmentEntries.createdAt,
    })
    .from(commitmentEntries)
    .where(
      and(inArray(commitmentEntries.commitmentId, ids), eq(commitmentEntries.localDate, today)),
    )
    .orderBy(asc(commitmentEntries.createdAt));
}

/** The view of each row: its fields, project, where it stands today, its streak, today's entries. */
async function viewsOf(conn: Conn, userId: string, rows: CommitmentRow[], s: Settings) {
  const today = userDay(new Date(), s);
  const ids = rows.map((r) => r.id);
  const totals = await totalsFor(conn, ids);
  const entries = await todaysEntries(conn, ids, today);
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((p): p is string => !!p))];
  const projectRows = projectIds.length
    ? await conn
        .select({
          id: projects.id,
          title: projects.title,
          color: projects.color,
          icon: projects.icon,
          status: projects.status,
        })
        .from(projects)
        .where(and(eq(projects.userId, userId), inArray(projects.id, projectIds)))
    : [];
  const projectOf = new Map(projectRows.map((p) => [p.id, p]));
  return rows.map((row) => {
    const { userId: _, deletedAt: __, description: ___, descriptionText: ____, ...c } = row;
    const t: DayTotals = totals.get(row.id) ?? new Map();
    return {
      ...c,
      project: row.projectId ? (projectOf.get(row.projectId) ?? null) : null,
      day: commitmentDay(rules(row), t, today, s.weekStart),
      streak: commitmentStreak(rules(row), t, today, userDay(row.createdAt, s), s.weekStart),
      entries: entries
        .filter((e) => e.commitmentId === row.id)
        .map(({ commitmentId: _c, ...e }) => e),
    };
  });
}

const live = (userId: string) => and(eq(commitments.userId, userId), isNull(commitments.deletedAt));

/** Every commitment (archived ones too when asked), in order, with today's state. */
export async function listCommitments(userId: string, { archived = false } = {}) {
  const s = await daySettings(db, userId);
  const rows = await db
    .select()
    .from(commitments)
    .where(and(live(userId), archived ? undefined : isNull(commitments.archivedAt)))
    .orderBy(asc(commitments.sortOrder), asc(commitments.createdAt));
  return viewsOf(db, userId, rows, s);
}
export type CommitmentView = Awaited<ReturnType<typeof listCommitments>>[number];

async function ownedCommitment(
  conn: Conn,
  userId: string,
  id: string,
  { deleted = false, lock = false } = {},
) {
  const q = conn
    .select()
    .from(commitments)
    .where(and(eq(commitments.id, id), eq(commitments.userId, userId)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row || (row.deletedAt !== null) !== deleted) throw notFound('commitment');
  return row;
}

/** One commitment, as the sheet shows it: the view, its description and the last 4 weeks. */
async function detail(conn: Conn, userId: string, id: string) {
  const s = await daySettings(conn, userId);
  const row = await ownedCommitment(conn, userId, id);
  const [view] = await viewsOf(conn, userId, [row], s);
  const totals = (await totalsFor(conn, [id])).get(id)!;
  return {
    ...view!,
    description: row.description,
    history: recentDays(
      rules(row),
      totals,
      userDay(new Date(), s),
      HISTORY_DAYS,
      userDay(row.createdAt, s),
    ),
  };
}

export const getCommitment = (userId: string, id: string) => detail(db, userId, id);
export type CommitmentDetail = Awaited<ReturnType<typeof getCommitment>>;

/**
 * Where each live commitment stands today, for quests: those of no project or an active one (a
 * parked project's commitments rest with it, like its tasks).
 */
export async function todayCommitments(tx: Tx, userId: string, today: DateString) {
  const s = await daySettings(tx, userId);
  const rows = await tx
    .select({ c: commitments })
    .from(commitments)
    .leftJoin(projects, eq(projects.id, commitments.projectId))
    .where(
      and(
        live(userId),
        isNull(commitments.archivedAt),
        sql`(${commitments.projectId} is null or ${projects.status} = 'active')`,
      ),
    );
  const totals = await totalsFor(
    tx,
    rows.map((r) => r.c.id),
  );
  return rows.map(({ c }) => ({
    id: c.id,
    ...commitmentDay(rules(c), totals.get(c.id)!, today, s.weekStart),
  }));
}

// --- Writing ---------------------------------------------------------------------------------

function checkedShape(c: CommitmentRules & { unit: string | null }) {
  const shaped = {
    ...c,
    unit: c.measure === 'count' ? c.unit?.trim() || null : null,
    target: c.measure === 'check' && c.period === 'day' ? 1 : c.target,
    schedule: normalizeSchedule(c.period, c.schedule),
  };
  const problem = commitmentShapeProblem(shaped);
  if (problem) throw invalid('invalid_commitment', problem);
  return shaped;
}

async function assertProject(conn: Conn, userId: string, projectId: string | null | undefined) {
  if (projectId) await ownedProject(conn, userId, projectId);
}

export async function createCommitment(userId: string, input: CommitmentCreate) {
  return db.transaction(async (tx) => {
    await assertProject(tx, userId, input.projectId);
    const shape = checkedShape({
      measure: input.measure ?? 'check',
      target: input.target ?? 1,
      unit: input.unit ?? null,
      period: input.period ?? 'day',
      schedule: input.schedule ?? null,
    });
    const id = newId('commitment');
    await tx.insert(commitments).values({
      id,
      userId,
      projectId: input.projectId ?? null,
      title: input.title,
      ...shape,
      sortOrder: await edgeOrder(tx, commitments, live(userId), 'bottom'),
      ...richColumns(input.description),
    });
    await writeLinks(tx, userId, id, input.description);
    return detail(tx, userId, id);
  });
}

export async function updateCommitment(userId: string, id: string, patch: CommitmentPatch) {
  return db.transaction(async (tx) => {
    const row = await ownedCommitment(tx, userId, id, { lock: true });
    const { description, archived, ...rest } = patch;
    if (rest.projectId !== undefined) await assertProject(tx, userId, rest.projectId);
    const next = { ...row, ...defined(rest) };
    const shape = checkedShape({
      measure: next.measure,
      target: next.target,
      unit: next.unit,
      period: next.period,
      schedule: next.schedule,
    });
    await tx
      .update(commitments)
      .set({
        ...defined(rest),
        ...shape,
        ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
        ...richColumns(description),
      })
      .where(eq(commitments.id, id));
    await writeLinks(tx, userId, id, description);
    return detail(tx, userId, id);
  });
}

/** Soft delete (undoable for 30 days); its entries stay with it. */
export async function deleteCommitment(userId: string, id: string) {
  await ownedCommitment(db, userId, id);
  const deletedAt = new Date();
  await db.update(commitments).set({ deletedAt }).where(eq(commitments.id, id));
  return { id, deletedAt };
}

export async function restoreCommitment(userId: string, id: string) {
  await ownedCommitment(db, userId, id, { deleted: true });
  await db
    .update(commitments)
    .set({ deletedAt: null })
    .where(and(eq(commitments.id, id), isNotNull(commitments.deletedAt)));
  return getCommitment(userId, id);
}

export interface NewEntry {
  amount: number;
  source: 'manual' | 'focus';
  focusSessionId?: string | null;
  /** When it happened (a focus session's end); it counts for the user's day then. */
  at: Date;
}

/**
 * Add an entry to a (locked) commitment, inside the caller's transaction, and log it: always
 * `commitment_logged`, and `commitment_met` when this entry reaches the period's target. A second
 * check on the same day, or a second entry from one focus session, adds nothing.
 */
export async function logEntry(tx: Tx, userId: string, c: CommitmentRow, entry: NewEntry) {
  const s = await daySettings(tx, userId);
  const localDate = userDay(entry.at, s);
  if (entry.focusSessionId) {
    const [already] = await tx
      .select({ id: commitmentEntries.id })
      .from(commitmentEntries)
      .where(eq(commitmentEntries.focusSessionId, entry.focusSessionId));
    if (already) return null;
  }
  const totals = new Map((await totalsFor(tx, [c.id])).get(c.id)!);
  if (c.measure === 'check' && (totals.get(localDate) ?? 0) > 0) return null;
  const amount = c.measure === 'check' ? 1 : entry.amount;
  if (c.measure === 'minutes' && amount > COMMITMENT_LIMITS.minutes.entry) {
    throw invalid('invalid_entry', 'One entry is at most a day (1440 minutes).');
  }
  const before = commitmentDay(rules(c), totals, localDate, s.weekStart);
  totals.set(localDate, (totals.get(localDate) ?? 0) + amount);
  const after = commitmentDay(rules(c), totals, localDate, s.weekStart);

  const id = newId('commitmentEntry');
  await tx.insert(commitmentEntries).values({
    id,
    userId,
    commitmentId: c.id,
    localDate,
    amount,
    source: entry.source,
    focusSessionId: entry.focusSessionId ?? null,
  });
  const payload = {
    commitmentId: c.id,
    projectId: c.projectId,
    period: c.period,
    measure: c.measure,
  };
  await logActivity(tx, userId, [
    {
      type: 'commitment_logged',
      entityId: id,
      payload: { ...payload, amount },
      occurredAt: entry.at,
    },
    ...(!before.met && after.met
      ? [
          {
            type: 'commitment_met' as const,
            entityId: commitmentPeriodKey(c.id, after.period.start),
            payload,
            occurredAt: entry.at,
          },
        ]
      : []),
  ]);
  return id;
}

/** Log on a commitment today, by hand or from a finished focus session's card. */
export async function addEntry(userId: string, id: string, input: EntryCreate) {
  return db.transaction(async (tx) => {
    const c = await ownedCommitment(tx, userId, id, { lock: true });
    if (c.archivedAt) {
      throw conflict('archived', 'This commitment is archived. Unarchive it to log on it.');
    }
    if (input.focusSessionId) {
      const [session] = await tx
        .select({ commitmentId: focusSessions.commitmentId, status: focusSessions.status })
        .from(focusSessions)
        .where(and(eq(focusSessions.id, input.focusSessionId), eq(focusSessions.userId, userId)));
      if (!session) throw notFound('focus session');
      if (session.commitmentId !== id || session.status !== 'completed') {
        throw invalid('invalid_entry', 'That session wasn’t a finished session on this one.');
      }
    }
    await logEntry(tx, userId, c, {
      amount: input.amount ?? 1,
      source: input.focusSessionId ? 'focus' : 'manual',
      focusSessionId: input.focusSessionId,
      at: new Date(),
    });
    return detail(tx, userId, id);
  });
}

/** Remove an entry (a mistaken +N, or unticking). XP already earned stays (D15). */
export async function deleteEntry(userId: string, id: string, entryId: string) {
  return db.transaction(async (tx) => {
    await ownedCommitment(tx, userId, id, { lock: true });
    const gone = await tx
      .delete(commitmentEntries)
      .where(
        and(
          eq(commitmentEntries.id, entryId),
          eq(commitmentEntries.commitmentId, id),
          eq(commitmentEntries.userId, userId),
        ),
      )
      .returning({ id: commitmentEntries.id });
    if (!gone.length) throw notFound('entry');
    return detail(tx, userId, id);
  });
}
