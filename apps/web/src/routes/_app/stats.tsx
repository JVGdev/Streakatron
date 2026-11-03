import { createFileRoute } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/_app/stats')({
  component: () => (
    <ComingSoon
      icon={BarChart3}
      title="Stats"
      description="Your contribution heatmap, focus time and streak history."
      phase="Phase 3"
    />
  ),
});
