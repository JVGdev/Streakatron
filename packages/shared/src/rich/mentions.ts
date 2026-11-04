// Mentions inside rich text (D4): a `mention` node holds the id of what it points to, plus the
// label it had when inserted (a fallback; chips show the target's current title). The server
// extracts them into the `links` table on every save, which powers backlinks.

import { parseId, type IdKind } from '../ids';
import type { RichNode } from './index';

/** What a mention can point to. Events join when they exist. */
export const LINKABLE_KINDS = [
  'area',
  'project',
  'goal',
  'task',
  'commitment',
] as const satisfies IdKind[];
export type LinkableKind = (typeof LINKABLE_KINDS)[number];

const LINKABLE = new Set<string>(LINKABLE_KINDS);

/** The kind of a mentionable id, or null when it isn't one. */
export function linkableKind(id: unknown): LinkableKind | null {
  if (typeof id !== 'string') return null;
  const parsed = parseId(id);
  return parsed && LINKABLE.has(parsed.kind) ? (parsed.kind as LinkableKind) : null;
}

export interface MentionRef {
  targetId: string;
  /** The line the (first) mention is in, as plain text, cut to about `SNIPPET_CHARS`. */
  snippet: string;
}

/** A mention's current title, when known (else the label it was inserted with is used). */
export type TitleOf = (id: string) => string | undefined;

export const SNIPPET_CHARS = 160;

const mentionText = (node: RichNode, titleOf?: TitleOf) => {
  const id = node.attrs?.id;
  const label = (typeof id === 'string' && titleOf?.(id)) || node.attrs?.label;
  return typeof label === 'string' && label ? `@${label}` : '@…';
};

/** A textblock's text, with where each mention starts in it. */
function inline(
  node: RichNode,
  titleOf: TitleOf | undefined,
  out: { text: string; at: { id: unknown; offset: number }[] },
) {
  for (const child of node.content ?? []) {
    if (child.type === 'text') out.text += child.text ?? '';
    else if (child.type === 'hardBreak') out.text += ' ';
    else if (child.type === 'mention') {
      out.at.push({ id: child.attrs?.id, offset: out.text.length });
      out.text += mentionText(child, titleOf);
    } else inline(child, titleOf, out);
  }
  return out;
}

/** About `SNIPPET_CHARS` of `text` around `offset`, cut at word boundaries. */
export function snippetAround(text: string, offset: number, max = SNIPPET_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  // Positions shift a little when whitespace collapses; close enough for a preview.
  const at = Math.min(offset, clean.length);
  let start = Math.max(0, at - Math.floor(max / 3));
  let end = Math.min(clean.length, start + max);
  start = Math.max(0, end - max);
  if (start > 0) {
    const space = clean.indexOf(' ', start);
    if (space > 0 && space < at) start = space + 1;
  }
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end);
    if (space > at) end = space;
  }
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
}

/**
 * Everything a document mentions, once each, in order, with the line it's mentioned in. Mentions
 * in that line read as `titleOf` says (current titles), falling back to their stored labels.
 */
export function mentionsOf(doc: RichNode | null | undefined, titleOf?: TitleOf): MentionRef[] {
  const found = new Map<string, string>();
  const walk = (node: RichNode) => {
    const kids = node.content ?? [];
    // A textblock: its children are inline (text, mentions, breaks).
    if (kids.some((k) => k.type === 'text' || k.type === 'mention' || k.type === 'hardBreak')) {
      const { text, at } = inline(node, titleOf, { text: '', at: [] });
      for (const m of at) {
        if (!linkableKind(m.id) || found.has(m.id as string)) continue;
        found.set(m.id as string, snippetAround(text, m.offset));
      }
      return;
    }
    kids.forEach(walk);
  };
  if (doc) walk(doc);
  return [...found].map(([targetId, snippet]) => ({ targetId, snippet }));
}
