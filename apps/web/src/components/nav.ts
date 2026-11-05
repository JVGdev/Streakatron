import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  FolderKanban,
  Inbox,
  ListTodo,
  Repeat,
  StickyNote,
  Sun,
  Timer,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to:
    | '/today'
    | '/focus'
    | '/inbox'
    | '/projects'
    | '/commitments'
    | '/tasks'
    | '/calendar'
    | '/review'
    | '/notes'
    | '/stats';
  label: string;
  icon: LucideIcon;
  /** In the phone's bottom bar (five fit). */
  phone: boolean;
  /** Not built yet: hidden from navigation until its phase lands (the route still exists). */
  later?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: Sun, phone: true },
  { to: '/focus', label: 'Focus', icon: Timer, phone: false },
  { to: '/inbox', label: 'Inbox', icon: Inbox, phone: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, phone: true },
  { to: '/commitments', label: 'Commitments', icon: Repeat, phone: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, phone: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, phone: false },
  { to: '/notes', label: 'Notes', icon: StickyNote, phone: false },
  { to: '/review', label: 'Review', icon: ClipboardCheck, phone: false },
  { to: '/stats', label: 'Stats', icon: BarChart3, phone: false },
];
