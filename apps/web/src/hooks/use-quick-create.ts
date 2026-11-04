// Making a thing from a picker with just its title (D31, "New … “typed text”"): the defaults any
// new one gets. Each resolves to the new id, or undefined when it failed (already reported).

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCommitmentActions, useStructureActions, useTaskActions } from '@/lib/actions';
import { countsTowardLimit } from '@/lib/project-status';
import { meQuery, projectsQuery } from '@/lib/queries';

export function useQuickCreate() {
  const structure = useStructureActions();
  const tasks = useTaskActions();
  const commitments = useCommitmentActions();
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const limit = me?.settings.activeProjectLimit ?? 3;

  return {
    area: async (title: string, look?: Parameters<typeof structure.createArea>[0]) =>
      (await structure.createArea({ icon: 'folder', color: 'blue', ...look, title }))?.id,

    /** Active when there's room under the limit (D5); otherwise it starts parked, and says so. */
    project: async (title: string, areaId: string | null = null) => {
      const full = projects.filter(countsTowardLimit).length >= limit;
      const project = await structure.createProject({
        title,
        areaId,
        status: full ? 'parked' : 'active',
      });
      if (project && full) {
        toast(`“${project.title}” starts parked`, {
          description: `You have ${limit} active projects, your limit.`,
        });
      }
      return project?.id;
    },

    goal: async (title: string, projectId: string) =>
      (await structure.createGoal({ title, projectId, kind: 'outcome' }))?.id,

    task: async (title: string) => (await tasks.create({ title, position: 'top' }))?.id,

    /** Done / not done, every day: the common case (D32: defaults first). */
    commitment: async (title: string) => (await commitments.create({ title }))?.id,
  };
}
