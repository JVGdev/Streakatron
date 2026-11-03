import { createFileRoute } from '@tanstack/react-router';
import { FolderKanban } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/_app/projects')({
  component: () => (
    <ComingSoon
      icon={FolderKanban}
      title="Projects"
      description="Areas, projects and goals, with Kanban boards and an active-project limit."
      phase="Phase 1"
    />
  ),
});
