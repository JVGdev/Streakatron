// Today's one-tap "turn on notifications" (D38): shown when there are reminders but this device
// won't show them, so turning them on never needs a visit to Settings. "Not now" hides it for two
// weeks on this device; on an iPhone in Safari it says how to install instead.

import { BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePush } from '@/lib/push';
import type { Commitment, Task } from '@/lib/queries';

const KEY = 'streakatron:notify-banner-hidden-until';
const HIDE_MS = 14 * 86_400_000;

function hiddenUntil(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function NotifyBanner({
  commitments,
  tasks,
  today,
}: {
  commitments: Commitment[];
  tasks: Task[];
  today: string;
}) {
  const { state, turnOn } = usePush();
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now());
  const [busy, setBusy] = useState(false);

  const reminding = [
    ...commitments.filter((c) => c.reminder && !c.archivedAt).map((c) => c.title),
    ...tasks.filter((t) => t.remindAt && t.remindAt.slice(0, 10) >= today).map((t) => t.title),
  ];
  if (hidden || !reminding.length || (state !== 'off' && state !== 'install')) return null;

  const hide = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + HIDE_MS));
    } catch {
      // Private mode: hidden for this visit only.
    }
    setHidden(true);
  };
  const what =
    reminding.length === 1
      ? `“${reminding[0]}” has a reminder`
      : `“${reminding[0]}” and ${reminding.length - 1} more have reminders`;

  return (
    <section
      aria-label="Turn on notifications"
      className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ember/30 bg-ember/5 p-3 pl-4"
    >
      <BellRing className="size-5 shrink-0 text-ember" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-bold">Get your reminders on this device</div>
        <div className="text-muted-foreground">
          {state === 'install'
            ? `${what}. To get them on this iPhone, tap Share → Add to Home Screen, then open Streakatron from there.`
            : `${what}, but this device isn’t getting them.`}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {state === 'off' && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await turnOn();
              setBusy(false);
            }}
          >
            Turn on
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" aria-label="Not now" onClick={hide}>
          <X />
        </Button>
      </div>
    </section>
  );
}
