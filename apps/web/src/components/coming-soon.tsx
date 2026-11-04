import type { LucideIcon } from 'lucide-react';

/** A place in the app whose feature is planned but not built yet. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-6" />
        </span>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">{description}</p>
        <p className="mt-3 text-xs font-semibold tracking-wide text-primary uppercase">{phase}</p>
      </div>
    </div>
  );
}
