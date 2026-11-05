// The Notes board (D42, D46): post-its on a freeform canvas, no columns. Drag the empty space (or
// scroll) to look around, Ctrl + scroll, a pinch or the buttons to zoom, "Fit" to see them all.
// Drag a post-it anywhere (it comes to the top); drop it on Task, Add to task or Dismiss to sort
// it. Click one to open it; double-click the empty space to write one there.

import { NOTE_SIZE } from '@streakatron/shared/notes';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ListPlus, ListTodo, Maximize, Minus, Plus, StickyNote, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { PostItFace } from '@/components/note-parts';
import { Button } from '@/components/ui/button';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useNoteActions } from '@/lib/actions';
import { notesQuery, projectsQuery, type Note } from '@/lib/queries';
import { newNote, setUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/notes')({ component: NotesPage });

function NotesPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-4xl tracking-tight">Notes</h1>
        <Button onClick={() => newNote()}>
          <StickyNote />
          New note
        </Button>
      </header>
      <Board />
    </div>
  );
}

// --- The view: screen = world × s + (x, y) ---------------------------------------------------

interface View {
  x: number;
  y: number;
  s: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const VIEW_KEY = 'streakatron:notes-view';
/** How far a pointer moves before a press on a post-it becomes a drag. */
const DRAG_SLOP = 4;

function savedView(): View | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as View | null;
    return v && [v.x, v.y, v.s].every(Number.isFinite) ? { ...v, s: clampScale(v.s) } : null;
  } catch {
    return null;
  }
}

function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    // Not kept: the board fits its notes next time.
  }
}

/** Every post-it in view (or the origin, with none), at most at 100%. */
function fitView(notes: readonly Note[], w: number, h: number): View {
  if (!notes.length) return { x: 32, y: 32, s: 1 };
  const pad = 48;
  const minX = Math.min(...notes.map((n) => n.x));
  const minY = Math.min(...notes.map((n) => n.y));
  const maxX = Math.max(...notes.map((n) => n.x)) + NOTE_SIZE;
  const maxY = Math.max(...notes.map((n) => n.y)) + NOTE_SIZE;
  const s = clampScale(Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY), 1));
  return {
    s,
    x: (w - (maxX - minX) * s) / 2 - minX * s,
    y: (h - (maxY - minY) * s) / 2 - minY * s,
  };
}

/** Below this, post-its are hard to read: the first view starts here at least (Fit can go further). */
const START_SCALE = 0.6;

/** The first view: every post-it when they fit readably, else the top-left of them at a readable size. */
function startView(notes: readonly Note[], w: number, h: number): View {
  const fitted = fitView(notes, w, h);
  if (fitted.s >= START_SCALE || !notes.length) return fitted;
  const pad = 24;
  const minX = Math.min(...notes.map((n) => n.x));
  const minY = Math.min(...notes.map((n) => n.y));
  return { s: START_SCALE, x: pad - minX * START_SCALE, y: pad - minY * START_SCALE };
}

/** Zoom to `s` keeping the board point under (px, py) where it is. */
const zoomAt = (v: View, s: number, px: number, py: number): View => {
  const next = clampScale(s);
  return { s: next, x: px - ((px - v.x) / v.s) * next, y: py - ((py - v.y) / v.s) * next };
};

// --- Sorting by dropping ---------------------------------------------------------------------

type DropKind = 'task' | 'append' | 'dismiss';

const DROPS: { kind: DropKind; label: string; icon: typeof ListTodo }[] = [
  { kind: 'task', label: 'Task', icon: ListTodo },
  { kind: 'append', label: 'Add to task', icon: ListPlus },
  { kind: 'dismiss', label: 'Dismiss', icon: X },
];

/** The drop target under a point, if any. */
function dropAt(cx: number, cy: number): DropKind | null {
  for (const el of document.elementsFromPoint(cx, cy)) {
    const drop = (el as HTMLElement).closest<HTMLElement>('[data-drop]');
    if (drop) return drop.dataset.drop as DropKind;
  }
  return null;
}

interface Drag {
  id: string;
  x: number;
  y: number;
  over: DropKind | null;
}

// --- The board -------------------------------------------------------------------------------

function Board() {
  const { data: notes, isPending } = useQuery(notesQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const actions = useNoteActions();
  const openSheet = useOpenSheet();
  const boxRef = useRef<HTMLDivElement>(null);
  const [kept, setView] = useState<View | null>(savedView);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // With no view kept, the board starts fitting its notes, then stays put (a new note doesn't
  // move it). Set while rendering: React's way to start state from what just arrived.
  if (!kept && notes && box) setView(startView(notes, box.w, box.h));
  const view = kept;
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [panning, setPanning] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; view: View } | null>(null);

  const size = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 800, h: r?.height ?? 600, left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  // The board's size, for fitting.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the view for next time, once it settles.
  useEffect(() => {
    if (!kept) return;
    const t = setTimeout(() => saveView(kept), 300);
    return () => clearTimeout(t);
  }, [kept]);

  // Scroll pans; Ctrl/⌘ + scroll (and a trackpad pinch) zooms. Not passive, to keep the page still.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const { left, top } = size();
        setView(zoomAt(v, v.s * Math.exp(-e.deltaY * 0.01), e.clientX - left, e.clientY - top));
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    if (!v) return;
    const { w, h } = size();
    setView(zoomAt(v, v.s * factor, w / 2, h / 2));
  };
  const fit = () => {
    const { w, h } = size();
    setView(fitView(notes ?? [], w, h));
  };

  // --- Panning and pinching the empty space ---

  const onBoardDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-note],[data-controls]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && viewRef.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current };
    }
    setPanning(true);
  };

  const onBoardMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId);
    const v = viewRef.current;
    if (!last || !v) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const { left, top } = size();
      const p = pinch.current;
      const s = p.view.s * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist);
      setView(zoomAt(v, s, (a.x + b.x) / 2 - left, (a.y + b.y) / 2 - top));
      return;
    }
    setView({ ...v, x: v.x + e.clientX - last.x, y: v.y + e.clientY - last.y });
  };

  const onBoardUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) setPanning(false);
  };

  const onBoardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = viewRef.current;
    if (!v || (e.target as HTMLElement).closest('[data-note],[data-controls]')) return;
    const { left, top } = size();
    newNote({
      x: Math.round((e.clientX - left - v.x) / v.s - NOTE_SIZE / 2),
      y: Math.round((e.clientY - top - v.y) / v.s - NOTE_SIZE / 2),
    });
  };

  // --- Dragging a post-it ---

  const drop = useCallback(
    (note: Note, x: number, y: number, over: DropKind | null) => {
      const ref = { id: note.id, title: note.title };
      if (over === 'dismiss') void actions.dismiss(ref);
      else if (over === 'task' && note.title) void actions.toTask(ref);
      else if (over === 'append' && note.title) setUi({ addToTask: ref });
      else void actions.move(note, x, y);
    },
    [actions],
  );

  const onNoteDown = (e: ReactPointerEvent<HTMLDivElement>, note: Note) => {
    if (e.button !== 0) return;
    // A link or a mention chip on the note does its own thing.
    if ((e.target as HTMLElement).closest('a,[data-mention]')) return;
    e.stopPropagation();
    const start = { cx: e.clientX, cy: e.clientY };
    let moved = false;
    let last: Drag | null = null;

    const move = (ev: PointerEvent) => {
      const v = viewRef.current;
      if (!v) return;
      const dx = ev.clientX - start.cx;
      const dy = ev.clientY - start.cy;
      if (!moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      moved = true;
      last = {
        id: note.id,
        x: note.x + dx / v.s,
        y: note.y + dy / v.s,
        over: dropAt(ev.clientX, ev.clientY),
      };
      setDrag(last);
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDrag(null);
      if (ev.type === 'pointercancel') return;
      if (moved && last) drop(note, last.x, last.y, last.over);
      else if (!moved) openSheet('note', note.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onNoteKey = (e: ReactKeyboardEvent<HTMLDivElement>, note: Note) => {
    const step = e.shiftKey ? 64 : 16;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSheet('note', note.id);
    } else if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key]!;
      void actions.move(note, note.x + dx, note.y + dy);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void actions.dismiss({ id: note.id, title: note.title });
    }
  };

  const titleOf = new Map(projects.map((p) => [p.id, p.title]));
  const dragged = drag ? notes?.find((n) => n.id === drag.id) : undefined;
  const v = view ?? { x: 0, y: 0, s: 1 };
  const dot = 24 * v.s;

  return (
    <div
      ref={boxRef}
      role="application"
      aria-label="Notes board"
      aria-roledescription="board"
      className={cn(
        'relative h-[calc(100dvh-19rem)] min-h-80 touch-none overflow-hidden rounded-2xl border-2 bg-muted/40 select-none md:h-[calc(100dvh-12rem)]',
        panning ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{
        backgroundImage: 'radial-gradient(var(--border) 1.2px, transparent 1.2px)',
        backgroundSize: `${dot}px ${dot}px`,
        backgroundPosition: `${v.x}px ${v.y}px`,
      }}
      onPointerDown={onBoardDown}
      onPointerMove={onBoardMove}
      onPointerUp={onBoardUp}
      onPointerCancel={onBoardUp}
      onDoubleClick={onBoardDoubleClick}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` }}
      >
        {notes?.map((n) => {
          const lifted = drag?.id === n.id;
          return (
            <div
              key={n.id}
              data-note={n.id}
              role="button"
              tabIndex={0}
              aria-label={`Note: ${n.title || 'empty'}`}
              className={cn(
                'group absolute cursor-pointer rounded-[2px] outline-none focus-visible:ring-4 focus-visible:ring-ring/60',
                lifted && 'pointer-events-none cursor-grabbing',
              )}
              style={{
                left: lifted ? drag.x : n.x,
                top: lifted ? drag.y : n.y,
                zIndex: lifted ? 1_000_000 : n.z,
                opacity: lifted && drag.over ? 0.75 : 1,
              }}
              onPointerDown={(e) => onNoteDown(e, n)}
              onKeyDown={(e) => onNoteKey(e, n)}
            >
              <PostItFace
                note={n}
                projectTitle={n.projectId ? titleOf.get(n.projectId) : undefined}
                straight={lifted}
                className={cn(
                  'group-hover:rotate-0 group-focus-visible:rotate-0',
                  lifted && 'scale-105 shadow-2xl',
                )}
              />
            </div>
          );
        })}
      </div>

      {!isPending && notes?.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-muted-foreground">
          No notes yet. Press N on any page to write one, or double-click here.
        </p>
      )}

      {dragged && (
        <div
          data-controls
          className="absolute inset-x-0 bottom-4 flex justify-center gap-2 px-4"
          aria-hidden
        >
          {DROPS.filter((d) => d.kind === 'dismiss' || dragged.title).map(
            ({ kind, label, icon: Icon }) => (
              <div
                key={kind}
                data-drop={kind}
                className={cn(
                  'flex min-w-28 flex-col items-center gap-1 rounded-xl border-2 border-dashed bg-background/90 px-4 py-3 text-sm font-bold text-muted-foreground shadow-sm backdrop-blur transition-colors',
                  drag?.over === kind && 'border-primary bg-primary/10 text-foreground',
                )}
              >
                <Icon className="size-5" />
                {label}
              </div>
            ),
          )}
        </div>
      )}

      {!dragged && (
        <div
          data-controls
          className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-xl border bg-background/90 p-1 shadow-sm backdrop-blur"
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Minus />
          </Button>
          <button
            type="button"
            className="w-12 text-center text-xs font-bold text-muted-foreground tabular-nums hover:text-foreground"
            aria-label="Zoom to 100%"
            onClick={() => zoomBy(1 / v.s)}
          >
            {Math.round(v.s * 100)}%
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.25)}
          >
            <Plus />
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={fit}>
            <Maximize />
            Fit
          </Button>
        </div>
      )}
    </div>
  );
}
