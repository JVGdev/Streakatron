import { FOCUS_LIMITS } from '@streakatron/shared/focus';
import { RESTABLE_QUEST_TYPES } from '@streakatron/shared/quests';
import {
  TIMEZONE_CHANGE_DAYS,
  type FocusPreset,
  type UserSettings,
} from '@streakatron/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowUp, FolderKanban, Plus, Shapes, X } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { MinutesField } from '@/components/focus-timer';
import { NotificationsCard } from '@/components/notifications-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStructureActions } from '@/lib/actions';
import { meQuery, projectsQuery, snapshotsQuery, type Me } from '@/lib/queries';
import { countsTowardLimit } from '@/lib/project-status';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <YourDay />
      <NotificationsCard />
      <FocusPresets />
      <QuestSettings />
      <ProjectLimit />
      <DeletedItems />
    </div>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hourLabel = (h: number) =>
  h === 0 ? 'Midnight' : h === 12 ? 'Noon' : h < 12 ? `${h} AM` : `${h - 12} PM`;
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = (() => {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes('UTC') ? all : ['UTC', ...all];
})();

/** When the time zone may change again (once a week, D17); null when it may now. */
function nextZoneChange(settings: Me['settings']): Date | null {
  if (!settings.timezoneChangedAt) return null;
  const next = new Date(
    new Date(settings.timezoneChangedAt).getTime() + TIMEZONE_CHANGE_DAYS * 86_400_000,
  );
  return next > new Date() ? next : null;
}

/** The user's day (time zone, day start) and week (start, active-day target): what streaks count. */
function YourDay() {
  const { data: me } = useQuery(meQuery);
  const actions = useStructureActions();
  if (!me) return null;
  const s = me.settings;
  const locked = nextZoneChange(s);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your day and week</CardTitle>
        <CardDescription>
          Work done before your day starts counts for the day before, so a late night still counts.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="timezone">Time zone</Label>
          <Select
            value={s.timezone}
            disabled={locked !== null}
            onValueChange={(timezone) => void actions.updateSettings({ timezone })}
          >
            <SelectTrigger id="timezone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {locked
              ? `It can change once a week; next change from ${date.format(locked)}.`
              : 'It can change once a week, so streaks can’t be gamed by hopping zones.'}
            {!locked && browserZone && browserZone !== s.timezone && (
              <>
                {' '}
                <button
                  type="button"
                  className="font-bold text-primary underline-offset-2 hover:underline"
                  onClick={() => void actions.updateSettings({ timezone: browserZone })}
                >
                  Use this device’s ({browserZone.replaceAll('_', ' ')})
                </button>
              </>
            )}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="day-start">Day starts at</Label>
          <Select
            value={String(s.dayStartHour)}
            onValueChange={(v) => void actions.updateSettings({ dayStartHour: Number(v) })}
          >
            <SelectTrigger id="day-start" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="week-start">Week starts on</Label>
          <Select
            value={String(s.weekStart)}
            onValueChange={(v) => void actions.updateSettings({ weekStart: Number(v) })}
          >
            <SelectTrigger id="week-start" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d, i) => (
                <SelectItem key={d} value={String(i)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="weekly-target">Weekly target</Label>
          <Select
            value={String(s.weeklyActiveDayTarget)}
            onValueChange={(v) => void actions.updateSettings({ weeklyActiveDayTarget: Number(v) })}
          >
            <SelectTrigger id="weekly-target" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} active day{n === 1 ? '' : 's'} a week
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Weeks that meet it in a row make your weekly streak; a missed day doesn’t break it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

const MAX_PRESETS = 6;

const presetValid = (p: FocusPreset) =>
  Number.isInteger(p.focusMinutes) &&
  Number.isInteger(p.breakMinutes) &&
  p.focusMinutes >= FOCUS_LIMITS.plannedMinutes.min &&
  p.focusMinutes <= FOCUS_LIMITS.plannedMinutes.max &&
  p.breakMinutes >= FOCUS_LIMITS.breakMinutes.min &&
  p.breakMinutes <= FOCUS_LIMITS.breakMinutes.max;

function FocusPresets() {
  const { data: me } = useQuery(meQuery);
  const actions = useStructureActions();
  const saved = me?.settings.focusPresets ?? [];
  const [draft, setDraft] = useState<FocusPreset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const presets = draft ?? saved;
  const valid = presets.length > 0 && presets.every(presetValid);
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const edit = (fn: (list: FocusPreset[]) => FocusPreset[]) => setDraft(fn([...presets]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus presets</CardTitle>
        <CardDescription>
          Session and break lengths. The first one is Today’s Start focus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="grid gap-2">
          {presets.map((p, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <MinutesField
                  label={i === 0 ? 'Focus (min) · default' : 'Focus (min)'}
                  value={p.focusMinutes}
                  min={FOCUS_LIMITS.plannedMinutes.min}
                  max={FOCUS_LIMITS.plannedMinutes.max}
                  onChange={(focusMinutes) =>
                    edit((list) => list.map((x, j) => (j === i ? { ...x, focusMinutes } : x)))
                  }
                />
                <MinutesField
                  label="Break (min)"
                  value={p.breakMinutes}
                  min={FOCUS_LIMITS.breakMinutes.min}
                  max={FOCUS_LIMITS.breakMinutes.max}
                  onChange={(breakMinutes) =>
                    edit((list) => list.map((x, j) => (j === i ? { ...x, breakMinutes } : x)))
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Make it the default"
                disabled={i === 0}
                onClick={() => edit((list) => [list[i]!, ...list.filter((_, j) => j !== i)])}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove this preset"
                disabled={presets.length === 1}
                onClick={() => edit((list) => list.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={presets.length >= MAX_PRESETS}
            onClick={() => edit((list) => [...list, { focusMinutes: 45, breakMinutes: 10 }])}
          >
            <Plus />
            Add preset
          </Button>
          <span className="flex-1" />
          {changed && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={!changed || !valid || busy}
            onClick={async () => {
              if (!draft) return;
              setBusy(true);
              const ok = await actions.updateSettings({ focusPresets: draft });
              setBusy(false);
              if (ok) setDraft(null);
            }}
          >
            Save
          </Button>
        </div>
        {!valid && (
          <p className="text-xs text-destructive">
            Focus can be {FOCUS_LIMITS.plannedMinutes.min}–{FOCUS_LIMITS.plannedMinutes.max}{' '}
            minutes, a break 0–{FOCUS_LIMITS.breakMinutes.max}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const QUEST_TYPE_INFO: Record<(typeof RESTABLE_QUEST_TYPES)[number], [string, string]> = {
  daily: ['Daily quests', 'Three a day from your tasks and projects, plus a bonus for all three.'],
  time: ['Time quests', 'Focus a number of minutes today, sized from your own days.'],
  quick: ['Quick wins', 'Small chores like triaging the inbox; 3 a day at most.'],
  make: ['Make quests', 'Add a task or goal, then fill in its details the next day.'],
  weekly: ['Weekly quests', 'Your weekly target, every active project, and a focus total.'],
};

function QuestSettings() {
  const { data: me } = useQuery(meQuery);
  const actions = useStructureActions();
  const saved = me?.settings.questSettings;
  const [draft, setDraft] = useState<UserSettings['questSettings'] | null>(null);
  const [busy, setBusy] = useState(false);
  if (!saved) return null;
  const value = draft ?? saved;
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const { timeQuestMinMinutes: min, timeQuestMaxMinutes: max } = value;
  const valid =
    Number.isInteger(min) && Number.isInteger(max) && min >= 5 && max <= 600 && min <= max;
  const resting = new Set(value.restingTypes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quests</CardTitle>
        <CardDescription>
          Kinds you turn off leave from the next day. Comeback quests always stay on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid gap-3">
          {RESTABLE_QUEST_TYPES.map((type) => {
            const [label, hint] = QUEST_TYPE_INFO[type];
            return (
              <li key={type} className="flex items-start gap-3">
                <Checkbox
                  id={`quest-${type}`}
                  className="mt-0.5"
                  checked={!resting.has(type)}
                  onCheckedChange={(on) =>
                    setDraft({
                      ...value,
                      restingTypes: on
                        ? value.restingTypes.filter((t) => t !== type)
                        : [...value.restingTypes, type],
                    })
                  }
                />
                <Label htmlFor={`quest-${type}`} className="grid gap-0.5 font-normal">
                  <span className="font-bold">{label}</span>
                  <span className="text-sm text-muted-foreground">{hint}</span>
                </Label>
              </li>
            );
          })}
        </ul>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <MinutesField
            label="Shortest time quest (min)"
            value={min}
            min={5}
            max={600}
            onChange={(n) => setDraft({ ...value, timeQuestMinMinutes: n })}
          />
          <MinutesField
            label="Longest (min)"
            value={max}
            min={5}
            max={600}
            onChange={(n) => setDraft({ ...value, timeQuestMaxMinutes: n })}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          {changed && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={!changed || !valid || busy}
            onClick={async () => {
              if (!draft) return;
              setBusy(true);
              const ok = await actions.updateSettings({ questSettings: draft });
              setBusy(false);
              if (ok) setDraft(null);
            }}
          >
            Save
          </Button>
        </div>
        {!valid && (
          <p className="text-xs text-destructive">
            Between 5 and 600 minutes, and the shortest no longer than the longest.
          </p>
        )}
      </CardContent>
    </Card>
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
  const active = projects.filter(countsTowardLimit).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active projects</CardTitle>
        <CardDescription>
          How many projects can be active at once. Activating one more asks you to park another.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <form
          className="flex items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            await actions.updateSettings({ activeProjectLimit: n });
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
          Kept for 30 days. Restoring brings everything back (parked, if your active limit is full).
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
