import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FolderKanban, Shapes } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStructureActions } from '@/lib/actions';
import { meQuery, projectsQuery, snapshotsQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Time zone, day start and quests come with the MVP."
      />
      <ProjectLimit />
      <DeletedItems />
    </div>
  );
}

function ProjectLimit() {
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const actions = useStructureActions();
  const current = me?.settings.activeProjectLimit ?? 3;
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 20;
  const active = projects.filter((p) => p.status === 'active').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active projects</CardTitle>
        <CardDescription>
          How many projects can be active at once. Activating one more asks you to park another;
          fewer active projects means each one actually moves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <form
          className="flex items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            await actions.updateSettings(n);
            setBusy(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="limit">Limit</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={20}
              className="w-24"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !valid || n === current}>
            Save
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {active} active now.
          {valid &&
            n < active &&
            ' Lowering it keeps them active; you just can’t add more until you’re under it.'}
        </p>
      </CardContent>
    </Card>
  );
}

function DeletedItems() {
  const { data: snapshots = [], isPending } = useQuery(snapshotsQuery);
  const actions = useStructureActions();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deleted projects and areas</CardTitle>
        <CardDescription>
          Each delete keeps a copy for 30 days. Restoring brings everything back as it was (an
          active project comes back parked if your limit is full).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isPending && snapshots.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing deleted recently.</p>
        )}
        <ul className="divide-y">
          {snapshots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              {s.kind === 'area' ? (
                <Shapes className="size-4 text-muted-foreground" />
              ) : (
                <FolderKanban className="size-4 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground">
                  {s.kind === 'area' ? 'Area' : 'Project'}
                  {s.kind === 'area' &&
                    s.projects > 0 &&
                    ` with ${s.projects} project${s.projects === 1 ? '' : 's'}`}
                  {s.tasks > 0 && ` · ${s.tasks} task${s.tasks === 1 ? '' : 's'}`} · deleted{' '}
                  {dateTime.format(new Date(s.createdAt))} · kept until{' '}
                  {date.format(new Date(s.expiresAt))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(s.id);
                  await actions.restoreSnapshot(s.id);
                  setBusy(null);
                }}
              >
                {busy === s.id ? 'Restoring…' : 'Restore'}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
