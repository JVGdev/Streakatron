// The one picker of existing things (D32: "one picker, with create", D31): a select you can type
// in, which offers "New … “typed text”" when nothing is called that. Used for the area in the
// project dialog, the project and goal in the task sheet, and "Move to…".
//
//   <ComboPicker value={areaId} options={areas} onChange={setAreaId}
//     create={{ noun: 'area', run: async (title) => (await createArea({ title }))?.id }} />

import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Small text after the label ("parked"). */
  hint?: string;
}

export function ComboPicker({
  value,
  options,
  onChange,
  create,
  placeholder = 'Choose…',
  searchPlaceholder,
  trigger,
  size = 'default',
  className,
  align = 'start',
  id,
  'aria-label': ariaLabel,
}: {
  value: string | null;
  options: ComboOption[];
  onChange: (value: string) => void;
  /** Offer "New {noun} “typed text”"; `run` makes it and returns its value (undefined: failed). */
  create?: { noun: string; run: (title: string) => Promise<string | undefined> };
  placeholder?: string;
  searchPlaceholder?: string;
  /** A custom trigger button (Move to…); by default it looks like a select. */
  trigger?: ReactNode;
  size?: 'default' | 'sm';
  className?: string;
  align?: 'start' | 'end';
  id?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = options.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const exact = options.some((o) => o.label.trim().toLowerCase() === needle);
  const canCreate = !!create && needle.length > 0 && !exact;

  const close = () => {
    setOpen(false);
    setQ('');
  };

  async function make() {
    if (!create || busy) return;
    setBusy(true);
    const made = await create.run(q.trim());
    setBusy(false);
    if (made !== undefined) {
      close();
      onChange(made);
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            className={cn(
              'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50',
              size === 'sm' ? 'h-8' : 'h-9',
              className,
            )}
          >
            <span
              className={cn(
                'flex min-w-0 items-center gap-2 [&_svg]:shrink-0',
                !selected && 'text-muted-foreground',
              )}
            >
              {selected?.icon}
              <span className="truncate">{selected?.label ?? placeholder}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        align={align}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            placeholder={searchPlaceholder ?? (create ? 'Find, or type a new name…' : 'Find…')}
            value={q}
            onValueChange={setQ}
            maxLength={200}
          />
          <CommandList>
            {!canCreate && <CommandEmpty>Nothing called that.</CommandEmpty>}
            {shown.length > 0 && (
              <CommandGroup>
                {shown.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    onSelect={() => {
                      close();
                      if (o.value !== value) onChange(o.value);
                    }}
                  >
                    {o.icon}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && (
                      <span className="text-[10px] text-muted-foreground uppercase">{o.hint}</span>
                    )}
                    {o.value === value && <Check className="size-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup>
                <CommandItem value="__create" onSelect={() => void make()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                  <span className="min-w-0 flex-1 truncate">
                    New {create.noun} “{q.trim()}”
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
