// Settings → Notifications (D38): turn Web Push on for this device, send a test, see and remove the
// other devices, and the two notifications that aren't reminders (focus ended, the evening nudge).
// Reminders themselves are set on each commitment and task.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing, Loader2, Monitor, Send, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStructureActions } from '@/lib/actions';
import { api, call } from '@/lib/api';
import { disablePush, enablePush, pushSupport, usePushDevices, type PushDevice } from '@/lib/push';
import { meQuery } from '@/lib/queries';
import { report } from '@/lib/report';

const added = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const isPhone = (label: string) => /Android|iPhone|iPad/.test(label);

export function NotificationsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Reminders come to every device you turn this on for, even with the app closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ThisDevice />
        <OtherDevices />
        <Extras />
      </CardContent>
    </Card>
  );
}

function ThisDevice() {
  const qc = useQueryClient();
  const { data, isPending } = usePushDevices();
  const [busy, setBusy] = useState(false);
  const support = pushSupport();
  const mine = data?.devices.find((d) => d.endpoint === data.endpoint);
  const on = !!mine;
  const refresh = () => qc.invalidateQueries({ queryKey: ['push'] });

  if (support === 'install') {
    return (
      <Note>
        On iPhone and iPad, notifications work from the installed app: tap Share, then{' '}
        <b>Add to Home Screen</b>, open Streakatron from there and turn them on.
      </Note>
    );
  }
  if (support === 'unsupported') {
    return (
      <Note>
        This browser can’t get notifications here. Open the app over HTTPS (your Tailscale address)
        in Chrome, Edge, Firefox or Safari.
      </Note>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${on ? 'bg-ember/15 text-ember' : 'bg-muted text-muted-foreground'}`}
        aria-hidden
      >
        {on ? <BellRing className="size-4.5" /> : <BellOff className="size-4.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">This device</div>
        <div className="text-sm text-muted-foreground">
          {isPending ? 'Checking…' : on ? `On · ${mine.label}` : 'Off'}
        </div>
      </div>
      <div className="flex gap-2">
        {on && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              try {
                const { sent } = await call(api.push.test.$post());
                toast(sent ? 'Sent. It should show in a moment.' : 'No device got it.');
              } catch (err) {
                report(err);
              }
            }}
          >
            <Send /> Send a test
          </Button>
        )}
        <Button
          size="sm"
          variant={on ? 'ghost' : 'default'}
          disabled={busy || isPending}
          onClick={async () => {
            setBusy(true);
            try {
              if (on) {
                await disablePush(mine.id);
                toast('Notifications are off on this device');
              } else {
                const problem = await enablePush();
                if (problem) toast.error(problem);
                else toast.success('Notifications are on for this device');
              }
            } catch (err) {
              report(err);
            } finally {
              setBusy(false);
              void refresh();
            }
          }}
        >
          {busy && <Loader2 className="animate-spin" />}
          {on ? 'Turn off' : 'Turn on'}
        </Button>
      </div>
    </div>
  );
}

function OtherDevices() {
  const qc = useQueryClient();
  const { data } = usePushDevices();
  const others = (data?.devices ?? []).filter((d) => d.endpoint !== data?.endpoint);
  if (!others.length) return null;
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-bold">Other devices</h3>
      <ul className="grid gap-1.5">
        {others.map((d) => (
          <DeviceRow
            key={d.id}
            device={d}
            onRemove={async () => {
              try {
                await call(api.push.devices[':id'].$delete({ param: { id: d.id } }));
                void qc.invalidateQueries({ queryKey: ['push'] });
              } catch (err) {
                report(err);
              }
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function DeviceRow({ device, onRemove }: { device: PushDevice; onRemove: () => void }) {
  const Icon = isPhone(device.label) ? Smartphone : Monitor;
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{device.label}</span>
      <span className="text-xs text-muted-foreground">
        since {added.format(new Date(device.createdAt))}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={`Remove ${device.label}`}
        onClick={onRemove}
      >
        <X />
      </Button>
    </li>
  );
}

function Extras() {
  const { data: me } = useQuery(meQuery);
  const actions = useStructureActions();
  const n = me?.settings.notifications;
  if (!n) return null;
  const save = (patch: Partial<typeof n>) =>
    void actions.updateSettings({ notifications: { ...n, ...patch } });

  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="notify-focus"
          className="mt-0.5"
          checked={n.focusEnded}
          onCheckedChange={(on) => save({ focusEnded: on === true })}
        />
        <Label htmlFor="notify-focus" className="grid gap-0.5 font-normal">
          <span className="font-bold">Focus session done</span>
          <span className="text-sm text-muted-foreground">
            When a session’s planned time is up, even with the app closed.
          </span>
        </Label>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="notify-streak"
          className="mt-0.5"
          checked={n.streakNudgeAt !== null}
          onCheckedChange={(on) => save({ streakNudgeAt: on === true ? '20:00' : null })}
        />
        <div className="grid gap-2">
          <Label htmlFor="notify-streak" className="grid gap-0.5 font-normal">
            <span className="font-bold">Streak at risk</span>
            <span className="text-sm text-muted-foreground">
              One nudge in the evening when your streak is going and nothing has counted today.
            </span>
          </Label>
          {n.streakNudgeAt !== null && (
            <div className="flex items-center gap-2">
              <Label htmlFor="notify-streak-at" className="text-sm font-normal">
                At
              </Label>
              <Input
                id="notify-streak-at"
                type="time"
                className="w-32"
                defaultValue={n.streakNudgeAt}
                onBlur={(e) => {
                  const at = e.target.value;
                  if (/^\d{2}:\d{2}$/.test(at) && at !== n.streakNudgeAt)
                    save({ streakNudgeAt: at });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{children}</p>
  );
}
