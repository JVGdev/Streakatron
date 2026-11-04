// Stats (plan.md §4.7). Phase 3: the year at a glance (a few numbers) and the contribution heatmap,
// with a table view of the same days. Focus per project, trends and quest stats come in Phase 6.

import { formatMinutes } from '@streakatron/shared/quests';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Heatmap, HeatLegend } from '@/components/heatmap';
import { PageHeader } from '@/components/page-header';
import { formatDayLong } from '@/lib/days';
import { gameQuery, heatmapQuery, meQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/stats')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(heatmapQuery),
      context.queryClient.prefetchQuery(gameQuery),
    ]),
  component: StatsPage,
});

function StatsPage() {
  const { data: heat } = useQuery(heatmapQuery);
  const { data: game } = useQuery(gameQuery);
  const { data: me } = useQuery(meQuery);
  if (!heat || !me) return null;

  const active = heat.days.filter((d) => d.active);
  const minutes = heat.days.reduce((s, d) => s + d.minutes, 0);
  const tasks = heat.days.reduce((s, d) => s + d.tasks, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Stats" description="The last year, as the server counts it." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Active days" value={String(active.length)} />
        <Tile
          label="Streak"
          value={game ? `${game.streak.current} d` : '–'}
          note={
            game && game.streak.longest > game.streak.current
              ? `Longest ${game.streak.longest}`
              : undefined
          }
        />
        <Tile label="Focus" value={minutes ? formatMinutes(minutes) : '0 min'} />
        <Tile label="Tasks done" value={String(tasks)} />
      </div>

      <section className="space-y-4 rounded-3xl border-2 bg-card p-4 shadow-ledge-lg sm:p-6">
        <h2 className="text-2xl">Your year</h2>
        <Heatmap from={heat.from} to={heat.to} days={heat.days} weekStart={me.settings.weekStart} />
        <HeatLegend />
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-muted-foreground hover:text-foreground">
            Show as a table
          </summary>
          {active.length ? (
            <table className="mt-3 w-full max-w-lg text-left">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-1 font-extrabold">Day</th>
                  <th className="py-1 text-right font-extrabold">Focus</th>
                  <th className="py-1 text-right font-extrabold">Tasks</th>
                  <th className="py-1 text-right font-extrabold">XP</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...active].reverse().map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="py-1">{formatDayLong(d.date)}</td>
                    <td className="py-1 text-right">{d.minutes} min</td>
                    <td className="py-1 text-right">{d.tasks}</td>
                    <td className="py-1 text-right">{d.xp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-muted-foreground">No active days yet.</p>
          )}
        </details>
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border-2 bg-card p-4 shadow-ledge">
      <div className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</div>
      {note && <div className="text-xs font-bold text-muted-foreground">{note}</div>}
    </div>
  );
}
