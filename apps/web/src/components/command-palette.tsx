// The command palette (Ctrl/⌘ K): capture a task in a few keystrokes, jump to anything, run an
// action, tick a commitment due today. In capture mode (C) it only adds tasks: type, Enter, done.

import { Command as Cmdk } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  FolderPlus,
  Inbox,
  Keyboard,
  LayoutGrid,
  ListTodo,
  Plus,
  Repeat,
  Settings,
  Shapes,
  Star,
  StarOff,
  Sun,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useOpenEntity, useOpenSheet, useOpenTask } from '@/hooks/use-open-task';
import { isMac } from '@/hooks/use-hotkeys';
import { progressText } from '@streakatron/shared/commitments';
import { useCommitmentActions, useSpotlightActions, useTaskActions } from '@/lib/actions';
import {
  commitmentsQuery,
  goalQuery,
  projectsQuery,
  searchQuery,
  taskQuery,
  type Commitment,
  type Project,
  type SearchHit,
} from '@/lib/queries';
import { newArea, newCommitment, newProject, setUi, useUi } from '@/lib/ui-store';
import { doneToday } from '@/lib/commitments';
import { EntityIcon, RefIcon } from './entity-icon';

export function CommandPalette() {
  const ui = useUi();
  const open = !!ui.palette;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && setUi({ palette: null })}>
      {ui.palette && (
        <DialogContent
          className="top-[12%] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {ui.palette.mode === 'capture' ? 'New task' : 'Command palette'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Type to add a task, find something or run a command.
          </DialogDescription>
          <Palette mode={ui.palette.mode} close={() => setUi({ palette: null })} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function useCurrentProjectId(): string | undefined {
  return useRouterState({
    select: (s) => {
      const match = s.matches.find((m) => m.routeId === '/_app/projects/$projectId');
      return (match?.params as { projectId?: string } | undefined)?.projectId;
    },
  });
}

function Palette({ mode, close }: { mode: 'search' | 'capture'; close: () => void }) {
  const [q, setQ] = useState('');
  // What was typed, as typed: Enter right after typing must add exactly that. Only the server
  // search waits for typing to settle.
  const query = q.trim();
  const searched = useDeferredValue(query);
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const openEntity = useOpenEntity();
  const tasks = useTaskActions();
  const commitmentActions = useCommitmentActions();
  const openSheet = useOpenSheet();
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: commitments = [] } = useQuery({
    ...commitmentsQuery(),
    enabled: mode === 'search',
  });
  const dueToday = commitments.filter((c) => c.day.scheduled && !doneToday(c));
  const { data: hits = [] } = useQuery({
    ...searchQuery(searched),
    enabled: mode === 'search' && searched.length > 0,
    placeholderData: (prev) => prev,
  });
  const currentId = useCurrentProjectId();
  const current = projects.find((p) => p.id === currentId);
  // The task or goal whose sheet is open can be spotlighted from here (D33).
  const spotlight = useSpotlightActions();
  const sheet = useRouterState({
    select: (s) => s.location.search as { task?: string; goal?: string },
  });
  const { data: sheetTask } = useQuery({
    ...taskQuery(sheet.task ?? ''),
    enabled: mode === 'search' && !!sheet.task,
  });
  const { data: sheetGoal } = useQuery({
    ...goalQuery(sheet.goal ?? ''),
    enabled: mode === 'search' && !sheet.task && !!sheet.goal,
  });
  const featurable =
    sheetTask && !sheetTask.completedAt
      ? sheetTask
      : sheetGoal && sheetGoal.status === 'open'
        ? sheetGoal
        : undefined;
  const active = projects.filter((p) => p.status === 'active' && p.id !== currentId);

  async function capture(projectId: string | null, title: string) {
    close();
    const task = await tasks.create({ title, projectId, position: projectId ? 'bottom' : 'top' });
    if (task) {
      const where = projectId ? projects.find((p) => p.id === projectId)?.title : 'Inbox';
      toast.success(`Added to ${where ?? 'the project'}`, {
        description: task.title,
        action: { label: 'Open', onClick: () => openTask(task.id) },
      });
    }
  }

  function go(hit: SearchHit) {
    close();
    openEntity(hit);
  }

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  /** A check is ticked right here; amounts and minutes open the sheet to log them. */
  function logCommitment(c: Commitment) {
    close();
    if (c.measure === 'check') {
      void commitmentActions.log(c.id).then((done) => done && toast.success(`Ticked “${c.title}”`));
    } else {
      openSheet('commitment', c.id);
    }
  }

  const commands: {
    id: string;
    label: string;
    icon: LucideIcon;
    hint?: string;
    run: () => void;
  }[] = [
    {
      id: 'new-task',
      label: 'New task',
      icon: Plus,
      hint: 'C',
      run: () => setUi({ palette: { mode: 'capture' } }),
    },
    {
      id: 'new-project',
      label: 'New project',
      icon: FolderPlus,
      run: run(() => newProject(currentId ? current?.areaId : undefined)),
    },
    { id: 'new-area', label: 'New area', icon: Shapes, run: run(newArea) },
    {
      id: 'new-commitment',
      label: 'New commitment',
      icon: Repeat,
      run: run(() => newCommitment(currentId ?? null)),
    },
    ...(featurable
      ? [
          {
            id: 'spotlight',
            label: featurable.spotlightedAt
              ? `Remove “${featurable.title}” from the spotlight`
              : `Spotlight “${featurable.title}” on Today`,
            icon: featurable.spotlightedAt ? StarOff : Star,
            run: run(() => void spotlight.set(featurable, !featurable.spotlightedAt)),
          },
        ]
      : []),
    {
      id: 'go-today',
      label: 'Go to Today',
      icon: Sun,
      hint: 'G T',
      run: run(() => void navigate({ to: '/today' })),
    },
    {
      id: 'focus',
      label: 'Start focus session',
      icon: Timer,
      hint: 'G F',
      run: run(() => void navigate({ to: '/focus' })),
    },
    {
      id: 'go-inbox',
      label: 'Go to Inbox',
      icon: Inbox,
      hint: 'G I',
      run: run(() => void navigate({ to: '/inbox' })),
    },
    {
      id: 'go-projects',
      label: 'Go to Projects',
      icon: LayoutGrid,
      hint: 'G P',
      run: run(() => void navigate({ to: '/projects' })),
    },
    {
      id: 'go-commitments',
      label: 'Go to Commitments',
      icon: Repeat,
      run: run(() => void navigate({ to: '/commitments' })),
    },
    {
      id: 'go-tasks',
      label: 'Go to all tasks',
      icon: ListTodo,
      hint: 'G L',
      run: run(() => void navigate({ to: '/tasks' })),
    },
    {
      id: 'go-settings',
      label: 'Go to Settings',
      icon: Settings,
      hint: 'G S',
      run: run(() => void navigate({ to: '/settings' })),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      hint: '?',
      run: run(() => setUi({ shortcuts: true })),
    },
  ];
  const needle = query.toLowerCase();
  const matchingCommands = needle
    ? commands.filter((c) => c.label.toLowerCase().includes(needle))
    : commands;

  // Where a typed title can go: on a project page in capture mode that project comes first.
  const here = current && current.status !== 'archived' ? current : undefined;
  const inbox = { id: null, project: undefined };
  const targets: { id: string | null; project?: Project }[] = [
    ...(mode === 'capture' && here ? [{ id: here.id, project: here }, inbox] : [inbox]),
    ...(mode === 'search' && here ? [{ id: here.id, project: here }] : []),
    ...active.slice(0, 5).map((p) => ({ id: p.id, project: p })),
  ];

  return (
    <Cmdk shouldFilter={false} loop className="flex max-h-[70dvh] flex-col">
      <div className="flex items-center gap-2 border-b px-4">
        {mode === 'capture' ? (
          <Plus className="size-4 text-primary" />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {isMac ? '⌘K' : 'Ctrl K'}
          </span>
        )}
        <Cmdk.Input
          autoFocus
          value={q}
          onValueChange={setQ}
          maxLength={200}
          placeholder={
            mode === 'capture'
              ? 'New task… (Enter adds it to the inbox)'
              : 'Add a task, find anything, or run a command'
          }
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Cmdk.List className="overflow-y-auto p-2">
        <Cmdk.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          {mode === 'capture' ? 'Type a title.' : 'Nothing found.'}
        </Cmdk.Empty>

        {query && (
          <Group heading="Add task">
            {targets.map((t, i) => (
              <Item
                key={t.id ?? 'inbox'}
                value={`capture-${t.id ?? 'inbox'}`}
                icon={
                  t.project ? (
                    <EntityIcon icon={t.project.icon} color={t.project.color} size="sm" />
                  ) : (
                    <Inbox />
                  )
                }
                onSelect={() => void capture(t.id, query)}
                hint={i === 0 ? '↵' : undefined}
              >
                {i === 0 ? <>Add “{query}” to </> : <>Add to </>}
                <b>{t.project?.title ?? 'Inbox'}</b>
              </Item>
            ))}
          </Group>
        )}

        {mode === 'search' && query && hits.length > 0 && (
          <Group heading="Found">
            {hits.map((h) => (
              <Item
                key={h.id}
                value={h.id}
                icon={<RefIcon entity={h} />}
                onSelect={() => go(h)}
                hint={h.context ?? undefined}
              >
                <span className={h.closed ? 'text-muted-foreground line-through' : undefined}>
                  {h.title}
                </span>
                {h.snippet && (
                  <span className="block truncate text-xs text-muted-foreground">{h.snippet}</span>
                )}
              </Item>
            ))}
          </Group>
        )}

        {mode === 'search' && !query && dueToday.length > 0 && (
          <Group heading="Commitments due today">
            {dueToday.map((c) => (
              <Item
                key={c.id}
                value={`commitment-${c.id}`}
                icon={<Repeat />}
                onSelect={() => logCommitment(c)}
                hint={c.measure === 'check' ? 'Tick' : progressText(c, c.day.progress)}
              >
                {c.title}
              </Item>
            ))}
          </Group>
        )}

        {mode === 'search' && matchingCommands.length > 0 && (
          <Group heading="Commands">
            {matchingCommands.map((c) => (
              <Item key={c.id} value={c.id} icon={<c.icon />} onSelect={c.run} hint={c.hint}>
                {c.label}
              </Item>
            ))}
          </Group>
        )}

        {mode === 'search' && !query && active.length + (current ? 1 : 0) > 0 && (
          <Group heading="Active projects">
            {projects
              .filter((p) => p.status === 'active')
              .map((p) => (
                <Item
                  key={p.id}
                  value={`project-${p.id}`}
                  icon={<EntityIcon icon={p.icon} color={p.color} size="sm" />}
                  onSelect={run(
                    () =>
                      void navigate({ to: '/projects/$projectId', params: { projectId: p.id } }),
                  )}
                  hint={p.nextAction?.title}
                >
                  {p.title}
                </Item>
              ))}
          </Group>
        )}
      </Cmdk.List>
    </Cmdk>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Cmdk.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Cmdk.Group>
  );
}

function Item({
  value,
  icon,
  hint,
  onSelect,
  children,
}: {
  value: string;
  icon: ReactNode;
  hint?: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Cmdk.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="max-w-40 truncate text-xs text-muted-foreground">{hint}</span>}
    </Cmdk.Item>
  );
}
