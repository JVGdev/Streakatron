import { createFileRoute } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/_app/inbox')({
  component: () => (
    <ComingSoon
      icon={Inbox}
      title="Inbox"
      description="Quick-captured tasks with no project, triaged later in the weekly review."
      phase="Phase 1"
    />
  ),
});
