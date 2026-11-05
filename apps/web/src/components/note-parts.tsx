// Post-its (D46): the face a note shows on the board and on the focus page, the colour swatches,
// and a read-only view of rich text (the board shows many notes; editors open one at a time).

import { NOTE_COLORS, noteTilt, type NoteColor } from '@streakatron/shared/notes';
import type { RichNode } from '@streakatron/shared/rich';
import { Check } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { NOTE_COLOR_LABEL, noteOrigin } from '@/lib/notes';
import type { Note } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { MentionChip } from './mention-chip';

/** The six paper colours, as round swatches. */
export function NoteColors({
  value,
  onChange,
  className,
}: {
  value: NoteColor;
  onChange: (c: NoteColor) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Colour" className={cn('flex gap-1.5', className)}>
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={NOTE_COLOR_LABEL[c]}
          title={NOTE_COLOR_LABEL[c]}
          data-color={c}
          onClick={() => onChange(c)}
          className="postit grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {c === value && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/**
 * A post-it's face: its text in a hand, its project and origin at the foot. Tilted slightly unless
 * `straight`; the board lays it out, this only draws it.
 */
export function PostItFace({
  note,
  projectTitle,
  straight,
  className,
  style,
  children,
}: {
  note: Note;
  projectTitle?: string;
  straight?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const origin = noteOrigin(note);
  const foot = [projectTitle, origin].filter(Boolean).join(' · ');
  return (
    <div
      data-color={note.color}
      className={cn(
        'postit relative flex size-48 flex-col rounded-[2px] p-3.5 pt-5 transition-[rotate,scale] duration-150',
        !straight && 'rotate-(--tilt)',
        className,
      )}
      style={{ '--tilt': `${noteTilt(note.id)}deg`, ...style } as CSSProperties}
    >
      <div className="min-h-0 flex-1 overflow-hidden font-hand text-[1.35rem] leading-[1.15] [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        {note.description ? (
          <RichView doc={note.description} />
        ) : (
          <span className="opacity-45">Empty note</span>
        )}
      </div>
      {foot && <div className="mt-1 truncate text-[11px] font-semibold opacity-60">{foot}</div>}
      {children}
    </div>
  );
}

// --- A read-only view of rich text -----------------------------------------------------------

const MARKS: Record<string, string> = {
  bold: 'font-bold',
  italic: 'italic',
  strike: 'line-through',
  code: 'font-mono text-[0.85em]',
  underline: 'underline',
};

function Inline({ node }: { node: RichNode }) {
  if (node.type === 'hardBreak') return <br />;
  if (node.type === 'mention') {
    const { id, label } = (node.attrs ?? {}) as { id?: string; label?: string };
    return <MentionChip id={id ?? ''} label={label} />;
  }
  if (node.type !== 'text') return <Nodes nodes={node.content} />;
  const marks = (node.marks ?? []) as { type: string; attrs?: { href?: string } }[];
  const cls = marks.map((m) => MARKS[m.type]).filter(Boolean);
  const link = marks.find((m) => m.type === 'link')?.attrs?.href;
  const text = cls.length ? <span className={cls.join(' ')}>{node.text}</span> : node.text;
  return link ? (
    <a href={link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {text}
    </a>
  ) : (
    <>{text}</>
  );
}

function Block({ node }: { node: RichNode }) {
  const kids = <Nodes nodes={node.content} />;
  switch (node.type) {
    case 'paragraph':
      return <p>{kids}</p>;
    case 'heading':
      return <p className="font-bold">{kids}</p>;
    case 'bulletList':
      return <ul className="list-disc pl-5">{kids}</ul>;
    case 'orderedList':
      return <ol className="list-decimal pl-5">{kids}</ol>;
    case 'listItem':
      return <li>{kids}</li>;
    case 'blockquote':
      return <blockquote className="border-l-2 border-current/30 pl-2">{kids}</blockquote>;
    case 'codeBlock':
      return <pre className="font-mono text-xs whitespace-pre-wrap">{kids}</pre>;
    case 'horizontalRule':
      return <hr className="my-1 border-current/30" />;
    default:
      return <Inline node={node} />;
  }
}

function Nodes({ nodes }: { nodes: RichNode[] | undefined }) {
  return (
    <>
      {nodes?.map((n, i) => (
        <Block key={i} node={n} />
      ))}
    </>
  );
}

/** A document as text, without an editor (mentions as chips). */
export function RichView({ doc, className }: { doc: RichNode; className?: string }) {
  return (
    <div className={cn('grid gap-1', className)}>
      <Nodes nodes={doc.content} />
    </div>
  );
}

/** A small post-it (the focus page's notes): its first line in a hand, opens its sheet. */
export function PostItMini({ note, onOpen }: { note: Note; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-color={note.color}
      onClick={onOpen}
      aria-label={`Note: ${note.title || 'empty'}`}
      className="postit flex size-24 rotate-(--tilt) items-start overflow-hidden rounded-[2px] p-2 pt-3 text-left font-hand text-base leading-tight transition-[rotate] hover:rotate-0 focus-visible:rotate-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ '--tilt': `${noteTilt(note.id)}deg` } as CSSProperties}
    >
      <span className="line-clamp-4">{note.title || 'Empty note'}</span>
    </button>
  );
}
