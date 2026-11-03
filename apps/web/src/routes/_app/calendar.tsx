import { createFileRoute } from '@tanstack/react-router';
import { CalendarDays } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/_app/calendar')({
  component: () => (
    <ComingSoon
      icon={CalendarDays}
      title="Calendar"
      description="Events, recurring schedule blocks, due dates and countdowns."
      phase="Phase 4"
    />
  ),
});
