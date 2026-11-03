import { Check } from 'lucide-react';
import { CATEGORY_DOT } from '@/lib/look';
import type { Task } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** The round complete/reopen button of a task. */
export function TaskCheck({
  task,
  onToggle,
  className,
}: {
  task: Task;
  onToggle: () => void;
  className?: string;
}) {
  const done = task.completedAt !== null;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'group/check relative grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
        done
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 hover:border-primary',
        className,
      )}
    >
      <Check
        className={cn(
          'size-3 stroke-[3]',
          done ? 'opacity-100' : 'text-primary opacity-0 group-hover/check:opacity-60',
        )}
      />
      {!done && task.status === 'in_progress' && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full',
            CATEGORY_DOT.in_progress,
          )}
          aria-hidden
        />
      )}
    </button>
  );
}
