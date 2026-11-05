// A project's commitments, under its goals (D31): the routines that keep it moving.

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { commitmentsQuery, meQuery } from '@/lib/queries';
import { onRowsKeyDown } from '@/lib/rows';
import { newCommitment } from '@/lib/ui-store';
import { CommitmentRow } from './commitment-row';

export function CommitmentsPanel({ projectId }: { projectId: string }) {
  const { data: me } = useQuery(meQuery);
  const { data: all = [] } = useQuery(commitmentsQuery());
  const mine = all.filter((c) => c.projectId === projectId);

  return (
    <section className="space-y-3" aria-label="Commitments">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">Commitments</h2>
        <Button variant="ghost" size="sm" onClick={() => newCommitment(projectId)}>
          <Plus />
          Commitment
        </Button>
      </div>
      {mine.length === 0 ? (
        <button
          onClick={() => newCommitment(projectId)}
          className="w-full rounded-2xl border-2 border-dashed px-4 py-6 text-left text-sm text-muted-foreground hover:bg-muted/40"
        >
          Add something you do regularly for this project.
        </button>
      ) : (
        <div
          className="grid gap-1 rounded-2xl border-2 bg-card p-2 shadow-ledge"
          onKeyDown={onRowsKeyDown}
        >
          {mine.map((c) => (
            <CommitmentRow
              key={c.id}
              commitment={c}
              showProject={false}
              weekStart={me?.settings.weekStart ?? 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
