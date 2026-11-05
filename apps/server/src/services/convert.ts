// Turn any entry into another (D44): a task, commitment, goal or event becomes one of the others,
// and a note (D46) becomes any of them (counted as sorting it).
// One transaction: the new entry is made from what maps across (`convertPlan`), the old one is
// soft-deleted, and `@` mentions of it point at the new one. Undo takes the new one away for good
// and brings the old one back, mentions included. XP already earned stays (D15).

import {
  convertPlan,
  type ConvertKind,
  type ConvertPlan,
  type ConvertSource,
} from '@streakatron/shared/convert';
import { splitNote } from '@streakatron/shared/notes';
import type { TaskRepeat } from '@streakatron/shared/repeats';
import {
  linkableKind,
  replaceMentionId,
  textFromDoc,
  type RichDoc,
} from '@streakatron/shared/rich';
import type { ConvertInput } from '@streakatron/shared/schemas';
import { userDay } from '@streakatron/shared/time';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  areas,
  commitments,
  events,
  goals,
  links,
  notes,
  projects,
  taskSeries,
  tasks,
} from '../db/schema';
import { conflict, invalid, notFound, type Tx } from './common';
import { createCommitment } from './commitments';
import { createEvent } from './events';
import { daySettings } from './game';
import { createGoal } from './goals';
import { sortNote } from './notes';
import { ownedProject, unpinClosed } from './projects';
import { createTask } from './tasks';

/** What can be converted: the four kinds, and notes (only ever a source). */
type SourceKind = ConvertKind | 'note';
const kindOf = (id: string) => linkableKind(id) as SourceKind;

interface Loaded {
  source: ConvertSource;
  description: RichDoc | null;
  spotlightedAt: Date | null;
}

/** The open entry behind `id`, as the shared rules read it. */
async function load(tx: Tx, userId: string, id: string): Promise<Loaded> {
  const kind = kindOf(id);
  if (kind === 'task') {
    const [t] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .for('update');
    if (!t) throw notFound('task');
    if (t.parentTaskId) {
      throw invalid('not_convertible', 'Subtasks can’t be turned into something else.');
    }
    if (t.completedAt)
      throw invalid('not_convertible', 'Only open tasks can be turned into something else.');
    let repeat: TaskRepeat | null = null;
    if (t.seriesId) {
      const [s] = await tx
        .select({ repeat: taskSeries.repeat })
        .from(taskSeries)
        .where(and(eq(taskSeries.id, t.seriesId), isNull(taskSeries.stoppedAt)));
      repeat = s?.repeat ?? null;
    }
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, id), isNull(tasks.deletedAt)))) as [{ n: number }];
    return {
      description: t.description,
      spotlightedAt: t.spotlightedAt,
      source: {
        kind,
        title: t.title,
        projectId: t.projectId,
        spotlighted: t.spotlightedAt !== null,
        dueDate: t.dueDate,
        scheduledDate: t.scheduledDate,
        repeat,
        reminder: t.remindAt !== null,
        subtasks: n,
        goal: t.goalId !== null,
        effort: t.effort !== null,
      },
    };
  }
  if (kind === 'commitment') {
    const [c] = await tx
      .select()
      .from(commitments)
      .where(
        and(eq(commitments.id, id), eq(commitments.userId, userId), isNull(commitments.deletedAt)),
      )
      .for('update');
    if (!c) throw notFound('commitment');
    if (c.archivedAt) {
      throw invalid(
        'not_convertible',
        'Restore the commitment before turning it into something else.',
      );
    }
    return {
      description: c.description,
      spotlightedAt: null,
      source: {
        kind,
        title: c.title,
        projectId: c.projectId,
        measure: c.measure,
        target: c.target,
        unit: c.unit,
        period: c.period,
        schedule: c.schedule,
        reminder: c.reminder !== null,
      },
    };
  }
  if (kind === 'note') {
    const [n] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)))
      .for('update');
    if (!n) throw notFound('note');
    const { title, description } = splitNote(n.description);
    return {
      description,
      spotlightedAt: null,
      source: { kind, title, projectId: n.projectId },
    };
  }
  if (kind === 'goal') {
    const [g] = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId), isNull(goals.deletedAt)))
      .for('update');
    if (!g) throw notFound('goal');
    if (g.status !== 'open') {
      throw invalid('not_convertible', 'Only open goals can be turned into something else.');
    }
    return {
      description: g.description,
      spotlightedAt: g.spotlightedAt,
      source: {
        kind,
        title: g.title,
        projectId: g.projectId,
        spotlighted: g.spotlightedAt !== null,
        goalKind: g.kind,
        targetMinutes: g.targetMinutes,
        period: g.period,
        dueDate: g.dueDate,
        duePrecision: g.duePrecision,
      },
    };
  }
  const [e] = await tx
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.userId, userId), isNull(events.deletedAt)))
    .for('update');
  if (!e) throw notFound('event');
  return {
    description: e.description,
    spotlightedAt: e.spotlightedAt,
    source: {
      kind: 'event',
      title: e.title,
      projectId: e.projectId,
      spotlighted: e.spotlightedAt !== null,
      date: e.date,
      precision: e.precision,
      startTime: e.startTime,
      repeat: e.repeat,
      reminder: e.reminderMinutes !== null,
    },
  };
}

/** Make the new entry from the plan; returns its id. */
async function make(
  tx: Tx,
  userId: string,
  plan: ConvertPlan,
  title: string,
  description: RichDoc | null,
  projectId: string | null,
): Promise<string> {
  const f = plan.fields;
  switch (f.kind) {
    case 'task':
      return (
        await createTask(
          userId,
          {
            title,
            description,
            projectId,
            dueDate: f.dueDate,
            scheduledDate: f.scheduledDate,
            repeat: f.repeat ?? undefined,
          },
          tx,
        )
      ).id;
    case 'commitment':
      return (
        await createCommitment(
          userId,
          {
            title,
            description,
            projectId,
            measure: f.measure,
            target: f.target,
            unit: f.unit,
            period: f.period,
            schedule: f.schedule,
          },
          tx,
        )
      ).id;
    case 'goal':
      return (
        await createGoal(
          userId,
          {
            title,
            description,
            projectId: projectId!,
            kind: f.goalKind,
            targetMinutes: f.targetMinutes,
            period: f.period,
            dueDate: f.dueDate,
            duePrecision: f.duePrecision,
          },
          tx,
        )
      ).id;
    case 'event':
      return (
        await createEvent(
          userId,
          { title, description, projectId, date: f.date, precision: f.precision, repeat: f.repeat },
          tx,
        )
      ).id;
  }
}

const tableOf = {
  task: tasks,
  commitment: commitments,
  goal: goals,
  event: events,
  note: notes,
} as const;

/** Soft-delete (`at`) or bring back (`null`) an entry; a task takes its subtasks and series along. */
async function setDeleted(tx: Tx, id: string, at: Date | null) {
  const kind = kindOf(id);
  if (kind !== 'task') {
    const table = tableOf[kind];
    await tx.update(table).set({ deletedAt: at }).where(eq(table.id, id));
    return;
  }
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return;
  const was = task.deletedAt;
  await tx.update(tasks).set({ deletedAt: at }).where(eq(tasks.id, id));
  await tx
    .update(tasks)
    .set({ deletedAt: at })
    .where(
      and(
        eq(tasks.parentTaskId, id),
        at ? isNull(tasks.deletedAt) : eq(tasks.deletedAt, was ?? new Date(0)),
      ),
    );
  if (task.seriesId) {
    // Stopped at the same instant, so an undo knows it was this conversion that stopped it.
    await tx
      .update(taskSeries)
      .set({ stoppedAt: at })
      .where(
        and(
          eq(taskSeries.id, task.seriesId),
          at ? isNull(taskSeries.stoppedAt) : eq(taskSeries.stoppedAt, was ?? new Date(0)),
        ),
      );
  }
  await unpinClosed(tx, [task.projectId]);
}

const richTables = {
  area: areas,
  project: projects,
  goal: goals,
  task: tasks,
  commitment: commitments,
  event: events,
  note: notes,
} as const;

/** Every `@` mention of `from` (in descriptions and the links table) now points at `to`. */
async function moveMentions(tx: Tx, userId: string, from: string, to: string) {
  const sources = await tx
    .select({ sourceId: links.sourceId })
    .from(links)
    .where(and(eq(links.userId, userId), eq(links.targetId, from)));
  for (const { sourceId } of sources) {
    const kind = linkableKind(sourceId);
    if (!kind) continue;
    const table = richTables[kind];
    const [row] = await tx
      .select({ description: table.description })
      .from(table)
      .where(eq(table.id, sourceId));
    if (!row?.description) continue;
    const doc = replaceMentionId(row.description, from, to);
    await tx
      .update(table)
      .set({ description: doc, descriptionText: textFromDoc(doc) })
      .where(eq(table.id, sourceId));
  }
  // A source mentioning both keeps one link.
  await tx.execute(sql`
    delete from links l where l.user_id = ${userId} and l.target_id = ${from}
       and exists (select 1 from links k where k.source_id = l.source_id
                   and k.source_field = l.source_field and k.target_id = ${to})
  `);
  await tx
    .update(links)
    .set({ targetId: to })
    .where(and(eq(links.userId, userId), eq(links.targetId, from)));
}

export async function convertEntry(userId: string, input: ConvertInput) {
  return db.transaction(async (tx) => {
    const from = kindOf(input.id);
    if (from === input.to) throw invalid('same_kind', `It’s already a ${input.to}.`);
    const loaded = await load(tx, userId, input.id);
    const today = userDay(new Date(), await daySettings(tx, userId));
    const plan = convertPlan(loaded.source, input.to, today);

    const projectId = input.projectId ?? loaded.source.projectId;
    if (input.projectId) await ownedProject(tx, userId, input.projectId);
    if (input.to === 'goal' && !projectId) {
      throw invalid('needs_project', 'A goal belongs to a project. Pick one.');
    }

    const id = await make(tx, userId, plan, loaded.source.title, loaded.description, projectId);
    if ('spotlight' in plan.fields && plan.fields.spotlight && loaded.spotlightedAt) {
      const table = tableOf[input.to] as typeof tasks | typeof goals | typeof events;
      await tx.update(table).set({ spotlightedAt: loaded.spotlightedAt }).where(eq(table.id, id));
    }
    if (from === 'note') await sortNote(tx, userId, input.id);
    else await setDeleted(tx, input.id, new Date());
    await moveMentions(tx, userId, input.id, id);
    return {
      from: { kind: from, id: input.id },
      to: { kind: input.to, id },
      kept: plan.kept,
      dropped: plan.dropped,
    };
  });
}

/** How long after a conversion its undo is offered (the toast's lifetime, generously). */
const UNDO_WINDOW_MS = 10 * 60_000;

/** Undo a conversion: the new entry goes for good, the old one comes back with its mentions. */
export async function undoConvert(userId: string, input: { from: string; to: string }) {
  return db.transaction(async (tx) => {
    const fromKind = kindOf(input.from);
    const toKind = kindOf(input.to);
    const old = tableOf[fromKind];
    const made = tableOf[toKind];
    const [before] = await tx
      .select({ deletedAt: old.deletedAt })
      .from(old)
      .where(and(eq(old.id, input.from), eq(old.userId, userId)))
      .for('update');
    const [after] = await tx
      .select({ createdAt: made.createdAt, deletedAt: made.deletedAt })
      .from(made)
      .where(and(eq(made.id, input.to), eq(made.userId, userId)))
      .for('update');
    if (!before?.deletedAt || !after || after.deletedAt) {
      throw conflict('not_undoable', 'That can’t be undone anymore.');
    }
    if (Math.abs(after.createdAt.getTime() - before.deletedAt.getTime()) > UNDO_WINDOW_MS) {
      throw conflict('not_undoable', 'That can’t be undone anymore.');
    }
    await moveMentions(tx, userId, input.to, input.from);
    await tx.delete(links).where(eq(links.sourceId, input.to));
    if (toKind === 'task') {
      const subtasks = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.parentTaskId, input.to));
      if (subtasks.length) {
        await tx.delete(links).where(
          inArray(
            links.sourceId,
            subtasks.map((s) => s.id),
          ),
        );
      }
      const [t] = await tx
        .select({ seriesId: tasks.seriesId, projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, input.to));
      await tx.delete(tasks).where(eq(tasks.id, input.to));
      if (t?.seriesId) await tx.delete(taskSeries).where(eq(taskSeries.id, t.seriesId));
      await unpinClosed(tx, [t?.projectId ?? null]);
    } else {
      await tx.delete(made).where(eq(made.id, input.to));
    }
    await setDeleted(tx, input.from, null);
    return { id: input.from, kind: fromKind };
  });
}
