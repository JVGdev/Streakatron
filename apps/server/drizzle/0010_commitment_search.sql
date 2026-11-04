-- Commitments are searchable and mentionable like goals and tasks (D31): the same generated
-- search vector and title trigram index as 0004_search.
ALTER TABLE "commitments" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, f_unaccent("title")), 'A') ||
  setweight(to_tsvector('simple'::regconfig, f_unaccent("description_text")), 'B')
) STORED;
--> statement-breakpoint
CREATE INDEX "commitments_search_vector_index" ON "commitments" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "commitments_title_trgm_index" ON "commitments" USING gin (lower(f_unaccent("title")) gin_trgm_ops);
