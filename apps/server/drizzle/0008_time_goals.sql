-- D31: the goal kind "commitment" is now "time" (a time goal), so "commitment" means one thing.
-- Hand-written because the rows must change between the old check and the new one: this widens
-- the kind check to allow both values and renames the rows; the next (generated) migration then
-- swaps in the final checks.
ALTER TABLE "goals" DROP CONSTRAINT "goals_kind";
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_kind" CHECK ("goals"."kind" in ('outcome', 'commitment', 'time'));
--> statement-breakpoint
UPDATE "goals" SET "kind" = 'time' WHERE "kind" = 'commitment';
