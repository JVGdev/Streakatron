import type { ColorKey, IconKey } from '@streaktron/shared/structure';
import { COLOR, ICON } from '@/lib/look';
import { cn } from '@/lib/utils';

/** An area's or project's icon on its color. */
export function EntityIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: IconKey;
  color: ColorKey;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = ICON[icon] ?? ICON.folder;
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md',
        COLOR[color]?.tile ?? COLOR.stone.tile,
        size === 'sm' && 'size-5 [&>svg]:size-3',
        size === 'md' && 'size-7 [&>svg]:size-4',
        size === 'lg' && 'size-10 rounded-lg [&>svg]:size-5',
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
