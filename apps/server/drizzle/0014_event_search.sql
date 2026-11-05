-- Events are searchable and mentionable like goals and tasks (D39): the same generated search
-- vector and title trigram index as 0004_search and 0010_commitment_search.
ALTER TABLE "events" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX "events_search_vector_index" ON "events" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "events_title_trgm_index" ON "events" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
