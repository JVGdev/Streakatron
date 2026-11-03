import { BarChart3, CalendarDays, FolderKanban, Inbox, Sun, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: '/today' | '/inbox' | '/projects' | '/calendar' | '/stats';
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];
