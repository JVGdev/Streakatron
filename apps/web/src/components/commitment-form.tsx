// The commitment dialog (new and edit), mounted once in the shell and opened through ui-store. It
// starts on the common case (done or not, every day) and only asks for more when you pick more
// (D32: defaults first).

import {
  COMMITMENT_LIMITS,
  targetText,
  type CommitmentMeasure,
  type CommitmentPeriod,
} from '@streakatron/shared/commitments';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useCommitmentActions } from '@/lib/actions';
import { commitmentQuery, meQuery, projectsQuery, type CommitmentDetail } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export function CommitmentDialog() {
  const ui = useUi();
  const d = ui.commitmentDialog;
  const { data: editing } = useQuery({
    ...commitmentQuery(d?.commitmentId ?? ''),
    enabled: !!d?.commitmentId,
  });
  const close = () => setUi({ commitmentDialog: null });
  const ready = d && (!d.commitmentId || editing?.id === d.commitmentId);
  return (
    <Dialog open={!!d} onOpenChange={(o) => !o && close()}>
      {ready && (
        <CommitmentForm
          key={d.commitmentId ?? 'new'}
          commitment={d.commitmentId ? editing : undefined}
          projectId={d.projectId ?? null}
          onDone={close}
        />
      )}
    </Dialog>
  );
}

type How = 'every' | 'days' | 'week';

const MEASURES: { value: CommitmentMeasure; label: string }[] = [
  { value: 'check', label: 'Done or not' },
  { value: 'count', label: 'An amount' },
  { value: 'minutes', label: 'Minutes' },
];

const HOW: { value: How; label: string }[] = [
  { value: 'every', label: 'Every day' },
  { value: 'days', label: 'Some days' },
  { value: 'week', label: 'Each week' },
];

/** Weekdays in the user's week order. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NO_PROJECT = 'none';

function CommitmentForm({
  commitment,
  projectId: startProject,
  onDone,
}: {
  commitment?: CommitmentDetail;
  projectId: string | null;
  onDone: () => void;
}) {
  const actions = useCommitmentActions();
  const openSheet = useOpenSheet();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const weekStart = me?.settings.weekStart ?? 1;

  const [title, setTitle] = useState(commitment?.title ?? '');
  const [measure, setMeasure] = useState<CommitmentMeasure>(commitment?.measure ?? 'check');
  const [how, setHow] = useState<How>(
    commitment?.period === 'week' ? 'week' : commitment?.schedule ? 'days' : 'every',
  );
  const [days, setDays] = useState<number[]>(commitment?.schedule?.days ?? [1, 2, 3, 4, 5]);
  const [target, setTarget] = useState(
    String(
      commitment && !(commitment.measure === 'check' && commitment.period === 'day')
        ? commitment.target
        : '',
    ),
  );
  const [unit, setUnit] = useState(commitment?.unit ?? '');
  const [projectId, setProjectId] = useState<string | null>(
    commitment ? commitment.projectId : startProject,
  );
  const [busy, setBusy] = useState(false);

  const period: CommitmentPeriod = how === 'week' ? 'week' : 'day';
  const needsTarget = measure !== 'check' || period === 'week';
  const fallback = measure === 'check' ? 3 : measure === 'minutes' ? 15 : 20;
  const n = target.trim() ? Math.round(Number(target)) : fallback;
  const max =
    measure === 'check'
      ? COMMITMENT_LIMITS.weekChecks.max
      : measure === 'minutes'
        ? COMMITMENT_LIMITS.minutes[period]
        : COMMITMENT_LIMITS.count.max;
  const validTarget = !needsTarget || (Number.isFinite(n) && n >= 1 && n <= max);
  const validDays = how !== 'days' || days.length > 0;
  const shape = {
    measure,
    period,
    target: needsTarget ? n : 1,
    unit: measure === 'count' ? unit.trim() || null : null,
    schedule: how === 'days' ? { days } : null,
  };
  const valid = !!title.trim() && validTarget && validDays;
  const choosable = projects.filter((p) => p.status !== 'archived' || p.id === projectId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const fields = { title, projectId, ...shape };
    const saved = commitment
      ? await actions.update(commitment.id, fields)
      : await actions.create(fields);
    setBusy(false);
    if (!saved) return;
    onDone();
    if (!commitment) openSheet('commitment', saved.id);
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{commitment ? 'Edit commitment' : 'New commitment'}</DialogTitle>
          <DialogDescription>
            A routine you keep, like a lesson every day or 3 classes a week.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="commitment-title">Title</Label>
          <Input
            id="commitment-title"
            autoFocus
            maxLength={200}
            placeholder="Duolingo lesson"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <Choice
          label="How do you count it?"
          options={MEASURES}
          value={measure}
          onChange={setMeasure}
        />
        <Choice label="How often?" options={HOW} value={how} onChange={setHow} />

        {how === 'days' && (
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
            {Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7).map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  className={cn(
                    'h-8 min-w-0 rounded-full border-2 text-xs font-bold transition-colors',
                    on ? 'border-ember bg-glow text-glow-foreground' : 'text-muted-foreground',
                  )}
                >
                  {WEEKDAYS[d]}
                </button>
              );
            })}
          </div>
        )}

        {needsTarget && (
          <div className="grid gap-1.5">
            <Label htmlFor="commitment-target">Target</Label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input
                id="commitment-target"
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                className="w-24"
                placeholder={String(fallback)}
                value={target}
                aria-invalid={!validTarget}
                onChange={(e) => setTarget(e.target.value)}
              />
              {measure === 'count' && (
                <Input
                  aria-label="Unit"
                  className="w-32"
                  maxLength={COMMITMENT_LIMITS.unitLength}
                  placeholder="cards"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              )}
              <span className="text-muted-foreground">
                {measure === 'check' ? 'times ' : measure === 'minutes' ? 'min ' : ''}a {period}
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label>Project (optional)</Label>
          <Select
            value={projectId ?? NO_PROJECT}
            onValueChange={(v) => setProjectId(v === NO_PROJECT ? null : v)}
          >
            <SelectTrigger className="w-full" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {choosable.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {valid && (
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{targetText(shape, weekStart)}</span>.
            Meeting it earns 10 XP.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {commitment ? 'Save' : 'Add commitment'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): ReactNode {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md py-1.5 text-sm font-medium text-muted-foreground',
              value === o.value && 'bg-background text-foreground shadow-xs',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
