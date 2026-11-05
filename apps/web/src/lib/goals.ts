// Goal words and icons shared by the goals panel, the goal sheet and the review (D45).

import type { GoalKind } from '@streakatron/shared/structure';
import { Hash, Target, Timer, type LucideIcon } from 'lucide-react';
import { formatMinutes } from './days';
import type { Goal } from './queries';

export const GOAL_ICON: Record<GoalKind, LucideIcon> = {
  outcome: Target,
  time: Timer,
  number: Hash,
};

/** "40 lessons", or "40" with no unit. */
export const withUnit = (n: number, unit: string | null) => (unit ? `${n} ${unit}` : String(n));

/** A goal's kind and target, in words (the sheet's Kind row). */
export function goalKindText(goal: Goal): string {
  if (goal.kind === 'time' && goal.targetMinutes && goal.period) {
    return `Time goal · ${formatMinutes(goal.targetMinutes)} of focus a ${goal.period}`;
  }
  if (goal.kind === 'number' && goal.targetCount) {
    return `Number · ${withUnit(goal.targetCount, goal.unit)}`;
  }
  return 'Outcome';
}
