import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Solid buttons stand on a ledge and press down into it.
        default:
          'bg-primary font-display text-primary-foreground shadow-press hover:bg-primary/92 active:translate-y-0.5 active:shadow-none',
        destructive:
          'bg-destructive font-display text-white shadow-[0_3px_0_color-mix(in_oklab,var(--destructive),black_30%)] hover:bg-destructive/90 focus-visible:ring-destructive/20 active:translate-y-0.5 active:shadow-none dark:bg-destructive/80 dark:focus-visible:ring-destructive/40',
        outline:
          'border-2 bg-card font-display shadow-ledge hover:bg-muted active:translate-y-0.5 active:shadow-none dark:border-input dark:hover:bg-input/50',
        secondary: 'bg-secondary font-display text-secondary-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-lg px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-lg px-3 has-[>svg]:px-2.5',
        lg: 'h-11 rounded-2xl px-6 text-base has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
