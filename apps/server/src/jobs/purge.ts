// Deleted things past their 30 days to restore: soft-deleted tasks and goals, expired snapshots.

import { lt } from 'drizzle-orm';
import { db } from '../db/client';
import { goals, tasks } from '../db/schema';
import { RESTORE_DAYS } from '../services/common';
import { purgeExpiredSnapshots } from '../services/snapshots';

export async function runPurge(now = new Date()) {
  const cutoff = new Date(now.getTime() - RESTORE_DAYS * 86_400_000);
  const goneTasks = await db
    .delete(tasks)
    .where(lt(tasks.deletedAt, cutoff))
    .returning({ id: tasks.id });
  const goneGoals = await db
    .delete(goals)
    .where(lt(goals.deletedAt, cutoff))
    .returning({ id: goals.id });
  const snapshots = await purgeExpiredSnapshots();
  return { tasks: goneTasks.length, goals: goneGoals.length, snapshots };
}
