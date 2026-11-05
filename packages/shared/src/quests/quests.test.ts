import { describe, expect, it } from 'vitest';
import {
  comebackDue,
  followupTarget,
  idleOnlyComeback,
  makeAllowed,
  makeWeight,
  median,
  missingGoalParts,
  missingTaskParts,
  partsFilled,
  pickWeighted,
  planDaily,
  planMake,
  planQuick,
  planReroll,
  planProject,
  planReview,
  planWeekly,
  goalTasksXp,
  questHint,
  questTitle,
  questWeight,
  sizeFromDays,
  tasksQuestXp,
  timeQuestXp,
  typeOfTemplate,
  weeklyFocusXp,
  QUESTS,
  type BoardInput,
  type GoalCandidate,
  type QuestSpec,
} from '.';

/** A seeded random (mulberry32), so boards are reproducible. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const input = (over: Partial<BoardInput> = {}): BoardInput => ({
  today: '2026-11-04',
  resting: [],
  idleDays: 0,
  yesterday: [],
  top: { id: 'tsk_top', title: 'Read chapter 4', daysWaiting: 0 },
  nextActions: [
    {
      id: 'tsk_n1',
      title: 'Tokenizer',
      daysWaiting: 2,
      projectId: 'prj_a',
      projectTitle: 'Compilers',
    },
  ],
  staleProjects: [{ id: 'prj_b', title: 'Thesis', daysWaiting: 5 }],
  hasLargeTask: true,
  taskDays: [],
  focusDays: [],
  focusWeeks: [],
  timeRange: { min: 15, max: 180 },
  weeklyTarget: 4,
  activeProjects: [
    { id: 'prj_a', title: 'Compilers', daysWaiting: 0, openTasks: 3, openGoals: 0, undetailed: 0 },
    { id: 'prj_b', title: 'Thesis', daysWaiting: 5, openTasks: 2, openGoals: 1, undetailed: 0 },
  ],
  breakable: [{ id: 'tsk_big', title: 'Write report', daysWaiting: 1, projectId: 'prj_a' }],
  pendingFollowups: 0,
  inboxOpen: 2,
  unpinnedProjects: [{ id: 'prj_a', title: 'Compilers', daysWaiting: 0 }],
  noEffortTasks: [{ id: 'tsk_x', title: 'Email prof', daysWaiting: 0 }],
  lastFocusWithoutNote: null,
  commitmentsDue: 0,
  parkedProjects: [],
  goals: [],
  ...over,
});

const ofType = (board: QuestSpec[], type: QuestSpec['type']) =>
  board.filter((q) => q.type === type);

describe('picking', () => {
  it('weighs by need and grows with the wait', () => {
    expect(questWeight(1, 0)).toBe(1);
    expect(questWeight(1, 7)).toBe(4);
    expect(questWeight(2, 14)).toBe(18);
    expect(questWeight(0, 0)).toBe(0.01);
  });

  it('picks the heavier more often', () => {
    const rand = seeded(1);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) {
      counts[
        pickWeighted(
          [
            { item: 'a' as const, weight: 3 },
            { item: 'b' as const, weight: 1 },
          ],
          rand,
        )!
      ]++;
    }
    expect(counts.a / 2000).toBeGreaterThan(0.7);
    expect(counts.a / 2000).toBeLessThan(0.8);
    expect(pickWeighted([], rand)).toBeNull();
    expect(pickWeighted([{ item: 'a', weight: 0 }], rand)).toBeNull();
  });
});

describe('sizing from your own days', () => {
  const rule = { min: 15, max: 180, step: 5, fallback: [30, 60] as const };

  it('uses the median, give or take a fifth, in steps', () => {
    expect(median([10, 40, 20])).toBe(20);
    expect(median([10, 40, 20, 30])).toBe(25);
    expect(sizeFromDays([60, 50, 70], rule, () => 0.5)).toBe(60);
    expect(sizeFromDays([60, 50, 70], rule, () => 0)).toBe(50); // 0.8 × 60 = 48 → 50
    expect(sizeFromDays([60, 50, 70], rule, () => 0.999)).toBe(70); // ≈ 1.2 × 60 = 72 → 70
  });

  it('stays within min and max', () => {
    expect(sizeFromDays([400, 500, 600], rule, () => 0.5)).toBe(180);
    expect(sizeFromDays([5, 5, 5], rule, () => 0.5)).toBe(15);
  });

  it('falls back to a random step with fewer than 3 days', () => {
    expect(sizeFromDays([90, 0, 0], rule, () => 0)).toBe(30);
    expect(sizeFromDays([], rule, () => 0.999)).toBe(60);
    const r = sizeFromDays([], rule, () => 0.5);
    expect(r % 5).toBe(0);
    expect(r).toBeGreaterThanOrEqual(30);
  });

  it('scales XP with the size', () => {
    expect(timeQuestXp(15)).toBe(30);
    expect(timeQuestXp(60)).toBe(45);
    expect(timeQuestXp(180)).toBe(80);
    expect(weeklyFocusXp(60)).toBe(60);
    expect(weeklyFocusXp(600)).toBe(90);
    expect(weeklyFocusXp(1200)).toBe(100);
    expect(tasksQuestXp(2)).toBe(25);
    expect(tasksQuestXp(6)).toBe(40);
  });
});

describe('the make soft cap (D16)', () => {
  it('fades as a project fills and as follow-ups wait', () => {
    expect(makeWeight(0, 15, 0)).toBe(1);
    expect(makeWeight(15, 15, 0)).toBe(0.5);
    expect(makeWeight(0, 15, 1)).toBeCloseTo(1 / 3);
    expect(makeWeight(30, 15, 0)).toBeCloseTo(0.2);
  });

  it('stops at the hard ceiling', () => {
    expect(makeAllowed(29, 15, 0)).toBe(true);
    expect(makeAllowed(30, 15, 0)).toBe(false);
    expect(makeAllowed(0, 15, 3)).toBe(false);
  });

  it('offers none with 3 follow-ups pending', () => {
    expect(planMake(input({ pendingFollowups: 3 }), seeded(2))).toBeNull();
  });

  it('is offered less often as projects fill', () => {
    const rate = (open: number) => {
      const rand = seeded(3);
      let n = 0;
      const i = input({
        activeProjects: [
          { id: 'prj_a', title: 'A', daysWaiting: 0, openTasks: open, openGoals: 1, undetailed: 0 },
        ],
        breakable: [],
      });
      for (let k = 0; k < 1000; k++) if (planMake(i, rand)) n++;
      return n / 1000;
    };
    expect(rate(0)).toBe(1);
    expect(rate(15)).toBeGreaterThan(0.4);
    expect(rate(15)).toBeLessThan(0.6);
    expect(rate(29)).toBeLessThan(0.3);
    expect(rate(30)).toBe(0);
  });

  it('only targets the projects it is given (the server passes active ones)', () => {
    const make = planMake(input({ activeProjects: [], breakable: [] }), seeded(4));
    expect(make).toBeNull();
  });
});

describe('follow-ups', () => {
  const bare = {
    descriptionText: '',
    effort: null,
    dueDate: null,
    scheduledDate: null,
    goalId: null,
    subtasks: 0,
    inProject: true,
  };

  it('lists what a task lacks', () => {
    expect(missingTaskParts(bare)).toEqual(['description', 'effort', 'date', 'goal', 'subtasks']);
    expect(
      missingTaskParts({ ...bare, inProject: false, effort: 'S', scheduledDate: '2026-11-05' }),
    ).toEqual(['description', 'subtasks']);
    expect(missingTaskParts({ ...bare, descriptionText: '   ' })).toContain('description');
  });

  it('lists what a goal lacks', () => {
    expect(missingGoalParts({ descriptionText: null, dueDate: null, tasks: 0 })).toEqual([
      'description',
      'due',
      'task',
    ]);
    expect(missingGoalParts({ descriptionText: 'why', dueDate: '2026-12-01', tasks: 1 })).toEqual(
      [],
    );
  });

  it('asks for any 2, or all when fewer are missing', () => {
    expect(followupTarget(['description', 'effort', 'date'])).toBe(2);
    expect(followupTarget(['effort'])).toBe(1);
    expect(followupTarget([])).toBe(0);
    expect(partsFilled(['description', 'effort', 'date'], ['date'])).toBe(2);
    // A part filled that wasn't asked for doesn't count.
    expect(partsFilled(['description'], ['description'])).toBe(0);
  });
});

describe('the daily board', () => {
  it('has 3 daily quests, a time quest and quick quests', () => {
    const board = planDaily(input(), seeded(5));
    expect(ofType(board, 'daily')).toHaveLength(3);
    expect(ofType(board, 'time')).toHaveLength(1);
    expect(ofType(board, 'quick').length).toBeLessThanOrEqual(QUESTS.quick.visible);
    expect(ofType(board, 'comeback')).toHaveLength(0);
    expect(ofType(board, 'make').length).toBeLessThanOrEqual(1);
    // No two daily quests of the same template.
    const templates = ofType(board, 'daily').map((q) => q.template);
    expect(new Set(templates).size).toBe(3);
  });

  it('doesn’t repeat yesterday’s templates when there’s enough else', () => {
    for (let seed = 0; seed < 30; seed++) {
      const board = planDaily(input({ yesterday: ['tasks_n', 'top_item'] }), seeded(seed));
      const templates = ofType(board, 'daily').map((q) => q.template);
      expect(templates).not.toContain('tasks_n');
      expect(templates).not.toContain('top_item');
    }
  });

  it('fills up with yesterday’s when there’s not enough new', () => {
    const lean = input({ top: null, nextActions: [], staleProjects: [], hasLargeTask: false });
    const board = planDaily({ ...lean, yesterday: ['tasks_n'] }, seeded(6));
    expect(
      ofType(board, 'daily')
        .map((q) => q.template)
        .sort(),
    ).toEqual(['focus_sessions', 'tasks_n']);
  });

  it('never targets the top item twice', () => {
    for (let seed = 0; seed < 30; seed++) {
      const i = input({
        nextActions: [
          {
            id: 'tsk_top',
            title: 'Read chapter 4',
            daysWaiting: 0,
            projectId: 'prj_a',
            projectTitle: 'A',
          },
        ],
      });
      const tasks = planDaily(i, seeded(seed))
        .map((q) => q.taskId)
        .filter(Boolean);
      expect(new Set(tasks).size).toBe(tasks.length);
    }
  });

  it('leaves out resting types, never the comeback', () => {
    const board = planDaily(
      input({ resting: ['daily', 'quick', 'time', 'make'], idleDays: 3 }),
      seeded(7),
    );
    expect(board.map((q) => q.type)).toEqual(['comeback']);
  });

  it('offers a comeback after 2 inactive days, and only it after 7+', () => {
    expect(comebackDue(2)).toBe(false); // active the day before yesterday
    expect(comebackDue(3)).toBe(true);
    expect(comebackDue(null)).toBe(false); // a new account isn't coming back
    expect(idleOnlyComeback(7)).toBe(false);
    expect(idleOnlyComeback(8)).toBe(true);
    const back = planDaily(input({ idleDays: 3 }), seeded(8));
    expect(back[0]).toMatchObject({ type: 'comeback', xp: 50 });
    expect(ofType(back, 'daily')).toHaveLength(3);
    expect(planDaily(input({ idleDays: 9 }), seeded(8)).map((q) => q.type)).toEqual(['comeback']);
  });

  it('sizes "complete N tasks" from your days', () => {
    const i = input({
      top: null,
      nextActions: [],
      staleProjects: [],
      hasLargeTask: false,
      taskDays: [5, 5, 5, 5],
    });
    const tasks = planDaily(i, () => 0.5).find((q) => q.template === 'tasks_n');
    expect(tasks).toMatchObject({ target: 5, xp: 40 });
  });
});

describe('quick quests', () => {
  it('offers what exists, none repeated', () => {
    const quick = planQuick(input(), 4, seeded(9));
    expect(quick.map((q) => q.template).sort()).toEqual(['effort', 'pin_next', 'triage']);
    const empty = planQuick(
      input({ inboxOpen: 0, unpinnedProjects: [], noEffortTasks: [], lastFocusWithoutNote: null }),
      2,
      seeded(9),
    );
    expect(empty).toEqual([]);
  });

  it('skips templates already on the board', () => {
    const quick = planQuick(input(), 4, seeded(10), [
      { type: 'quick', template: 'triage', target: 1, xp: 10 },
    ]);
    expect(quick.map((q) => q.template)).not.toContain('triage');
  });
});

describe('the weekly quests', () => {
  it('has the target, every project (2+) and a focus total', () => {
    const week = ofType(
      planWeekly(input(), () => 0.5),
      'weekly',
    );
    expect(week.map((q) => q.template)).toEqual(['week_target', 'week_projects', 'week_focus']);
    expect(week[0]).toMatchObject({ target: 4, xp: 100 });
    expect(week[1]).toMatchObject({ target: 2 });
    expect(week[2]!.target % 15).toBe(0);
  });

  it('skips "every project" with fewer than 2, and rests', () => {
    const one = ofType(
      planWeekly(input({ activeProjects: input().activeProjects.slice(0, 1) }), seeded(11)),
      'weekly',
    );
    expect(one.map((q) => q.template)).toEqual(['week_target', 'week_focus']);
    expect(ofType(planWeekly(input({ resting: ['weekly'] }), seeded(11)), 'weekly')).toEqual([]);
  });

  it('sizes the focus total from past weeks', () => {
    expect(planWeekly(input({ focusWeeks: [300, 300, 300] }), () => 0.5)[2]!.target).toBe(300);
  });
});

describe('review and project quests (D45)', () => {
  const goal = (over: Partial<GoalCandidate>): GoalCandidate => ({
    id: 'gol_a',
    title: 'Pass JLPT N5',
    daysWaiting: 0,
    kind: 'outcome',
    daysLeft: null,
    openTasks: 0,
    weekMinutes: null,
    current: null,
    weekPace: null,
    ...over,
  });

  it('asks for the weekly review every week, and a parked project when there is one', () => {
    expect(planReview(input(), seeded(1)).map((q) => q.template)).toEqual(['weekly_review']);
    const both = planReview(
      input({ parkedProjects: [{ id: 'prj_p', title: 'Guitar', daysWaiting: 20 }] }),
      seeded(1),
    );
    expect(both[1]).toMatchObject({ template: 'revisit_parked', projectId: 'prj_p', xp: 50 });
    expect(both.every((q) => QUESTS.tier[q.type] === 'large')).toBe(true);
    expect(planReview(input({ resting: ['review'] }), seeded(1))).toEqual([]);
  });

  it('makes one project quest from a goal, sized by its kind', () => {
    expect(planProject(input(), seeded(2))).toEqual([]);
    expect(planProject(input({ goals: [goal({ openTasks: 5 })] }), seeded(2))[0]).toMatchObject({
      template: 'goal_tasks',
      target: 3,
      xp: goalTasksXp(3),
      goalId: 'gol_a',
    });
    expect(
      planProject(input({ goals: [goal({ kind: 'time', weekMinutes: 240 })] }), seeded(2))[0],
    ).toMatchObject({ template: 'time_goal', target: 120 });
    expect(
      planProject(
        input({ goals: [goal({ kind: 'number', current: 12, weekPace: 2, daysLeft: 200 })] }),
        seeded(2),
      )[0],
    ).toMatchObject({ template: 'number_goal', target: 14 });
    // Nothing to ask: an outcome with no open tasks, a met number goal.
    expect(
      planProject(input({ goals: [goal({}), goal({ kind: 'number', current: 40 })] })),
    ).toEqual([]);
  });

  it('prefers a goal with a near deadline', () => {
    const goals = [
      goal({ id: 'gol_far', openTasks: 2, daysLeft: 300 }),
      goal({ id: 'gol_near', openTasks: 2, daysLeft: 10 }),
    ];
    let near = 0;
    const rand = seeded(3);
    for (let i = 0; i < 300; i++) {
      if (planProject(input({ goals }), rand)[0]?.goalId === 'gol_near') near++;
    }
    expect(near).toBeGreaterThan(170);
  });

  it('rerolls a project quest onto another goal', () => {
    const goals = [goal({ id: 'gol_1', openTasks: 1 }), goal({ id: 'gol_2', openTasks: 1 })];
    const [old] = planProject(input({ goals }), seeded(4));
    const next = planReroll(old!, input({ goals }), [old!], seeded(4));
    expect(next?.goalId).not.toBe(old!.goalId);
    const only = goals.filter((g) => g.id === old!.goalId);
    expect(planReroll(old!, input({ goals: only }), [old!], seeded(4))).toBeNull();
  });

  it('says what they ask', () => {
    expect(questTitle({ template: 'weekly_review', target: 1 })).toBe('Do your weekly review');
    expect(questTitle({ template: 'goal_tasks', target: 2, name: 'Hiragana' })).toBe(
      'Finish 2 tasks of “Hiragana” this week',
    );
    expect(questTitle({ template: 'time_goal', target: 120, name: 'Japanese' })).toBe(
      'Put 2 h into “Japanese” this week',
    );
    expect(questTitle({ template: 'number_goal', target: 14, name: 'Course' })).toBe(
      'Bring “Course” to 14 this week',
    );
  });
});

describe('rerolls', () => {
  it('finds another of the same type, not on the board', () => {
    const board = planDaily(input(), seeded(12));
    const old = ofType(board, 'daily')[0]!;
    const next = planReroll(old, input(), board, seeded(12));
    expect(next?.type).toBe('daily');
    expect(next?.template).not.toBe(old.template);
    expect(ofType(board, 'daily').map((q) => q.template)).not.toContain(next?.template);
  });

  it('has none when nothing else fits', () => {
    const lean = input({ top: null, nextActions: [], staleProjects: [], hasLargeTask: false });
    const board: QuestSpec[] = [
      { type: 'daily', template: 'tasks_n', target: 3, xp: 30 },
      { type: 'daily', template: 'focus_sessions', target: 2, xp: 30 },
    ];
    expect(planReroll(board[0]!, lean, board, seeded(13))).toBeNull();
    expect(
      planReroll(
        { type: 'comeback', template: 'comeback', target: 1, xp: 50 },
        lean,
        [],
        seeded(13),
      ),
    ).toBeNull();
  });

  it('resizes a time quest', () => {
    const old: QuestSpec = { type: 'time', template: 'focus_today', target: 45, xp: 40 };
    const next = planReroll(old, input(), [old], seeded(14));
    expect(next?.template).toBe('focus_today');
    expect(next?.target).not.toBe(45);
  });
});

describe('words', () => {
  it('titles quests', () => {
    expect(questTitle({ template: 'top_item', target: 1, name: 'Read chapter 4' })).toBe(
      'Finish “Read chapter 4”',
    );
    expect(questTitle({ template: 'tasks_n', target: 3 })).toBe('Complete 3 tasks today');
    expect(questTitle({ template: 'focus_today', target: 90 })).toBe('Focus 1 h 30 min today');
    expect(questTitle({ template: 'week_focus', target: 180 })).toBe('Focus 3 h this week');
    expect(questTitle({ template: 'task_details', target: 2, name: 'Essay' })).toBe(
      'Add 2 details to “Essay”',
    );
    expect(questTitle({ template: 'task_details', target: 1, name: 'Essay' })).toBe(
      'Add a detail to “Essay”',
    );
    expect(questHint('task_details', ['effort', 'date'])).toBe(
      'Any of: its effort, a due or scheduled date.',
    );
  });

  it('maps templates to types', () => {
    expect(typeOfTemplate('add_goal')).toBe('make');
    expect(typeOfTemplate('week_projects')).toBe('weekly');
  });
});

describe('commitment quests (D31)', () => {
  it('offers meeting today’s commitments, sized to how many are due', () => {
    // Three candidates left, so all three are picked.
    const only = { top: null, nextActions: [], staleProjects: [], hasLargeTask: false };
    const daily = planDaily(input({ ...only, commitmentsDue: 3 }), seeded(3));
    const all = [...daily, ...planQuick(input({ commitmentsDue: 3 }), 5, seeded(3))];
    expect(all.some((q) => q.template === 'commitments_due' && q.target === 3)).toBe(true);
    expect(all.some((q) => q.template === 'log_commitment')).toBe(true);
  });

  it('offers neither with nothing due', () => {
    const quick = planQuick(input(), 5, seeded(3));
    expect(quick.map((q) => q.template)).not.toContain('log_commitment');
  });

  it('words them', () => {
    expect(questTitle({ template: 'commitments_due', target: 3 })).toBe(
      'Meet every commitment due today (3)',
    );
    expect(questTitle({ template: 'commitments_due', target: 1 })).toBe(
      'Meet your commitment due today',
    );
    expect(questTitle({ template: 'log_commitment', target: 1 })).toBe('Log one commitment');
  });
});
