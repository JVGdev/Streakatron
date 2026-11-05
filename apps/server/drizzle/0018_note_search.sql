-- Notes are searchable and mentionable like events (D46): the same generated search vector and
-- title trigram index as 0004_search, 0010_commitment_search and 0014_event_search.
ALTER TABLE "notes" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX "notes_search_vector_index" ON "notes" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "notes_title_trgm_index" ON "notes" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
