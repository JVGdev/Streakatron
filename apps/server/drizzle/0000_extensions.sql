-- Search (plan.md §4.1): accent-insensitive full-text search and trigram fuzzy matching.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
