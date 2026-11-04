import { cn } from '@/lib/utils';

/** The ember tile with a white bolt, and the wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight',
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-ember shadow-press-ember">
        <svg viewBox="0 0 24 24" className="size-5 fill-white" aria-hidden>
          <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
        </svg>
      </span>
      Streaktron
    </span>
  );
}
