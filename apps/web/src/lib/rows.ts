import type { KeyboardEvent } from 'react';

/** J/K and arrow keys between the rows of a list. */
export function onRowsKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step =
    e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-task-row]')];
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[at === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, at + step))];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}
