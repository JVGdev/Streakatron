import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Flame, ListTodo, Swords, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayLong } from '@/lib/days';
import { meQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/today')({
  component: TodayPage,
});

function TodayPage() {
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  const first = me.user.name.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{formatDayLong(me.today)}</p>
        <h1 className="text-2xl font-bold tracking-tight">Hi, {first}.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What’s the smallest meaningful thing you can do right now?
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Placeholder
          icon={ListTodo}
          title="Focus list"
          text="Overdue, due today, habits and next actions — at most five."
        />
        <Placeholder
          icon={Swords}
          title="Quests"
          text="Daily, quick and time quests sized from your own days."
        />
        <Placeholder
          icon={Timer}
          title="Focus session"
          text="Start a timed block attached to a task or project."
        />
        <Placeholder
          icon={Flame}
          title="Streaks & XP"
          text="Level, daily and weekly streaks, banked freezes."
        />
      </div>
      <p className="text-xs text-muted-foreground">
        These arrive with the MVP (Phase 3). Projects, tasks and the inbox are ready now; press C to
        capture a task.
      </p>
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Card className="gap-2 border-dashed shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
