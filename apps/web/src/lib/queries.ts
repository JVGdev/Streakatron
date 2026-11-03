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
