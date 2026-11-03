-- Search (plan.md §4.1, Phase 2): full-text search over titles and descriptions, accent- and
-- case-insensitive, plus trigram matching on titles for typos. Hand-written: Drizzle can't express
-- these generated columns and expression indexes, and its schema doesn't list them (queries use
-- them through raw SQL in services/search.ts).
--
-- `unaccent()` is only STABLE (its dictionary could change), so it can't be used in a generated
-- column or an index. This wrapper names the dictionary explicitly and is declared IMMUTABLE,
-- the usual way around it.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
-- The 'simple' configuration: no stemming or stop words, so text in any language matches the
-- same way (the UI is English; what people write may not be).
ALTER TABLE "areas" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX "areas_search_vector_index" ON "areas" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "projects_search_vector_index" ON "projects" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "goals_search_vector_index" ON "goals" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "tasks_search_vector_index" ON "tasks" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "areas_title_trgm_index" ON "areas" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "projects_title_trgm_index" ON "projects" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "goals_title_trgm_index" ON "goals" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_index" ON "tasks" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
