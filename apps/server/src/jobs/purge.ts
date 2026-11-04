// Deleted things past their 30 days to restore: soft-deleted tasks, goals and commitments, expired
// snapshots;
// then the links whose source is gone.

import { lt } from 'drizzle-orm';
import { db } from '../db/client';
import { commitments, goals, tasks } from '../db/schema';
import { RESTORE_DAYS } from '../services/common';
import { purgeOrphanLinks } from '../services/links';
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
  const goneCommitments = await db
    .delete(commitments)
    .where(lt(commitments.deletedAt, cutoff))
    .returning({ id: commitments.id });
  const snapshots = await purgeExpiredSnapshots();
  const links = await purgeOrphanLinks();
  return {
    tasks: goneTasks.length,
    goals: goneGoals.length,
    commitments: goneCommitments.length,
    snapshots,
    links,
  };
}
