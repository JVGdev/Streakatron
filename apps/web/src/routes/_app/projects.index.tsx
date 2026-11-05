import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { EntityIcon } from '@/components/entity-icon';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOpenSheet } from '@/hooks/use-open-task';
import { useStructureActions } from '@/lib/actions';
import { countdown } from '@/lib/days';
import { RequiredBadge } from '@/components/project-status';
import { STATUS_LABEL } from '@/lib/look';
import { countsTowardLimit } from '@/lib/project-status';
import { areasQuery, meQuery, projectsQuery, type Area, type Project } from '@/lib/queries';
import { editArea, newArea, newProject } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/projects/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(areasQuery),
      context.queryClient.ensureQueryData(projectsQuery),
    ]),
  component: ProjectsPage,
});

const STATUS_RANK = { active: 0, parked: 1, completed: 2, archived: 3 } as const;

function ProjectsPage() {
  const { data: areas = [] } = useQuery(areasQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: me } = useQuery(meQuery);
  const actions = useStructureActions();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const open = areas.filter((a) => !a.archivedAt);
  const archived = areas.filter((a) => a.archivedAt);
  const loose = projects.filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId));
  const active = projects.filter(countsTowardLimit).length;
  const required = projects.filter((p) => p.status === 'active' && p.required).length;
  const limit = me?.settings.activeProjectLimit ?? 3;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = areas.map((a) => a.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) void actions.reorderAreas(arrayMove(ids, from, to));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description={
          <>
            <span className={cn(active >= limit && 'font-medium text-foreground')}>
              {active} of {limit} active
            </span>
            {required > 0 && ` (+${required} required)`}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={newArea}>
              New area
            </Button>
            <Button onClick={() => newProject()}>
              <Plus />
              New project
            </Button>
          </>
        }
      />

      {areas.length === 0 && projects.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed px-6 py-12 text-center">
          <p className="font-medium">Start with what you’re working on.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Areas group your projects; each project has goals, tasks and a board.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={newArea}>
              New area
            </Button>
            <Button onClick={() => newProject()}>New project</Button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={open.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {open.map((a) => (
            <SortableArea key={a.id} area={a}>
              <ProjectGrid
                projects={projects.filter((p) => p.areaId === a.id)}
                today={me?.today ?? ''}
                areaId={a.id}
              />
            </SortableArea>
          ))}
        </SortableContext>
      </DndContext>

      {loose.length > 0 && (
        <section className="space-y-3">
          {areas.length > 0 && (
            <h2 className="text-sm font-semibold text-muted-foreground">No area</h2>
          )}
          <ProjectGrid projects={loose} today={me?.today ?? ''} areaId={null} />
        </section>
      )}

      {archived.length > 0 && (
        <Collapsible label={`Archived areas (${archived.length})`}>
          {archived.map((a) => (
            <AreaSection key={a.id} area={a}>
              <ProjectGrid
                projects={projects.filter((p) => p.areaId === a.id)}
                today={me?.today ?? ''}
                areaId={a.id}
              />
            </AreaSection>
          ))}
        </Collapsible>
      )}
    </div>
  );
}

function SortableArea({ area, children }: { area: Area; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: area.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('mb-8', isDragging && 'relative z-10 opacity-80')}
    >
      <AreaSection
        area={area}
        handle={
          <button
            className="-ml-1 grid size-7 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label={`Reorder ${area.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        }
      >
        {children}
      </AreaSection>
    </div>
  );
}

function AreaSection({
  area,
  handle,
  children,
}: {
  area: Area;
  handle?: ReactNode;
  children: ReactNode;
}) {
  const actions = useStructureActions();
  const openSheet = useOpenSheet();
  const { data: projects = [] } = useQuery(projectsQuery);
  const [deleting, setDeleting] = useState(false);
  const count = projects.filter((p) => p.areaId === area.id).length;

  return (
    <section id={area.id} className="scroll-mt-20 space-y-3">
      <div className="flex items-center gap-2">
        {handle}
        <EntityIcon icon={area.icon} color={area.color} />
        <h2 className="min-w-0 flex-1 truncate text-xl">
          <button
            className="max-w-full truncate text-left hover:underline"
            onClick={() => openSheet('area', area.id)}
          >
            {area.title}
          </button>
        </h2>
        <Button variant="ghost" size="sm" onClick={() => newProject(area.id)}>
          <Plus />
          <span className="hidden sm:inline">Project</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${area.title} menu`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => editArea(area.id)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void actions.updateArea(area.id, { archived: !area.archivedAt })}
            >
              {area.archivedAt ? <ArchiveRestore /> : <Archive />}
              {area.archivedAt ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{area.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {count === 0
                ? 'The area is empty.'
                : `It has ${count} project${count === 1 ? '' : 's'}. Keep them (they move to “No area”) or delete them with it.`}{' '}
              You can restore it from Settings for 30 days. To just put it away, archive it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {count > 0 && (
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleting(false);
                  void actions.deleteArea(area, 'delete');
                }}
              >
                Delete with projects
              </Button>
            )}
            <Button
              variant={count > 0 ? 'outline' : 'destructive'}
              onClick={() => {
                setDeleting(false);
                void actions.deleteArea(area, 'keep');
              }}
            >
              {count > 0 ? 'Delete, keep projects' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ProjectGrid({
  projects,
  today,
  areaId,
}: {
  projects: Project[];
  today: string;
  areaId: string | null;
}) {
  const sorted = [...projects].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const current = sorted.filter((p) => p.status === 'active' || p.status === 'parked');
  const closed = sorted.filter((p) => p.status === 'completed' || p.status === 'archived');
  return (
    <div className="space-y-3">
      {current.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {current.map((p) => (
            <ProjectCard key={p.id} project={p} today={today} />
          ))}
        </div>
      ) : (
        <button
          onClick={() => newProject(areaId)}
          className="w-full rounded-3xl border-2 border-dashed px-4 py-6 text-sm font-semibold text-muted-foreground hover:bg-muted/40"
        >
          No projects in progress. Add one?
        </button>
      )}
      {closed.length > 0 && (
        <Collapsible label={`Completed & archived (${closed.length})`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((p) => (
              <ProjectCard key={p.id} project={p} today={today} />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function ProjectCard({ project: p, today }: { project: Project; today: string }) {
  const total = p.counts.open + p.counts.done;
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: p.id }}
      className={cn(
        'group flex flex-col gap-3 rounded-3xl border-2 bg-card p-5 shadow-ledge-lg transition-colors hover:border-input',
        p.status !== 'active' && 'bg-card/60',
      )}
    >
      <div className="flex items-start gap-3">
        <EntityIcon icon={p.icon} color={p.color} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-semibold">{p.title}</div>
          {p.dueDate && (
            <div
              className={cn(
                'text-xs text-muted-foreground',
                p.dueDate < today && p.status === 'active' && 'text-destructive',
              )}
            >
              {countdown(p.dueDate, today)}
            </div>
          )}
        </div>
        {p.status !== 'active' && <Badge variant="secondary">{STATUS_LABEL[p.status]}</Badge>}
        {p.required && p.status !== 'archived' && <RequiredBadge />}
      </div>
      {p.status === 'active' && (
        <div className="flex min-h-5 items-center gap-1.5 text-sm">
          {p.nextAction ? (
            <>
              <Pin className="size-3.5 shrink-0 text-ember" />
              <span className="truncate">{p.nextAction.title}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No next action yet</span>
          )}
        </div>
      )}
      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(p.counts.done / total) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {p.counts.done}/{total}
          </span>
        </div>
      )}
    </Link>
  );
}

function Collapsible({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && children}
    </div>
  );
}
