# Streaktron

A web app that builds consistency for studies and personal projects: real project management (areas, projects, goals, tasks, Kanban, calendar, countdowns, `@` links between anything) with light gamification (XP, levels, forgiving streaks, quests) and cosmetic rewards (loot boxes, collectibles, a customizable bedroom). Friend streaks come later.

**Status:** planning complete; implementation starts with Phase 0 (Foundation).

## Docs

- [`plan.md`](plan.md): feature spec, gamification rules, architecture, data model, roadmap
- [`.claude/context/vision.md`](.claude/context/vision.md): the main idea and principles
- [`.claude/context/decisions.md`](.claude/context/decisions.md): every decision, with its reasons
- [`.claude/context/progress.md`](.claude/context/progress.md): status and session log

## Stack (planned)

TypeScript monorepo (pnpm): React + Vite, TanStack Router/Query, Tailwind + shadcn/ui, TipTap, dnd-kit, PixiJS · Hono on Node · PostgreSQL + Drizzle · Better Auth · pg-boss · Vitest + Playwright · Docker Compose.
