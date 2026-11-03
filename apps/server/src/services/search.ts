// Finding things by title, for the command palette (and, in Phase 2, the mention picker, when this
// moves to full-text search). Accent- and case-insensitive substring match; titles that start with
// the query come first, then open things before closed ones, shorter titles, recent ones.

import { sql } from 'drizzle-orm';
import { db } from '../db/client';

export type SearchKind = 'area' | 'project' | 'goal' | 'task';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** Where it lives: the area of a project, the project of a goal or task ("Inbox" for none). */
  context: string | null;
  projectId: string | null;
  closed: boolean;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function search(userId: string, q: string, limit: number): Promise<SearchHit[]> {
  if (!q) return [];
  const needle = escapeLike(q.toLowerCase());
  const res = await db.execute<{
    kind: SearchKind;
    id: string;
    title: string;
    context: string | null;
    project_id: string | null;
    closed: boolean;
  }>(sql`
    with entities as (
      select 'area' as kind, a.id, a.title, null::text as context, null::text as project_id,
             a.archived_at is not null as closed, a.updated_at
        from areas a where a.user_id = ${userId}
      union all
      select 'project', p.id, p.title, ar.title, p.id,
             p.status in ('completed', 'archived'), p.updated_at
        from projects p left join areas ar on ar.id = p.area_id where p.user_id = ${userId}
      union all
      select 'goal', g.id, g.title, p.title, g.project_id, g.status <> 'open', g.updated_at
        from goals g join projects p on p.id = g.project_id
       where g.user_id = ${userId} and g.deleted_at is null
      union all
      select 'task', t.id, t.title, coalesce(p.title, 'Inbox'), t.project_id,
             t.completed_at is not null, t.updated_at
        from tasks t left join projects p on p.id = t.project_id
       where t.user_id = ${userId} and t.deleted_at is null
    )
    select kind, id, title, context, project_id, closed from entities
     where unaccent(lower(title)) like '%' || unaccent(${needle}) || '%'
     order by unaccent(lower(title)) like unaccent(${needle}) || '%' desc,
              closed, length(title), updated_at desc
     limit ${limit}
  `);
  return res.rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    context: r.context,
    projectId: r.project_id,
    closed: r.closed,
  }));
}
