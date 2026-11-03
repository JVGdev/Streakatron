// Every query the app reads, with its key. Task lists share one key prefix (`['tasks', 'list', …]`)
// so the merge rule in tasks.ts can update all of them after a write.

import { queryOptions } from '@tanstack/react-query';
import { api, call } from './api';

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

const fetchSearch = (q: string) => call(api.search.$get({ query: { q, limit: '12' } }));
export type SearchHit = Awaited<ReturnType<typeof fetchSearch>>['results'][number];

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ['search', q],
    queryFn: async () => (await fetchSearch(q)).results,
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  });
