import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from '@/components/app-shell';
import { ApiError } from '@/lib/api';
import { meQuery } from '@/lib/queries';

// Everything behind sign-in. `?task=tsk_…`, `?goal=gol_…`, `?area=are_…`, `?commitment=cmt_…` and
// `?event=evt_…` and `?note=not_…` open that sheet over any page.
export const Route = createFileRoute('/_app')({
  validateSearch: z.object({
    task: z.string().optional(),
    goal: z.string().optional(),
    area: z.string().optional(),
    commitment: z.string().optional(),
    event: z.string().optional(),
    note: z.string().optional(),
  }),
  beforeLoad: async ({ context, location }) => {
    try {
      return { me: await context.queryClient.ensureQueryData(meQuery) };
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) {
        throw redirect({ to: '/sign-in', search: { redirect: location.href } });
      }
      throw err;
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { me } = Route.useRouteContext();
  const sheets = Route.useSearch();
  return (
    <AppShell me={me} sheets={sheets}>
      <Outlet />
    </AppShell>
  );
}
