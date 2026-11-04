import type { ProjectStatus } from '@streakatron/shared/structure';
import { createContext, useContext } from 'react';

export type ChangeStatus = (
  project: { id: string; title: string },
  status: ProjectStatus,
) => Promise<boolean>;

/** Whether a project takes one of the active slots (D5); required ones don't (D32). */
export const countsTowardLimit = (p: { status: ProjectStatus; required: boolean }) =>
  p.status === 'active' && !p.required;

export const ProjectStatusContext = createContext<ChangeStatus | null>(null);

/** Change a project's status; over the active limit, the shell's dialog takes over. */
export function useProjectStatus(): ChangeStatus {
  const change = useContext(ProjectStatusContext);
  if (!change) throw new Error('useProjectStatus needs <ProjectStatusProvider>');
  return change;
}
