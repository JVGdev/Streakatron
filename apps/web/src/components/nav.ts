import {
  BarChart3,
  CalendarDays,
  FolderKanban,
  Inbox,
  ListTodo,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: '/today' | '/inbox' | '/projects' | '/tasks' | '/calendar' | '/stats';
  label: string;
  icon: LucideIcon;
  /** In the phone's bottom bar (five fit). */
  phone: boolean;
}

export const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: Sun, phone: true },
  { to: '/inbox', label: 'Inbox', icon: Inbox, phone: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, phone: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, phone: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, phone: true },
  { to: '/stats', label: 'Stats', icon: BarChart3, phone: false },
];
