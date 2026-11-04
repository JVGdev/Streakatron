// The reminder job (D38): every minute, for each user with a device to notify, send what is due —
// commitment reminders (while the commitment is due today), task reminders (while the task is
// open), the end of a running focus session, and the opt-in "streak at risk" nudge. Each goes out
// once: `reminder_log` keeps a key per target and due instant, written before sending. Also
// "Snooze 1 h" from a notification.

import { isId } from '@streakatron/shared/ids';
import { plannedEndAt } from '@streakatron/shared/focus';
import {
  clockInstant,
  commitmentReminderDue,
  REMINDER_GRACE_MS,
  SNOOZE_MINUTES,
} from '@streakatron/shared/reminders';
import { userDay, userDayRange, type DateString } from '@streakatron/shared/time';
import { and, eq, gt, isNotNull, isNull, lt, lte } from 'drizzle-orm';
import { db } from '../db/client';
import {
  commitments,
  focusSessions,
  projects,
  pushSubscriptions,
  reminderLog,
  tasks,
  userSettings,
} from '../db/schema';
import { notFound } from './common';
import { todayCommitments } from './commitments';
import { daySettings, getGameState } from './game';
import { sendToUser, type PushMessage } from './push';

/** Claim a reminder: true the first time `key` is seen for the user (then send it). */
async function claim(userId: string, key: string) {
  const rows = await db
    .insert(reminderLog)
    .values({ userId, key })
    .onConflictDoNothing()
    .returning({ key: reminderLog.key });
  return rows.length > 0;
}

const keyOf = (id: string, at: Date) => `${id}@${at.toISOString()}`;

interface Due {
  key: string;
  message: PushMessage;
}

/** "2 of 20 cards today", "Not done yet today". */
function progressLine(
  c: { measure: string; unit: string | null; period: string },
  day: { progress: number; target: number },
) {
  const when = c.period === 'week' ? 'this week' : 'today';
  if (c.measure === 'check' && c.period === 'day') return `Not done yet ${when}.`;
  const unit = c.measure === 'minutes' ? 'min' : c.measure === 'count' ? (c.unit ?? '') : 'times';
  return `${day.progress} of ${day.target}${unit ? ` ${unit}` : ''} ${when}.`;
}

async function commitmentReminders(userId: string, now: Date, today: DateString) {
  const s = await daySettings(db, userId);
  const rows = await db
    .select({
      id: commitments.id,
      title: commitments.title,
      measure: commitments.measure,
      unit: commitments.unit,
      period: commitments.period,
      reminder: commitments.reminder,
      remindAgainAt: commitments.remindAgainAt,
    })
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, userId),
        isNotNull(commitments.reminder),
        isNull(commitments.archivedAt),
        isNull(commitments.deletedAt),
      ),
    );
  if (!rows.length) return [];
  // Due today: scheduled, not met, and in no project or an active one (a parked one rests).
  const states = new Map((await todayCommitments(db, userId, today)).map((d) => [d.id, d]));
  const out: Due[] = [];
  for (const c of rows) {
    const day = states.get(c.id);
    if (!day?.due) continue;
    const at = commitmentReminderDue(c, today, s, now);
    if (!at) continue;
    const actions: PushMessage['actions'] = [];
    if (c.measure === 'check') actions.push({ action: 'done', title: 'Done' });
    if (c.measure === 'count') actions.push({ action: 'plus1', title: '+1' });
    actions.push({ action: 'snooze', title: `Snooze ${SNOOZE_MINUTES / 60} h` });
    out.push({
      key: keyOf(c.id, at),
      message: {
        title: c.title,
        body: progressLine(c, day),
        tag: c.id,
        url: `/today?commitment=${c.id}`,
        target: { kind: 'commitment', id: c.id },
        actions,
      },
    });
  }
  return out;
}

async function taskReminders(userId: string, now: Date) {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      remindAt: tasks.remindAt,
      project: projects.title,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.userId, userId),
        lte(tasks.remindAt, now),
        gt(tasks.remindAt, new Date(now.getTime() - REMINDER_GRACE_MS.task)),
        isNull(tasks.completedAt),
        isNull(tasks.deletedAt),
      ),
    );
  return rows.map((t) => ({
    key: keyOf(t.id, t.remindAt!),
    message: {
      title: t.title,
      body: t.project ? `Reminder · ${t.project}` : 'Reminder',
      tag: t.id,
      url: `/today?task=${t.id}`,
      target: { kind: 'task' as const, id: t.id },
      actions: [
        { action: 'done' as const, title: 'Done' },
        { action: 'snooze' as const, title: `Snooze ${SNOOZE_MINUTES / 60} h` },
      ],
    } satisfies PushMessage,
  }));
}

async function focusEnded(userId: string, now: Date) {
  const rows = await db
    .select({
      id: focusSessions.id,
      startedAt: focusSessions.startedAt,
      pausedMs: focusSessions.pausedMs,
      pausedAt: focusSessions.pausedAt,
      endedAt: focusSessions.endedAt,
      plannedMinutes: focusSessions.plannedMinutes,
      task: tasks.title,
      commitment: commitments.title,
      project: projects.title,
    })
    .from(focusSessions)
    .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .leftJoin(commitments, eq(commitments.id, focusSessions.commitmentId))
    .leftJoin(projects, eq(projects.id, focusSessions.projectId))
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.status, 'running')));
  const out: Due[] = [];
  for (const f of rows) {
    const end = plannedEndAt(f);
    if (!end || end > now || now.getTime() - end.getTime() > REMINDER_GRACE_MS.focus) continue;
    const on = f.task ?? f.commitment ?? f.project;
    out.push({
      key: keyOf(f.id, end),
      message: {
        title: 'Focus session done',
        body: `${f.plannedMinutes} min${on ? ` on “${on}”` : ''}. Finish it, or keep going.`,
        // The same tag the open app's own notification uses, so the two never stack.
        tag: `focus-${f.id}`,
        url: '/focus',
      },
    });
  }
  return out;
}

async function streakNudge(userId: string, now: Date, today: DateString, nudgeAt: string | null) {
  if (!nudgeAt) return [];
  const s = await daySettings(db, userId);
  const at = clockInstant(today, nudgeAt, s);
  const { end } = userDayRange(today, s);
  if (at > now || now >= end || now.getTime() - at.getTime() > REMINDER_GRACE_MS.streak) return [];
  const { streak } = await getGameState(userId, now);
  if (streak.current < 1 || streak.todayActive) return [];
  return [
    {
      key: `streak@${today}`,
      message: {
        title: `Keep your ${streak.current}-day streak`,
        body: 'Nothing has counted today yet. One small thing keeps it going.',
        tag: 'streak',
        url: '/today',
      } satisfies PushMessage,
    },
  ];
}

/** Everything due for one user at `now`, as `{ key, message }`, not yet claimed. */
export async function dueFor(userId: string, now: Date): Promise<Due[]> {
  const [settings] = await db
    .select({
      timeZone: userSettings.timezone,
      dayStartHour: userSettings.dayStartHour,
      notifications: userSettings.notifications,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (!settings) return [];
  const today = userDay(now, settings);
  return [
    ...(await commitmentReminders(userId, now, today)),
    ...(await taskReminders(userId, now)),
    ...(settings.notifications.focusEnded ? await focusEnded(userId, now) : []),
    ...(await streakNudge(userId, now, today, settings.notifications.streakNudgeAt)),
  ];
}

/** The job: send what's due to everyone with a device. Returns how many reminders went out. */
export async function runReminders(now = new Date()) {
  const users = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);
  let sent = 0;
  for (const { userId } of users) {
    try {
      for (const { key, message } of await dueFor(userId, now)) {
        if (!(await claim(userId, key))) continue;
        // A reminder older than its grace is useless; the push service drops it after that.
        await sendToUser(userId, message, message.target ? 3600 : 600);
        sent++;
      }
    } catch (err) {
      console.error(`reminders: user ${userId} failed`, err);
    }
  }
  return sent;
}

/** Forget what was sent more than three days ago (keys are per instant, so older ones never recur). */
export async function pruneReminderLog(now = new Date()) {
  await db
    .delete(reminderLog)
    .where(lt(reminderLog.sentAt, new Date(now.getTime() - 3 * 86_400_000)));
}

/** "Snooze 1 h": a task's reminder moves an hour out; a commitment's next one comes in an hour. */
export async function snooze(userId: string, id: string, now = new Date()) {
  const until = new Date(now.getTime() + SNOOZE_MINUTES * 60_000);
  if (isId(id, 'task')) {
    const rows = await db
      .update(tasks)
      .set({ remindAt: until })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    if (!rows.length) throw notFound('task');
  } else {
    const rows = await db
      .update(commitments)
      .set({ remindAgainAt: until })
      .where(
        and(eq(commitments.id, id), eq(commitments.userId, userId), isNull(commitments.deletedAt)),
      )
      .returning({ id: commitments.id });
    if (!rows.length) throw notFound('commitment');
  }
  return { until };
}
