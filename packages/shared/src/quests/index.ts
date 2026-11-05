// Quests (plan.md §5, D10, D16, D30): a registry of types and templates, the rules that pick and
// size them, and what they say. Pure, so it's tested here; the server gathers the data
// (`BoardInput`), plans boards with `planDaily`/`planWeekly`/`planQuick`, stores the instances and
// evaluates them against what happens.

import { NOTES_CROWDED } from '../notes';
import type { DateString } from '../time';

// --- The registry ----------------------------------------------------------------------------

export const QUEST_TYPES = [
  'daily',
  'time',
  'quick',
  'make',
  'followup',
  'weekly',
  'review',
  'project',
  'comeback',
] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

/** Types that can rest (be turned off in Settings). Follow-ups come with make; comeback never rests. */
export const RESTABLE_QUEST_TYPES = [
  'daily',
  'time',
  'quick',
  'make',
  'weekly',
  'review',
  'project',
] as const satisfies readonly QuestType[];

export const QUEST_STATUSES = ['offered', 'completed', 'expired', 'rerolled', 'cancelled'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export const BOX_TIERS = ['small', 'standard', 'large'] as const;
export type BoxTier = (typeof BOX_TIERS)[number];

/** Every template, by type. A template is one kind of ask ("Finish your top Today item"). */
export const QUEST_TEMPLATES = {
  daily: [
    'top_item',
    'next_action',
    'stale_project',
    'tasks_n',
    'large_task',
    'focus_sessions',
    'commitments_due',
  ],
  time: ['focus_today'],
  quick: ['triage', 'pin_next', 'effort', 'focus_note', 'log_commitment', 'sort_notes'],
  make: ['add_task', 'add_goal', 'subtasks'],
  followup: ['task_details', 'goal_details'],
  weekly: ['week_target', 'week_projects', 'week_focus'],
  review: ['weekly_review', 'revisit_parked'],
  project: ['goal_tasks', 'time_goal', 'number_goal'],
  comeback: ['comeback'],
} as const satisfies Record<QuestType, readonly string[]>;
export type QuestTemplate = (typeof QUEST_TEMPLATES)[QuestType][number];

export const typeOfTemplate = (template: QuestTemplate): QuestType =>
  (Object.keys(QUEST_TEMPLATES) as QuestType[]).find((t) =>
    (QUEST_TEMPLATES[t] as readonly string[]).includes(template),
  )!;

/** Every quest number in one place. Tune after dogfooding. */
export const QUESTS = {
  daily: {
    perDay: 3,
    xp: {
      top_item: 30,
      next_action: 30,
      stale_project: 35,
      large_task: 40,
      focus_sessions: 30,
      commitments_due: 30,
    } as Record<string, number>,
    /** "Complete N tasks": N from your own days, within these. */
    tasks: { min: 2, max: 6, fallback: [2, 4] as const },
    focusSessions: 2,
  },
  /** A project with no activity this many days is one to get back to. */
  staleProjectDays: 3,
  time: {
    step: 5,
    fallback: [30, 60] as const,
  },
  weekly: {
    focus: { min: 60, max: 1200, step: 15, fallback: [120, 240] as const },
    xp: { week_target: 100, week_projects: 80 } as Record<string, number>,
  },
  quick: {
    visible: 2,
    rewardedPerDay: 3,
    xp: 10,
    /** "Sort N post-its", offered only while the board holds `NOTES_CROWDED` or more (D46). */
    sortNotes: 3,
  },
  make: {
    xp: 15,
    /** How full a project can get before make quests fade: `open / cap` (soft cap, D16). */
    caps: { add_task: 15, add_goal: 3, subtasks: 15 } as Record<string, number>,
    /** No make quest while this many follow-ups wait. */
    maxPendingFollowups: 3,
    /** Subtasks to break a task into. */
    subtasks: 2,
  },
  followup: { xp: 15, parts: 2 },
  comeback: { xp: 50, afterInactiveDays: 2, onlyAfterIdleDays: 7 },
  /** Review quests (D45): the weekly review, and a parked project to decide on. */
  review: { xp: { weekly_review: 60, revisit_parked: 50 } as Record<string, number> },
  /** Project quests (D45): one a week, from an open goal in an active project. */
  project: {
    /** "Finish N tasks of goal X": at most this many. */
    tasks: 3,
    /** A time goal's quest asks this share of its week. */
    timeShare: 0.5,
    xp: { time_goal: 60, number_goal: 60 } as Record<string, number>,
  },
  bonusXp: 25,
  /** Sizing from your own days: this many recent days, at least this many of them. */
  history: { days: 28, least: 3 },
  tier: {
    daily: 'standard',
    time: 'standard',
    quick: 'small',
    make: 'standard',
    followup: 'small',
    weekly: 'large',
    review: 'large',
    project: 'large',
    comeback: 'standard',
  } satisfies Record<QuestType, BoxTier>,
  /** Completions of these types take the screen (D30); the rest show in the toast. */
  big: ['daily', 'time', 'weekly', 'review', 'project', 'comeback'] as readonly QuestType[],
  /** Types that can be rerolled (once per quest per day). */
  rerollable: ['daily', 'time', 'quick', 'make', 'weekly', 'project'] as readonly QuestType[],
} as const;

// --- Picking and sizing (Quire's rules, plan.md §11) -----------------------------------------

/**
 * How likely something is to be picked: what it needs, made likelier each day it waits (since it
 * was last offered or worked on). The wait grows without end, so nothing is left out forever.
 */
export function questWeight(need: number, daysWaiting: number): number {
  const w = 1 + Math.max(0, daysWaiting) / 7;
  return Math.max(0.01, need) * w * w;
}

/** Pick one at random, the heavier the likelier. */
export function pickWeighted<T>(
  items: readonly { item: T; weight: number }[],
  rand = Math.random,
): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (!items.length || total <= 0) return null;
  let r = rand() * total;
  for (const x of items) {
    r -= Math.max(0, x.weight);
    if (r < 0) return x.item;
  }
  return items[items.length - 1]!.item;
}

export const median = (values: readonly number[]): number => {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
};

export interface SizeRule {
  min: number;
  max: number;
  step: number;
  /** With too little history: a random step in this range (still within min…max). */
  fallback: readonly [number, number];
}

/**
 * A target sized from your own days: their median, give or take a fifth, in steps, between min and
 * max. With fewer than `history.least` days (of values above 0), a random step in the fallback.
 */
export function sizeFromDays(
  recent: readonly number[],
  rule: SizeRule,
  rand = Math.random,
): number {
  const clamp = (n: number) => Math.max(rule.min, Math.min(rule.max, n));
  const days = recent.filter((n) => n > 0);
  if (days.length >= QUESTS.history.least) {
    const n = Math.round((median(days) * (0.8 + 0.4 * rand())) / rule.step) * rule.step;
    return clamp(Math.max(rule.step, n));
  }
  const lo = clamp(rule.fallback[0]);
  const hi = clamp(rule.fallback[1]);
  const steps = Math.max(0, Math.floor((hi - lo) / rule.step));
  return lo + rule.step * Math.floor(rand() * (steps + 1));
}

/** A daily time quest's XP: 30 for short ones up to 80 for long ones. */
export const timeQuestXp = (minutes: number) =>
  Math.max(30, Math.min(80, Math.round(minutes / 2 / 5) * 5 + 15));

/** A weekly time quest's XP: 60 up to 100. */
export const weeklyFocusXp = (minutes: number) =>
  Math.max(60, Math.min(100, Math.round(minutes / 12 / 5) * 5 + 40));

/** "Finish N tasks of goal X this week": 50 for one, 10 more for each other. */
export const goalTasksXp = (n: number) => 50 + 10 * Math.max(0, n - 1);

/** "Complete N tasks today": XP grows with N. */
export const tasksQuestXp = (n: number) => Math.min(40, 15 + 5 * n);

/**
 * The soft cap on make quests (D16): the weight shrinks as the project fills up and as made things
 * wait for details. `open` = open tasks (or goals) there, `undetailed` = pending follow-ups.
 */
export function makeWeight(open: number, cap: number, undetailed: number): number {
  return (1 / (1 + (open / cap) ** 2)) * (1 / (1 + 2 * undetailed));
}

/** Past the hard ceiling, no make quest at all. */
export const makeAllowed = (open: number, cap: number, pendingFollowups: number) =>
  pendingFollowups < QUESTS.make.maxPendingFollowups && open < 2 * cap;

// --- Follow-ups ------------------------------------------------------------------------------

export const TASK_PARTS = ['description', 'effort', 'date', 'goal', 'subtasks'] as const;
export const GOAL_PARTS = ['description', 'due', 'task'] as const;
export type DetailPart = (typeof TASK_PARTS)[number] | (typeof GOAL_PARTS)[number];

export const PART_LABEL: Record<DetailPart, string> = {
  description: 'a description',
  effort: 'its effort',
  date: 'a due or scheduled date',
  goal: 'a goal',
  subtasks: 'subtasks',
  due: 'a deadline',
  task: 'a task under it',
};

export interface TaskShape {
  descriptionText: string | null;
  effort: string | null;
  dueDate: string | null;
  scheduledDate: string | null;
  goalId: string | null;
  subtasks: number;
  /** A project task can have a goal; an inbox task can't, so it isn't asked. */
  inProject: boolean;
}

/** The parts a task still lacks. */
export function missingTaskParts(t: TaskShape): DetailPart[] {
  const has: Record<(typeof TASK_PARTS)[number], boolean> = {
    description: !!t.descriptionText?.trim(),
    effort: t.effort !== null,
    date: t.dueDate !== null || t.scheduledDate !== null,
    goal: t.goalId !== null || !t.inProject,
    subtasks: t.subtasks > 0,
  };
  return TASK_PARTS.filter((p) => !has[p]);
}

export interface GoalShape {
  descriptionText: string | null;
  dueDate: string | null;
  tasks: number;
}

export function missingGoalParts(g: GoalShape): DetailPart[] {
  const has: Record<(typeof GOAL_PARTS)[number], boolean> = {
    description: !!g.descriptionText?.trim(),
    due: g.dueDate !== null,
    task: g.tasks > 0,
  };
  return GOAL_PARTS.filter((p) => !has[p]);
}

/** How many of the missing parts a follow-up asks for (any 2, or all when fewer are missing). */
export const followupTarget = (missing: readonly DetailPart[]) =>
  Math.min(QUESTS.followup.parts, missing.length);

/** How many of the parts that were missing are now filled in. */
export const partsFilled = (askedFor: readonly DetailPart[], stillMissing: readonly DetailPart[]) =>
  askedFor.filter((p) => !stillMissing.includes(p)).length;

// --- What quests say -------------------------------------------------------------------------

export interface QuestWords {
  template: QuestTemplate;
  target: number;
  /** The title of what it's about (task, project or goal), as it is now. */
  name?: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** What a quest asks, in a line. */
export function questTitle({ template, target, name }: QuestWords): string {
  const n = name ?? 'it';
  switch (template) {
    case 'top_item':
      return `Finish “${n}”`;
    case 'next_action':
      return `Move ${n} forward: do its next action`;
    case 'stale_project':
      return `Get back to ${n}: complete one of its tasks`;
    case 'tasks_n':
      return `Complete ${plural(target, 'task')} today`;
    case 'large_task':
      return 'Complete a large task';
    case 'focus_sessions':
      return `Do ${plural(target, 'focus session')} of 10+ minutes`;
    case 'focus_today':
      return `Focus ${formatMinutes(target)} today`;
    case 'triage':
      return 'Clear one inbox item';
    case 'pin_next':
      return `Pick the next action for ${n}`;
    case 'effort':
      return `Set the effort of “${n}”`;
    case 'focus_note':
      return 'Write a line about your last focus session';
    case 'commitments_due':
      return target === 1
        ? 'Meet your commitment due today'
        : `Meet every commitment due today (${target})`;
    case 'log_commitment':
      return 'Log one commitment';
    case 'sort_notes':
      return `Sort ${plural(target, 'post-it')}`;
    case 'add_task':
      return `Add a task to ${n}`;
    case 'add_goal':
      return `Add a goal to ${n}`;
    case 'subtasks':
      return `Break “${n}” into ${plural(target, 'subtask')}`;
    case 'task_details':
    case 'goal_details':
      return `Add ${target === 1 ? 'a detail' : `${target} details`} to “${n}”`;
    case 'week_target':
      return `Be active ${plural(target, 'day')} this week`;
    case 'week_projects':
      return `Touch every active project this week (${target})`;
    case 'week_focus':
      return `Focus ${formatMinutes(target)} this week`;
    case 'weekly_review':
      return 'Do your weekly review';
    case 'revisit_parked':
      return `Revisit ${n}: keep it parked, start it or close it`;
    case 'goal_tasks':
      return `Finish ${plural(target, 'task')} of “${n}” this week`;
    case 'time_goal':
      return `Put ${formatMinutes(target)} into “${n}” this week`;
    case 'number_goal':
      return `Bring “${n}” to ${target} this week`;
    case 'comeback':
      return 'Welcome back: make today count';
  }
}

/** A second line, where the title alone isn't enough. */
export function questHint(template: QuestTemplate, missing?: readonly DetailPart[]): string | null {
  switch (template) {
    case 'task_details':
    case 'goal_details':
      return missing?.length ? `Any of: ${missing.map((p) => PART_LABEL[p]).join(', ')}.` : null;
    case 'triage':
      return 'Give it a project, or complete it.';
    case 'pin_next':
      return 'Pin a task as its next action.';
    case 'week_projects':
      return 'A completed task or a focus session in each.';
    case 'comeback':
      return 'One task or a 10-minute focus session. Nice to see you.';
    case 'stale_project':
      return `Nothing happened there for ${QUESTS.staleProjectDays}+ days.`;
    case 'commitments_due':
      return 'Tick, add to or log minutes on each one on Today.';
    case 'log_commitment':
      return 'A tick, +1 or a few minutes on any commitment.';
    case 'sort_notes':
      return 'Make one a task, add it to a task, or dismiss it.';
    case 'time_goal':
      return 'Focus sessions on its project count.';
    case 'number_goal':
      return 'What it needs this week to make its deadline.';
    default:
      return null;
  }
}

// --- Planning boards -------------------------------------------------------------------------

/** One quest to offer. */
export interface QuestSpec {
  type: QuestType;
  template: QuestTemplate;
  target: number;
  xp: number;
  taskId?: string;
  projectId?: string;
  goalId?: string;
  focusSessionId?: string;
  /** Follow-ups: the parts that were missing (leaf data). */
  missing?: DetailPart[];
}

export interface Candidate {
  id: string;
  title: string;
  /** Days since it was last offered or worked on. */
  daysWaiting: number;
}

export interface ProjectCandidate extends Candidate {
  openTasks: number;
  openGoals: number;
  /** Follow-ups pending on things in it. */
  undetailed: number;
}

/** Everything a board is planned from, gathered by the server. */
export interface BoardInput {
  today: DateString;
  resting: readonly QuestType[];
  /** Days since the last active day (null: never active). Today counts as 0. */
  idleDays: number | null;
  /** Daily templates offered yesterday (not repeated today when there's enough else). */
  yesterday: readonly QuestTemplate[];
  /** Today's top focus-list item. */
  top: Candidate | null;
  /** Active projects' next actions (task id, with the project). */
  nextActions: readonly (Candidate & { projectId: string; projectTitle: string })[];
  /** Active projects with open tasks and no activity for `staleProjectDays`. */
  staleProjects: readonly Candidate[];
  hasLargeTask: boolean;
  /** Tasks completed and focus minutes on each recent active day. */
  taskDays: readonly number[];
  focusDays: readonly number[];
  /** Focus minutes of each recent week that had any (for the weekly time quest). */
  focusWeeks: readonly number[];
  timeRange: { min: number; max: number };
  weeklyTarget: number;
  activeProjects: readonly ProjectCandidate[];
  /** Open tasks in active projects that could be broken down (no subtasks yet). */
  breakable: readonly (Candidate & { projectId: string })[];
  pendingFollowups: number;
  /** Quick-quest targets. */
  inboxOpen: number;
  unpinnedProjects: readonly Candidate[];
  noEffortTasks: readonly Candidate[];
  lastFocusWithoutNote: { id: string } | null;
  /** Commitments due today and not met yet (D31). */
  commitmentsDue: number;
  /** Post-its on the Notes board (D46). */
  notesOnBoard: number;
  /** Parked projects, waiting since they were parked or last revisited (D45). */
  parkedProjects: readonly Candidate[];
  /** Open goals in active projects, for project quests (D45). */
  goals: readonly GoalCandidate[];
}

/** An open goal a project quest can be about. */
export interface GoalCandidate extends Candidate {
  kind: 'outcome' | 'time' | 'number';
  /** Days until its deadline (null: none). */
  daysLeft: number | null;
  /** Outcome goals: open tasks under it. */
  openTasks: number;
  /** Time goals: their target as minutes a week. */
  weekMinutes: number | null;
  /** Number goals with a deadline, not met: where it stands and a week's pace. */
  current: number | null;
  weekPace: number | null;
}

const rests = (input: BoardInput, type: QuestType) =>
  type !== 'comeback' && input.resting.includes(type);

/** Whether only the comeback quest shows (idle 7+ days: no full board as noise, plan.md §5). */
export const idleOnlyComeback = (idleDays: number | null) =>
  idleDays !== null && idleDays > QUESTS.comeback.onlyAfterIdleDays;

/** Whether the comeback quest is offered: at least 2 inactive days in a row before today. */
export const comebackDue = (idleDays: number | null) =>
  idleDays !== null && idleDays > QUESTS.comeback.afterInactiveDays;

/** The daily candidates, each a spec with its weight (before the no-repeat rule). */
function dailyCandidates(input: BoardInput, rand: () => number) {
  const out: { item: QuestSpec; weight: number }[] = [];
  const xp = QUESTS.daily.xp;
  if (input.top) {
    out.push({
      item: {
        type: 'daily',
        template: 'top_item',
        target: 1,
        xp: xp.top_item!,
        taskId: input.top.id,
      },
      weight: questWeight(1.5, input.top.daysWaiting),
    });
  }
  const next = input.nextActions.filter((n) => n.id !== input.top?.id);
  const pickedNext = pickWeighted(
    next.map((n) => ({ item: n, weight: questWeight(1, n.daysWaiting) })),
    rand,
  );
  if (pickedNext) {
    out.push({
      item: {
        type: 'daily',
        template: 'next_action',
        target: 1,
        xp: xp.next_action!,
        taskId: pickedNext.id,
        projectId: pickedNext.projectId,
      },
      weight: questWeight(1, pickedNext.daysWaiting),
    });
  }
  const stale = pickWeighted(
    input.staleProjects
      .filter((p) => p.id !== pickedNext?.projectId)
      .map((p) => ({ item: p, weight: questWeight(1, p.daysWaiting) })),
    rand,
  );
  if (stale) {
    out.push({
      item: {
        type: 'daily',
        template: 'stale_project',
        target: 1,
        xp: xp.stale_project!,
        projectId: stale.id,
      },
      weight: questWeight(1.2, stale.daysWaiting),
    });
  }
  const n = sizeFromDays(input.taskDays, { ...QUESTS.daily.tasks, step: 1 }, rand);
  out.push({
    item: { type: 'daily', template: 'tasks_n', target: n, xp: tasksQuestXp(n) },
    weight: 1,
  });
  if (input.hasLargeTask) {
    out.push({
      item: { type: 'daily', template: 'large_task', target: 1, xp: xp.large_task! },
      weight: 0.8,
    });
  }
  out.push({
    item: {
      type: 'daily',
      template: 'focus_sessions',
      target: QUESTS.daily.focusSessions,
      xp: xp.focus_sessions!,
    },
    weight: 0.8,
  });
  if (input.commitmentsDue > 0) {
    out.push({
      item: {
        type: 'daily',
        template: 'commitments_due',
        target: input.commitmentsDue,
        xp: xp.commitments_due!,
      },
      weight: 1.2,
    });
  }
  return out;
}

/** Pick `count` distinct items, weighted, without replacement. */
function pickMany<T>(items: { item: T; weight: number }[], count: number, rand: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length) {
    const item = pickWeighted(pool, rand);
    if (item === null) break;
    picked.push(item);
    pool.splice(
      pool.findIndex((x) => x.item === item),
      1,
    );
  }
  return picked;
}

/** The make candidate for today (or none: the soft cap makes it likelier the emptier things are). */
export function planMake(
  input: BoardInput,
  rand: () => number,
  exclude: readonly QuestSpec[] = [],
): QuestSpec | null {
  if (rests(input, 'make')) return null;
  const options: { item: QuestSpec; weight: number }[] = [];
  const caps = QUESTS.make.caps;
  for (const p of input.activeProjects) {
    if (makeAllowed(p.openTasks, caps.add_task!, input.pendingFollowups)) {
      options.push({
        item: {
          type: 'make',
          template: 'add_task',
          target: 1,
          xp: QUESTS.make.xp,
          projectId: p.id,
        },
        weight:
          (makeWeight(p.openTasks, caps.add_task!, p.undetailed + input.pendingFollowups) *
            questWeight(1, p.daysWaiting)) /
          questWeight(1, 0),
      });
    }
    if (p.openGoals === 0 && makeAllowed(0, caps.add_goal!, input.pendingFollowups)) {
      options.push({
        item: {
          type: 'make',
          template: 'add_goal',
          target: 1,
          xp: QUESTS.make.xp,
          projectId: p.id,
        },
        weight: makeWeight(0, caps.add_goal!, input.pendingFollowups) * 0.8,
      });
    }
  }
  for (const t of input.breakable) {
    if (input.pendingFollowups < QUESTS.make.maxPendingFollowups) {
      options.push({
        item: {
          type: 'make',
          template: 'subtasks',
          target: QUESTS.make.subtasks,
          xp: QUESTS.make.xp,
          taskId: t.id,
          projectId: t.projectId,
        },
        weight: makeWeight(0, caps.subtasks!, input.pendingFollowups) * 0.5,
      });
    }
  }
  const fresh = options.filter(
    (o) =>
      !exclude.some(
        (e) =>
          e.template === o.item.template &&
          e.projectId === o.item.projectId &&
          e.taskId === o.item.taskId,
      ),
  );
  if (!fresh.length) return null;
  // The soft cap decides whether there's one at all: the best weight is the chance (at most 1).
  const best = Math.min(1, Math.max(...fresh.map((o) => o.weight)));
  if (exclude.length === 0 && rand() >= best) return null;
  return pickWeighted(fresh, rand);
}

/** Quick quests: up to `count`, none repeating what's already on the board. */
export function planQuick(
  input: BoardInput,
  count: number,
  rand: () => number,
  exclude: readonly QuestSpec[] = [],
): QuestSpec[] {
  if (rests(input, 'quick') || count <= 0) return [];
  const xp = QUESTS.quick.xp;
  const options: { item: QuestSpec; weight: number }[] = [];
  if (input.inboxOpen > 0)
    options.push({ item: { type: 'quick', template: 'triage', target: 1, xp }, weight: 1.5 });
  const unpinned = pickWeighted(
    input.unpinnedProjects.map((p) => ({ item: p, weight: questWeight(1, p.daysWaiting) })),
    rand,
  );
  if (unpinned) {
    options.push({
      item: { type: 'quick', template: 'pin_next', target: 1, xp, projectId: unpinned.id },
      weight: 1,
    });
  }
  const effortless = pickWeighted(
    input.noEffortTasks.map((t) => ({ item: t, weight: questWeight(1, t.daysWaiting) })),
    rand,
  );
  if (effortless) {
    options.push({
      item: { type: 'quick', template: 'effort', target: 1, xp, taskId: effortless.id },
      weight: 1,
    });
  }
  if (input.lastFocusWithoutNote) {
    options.push({
      item: {
        type: 'quick',
        template: 'focus_note',
        target: 1,
        xp,
        focusSessionId: input.lastFocusWithoutNote.id,
      },
      weight: 1.2,
    });
  }
  if (input.commitmentsDue > 0) {
    options.push({
      item: { type: 'quick', template: 'log_commitment', target: 1, xp },
      weight: 1.2,
    });
  }
  if (input.notesOnBoard >= NOTES_CROWDED) {
    options.push({
      item: { type: 'quick', template: 'sort_notes', target: QUESTS.quick.sortNotes, xp },
      weight: 1.5,
    });
  }
  const fresh = options.filter((o) => !exclude.some((e) => e.template === o.item.template));
  return pickMany(fresh, count, rand);
}

/** The time quest for today. */
export function planTime(input: BoardInput, rand: () => number): QuestSpec | null {
  if (rests(input, 'time')) return null;
  const minutes = sizeFromDays(
    input.focusDays,
    {
      min: input.timeRange.min,
      max: input.timeRange.max,
      step: QUESTS.time.step,
      fallback: QUESTS.time.fallback,
    },
    rand,
  );
  return { type: 'time', template: 'focus_today', target: minutes, xp: timeQuestXp(minutes) };
}

/** Today's board: comeback when due, 3 daily quests, a time quest, maybe a make quest, quick quests. */
export function planDaily(input: BoardInput, rand = Math.random): QuestSpec[] {
  const board: QuestSpec[] = [];
  if (comebackDue(input.idleDays)) {
    board.push({ type: 'comeback', template: 'comeback', target: 1, xp: QUESTS.comeback.xp });
  }
  if (idleOnlyComeback(input.idleDays)) return board;

  if (!rests(input, 'daily')) {
    const all = dailyCandidates(input, rand);
    const fresh = all.filter((c) => !input.yesterday.includes(c.item.template));
    const picked = pickMany(fresh, QUESTS.daily.perDay, rand);
    // Not enough new ones: yesterday's templates fill the rest.
    if (picked.length < QUESTS.daily.perDay) {
      const rest = all.filter((c) => !picked.includes(c.item));
      picked.push(...pickMany(rest, QUESTS.daily.perDay - picked.length, rand));
    }
    board.push(...picked);
  }
  const time = planTime(input, rand);
  if (time) board.push(time);
  const make = planMake(input, rand);
  if (make) board.push(make);
  board.push(...planQuick(input, QUESTS.quick.visible, rand));
  return board;
}

/**
 * This week's quests: the weekly target, every active project (2 or more), a focus total; the
 * review quests; a project quest. Each type rests on its own.
 */
export function planWeekly(input: BoardInput, rand = Math.random): QuestSpec[] {
  if (idleOnlyComeback(input.idleDays)) return [];
  return [...planWeeklyOwn(input, rand), ...planReview(input, rand), ...planProject(input, rand)];
}

function planWeeklyOwn(input: BoardInput, rand: () => number): QuestSpec[] {
  if (rests(input, 'weekly')) return [];
  const xp = QUESTS.weekly.xp;
  const quests: QuestSpec[] = [
    { type: 'weekly', template: 'week_target', target: input.weeklyTarget, xp: xp.week_target! },
  ];
  if (input.activeProjects.length >= 2) {
    quests.push({
      type: 'weekly',
      template: 'week_projects',
      target: input.activeProjects.length,
      xp: xp.week_projects!,
    });
  }
  const minutes = sizeFromDays(input.focusWeeks, QUESTS.weekly.focus, rand);
  quests.push({
    type: 'weekly',
    template: 'week_focus',
    target: minutes,
    xp: weeklyFocusXp(minutes),
  });
  return quests;
}

/** The review quests: the weekly review, and a parked project to decide on when there is one. */
export function planReview(input: BoardInput, rand = Math.random): QuestSpec[] {
  if (rests(input, 'review')) return [];
  const xp = QUESTS.review.xp;
  const quests: QuestSpec[] = [
    { type: 'review', template: 'weekly_review', target: 1, xp: xp.weekly_review! },
  ];
  const parked = pickWeighted(
    input.parkedProjects.map((p) => ({ item: p, weight: questWeight(1, p.daysWaiting) })),
    rand,
  );
  if (parked) {
    quests.push({
      type: 'review',
      template: 'revisit_parked',
      target: 1,
      xp: xp.revisit_parked!,
      projectId: parked.id,
    });
  }
  return quests;
}

/** How much a goal's deadline makes it likelier: near ones first, none at all still possible. */
const urgency = (daysLeft: number | null) =>
  daysLeft === null ? 1 : daysLeft <= 30 ? 2 : daysLeft <= 90 ? 1.5 : 1;

/** Every project quest the goals allow, each with its weight. */
function projectCandidates(input: BoardInput) {
  const out: { item: QuestSpec; weight: number }[] = [];
  const xp = QUESTS.project.xp;
  for (const g of input.goals) {
    const weight = questWeight(urgency(g.daysLeft), g.daysWaiting);
    if (g.kind === 'outcome' && g.openTasks > 0) {
      const n = Math.min(QUESTS.project.tasks, g.openTasks);
      out.push({
        item: {
          type: 'project',
          template: 'goal_tasks',
          target: n,
          xp: goalTasksXp(n),
          goalId: g.id,
        },
        weight,
      });
    } else if (g.kind === 'time' && g.weekMinutes) {
      const step = QUESTS.time.step;
      const minutes = Math.max(
        step * 3,
        Math.round((g.weekMinutes * QUESTS.project.timeShare) / step) * step,
      );
      out.push({
        item: {
          type: 'project',
          template: 'time_goal',
          target: minutes,
          xp: xp.time_goal!,
          goalId: g.id,
        },
        weight,
      });
    } else if (g.kind === 'number' && g.current !== null && g.weekPace) {
      out.push({
        item: {
          type: 'project',
          template: 'number_goal',
          target: g.current + g.weekPace,
          xp: xp.number_goal!,
          goalId: g.id,
        },
        weight,
      });
    }
  }
  return out;
}

/** This week's project quest: one, from an open goal, likelier the nearer its deadline. */
export function planProject(
  input: BoardInput,
  rand = Math.random,
  exclude: readonly QuestSpec[] = [],
): QuestSpec[] {
  if (rests(input, 'project')) return [];
  const options = projectCandidates(input).filter(
    (o) => !exclude.some((e) => e.goalId === o.item.goalId),
  );
  const picked = pickWeighted(options, rand);
  return picked ? [picked] : [];
}

/**
 * Another quest of the same type for a reroll: one that isn't on the board already. Null when
 * there's no other (the reroll is refused).
 */
export function planReroll(
  old: QuestSpec,
  input: BoardInput,
  board: readonly QuestSpec[],
  rand = Math.random,
): QuestSpec | null {
  const same = (a: QuestSpec, b: QuestSpec) =>
    a.template === b.template && a.taskId === b.taskId && a.projectId === b.projectId;
  const taken = (s: QuestSpec) => board.some((b) => same(b, s)) || same(old, s);
  switch (old.type) {
    case 'daily': {
      const options = dailyCandidates(input, rand).filter(
        (c) => !taken(c.item) && c.item.template !== old.template,
      );
      return pickWeighted(options, rand);
    }
    case 'time': {
      for (let i = 0; i < 6; i++) {
        const t = planTime(input, rand);
        if (t && t.target !== old.target) return t;
      }
      return null;
    }
    case 'quick':
      return (
        planQuick(input, 1, rand, [...board.filter((b) => b.type === 'quick'), old])[0] ?? null
      );
    case 'make':
      return planMake(input, rand, [old, ...board.filter((b) => b.type === 'make')]);
    case 'project':
      return (
        planProject(input, rand, [old, ...board.filter((b) => b.type === 'project')])[0] ?? null
      );
    case 'weekly': {
      if (old.template !== 'week_focus') return null;
      for (let i = 0; i < 6; i++) {
        const minutes = sizeFromDays(input.focusWeeks, QUESTS.weekly.focus, rand);
        if (minutes !== old.target) {
          return { ...old, target: minutes, xp: weeklyFocusXp(minutes) };
        }
      }
      return null;
    }
    default:
      return null;
  }
}
