// "Turn into…" (D44): a task, commitment, goal or event becomes one of the others. The dialog shows
// what carries over and what stays behind (back on undo) before anything changes.

import {
  CONVERT_KINDS,
  CONVERT_LABELS,
  convertPlan,
  type ConvertKind,
  type ConvertSource,
} from '@streakatron/shared/convert';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CalendarDays,
  Ellipsis,
  ListTodo,
  Repeat,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useOpenSheet } from '@/hooks/use-open-task';
import { api, call } from '@/lib/api';
import { STATUS_LABEL } from '@/lib/look';
import { meQuery, projectsQuery } from '@/lib/queries';
import { attempt } from '@/lib/report';
import { cn } from '@/lib/utils';
import { ComboPicker } from './combo-picker';
import { EntityIcon } from './entity-icon';

const ICONS: Record<ConvertKind, LucideIcon> = {
  task: ListTodo,
  commitment: Repeat,
  goal: Target,
  event: CalendarDays,
};

const forget = (qc: QueryClient, id: string) =>
  qc.removeQueries({ predicate: (q) => q.queryKey.includes(id) });

const noun = (k: ConvertKind) => CONVERT_LABELS[k].toLowerCase();
const article = (k: ConvertKind) => (k === 'event' ? 'an' : 'a');

/**
 * A sheet footer's "More" menu with "Turn into…", and its dialog. `beforeOpen` flushes the sheet's
 * unsaved text.
 */
export function TurnInto({
  id,
  source,
  beforeOpen,
}: {
  id: string;
  source: ConvertSource;
  beforeOpen?: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="More">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={async () => {
              await beforeOpen?.();
              setOpen(true);
            }}
          >
            <ArrowRightLeft />
            Turn into…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <TurnIntoDialog id={id} source={source} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function TurnIntoDialog({
  id,
  source,
  onDone,
}: {
  id: string;
  source: ConvertSource;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const openSheet = useOpenSheet();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const targets = CONVERT_KINDS.filter((k) => k !== source.kind);
  const [to, setTo] = useState<ConvertKind>(targets[0]!);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = convertPlan(source, to, today);
  const from = noun(source.kind);

  const run = async () => {
    setBusy(true);
    const res = await attempt(() =>
      call(
        api.convert.$post({
          json: { id, to, ...(plan.needsProject && projectId ? { projectId } : {}) },
        }),
      ),
    );
    setBusy(false);
    if (!res) return;
    onDone();
    openSheet(to, res.to.id);
    // The old entry is gone: drop what's cached of it, so nothing asks for it again.
    forget(qc, id);
    void qc.invalidateQueries();
    toast(`Turned “${source.title}” into ${article(to)} ${noun(to)}`, {
      action: {
        label: 'Undo',
        onClick: () =>
          void attempt(async () => {
            await call(api.convert.undo.$post({ json: { from: id, to: res.to.id } }));
            openSheet(source.kind, id);
            forget(qc, res.to.id);
            void qc.invalidateQueries();
          }),
      },
    });
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Turn into…</DialogTitle>
        <DialogDescription>
          “{source.title}” becomes a new {noun(to)}; the {from} is deleted (you can undo).
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Turn into">
        {targets.map((k) => {
          const Icon = ICONS[k];
          const on = k === to;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTo(k)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm font-medium transition-colors',
                on
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/40'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {CONVERT_LABELS[k]}
            </button>
          );
        })}
      </div>

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Carries over</dt>
          <dd>{plan.kept.join(' · ')}</dd>
        </div>
        {plan.dropped.length > 0 && (
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">
              Stays with the deleted {from}
            </dt>
            <dd>{plan.dropped.join(' · ')}</dd>
          </div>
        )}
      </dl>

      {plan.needsProject && (
        <div className="grid gap-1.5">
          <Label className="text-muted-foreground">A goal belongs to a project</Label>
          <ComboPicker
            aria-label="Project"
            value={projectId ?? ''}
            placeholder="Pick a project"
            onChange={(v) => setProjectId(v || null)}
            options={projects
              .filter((p) => p.status !== 'archived')
              .map((p) => ({
                value: p.id,
                label: p.title,
                icon: <EntityIcon icon={p.icon} color={p.color} size="sm" />,
                hint: p.status === 'active' ? undefined : STATUS_LABEL[p.status],
              }))}
          />
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={busy || (plan.needsProject && !projectId)} onClick={() => void run()}>
          Turn into {article(to)} {noun(to)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
