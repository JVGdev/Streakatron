// Every query the app reads, with its key. Task lists share one key prefix (`['tasks', 'list', …]`)
// so the merge rule in tasks.ts can update all of them after a write.

import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api, call } from './api';
import { syncServerClock } from './focus-timer';

const fetchMe = () => call(api.me.$get());
export type Me = Awaited<ReturnType<typeof fetchMe>>;

/** The signed-in user, their settings and their day (server-computed). */
export const meQuery = queryOptions({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000 });

/** Whether the app still needs its first account. */
export const setupQuery = queryOptions({
  queryKey: ['setup'],
  queryFn: () => call(api.setup.$get()),
});

// --- Structure -------------------------------------------------------------------------------

const fetchAreas = () => call(api.areas.$get());
export type Area = Awaited<ReturnType<typeof fetchAreas>>['areas'][number];

export const areasQuery = queryOptions({
  queryKey: ['areas'],
  queryFn: async () => (await fetchAreas()).areas,
});

const fetchProjects = () => call(api.projects.$get());
export type Project = Awaited<ReturnType<typeof fetchProjects>>['projects'][number];

/** Every project with counts and next action (sidebar, overview, pickers). */
export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: async () => (await fetchProjects()).projects,
});

const fetchProject = (id: string) => call(api.projects[':id'].$get({ param: { id } }));
export type ProjectPage = Awaited<ReturnType<typeof fetchProject>>;
export type BoardColumn = ProjectPage['columns'][number];
export type Goal = ProjectPage['goals'][number];

/** A project page: the project, its board columns and goals. */
export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ['project', id], queryFn: () => fetchProject(id) });

export interface TaskFilter {
  /** A project id, `inbox`, or every project when absent. */
  project?: string;
  status?: 'open' | 'done' | 'any';
  /** Subtasks of this task. */
  parent?: string;
}

const fetchTasks = (f: TaskFilter) =>
  call(
    api.tasks.$get({
      query: {
        ...(f.project ? { project: f.project } : {}),
        ...(f.parent ? { parent: f.parent } : {}),
        status: f.status ?? 'any',
      },
    }),
  );
export type Task = Awaited<ReturnType<typeof fetchTasks>>['tasks'][number];

/** The canonical form of a filter, so equal filters share a cache entry. */
export const normalizeFilter = (f: TaskFilter): TaskFilter => ({
  ...(f.project ? { project: f.project } : {}),
  ...(f.parent ? { parent: f.parent } : {}),
  status: f.status ?? 'any',
});

export const tasksQuery = (f: TaskFilter) => {
  const filter = normalizeFilter(f);
  return queryOptions({
    queryKey: ['tasks', 'list', filter] as const,
    queryFn: async () => (await fetchTasks(filter)).tasks,
  });
};

const fetchTask = (id: string) => call(api.tasks[':id'].$get({ param: { id } }));
export type TaskDetail = Awaited<ReturnType<typeof fetchTask>>;

export const taskQuery = (id: string) =>
  queryOptions({ queryKey: ['tasks', 'detail', id], queryFn: () => fetchTask(id) });

const fetchSnapshots = () => call(api.snapshots.$get());
export type Snapshot = Awaited<ReturnType<typeof fetchSnapshots>>['snapshots'][number];

export const snapshotsQuery = queryOptions({
  queryKey: ['snapshots'],
  queryFn: async () => (await fetchSnapshots()).snapshots,
});

const fetchSearch = (q: string, limit: number) =>
  call(api.search.$get({ query: { q, limit: String(limit) } }));
export type SearchHit = Awaited<ReturnType<typeof fetchSearch>>['results'][number];

/** Search; an empty query lists recently changed things (the mention picker's first view). */
export const searchQuery = (q: string, limit = 12) =>
  queryOptions({
    queryKey: ['search', q, limit],
    queryFn: async () => (await fetchSearch(q, limit)).results,
    staleTime: 10_000,
  });

const fetchGoal = (id: string) => call(api.goals[':id'].$get({ param: { id } }));

/** One goal (the goal sheet). */
export const goalQuery = (id: string) =>
  queryOptions({ queryKey: ['goal', id], queryFn: () => fetchGoal(id) });

// --- Spotlight (D33) -------------------------------------------------------------------------

const fetchSpotlight = () => call(api.spotlight.$get());
export type SpotlightItem = Awaited<ReturnType<typeof fetchSpotlight>>['items'][number];
export type SpotlightGoal = NonNullable<SpotlightItem['goal']>;
export type SpotlightEvent = NonNullable<SpotlightItem['event']>;

/** What's featured on Today, oldest first: task ids (tasks come from the task lists) and goals. */
export const spotlightQuery = queryOptions({
  queryKey: ['spotlight'],
  queryFn: async () => (await fetchSpotlight()).items,
});

// --- Calendar (D39) --------------------------------------------------------------------------

const fetchEvent = (id: string) => call(api.events[':id'].$get({ param: { id } }));
export type CalendarEvent = Awaited<ReturnType<typeof fetchEvent>>;

/** One event (the event sheet). */
export const eventQuery = (id: string) =>
  queryOptions({ queryKey: ['event', id], queryFn: () => fetchEvent(id) });

const fetchProjectEvents = (project: string) => call(api.events.$get({ query: { project } }));

/** A project's events, dated first (its page's "Dates"). */
export const projectEventsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ['events', 'project', projectId],
    queryFn: async () => (await fetchProjectEvents(projectId)).events,
  });

const fetchCalendar = (from: string, to: string) =>
  call(api.calendar.$get({ query: { from, to } }));
export type CalendarData = Awaited<ReturnType<typeof fetchCalendar>>;
export type CalendarItem = CalendarData['events'][number];

/** Events with their days in range, done tasks, focus and commitments met per day. */
export const calendarQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ['calendar', from, to],
    queryFn: () => fetchCalendar(from, to),
    placeholderData: keepPreviousData,
  });

// --- Commitments (D31) -----------------------------------------------------------------------

const fetchCommitments = (archived: boolean) =>
  call(api.commitments.$get({ query: { archived: archived ? 'true' : 'false' } }));
export type Commitment = Awaited<ReturnType<typeof fetchCommitments>>['commitments'][number];

/** Live commitments with where each stands today (archived ones too, when asked). */
export const commitmentsQuery = (archived = false) =>
  queryOptions({
    queryKey: ['commitments', { archived }] as const,
    queryFn: async () => (await fetchCommitments(archived)).commitments,
  });

const fetchCommitment = (id: string) => call(api.commitments[':id'].$get({ param: { id } }));
export type CommitmentDetail = Awaited<ReturnType<typeof fetchCommitment>>;

/** One commitment with its description and the last 4 weeks (the sheet). */
export const commitmentQuery = (id: string) =>
  queryOptions({ queryKey: ['commitment', id], queryFn: () => fetchCommitment(id) });

// --- Game ------------------------------------------------------------------------------------

const fetchGame = () => call(api.game.state.$get());
export type GameState = Awaited<ReturnType<typeof fetchGame>>;

/** XP, level, streaks and this week, as the server counts them. Writes update it (GameMoments). */
export const gameQuery = queryOptions({
  queryKey: ['game'],
  queryFn: fetchGame,
  staleTime: 60_000,
});

// --- Focus -----------------------------------------------------------------------------------

const fetchFocus = async () => {
  const state = await call(api.focus.current.$get());
  syncServerClock(state.now);
  return state;
};
export type FocusState = Awaited<ReturnType<typeof fetchFocus>>;
export type FocusSession = NonNullable<FocusState['session']>;

/**
 * The open focus session (or null), the one that ended last, and today's focus. Writes replace it
 * (focusActions); it's read again now and then while a session is open, for other devices.
 */
export const focusQuery = queryOptions({
  queryKey: ['focus'],
  queryFn: fetchFocus,
  staleTime: 30_000,
  refetchInterval: (q) => (q.state.data?.session ? 60_000 : false),
});

// --- Quests and stats ------------------------------------------------------------------------

const fetchQuests = () => call(api.quests.$get());
export type QuestBoard = Awaited<ReturnType<typeof fetchQuests>>;
export type Quest = QuestBoard['quests'][number];

/** Today's quests and this week's (made on the day's first look). Writes mark it stale. */
export const questsQuery = queryOptions({ queryKey: ['quests'], queryFn: fetchQuests });

const fetchHeatmap = () => call(api.stats.heatmap.$get({ query: {} }));
export type Heatmap = Awaited<ReturnType<typeof fetchHeatmap>>;

/** A year of days, to today. */
export const heatmapQuery = queryOptions({ queryKey: ['stats', 'heatmap'], queryFn: fetchHeatmap });

const fetchReview = () => call(api.review.$get());
export type WeekReview = Awaited<ReturnType<typeof fetchReview>>;
export type Review = NonNullable<WeekReview['review']>;

/** The weekly review page (D45): the week it looks at, its summary, the review row. */
export const reviewQuery = queryOptions({ queryKey: ['review'], queryFn: fetchReview });

/** Whether Today offers the review now. */
export const reviewStatusQuery = queryOptions({
  queryKey: ['review', 'status'],
  queryFn: () => call(api.review.status.$get()),
  staleTime: 5 * 60_000,
});
