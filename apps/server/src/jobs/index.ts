// Background jobs on pg-boss (Postgres-backed queue, in its own `pgboss` schema). Failures are
// retried with backoff and logged; they never affect a request.

import { PgBoss } from 'pg-boss';
import { env } from '../env';
import { runBackup } from './backup';
import { runPurge } from './purge';
import { runReminders } from '../services/reminders';
import { runRepeats } from '../services/repeats';

export const QUEUES = {
  backup: 'backup',
  purge: 'purge',
  reminders: 'reminders',
  repeats: 'repeats',
} as const;

export async function startJobs(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => console.error('[jobs] pg-boss error', err));
  await boss.start();

  await boss.createQueue(QUEUES.backup, {
    policy: 'exclusive', // never two backups at once
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  });
  await boss.work(QUEUES.backup, async () => {
    const result = await runBackup();
    if (result.status === 'created') {
      console.log(`[jobs] backup written: ${result.file} (${result.bytes} bytes)`);
      for (const name of result.pruned) console.log(`[jobs] old backup removed: ${name}`);
    }
  });
  // Hourly; the job itself makes at most one backup per day.
  await boss.schedule(QUEUES.backup, '17 * * * *');
  // And once at startup, for a machine that was off when the last one was due.
  await boss.send(QUEUES.backup);

  await boss.createQueue(QUEUES.purge, { policy: 'exclusive', retryLimit: 3, retryDelay: 300 });
  await boss.work(QUEUES.purge, async () => {
    const gone = await runPurge();
    if (gone.tasks || gone.goals || gone.snapshots) {
      console.log(
        `[jobs] purged ${gone.tasks} task(s), ${gone.goals} goal(s), ${gone.snapshots} snapshot(s) past 30 days`,
      );
    }
  });
  await boss.schedule(QUEUES.purge, '43 * * * *');

  // Reminders (D38): every minute; a missed run is caught up by the next (each reminder has a
  // grace), so no retries, and never two at once.
  await boss.createQueue(QUEUES.reminders, { policy: 'exclusive', retryLimit: 0 });
  await boss.work(QUEUES.reminders, async () => {
    const sent = await runReminders();
    if (sent) console.log(`[jobs] sent ${sent} reminder(s)`);
  });
  await boss.schedule(QUEUES.reminders, '* * * * *');

  // Recurring tasks (D43): a schedule's occurrence on its day while the last one isn't done. Each
  // run catches up whatever is owed, so no retries.
  await boss.createQueue(QUEUES.repeats, { policy: 'exclusive', retryLimit: 0 });
  await boss.work(QUEUES.repeats, async () => {
    const made = await runRepeats();
    if (made) console.log(`[jobs] made ${made} repeating task(s)`);
  });
  await boss.schedule(QUEUES.repeats, '*/5 * * * *');
  await boss.send(QUEUES.repeats);

  return boss;
}
