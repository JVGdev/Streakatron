import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Logo } from '@/components/logo';
import { NAV } from '@/components/nav';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import type { Me } from '@/lib/queries';
import { flushAll } from '@/lib/saver';

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: 'bg-sidebar-accent !text-sidebar-accent-foreground',
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <Logo className="md:invisible" />
          <UserMenu me={me} />
        </header>
        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>

      {/* Phones (over the tailnet): the same places as a bottom bar. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: '!text-primary' }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function UserMenu({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initials = me.user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await flushAll();
    const { error } = await authClient.signOut();
    if (error) {
      toast.error(error.message ?? 'Couldn’t sign out.');
      return;
    }
    queryClient.clear();
    await navigate({ to: '/sign-in' });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
          <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {initials || '?'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">{me.user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{me.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
