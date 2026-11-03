// Global keyboard shortcuts. Plain keys don't fire while typing (inputs, text areas, editable
// content) or while a dialog is open; `mod+…` combos (Ctrl, or ⌘ on a Mac) always do.
//
//   useHotkeys({ 'mod+k': openPalette, c: capture, 'g i': () => navigate({ to: '/inbox' }) });

import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}

const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');

function keyName(e: KeyboardEvent) {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return mod ? `mod+${key}` : key;
}

/** Two-key sequences (`g i`) must be typed within this long. */
const SEQUENCE_MS = 1200;

export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    let pending: { key: string; at: number } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const name = keyName(e);
      const combo = name.startsWith('mod+');
      if (!combo && (e.altKey || e.ctrlKey || e.metaKey)) return;
      if (!combo && (isTyping(e.target) || dialogOpen())) return;

      const now = Date.now();
      const seq = pending && now - pending.at < SEQUENCE_MS ? `${pending.key} ${name}` : null;
      const handler = (seq && mapRef.current[seq]) || mapRef.current[name];
      if (handler) {
        pending = null;
        e.preventDefault();
        handler(e);
        return;
      }
      // The first key of a sequence.
      pending = Object.keys(mapRef.current).some((k) => k.startsWith(`${name} `))
        ? { key: name, at: now }
        : null;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
