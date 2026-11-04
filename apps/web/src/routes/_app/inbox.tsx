import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QuickAdd } from '@/components/quick-add';
import { TaskListView } from '@/components/task-list-view';
import { tasksQuery } from '@/lib/queries';
import { DEFAULT_LIST } from '@/lib/task-list';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/inbox')({
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksQuery({ project: 'inbox' })),
  component: InboxPage,
});

function InboxPage() {
  const { data: tasks = [] } = useQuery(tasksQuery({ project: 'inbox' }));
  const [showDone, setShowDone] = useState(false);
  const done = tasks.filter((t) => t.completedAt);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Inbox"
        description="Capture now, sort later. Press C anywhere to add one."
      />
      <QuickAdd
        input={{ projectId: null, position: 'top' }}
        placeholder="Add to the inbox"
        className="border bg-card"
      />
      <TaskListView
        tasks={tasks}
        showProject={false}
        triage
        options={{ ...DEFAULT_LIST, project: 'inbox', sort: 'board', group: 'none' }}
        empty="Inbox zero. Everything has a home."
      />
      {done.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            onClick={() => setShowDone((s) => !s)}
            aria-expanded={showDone}
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', showDone && 'rotate-90')}
            />
            Done {done.length}
          </button>
          {showDone && (
            <div className="mt-1">
              <TaskListView
                tasks={done}
                showProject={false}
                options={{
                  ...DEFAULT_LIST,
                  project: 'inbox',
                  status: 'done',
                  sort: 'board',
                  group: 'none',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
