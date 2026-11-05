// The dialog after setting a reminder this device won't show (D38): why, what to do (one button
// when one click fixes it), and which devices still get it. Mounted once in the shell; opened by
// `checkAfterReminder`.

import { BellOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePush, type PushProblem } from '@/lib/push';
import { setUi, useUi } from '@/lib/ui-store';

const COPY: Record<PushProblem, { title: string; body: ReactNode; fix?: boolean }> = {
  dismissed: {
    title: 'Notifications aren’t on here yet',
    body: 'The browser’s question was closed without an answer, so this device won’t show the reminder.',
    fix: true,
  },
  failed: {
    title: 'Notifications didn’t turn on',
    body: 'The browser wouldn’t turn them on for this device.',
    fix: true,
  },
  'turned-off': {
    title: 'Notifications are off on this device',
    body: 'You turned them off here in Settings, so this device won’t show the reminder.',
    fix: true,
  },
  blocked: {
    title: 'This browser blocks notifications from Streakatron',
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Click the icon at the left of the address bar (a lock or sliders).</li>
        <li>
          Set <b>Notifications</b> to <b>Allow</b>.
        </li>
        <li>Reload the page. Notifications turn on by themselves.</li>
      </ol>
    ),
  },
  install: {
    title: 'Install Streakatron to get reminders on this iPhone',
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Tap <b>Share</b>, then <b>Add to Home Screen</b>.
        </li>
        <li>Open Streakatron from the Home Screen and sign in.</li>
        <li>Turn notifications on there (the banner on Today, or Settings → Notifications).</li>
      </ol>
    ),
  },
  unsupported: {
    title: 'This browser can’t show notifications here',
    body: 'Open Streakatron at its Tailscale address (https://…) in Chrome, Edge, Firefox or Safari.',
  },
};

export function PushPromptDialog() {
  const { pushPrompt: p } = useUi();
  const { turnOn } = usePush();
  const close = () => setUi({ pushPrompt: null });
  const copy = p && COPY[p.problem];
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && close()}>
      {p && copy && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <span className="mb-1 grid size-10 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <BellOff className="size-5" aria-hidden />
            </span>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="grid gap-2 text-left text-sm text-muted-foreground">
                <div>{copy.body}</div>
                {p.message && p.problem === 'failed' && <div>{p.message}</div>}
              </div>
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {p.others.length
              ? `The reminder is saved and still comes to ${list(p.others)}.`
              : 'The reminder is saved, but no device gets notifications yet.'}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              {copy.fix ? 'Not now' : 'OK'}
            </Button>
            {copy.fix && (
              <Button
                onClick={async () => {
                  if (await turnOn()) close();
                }}
              >
                Turn on
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

const list = (xs: string[]) =>
  xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
