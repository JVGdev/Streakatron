import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CATEGORY_DOT } from '@/lib/look';
import type { Task } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** How long the completion pop plays before the task moves (to Done, or out of a list). */
const CELEBRATE_MS = 420;
const SPARKS = 6;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The round complete/reopen button of a task. Completing plays a short pop and burst first, so
 * the moment registers before the optimistic move takes the task away.
 */
export function TaskCheck({
  task,
  onToggle,
  size = 'md',
  className,
}: {
  task: Task;
  onToggle: () => void;
  /** `lg` for roomy rows (Today). */
  size?: 'md' | 'lg';
  className?: string;
}) {
  const [celebrating, setCelebrating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const done = task.completedAt !== null || celebrating;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
      onClick={(e) => {
        e.stopPropagation();
        if (celebrating) return;
        if (task.completedAt !== null || reducedMotion()) return onToggle();
        setCelebrating(true);
        timer.current = setTimeout(() => {
          setCelebrating(false);
          onToggle();
        }, CELEBRATE_MS);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'group/check relative grid shrink-0 place-items-center rounded-full border-2 transition-colors',
        size === 'md' ? 'size-5' : 'size-8 border-[3px]',
        done
          ? 'border-ember bg-ember text-white shadow-[0_2px_0_var(--ember-shade)]'
          : 'border-dashed border-muted-foreground/45 bg-card hover:border-solid hover:border-ember hover:bg-glow/60',
        celebrating && 'animate-check-pop',
        className,
      )}
    >
      <Check
        className={cn(
          'stroke-[3.5]',
          size === 'md' ? 'size-3' : 'size-4',
          done ? 'opacity-100' : 'text-ember opacity-0 group-hover/check:opacity-80',
        )}
      />
      {celebrating && (
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="animate-check-ring absolute inset-0 rounded-full border-2 border-ember" />
          {Array.from({ length: SPARKS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'animate-check-spark absolute top-1/2 left-1/2 rounded-full',
                size === 'md' ? 'size-1.5' : 'size-2',
                i % 2 ? 'bg-ember' : 'bg-peach',
              )}
              style={{ '--angle': `${(360 / SPARKS) * i + 15}deg` } as CSSProperties}
            />
          ))}
        </span>
      )}
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
