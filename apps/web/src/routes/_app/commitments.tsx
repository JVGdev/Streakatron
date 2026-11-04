// Every commitment (D31): today's first (what's still to do, then what's done), then the ones that
// ask nothing today, and the archived ones on request.

import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CommitmentRow } from '@/components/commitment-row';
import { doneToday } from '@/lib/commitments';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { commitmentsQuery, meQuery, type Commitment } from '@/lib/queries';
import { onRowsKeyDown } from '@/lib/rows';
import { newCommitment } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/commitments')({
  loader: ({ context }) => context.queryClient.ensureQueryData(commitmentsQuery()),
  component: CommitmentsPage,
});

function CommitmentsPage() {
  const { data: me } = useQuery(meQuery);
  const { data: all = [] } = useQuery(commitmentsQuery());
  const [showArchived, setShowArchived] = useState(false);
  const { data: withArchived = [] } = useQuery({
    ...commitmentsQuery(true),
    enabled: showArchived,
  });
  const weekStart = me?.settings.weekStart ?? 1;
  const archived = withArchived.filter((c) => c.archivedAt);

  const scheduled = all.filter((c) => c.day.scheduled);
  const todo = scheduled.filter((c) => !doneToday(c));
  const done = scheduled.filter((c) => doneToday(c));
  const other = all.filter((c) => !c.day.scheduled);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Commitments"
        description="Routines you keep: a lesson every day, 20 cards, 3 classes a week."
        actions={
          <Button onClick={() => newCommitment()}>
            <Plus />
            New commitment
          </Button>
        }
      />

      {all.length === 0 ? (
        <button
          onClick={() => newCommitment()}
          className="w-full rounded-2xl border-2 border-dashed px-4 py-8 text-left hover:bg-muted/40"
        >
          <span className="block font-display text-lg font-semibold">No commitments yet.</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Add something you do regularly. Tick it, add to it or log minutes, and it shows on Today
            until it’s done. Each one keeps its own streak.
          </span>
        </button>
      ) : (
        <>
          <Group title="To do today" items={todo} weekStart={weekStart} />
          <Group title="Done today" items={done} weekStart={weekStart} />
          <Group title="Other days" items={other} weekStart={weekStart} />
        </>
      )}

      <div>
        <button
          className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
          onClick={() => setShowArchived((s) => !s)}
          aria-expanded={showArchived}
        >
          <ChevronRight
            className={cn('size-4 transition-transform', showArchived && 'rotate-90')}
          />
          Archived
        </button>
        {showArchived && (
          <div className="mt-2 grid gap-1" onKeyDown={onRowsKeyDown}>
            {archived.length ? (
              archived.map((c) => <CommitmentRow key={c.id} commitment={c} weekStart={weekStart} />)
            ) : (
              <p className="px-2 text-sm text-muted-foreground">Nothing archived.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  items,
  weekStart,
}: {
  title: ReactNode;
  items: Commitment[];
  weekStart: number;
}) {
  if (!items.length) return null;
  return (
    <section aria-label={typeof title === 'string' ? title : undefined} className="space-y-2">
      <h2 className="px-1 font-sans text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="grid gap-2" onKeyDown={onRowsKeyDown}>
        {items.map((c) => (
          <CommitmentRow key={c.id} commitment={c} tile weekStart={weekStart} />
        ))}
      </div>
    </section>
  );
}
