import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { ApiError } from '@/lib/api';
import { meQuery } from '@/lib/queries';

// Everything behind sign-in.
export const Route = createFileRoute('/_app')({
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
  return (
    <AppShell me={me}>
      <Outlet />
    </AppShell>
  );
}
