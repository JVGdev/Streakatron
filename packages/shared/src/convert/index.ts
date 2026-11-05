// Turn any entry into another (D44): a task, commitment, goal or event becomes one of the others,
// and a note (D46) becomes any of them.
// The server makes a new entry from what maps across and soft-deletes the old one; the dialog shows
// the same plan first ("Carries over" / "Stays behind"). Pure: no ids, no I/O.

import { monthEnd, nextOccurrence, type DatePrecision, type Repeat } from '../calendar';
import type { CommitmentMeasure, CommitmentPeriod, CommitmentSchedule } from '../commitments';
import { ruleOf, type TaskRepeat } from '../repeats';
import type { GoalKind, GoalPeriod } from '../structure';
import type { DateString } from '../time';

export const CONVERT_KINDS = ['task', 'commitment', 'goal', 'event'] as const;
export type ConvertKind = (typeof CONVERT_KINDS)[number];

export const CONVERT_LABELS: Record<ConvertKind, string> = {
  task: 'Task',
  commitment: 'Commitment',
  goal: 'Goal',
  event: 'Event',
};

interface Common {
  title: string;
  projectId: string | null;
  spotlighted: boolean;
}

export type ConvertSource =
  | (Common & {
      kind: 'task';
      dueDate: DateString | null;
      scheduledDate: DateString | null;
      repeat: TaskRepeat | null;
      reminder: boolean;
      subtasks: number;
      goal: boolean;
      effort: boolean;
    })
  | (Omit<Common, 'spotlighted'> & {
      kind: 'commitment';
      spotlighted?: false;
      measure: CommitmentMeasure;
      target: number;
      unit: string | null;
      period: CommitmentPeriod;
      schedule: CommitmentSchedule | null;
      reminder: boolean;
    })
  | (Common & {
      kind: 'goal';
      goalKind: GoalKind;
      targetMinutes: number | null;
      period: GoalPeriod | null;
      dueDate: DateString | null;
      duePrecision: 'day' | 'month';
    })
  | (Common & {
      kind: 'event';
      date: DateString | null;
      precision: DatePrecision;
      startTime: string | null;
      repeat: Repeat | null;
      reminder: boolean;
    })
  /** A post-it (D46): its first line is the title, the rest the notes. Only ever a source. */
  | (Omit<Common, 'spotlighted'> & { kind: 'note'; spotlighted?: false });

export type ConvertFields =
  | {
      kind: 'task';
      dueDate: DateString | null;
      scheduledDate: DateString | null;
      repeat: TaskRepeat | null;
      spotlight: boolean;
    }
  | {
      kind: 'commitment';
      measure: CommitmentMeasure;
      target: number;
      unit: string | null;
      period: CommitmentPeriod;
      schedule: CommitmentSchedule | null;
    }
  | {
      kind: 'goal';
      goalKind: GoalKind;
      targetMinutes: number | null;
      period: GoalPeriod | null;
      dueDate: DateString | null;
      duePrecision: 'day' | 'month';
      spotlight: boolean;
    }
  | {
      kind: 'event';
      date: DateString | null;
      precision: DatePrecision;
      repeat: Repeat | null;
      spotlight: boolean;
    };

export interface ConvertPlan {
  fields: ConvertFields;
  /** What carries over, in words ("Title and notes", "Every week on Fri"). */
  kept: string[];
  /** What stays with the old entry (back on undo). */
  dropped: string[];
  /** A goal needs a project and the source has none: the dialog asks for one. */
  needsProject: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A calendar repeat as a commitment's days, when it is one: every day, or weekly on weekdays. */
export function scheduleOfRepeat(r: Repeat): CommitmentSchedule | null | undefined {
  if (r.until) return undefined;
  if (r.every === 'day' && r.interval === 1) return null;
  if (r.every === 'week' && r.interval === 1 && r.weekdays?.length) {
    return r.weekdays.length === 7 ? null : { days: [...r.weekdays] };
  }
  return undefined;
}

/** A day commitment's days as a calendar repeat. */
export function repeatOfSchedule(s: CommitmentSchedule | null): Repeat {
  if (!s || s.days.length === 7) return { every: 'day', interval: 1, until: null };
  return { every: 'week', interval: 1, weekdays: [...s.days].sort((a, b) => a - b), until: null };
}

const daysWord = (s: CommitmentSchedule | null) =>
  !s || s.days.length === 7
    ? 'Every day'
    : `On ${[...s.days]
        .sort((a, b) => a - b)
        .map((d) => WEEKDAYS[d])
        .join(', ')}`;

/** The day a dated source is on, for a task or goal (a month is due at its end). */
function dayOfSource(s: ConvertSource, today: DateString) {
  if (s.kind === 'task') return s.dueDate ?? s.scheduledDate;
  if (s.kind === 'goal') {
    if (!s.dueDate) return null;
    return s.duePrecision === 'month' ? monthEnd(s.dueDate) : s.dueDate;
  }
  if (s.kind === 'event') {
    if (!s.date || s.precision === 'tbd') return null;
    if (s.precision === 'month') return monthEnd(s.date);
    return s.repeat ? (nextOccurrence(s.date, s.repeat, today) ?? s.date) : s.date;
  }
  return null;
}

/** The repeat a source has, as a calendar rule (a task's "after done" has none). */
function ruleOfSource(s: ConvertSource): Repeat | null {
  if (s.kind === 'task') return s.repeat?.kind === 'schedule' ? ruleOf(s.repeat) : null;
  if (s.kind === 'event') return s.repeat;
  if (s.kind === 'commitment' && s.period === 'day') return repeatOfSchedule(s.schedule);
  return null;
}

/** How an entry becomes `to`, on `today`. Converting into its own kind is not a conversion. */
export function convertPlan(s: ConvertSource, to: ConvertKind, today: DateString): ConvertPlan {
  if (s.kind === to) throw new Error(`Already a ${to}`);
  const kept = [s.kind === 'note' ? 'First line as title, the rest as notes' : 'Title and notes'];
  const dropped: string[] = [];
  if (s.projectId) kept.push('Project');
  const spotlight = s.spotlighted === true && to !== 'commitment';
  if (s.spotlighted) (spotlight ? kept : dropped).push('Spotlight');

  // What only the source has.
  if (s.kind === 'task') {
    if (s.subtasks) dropped.push(s.subtasks === 1 ? '1 subtask' : `${s.subtasks} subtasks`);
    if (s.goal) dropped.push('Its goal');
    if (s.effort) dropped.push('Effort');
  }
  if (s.kind === 'commitment') dropped.push('History and streak');
  if (s.kind === 'event' && s.startTime) dropped.push('Time');
  if ('reminder' in s && s.reminder) dropped.push('Reminder');

  const rule = ruleOfSource(s);
  const day = dayOfSource(s, today);
  const needsProject = to === 'goal' && !s.projectId;

  const note = (what: string, ok: boolean) => (ok ? kept : dropped).push(what);

  switch (to) {
    case 'task': {
      let repeat: TaskRepeat | null = null;
      if (s.kind === 'task') repeat = s.repeat;
      else if (rule) repeat = { kind: 'schedule', ...rule };
      if (s.kind === 'commitment') {
        note('Days', s.period === 'day');
        if (s.measure !== 'check') dropped.push('Target');
      } else if (s.kind === 'event') {
        if (s.repeat) note('Repeat', true);
      } else if (s.kind === 'goal' && s.goalKind !== 'outcome') dropped.push('Target');
      if (day) kept.push(s.kind === 'goal' ? 'Deadline as due date' : 'Date');
      return {
        fields: { kind: 'task', dueDate: day, scheduledDate: null, repeat, spotlight },
        kept,
        dropped,
        needsProject,
      };
    }

    case 'commitment': {
      let measure: CommitmentMeasure = 'check';
      let target = 1;
      let period: CommitmentPeriod = 'day';
      let schedule: CommitmentSchedule | null = null;
      if (s.kind === 'goal' && s.goalKind === 'time' && s.targetMinutes && s.period) {
        measure = 'minutes';
        period = 'week';
        target =
          s.period === 'week' ? s.targetMinutes : Math.max(1, Math.round(s.targetMinutes / 4));
        kept.push(`${target} min a week`);
      } else if (s.kind === 'goal') {
        if (s.goalKind !== 'outcome') dropped.push('Target');
        if (s.dueDate) dropped.push('Deadline');
      } else {
        const asDays = rule ? scheduleOfRepeat(rule) : null;
        if (rule && asDays === undefined) dropped.push('Repeat');
        schedule = asDays ?? null;
        if (rule && asDays !== undefined) kept.push(daysWord(schedule));
        if (s.kind === 'task' && s.repeat?.kind === 'after_done') dropped.push('Repeat');
        if (day && !rule) dropped.push('Date');
      }
      return {
        fields: { kind: 'commitment', measure, target, unit: null, period, schedule },
        kept,
        dropped,
        needsProject,
      };
    }

    case 'goal': {
      let goalKind: GoalKind = 'outcome';
      let targetMinutes: number | null = null;
      let period: GoalPeriod | null = null;
      let dueDate: DateString | null = null;
      let duePrecision: 'day' | 'month' = 'day';
      if (s.kind === 'commitment' && s.measure === 'minutes') {
        goalKind = 'time';
        period = 'week';
        const days = s.period === 'week' ? 1 : (s.schedule?.days.length ?? 7);
        targetMinutes = s.target * days;
        kept.push(`${targetMinutes} min a week`);
      } else if (s.kind === 'commitment') {
        dropped.push(s.period === 'day' ? 'Days' : 'Target');
      } else if (s.kind === 'event' && s.precision === 'month' && s.date) {
        dueDate = s.date;
        duePrecision = 'month';
        kept.push('Month as deadline');
      } else if (day) {
        dueDate = day;
        kept.push('Date as deadline');
      }
      if (rule && s.kind !== 'commitment') dropped.push('Repeat');
      if (s.kind === 'task' && s.repeat?.kind === 'after_done') dropped.push('Repeat');
      return {
        fields: { kind: 'goal', goalKind, targetMinutes, period, dueDate, duePrecision, spotlight },
        kept,
        dropped,
        needsProject,
      };
    }

    case 'event': {
      let date: DateString | null = day;
      let precision: DatePrecision = day ? 'day' : 'tbd';
      let repeat: Repeat | null = null;
      if (s.kind === 'goal' && s.dueDate && s.duePrecision === 'month') {
        date = s.dueDate;
        precision = 'month';
      }
      if (rule) {
        repeat = rule;
        // A commitment has no date: the repeat starts today.
        if (!date) {
          date = nextOccurrence(today, rule, today) ?? today;
          precision = 'day';
        }
        kept.push(s.kind === 'commitment' ? daysWord(s.schedule) : 'Repeat');
      }
      if (s.kind === 'task' && s.repeat?.kind === 'after_done') dropped.push('Repeat');
      if (s.kind === 'commitment' && s.period === 'week') dropped.push('Target');
      else if (s.kind === 'commitment' && s.measure !== 'check') dropped.push('Target');
      if (s.kind === 'goal' && s.goalKind !== 'outcome') dropped.push('Target');
      if (date && s.kind !== 'commitment') kept.push(precision === 'month' ? 'Month' : 'Date');
      return {
        fields: { kind: 'event', date, precision, repeat, spotlight },
        kept,
        dropped,
        needsProject,
      };
    }
  }
}
