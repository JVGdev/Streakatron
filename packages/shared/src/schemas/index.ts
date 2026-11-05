// Zod schemas shared by the server (validation) and the web app (forms, types).

import { z } from 'zod';
import { isId, type IdKind } from '../ids';
import { LINKABLE_KINDS, linkableKind, MAX_RICH_BYTES, type RichDoc } from '../rich';
import {
  COLORS,
  COLUMN_CATEGORIES,
  EFFORTS,
  GOAL_KINDS,
  GOAL_PERIODS,
  GOAL_STATUSES,
  ICONS,
  PROJECT_STATUSES,
  type GoalKind,
  type GoalPeriod,
} from '../structure';
import { isDateString, isValidTimeZone } from '../time';
import { FOCUS_LIMITS } from '../focus';
import { RESTABLE_QUEST_TYPES } from '../quests';
import {
  COMMITMENT_LIMITS,
  COMMITMENT_MEASURES,
  COMMITMENT_PERIODS,
  commitmentShapeProblem,
  normalizeSchedule,
} from '../commitments';
import {
  CLOCK_RE,
  DEFAULT_NOTIFICATION_SETTINGS,
  REMINDER_LIMITS,
  reminderProblem,
  type CommitmentReminder,
} from '../reminders';
import {
  DATE_PRECISIONS,
  EVENT_LIMITS,
  EVENT_REMINDER_MAX,
  REPEAT_LIMITS,
  REPEAT_UNITS,
  repeatProblem,
  type DatePrecision,
  type Repeat,
} from '../calendar';
import { AFTER_DONE_LIMITS, AFTER_DONE_UNITS } from '../repeats';
import { CONVERT_KINDS } from '../convert';

export const dateString = z.string().refine(isDateString, 'Expected a YYYY-MM-DD day');

export const timeZone = z.string().refine(isValidTimeZone, 'Unknown time zone');

/** An id of one kind, e.g. `idOf('task')` accepts `tsk_…` only. */
export const idOf = (kind: IdKind) =>
  z.string().refine((s) => isId(s, kind), `Expected a ${kind} id`);

// --- Errors ----------------------------------------------------------------------------------

/** Every failed API response has this body, so the client can show one clear message. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

// --- Setup (the first account) ---------------------------------------------------------------

export const setupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: z.email('Enter a valid email').max(254),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  timezone: timeZone,
});
export type SetupInput = z.infer<typeof setupSchema>;

// --- User settings ---------------------------------------------------------------------------

export const focusPresetSchema = z.object({
  focusMinutes: z.int().min(FOCUS_LIMITS.plannedMinutes.min).max(FOCUS_LIMITS.plannedMinutes.max),
  breakMinutes: z.int().min(FOCUS_LIMITS.breakMinutes.min).max(FOCUS_LIMITS.breakMinutes.max),
});
export type FocusPreset = z.infer<typeof focusPresetSchema>;

export const questSettingsSchema = z.object({
  /** Quest types turned off by the user (every type but comeback can rest). */
  restingTypes: z.array(z.enum(RESTABLE_QUEST_TYPES)).max(RESTABLE_QUEST_TYPES.length),
  timeQuestMinMinutes: z.int().min(5).max(600),
  timeQuestMaxMinutes: z.int().min(5).max(600),
});

// --- Reminders (D38) -------------------------------------------------------------------------

export const clockTime = z.string().regex(CLOCK_RE, 'Expected a time, HH:MM');

export const commitmentReminderSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('once'), at: clockTime }),
    z.object({
      kind: z.literal('repeat'),
      from: clockTime,
      everyMinutes: z
        .int()
        .min(REMINDER_LIMITS.everyMinutes.min)
        .max(REMINDER_LIMITS.everyMinutes.max),
      until: clockTime,
    }),
  ])
  .superRefine((r, ctx) => {
    const problem = reminderProblem(r as CommitmentReminder);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

export const notificationSettingsSchema = z.object({
  focusEnded: z.boolean(),
  streakNudgeAt: clockTime.nullable(),
});

/** A browser's push subscription (`PushSubscription.toJSON()`); the server names the device. */
export const pushSubscribeSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscribeInput = z.input<typeof pushSubscribeSchema>;

/** "Snooze 1 h" on a task's or a commitment's reminder. */
export const snoozeSchema = z.object({
  id: z
    .string()
    .refine((s) => isId(s, 'task') || isId(s, 'commitment'), 'Expected a task or commitment id'),
});

export const userSettingsSchema = z.object({
  timezone: timeZone,
  dayStartHour: z.int().min(0).max(23),
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: z.int().min(0).max(6),
  activeProjectLimit: z.int().min(1).max(20),
  weeklyActiveDayTarget: z.int().min(1).max(7),
  focusPresets: z.array(focusPresetSchema).min(1).max(6),
  questSettings: questSettingsSchema,
  notifications: notificationSettingsSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  timezone: 'UTC',
  dayStartHour: 4,
  weekStart: 1,
  activeProjectLimit: 3,
  weeklyActiveDayTarget: 4,
  focusPresets: [
    { focusMinutes: 25, breakMinutes: 5 },
    { focusMinutes: 50, breakMinutes: 10 },
  ],
  questSettings: { restingTypes: [], timeQuestMinMinutes: 15, timeQuestMaxMinutes: 180 },
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

// --- Structure: areas, projects, columns, goals, tasks --------------------------------------

export const title = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(200, 'Keep it under 200 characters');

const isNode = (v: unknown): v is { type: string } =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

/** A TipTap document (checked loosely: the editor owns its shape), or null for empty. */
export const richDoc = z
  .custom<RichDoc>(
    (v) =>
      isNode(v) &&
      v.type === 'doc' &&
      ((v as RichDoc).content === undefined ||
        (Array.isArray((v as RichDoc).content) && (v as RichDoc).content!.every(isNode))),
    'Expected a rich-text document',
  )
  .refine((d) => JSON.stringify(d).length <= MAX_RICH_BYTES, 'That text is too long');

const description = richDoc.nullable();
const color = z.enum(COLORS);
const icon = z.enum(ICONS);
const optionalDay = dateString.nullable();

export const reorderSchema = z.object({ ids: z.array(z.string()).max(1000) });
export type ReorderInput = z.infer<typeof reorderSchema>;

export const areaCreateSchema = z.object({
  title,
  description: description.optional(),
  color: color.optional(),
  icon: icon.optional(),
});
export type AreaCreate = z.infer<typeof areaCreateSchema>;

export const areaPatchSchema = z
  .object({ title, description, color, icon, archived: z.boolean() })
  .partial();
export type AreaPatch = z.infer<typeof areaPatchSchema>;

export const areaDeleteQuerySchema = z.object({
  /** What happens to the area's projects: moved out of it (kept), or deleted with it. */
  projects: z.enum(['keep', 'delete']).default('keep'),
});

export const projectCreateSchema = z.object({
  title,
  areaId: idOf('area').nullable().optional(),
  /** New projects start active, or parked; activating still respects the active limit. */
  status: z.enum(['active', 'parked']).default('active'),
  /** Required (D32): outside the active limit. */
  required: z.boolean().optional(),
  description: description.optional(),
  color: color.optional(),
  icon: icon.optional(),
  startDate: optionalDay.optional(),
  dueDate: optionalDay.optional(),
});
export type ProjectCreate = z.input<typeof projectCreateSchema>;

export const projectPatchSchema = z
  .object({
    title,
    areaId: idOf('area').nullable(),
    description,
    color,
    icon,
    startDate: optionalDay,
    dueDate: optionalDay,
    /** Pin a task as the next action, or null to go back to the automatic one. */
    nextActionTaskId: idOf('task').nullable(),
    /** Turning it off on an active project needs room under the limit. */
    required: z.boolean(),
  })
  .partial();
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

export const projectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  /** Park this active project in the same step, to make room under the limit. */
  park: idOf('project').optional(),
});
export type ProjectStatusInput = z.infer<typeof projectStatusSchema>;

export const columnCreateSchema = z.object({
  title: title.max(60),
  category: z.enum(COLUMN_CATEGORIES),
});
export type ColumnCreate = z.infer<typeof columnCreateSchema>;

export const columnPatchSchema = columnCreateSchema.partial();
export type ColumnPatch = z.infer<typeof columnPatchSchema>;

export const columnDeleteQuerySchema = z.object({
  /** Where the column's tasks go; by default the leftmost other column of the same category. */
  moveTo: idOf('boardColumn').optional(),
});

/** Feature a task or goal on Today (D33), or take it off; `replace` makes room when it's full. */
export const spotlightSchema = z.object({
  id: z.union([idOf('task'), idOf('goal'), idOf('event')]),
  on: z.boolean(),
  replace: z.union([idOf('task'), idOf('goal'), idOf('event')]).optional(),
});
export type SpotlightInput = z.infer<typeof spotlightSchema>;

const goalFields = {
  title,
  description,
  kind: z.enum(GOAL_KINDS),
  /** Time goals: minutes of focus per period. */
  targetMinutes: z.int().min(5).max(10_000).nullable(),
  period: z.enum(GOAL_PERIODS).nullable(),
  /** Outcome goals: an optional deadline. */
  dueDate: optionalDay,
  /** A deadline can be a month ("~July 2027", stored as its first day) until it's known (D32). */
  duePrecision: z.enum(['day', 'month']),
};

/** A time goal needs a target and a period; an outcome goal has neither. */
export const goalShapeProblem = (g: {
  kind: GoalKind;
  targetMinutes: number | null;
  period: GoalPeriod | null;
}) =>
  g.kind === 'time' && (g.targetMinutes == null || g.period == null)
    ? 'A time goal needs a target and a period'
    : null;

export const goalCreateSchema = z
  .object({
    projectId: idOf('project'),
    ...goalFields,
    description: description.optional(),
    targetMinutes: goalFields.targetMinutes.optional().default(null),
    period: goalFields.period.optional().default(null),
    dueDate: optionalDay.optional(),
    duePrecision: goalFields.duePrecision.optional(),
  })
  .superRefine((g, ctx) => {
    const problem = goalShapeProblem(g);
    if (problem) ctx.addIssue({ code: 'custom', path: ['targetMinutes'], message: problem });
  });
export type GoalCreate = z.input<typeof goalCreateSchema>;

export const goalPatchSchema = z.object({ ...goalFields, status: z.enum(GOAL_STATUSES) }).partial();
export type GoalPatch = z.infer<typeof goalPatchSchema>;

export const repeatSchema = z.object({
  every: z.enum(REPEAT_UNITS),
  interval: z.int().min(REPEAT_LIMITS.interval.min).max(REPEAT_LIMITS.interval.max),
  weekdays: z.array(z.int().min(0).max(6)).max(7).optional(),
  until: optionalDay.optional(),
});

/** A task's repeat (D43): on a schedule (the calendar's rule) or some time after it's done. */
export const taskRepeatSchema = z.discriminatedUnion('kind', [
  repeatSchema.extend({ kind: z.literal('schedule') }),
  z.object({
    kind: z.literal('after_done'),
    every: z.enum(AFTER_DONE_UNITS),
    interval: z.int().min(AFTER_DONE_LIMITS.interval.min).max(AFTER_DONE_LIMITS.interval.max),
  }),
]);

const taskFields = {
  title,
  description,
  effort: z.enum(EFFORTS).nullable(),
  dueDate: optionalDay,
  scheduledDate: optionalDay,
  /** null: the inbox. */
  projectId: idOf('project').nullable(),
  goalId: idOf('goal').nullable(),
  /** A reminder at this instant (D32); null: none. */
  remindAt: z.iso.datetime({ offset: true }).nullable(),
  /** Repeats (D43); null: doesn't (on an occurrence: stops the series). */
  repeat: taskRepeatSchema.nullable(),
};

export const taskCreateSchema = z.object({
  ...taskFields,
  description: description.optional(),
  effort: taskFields.effort.optional(),
  dueDate: optionalDay.optional(),
  scheduledDate: optionalDay.optional(),
  projectId: taskFields.projectId.optional(),
  goalId: taskFields.goalId.optional(),
  remindAt: taskFields.remindAt.optional(),
  repeat: taskFields.repeat.optional(),
  /** A subtask (one level): it joins its parent's project. */
  parentTaskId: idOf('task').optional(),
  /** Board column; by default the project's leftmost open column. */
  columnId: idOf('boardColumn').optional(),
  /** Where in its column or list it goes. */
  position: z.enum(['top', 'bottom']).default('bottom'),
});
export type TaskCreate = z.input<typeof taskCreateSchema>;

export const taskPatchSchema = z.object(taskFields).partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const taskMoveSchema = z.object({
  columnId: idOf('boardColumn'),
  index: z.int().min(0),
});
export type TaskMove = z.infer<typeof taskMoveSchema>;

export const taskListQuerySchema = z.object({
  /** A project id, `inbox`, or every task when left out. */
  project: z.union([idOf('project'), z.literal('inbox')]).optional(),
  status: z.enum(['open', 'done', 'any']).default('any'),
  /** Subtasks of this task. Without it, lists hold top-level tasks only. */
  parent: idOf('task').optional(),
});
export type TaskListQuery = z.input<typeof taskListQuerySchema>;

/** A comma-separated query value as a list (`?ids=a,b`), empty items dropped. */
// --- Commitments (D31) ------------------------------------------------------------------------

const commitmentSchedule = z.object({ days: z.array(z.int().min(0).max(6)).min(1).max(7) });

const commitmentFields = {
  title,
  description,
  /** null: no project. */
  projectId: idOf('project').nullable(),
  measure: z.enum(COMMITMENT_MEASURES),
  target: z.int().min(1).max(COMMITMENT_LIMITS.minutes.week),
  /** Amounts only: "cards", "pages". */
  unit: z.string().trim().max(COMMITMENT_LIMITS.unitLength).nullable(),
  period: z.enum(COMMITMENT_PERIODS),
  /** Day commitments: the weekdays; null (or all seven) is every day. */
  schedule: commitmentSchedule.nullable(),
  /** null: no reminder (D31, D38). */
  reminder: commitmentReminderSchema.nullable(),
};

export const commitmentCreateSchema = z
  .object({
    ...commitmentFields,
    description: description.optional(),
    projectId: commitmentFields.projectId.optional(),
    measure: commitmentFields.measure.default('check'),
    target: commitmentFields.target.default(1),
    unit: commitmentFields.unit.optional(),
    period: commitmentFields.period.default('day'),
    schedule: commitmentFields.schedule.optional(),
    reminder: commitmentFields.reminder.optional(),
  })
  .superRefine((c, ctx) => {
    // Checked as it will be stored: a daily check's target is 1, a week has no weekdays.
    const problem = commitmentShapeProblem({
      ...c,
      target: c.measure === 'check' && c.period === 'day' ? 1 : c.target,
      schedule: normalizeSchedule(c.period, c.schedule),
    });
    if (problem) ctx.addIssue({ code: 'custom', path: ['target'], message: problem });
  });
export type CommitmentCreate = z.input<typeof commitmentCreateSchema>;

export const commitmentPatchSchema = z
  .object({ ...commitmentFields, archived: z.boolean() })
  .partial();
export type CommitmentPatch = z.infer<typeof commitmentPatchSchema>;

/** Log on a commitment, today: a check (amount ignored), +N, or minutes. */
export const entryCreateSchema = z.object({
  amount: z.int().min(1).max(COMMITMENT_LIMITS.count.max).default(1),
  /** The focus session it came from (its finish card's "Mark done" / "+1"). */
  focusSessionId: idOf('focusSession').optional(),
});
export type EntryCreate = z.input<typeof entryCreateSchema>;

export const commitmentListQuerySchema = z.object({
  /** Archived ones too (the commitments page's "Archived" list). */
  archived: z.enum(['true', 'false']).default('false'),
});

const commaList = z
  .string()
  .max(5000)
  .transform((s) => s.split(',').filter(Boolean));

export const searchQuerySchema = z.object({
  /** Empty: recently changed open things. */
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Only these kinds (`task,goal`). */
  types: commaList.pipe(z.array(z.enum(LINKABLE_KINDS)).max(LINKABLE_KINDS.length)).optional(),
});

// --- Links (D4) -------------------------------------------------------------------------------

/** Any id a mention can point to. */
export const linkableId = z.string().refine((s) => linkableKind(s) !== null, 'Expected an id');

/** Mention chips ask for many ids at once. */
export const MAX_RESOLVE_IDS = 100;

export const resolveQuerySchema = z.object({
  ids: commaList.pipe(z.array(linkableId).min(1).max(MAX_RESOLVE_IDS)),
});

export const settingsPatchSchema = userSettingsSchema
  .pick({
    activeProjectLimit: true,
    timezone: true,
    dayStartHour: true,
    weekStart: true,
    weeklyActiveDayTarget: true,
    focusPresets: true,
    questSettings: true,
    notifications: true,
  })
  .partial()
  .refine(
    (v) =>
      !v.questSettings ||
      v.questSettings.timeQuestMinMinutes <= v.questSettings.timeQuestMaxMinutes,
    {
      message: 'The shortest time quest can’t be longer than the longest',
      path: ['questSettings'],
    },
  );

/** The time zone can change once this often, so days can't be farmed by hopping zones (D17). */
export const TIMEZONE_CHANGE_DAYS = 7;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

// --- Focus sessions --------------------------------------------------------------------------

/**
 * Start a session, on a task or a commitment (its project comes along), a project, or nothing.
 */
export const focusStartSchema = focusPresetSchema
  .extend({
    taskId: idOf('task').optional(),
    projectId: idOf('project').optional(),
    commitmentId: idOf('commitment').optional(),
  })
  .refine(
    (v) => [v.taskId, v.projectId, v.commitmentId].filter(Boolean).length <= 1,
    'Attach one thing: a task, a project or a commitment',
  );
export type FocusStart = z.infer<typeof focusStartSchema>;

/** After a session: its one-line note. */
export const focusPatchSchema = z.object({
  note: z.string().trim().max(FOCUS_LIMITS.noteLength).nullable(),
});
export type FocusPatch = z.infer<typeof focusPatchSchema>;

// --- Stats -----------------------------------------------------------------------------------

/** A span of the user's days (at most about 400). */
export const heatmapQuerySchema = z
  .object({ from: dateString.optional(), to: dateString.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'from must not be after to')
  .refine(
    (v) => !v.from || !v.to || (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 400,
    'At most 400 days at a time',
  );
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;

// --- Calendar events (D39) -------------------------------------------------------------------

/** What's wrong with an event's dates, time, repeat and reminder together, or null. */
export function eventShapeProblem(e: {
  date: string | null;
  precision: DatePrecision;
  startTime: string | null;
  durationMinutes: number | null;
  repeat: Repeat | null;
  reminderMinutes: number | null;
}): string | null {
  if (e.precision === 'tbd') {
    if (e.date) return 'A date to be decided has no day yet.';
  } else if (!e.date) return 'Pick a day.';
  if (e.precision !== 'day' && (e.startTime || e.repeat || e.reminderMinutes !== null)) {
    return 'Times, repeats and reminders need a day.';
  }
  if (e.durationMinutes !== null && !e.startTime) return 'A length needs a start time.';
  if (e.repeat && e.date) return repeatProblem(e.repeat, e.date);
  return null;
}

const eventFields = {
  title,
  description,
  /** null: no project. */
  projectId: idOf('project').nullable(),
  /** The day (or the month's first day, for a month); null when it's to be decided. */
  date: optionalDay,
  precision: z.enum(DATE_PRECISIONS),
  /** null: all day. */
  startTime: clockTime.nullable(),
  durationMinutes: z
    .int()
    .min(EVENT_LIMITS.durationMinutes.min)
    .max(EVENT_LIMITS.durationMinutes.max)
    .nullable(),
  repeat: repeatSchema.nullable(),
  /** Minutes before the start (all-day events: before 09:00 that day); null: none. */
  reminderMinutes: z.int().min(0).max(EVENT_REMINDER_MAX).nullable(),
};

export const eventCreateSchema = z
  .object({
    ...eventFields,
    description: description.optional(),
    projectId: eventFields.projectId.optional().default(null),
    precision: eventFields.precision.default('day'),
    date: optionalDay.default(null),
    startTime: eventFields.startTime.default(null),
    durationMinutes: eventFields.durationMinutes.default(null),
    repeat: eventFields.repeat.default(null),
    reminderMinutes: eventFields.reminderMinutes.default(null),
  })
  .superRefine((e, ctx) => {
    const problem = eventShapeProblem(e as Parameters<typeof eventShapeProblem>[0]);
    if (problem) ctx.addIssue({ code: 'custom', path: ['date'], message: problem });
  });
export type EventCreate = z.input<typeof eventCreateSchema>;

export const eventPatchSchema = z.object(eventFields).partial();
export type EventPatch = z.infer<typeof eventPatchSchema>;

export const eventListQuerySchema = z.object({ project: idOf('project') });

/** The calendar between two days (both included), at most a few months. */
export const calendarQuerySchema = z
  .object({ from: dateString, to: dateString })
  .refine((q) => q.from <= q.to, 'from comes before to')
  .refine(
    (q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 100,
    'At most 100 days at a time',
  );
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

// --- Turn into (D44) -------------------------------------------------------------------------

const convertibleId = z
  .string()
  .refine(
    (s) => isId(s, 'task') || isId(s, 'commitment') || isId(s, 'goal') || isId(s, 'event'),
    'Expected a task, commitment, goal or event id',
  );

/** Turn an entry into another kind; a goal needs a project (`projectId`) when the entry has none. */
export const convertSchema = z.object({
  id: convertibleId,
  to: z.enum(CONVERT_KINDS),
  projectId: idOf('project').optional(),
});
export type ConvertInput = z.infer<typeof convertSchema>;

/** Undo a conversion: the new entry goes, the old one comes back. */
export const convertUndoSchema = z.object({ from: convertibleId, to: convertibleId });
