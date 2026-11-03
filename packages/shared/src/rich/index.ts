// Rich-text fields are stored as TipTap (ProseMirror) JSON, with a derived plain-text copy for
// search and previews. Until the editor arrives (Phase 2) the web app edits plain text and turns
// it into a document with `docFromText`, so stored data already has its final shape.

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: unknown[];
}

export interface RichDoc extends RichNode {
  type: 'doc';
}

/** Largest stored document, as JSON. */
export const MAX_RICH_BYTES = 200_000;

/** A document of one paragraph per line; null for empty text. */
export function docFromText(text: string): RichDoc | null {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return null;
  return {
    type: 'doc',
    content: normalized
      .split('\n')
      .map((line) =>
        line
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' },
      ),
  };
}

// Nodes whose text is followed by a line break when flattened.
const BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'horizontalRule',
]);

/** The document's text: one line per block, mentions as their label. */
export function textFromDoc(doc: RichNode | null | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  let line = '';
  const walk = (node: RichNode) => {
    if (node.type === 'text') line += node.text ?? '';
    else if (node.type === 'hardBreak') line += '\n';
    else if (node.type === 'mention') {
      const label = node.attrs?.label;
      line += typeof label === 'string' ? `@${label}` : '';
    }
    let hasBlockChild = false;
    for (const child of node.content ?? []) {
      // A block starts a new line; text before it (inside the same parent) ends there.
      if (BLOCKS.has(child.type)) {
        hasBlockChild = true;
        if (line) {
          lines.push(line);
          line = '';
        }
      }
      walk(child);
    }
    // A block ends its line. One that only wraps other blocks (a list item) adds no line itself,
    // while an empty paragraph is a blank line the author wrote.
    if (BLOCKS.has(node.type) && (line || !hasBlockChild)) {
      lines.push(line);
      line = '';
    }
  };
  walk(doc);
  if (line) lines.push(line);
  return lines.join('\n').replace(/^\n+|\n+$/g, '');
}
