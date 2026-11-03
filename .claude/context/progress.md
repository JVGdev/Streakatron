# Progress

## Status

- **Current phase:** Phase 0 (Foundation) done → **Phase 1 (Structure & views) next**.
- **Code:** monorepo with server, web and shared packages; 56 tests passing. **Repository:** https://github.com/JVGdev/streaktron (private, `main`).
- **Running over Tailscale:** the Docker app is served at `https://hills.tail99ef4d.ts.net:8443` (port 8443, because the root of that address serves Quire on :8788; never replace it). Verified from the laptop over HTTPS (page, sign-in with a Secure cookie, `/me`); not yet opened from the phone.
- **Open questions:** deferred by the user (plan.md §13). Pending confirmation: the loot-box timing for make quests (decisions.md D16).

## Next steps

1. The user opens `https://hills.tail99ef4d.ts.net:8443` on the phone; that closes Phase 0's acceptance.
2. Phase 1 (plan.md §9): areas, projects with the active-project limit, goals, tasks, Kanban, list view, next action, command palette, snapshots.
3. Then Phases 2–3 to reach the MVP and start dogfooding.

---

## Session log

### 2026-11-03 — Planning session
- **Brainstormed the concept.** The user reported all five consistency failure modes and chose light gamification; English UI; free-form mentions with no behavioral effect; a hard active-project limit; generic calendar/schedule/countdown features (not study-specific).
- **Wrote `plan.md`:** vision, feature spec, gamification rules, architecture, data model, API, phases.
- **Merged `observations.txt` (round 1):** quest types, a loot box per quest with rarities, the bedroom, friend streaks. The user deferred the social backend, friend-streak ordering and bedroom art.
- **Studied Quire** (`~/Documentos/quire`) for reuse and lessons; added plan.md §11. The user declined a Quire integration and a pet companion.
- **Product direction stated.** Re-evaluated the stack and chose React + Hono + Postgres + Better Auth + pg-boss (D14), with server-authoritative rewards (D17) and a new launch-readiness phase.
- **Other decisions:** XP is never taken away (D15); make quests with follow-ups and a soft cap (D16); runs locally and over Tailscale (D2 revised).
- **Merged `observations.txt` (round 2):** a wardrobe in the bedroom for medals and prizes (D12).
- **Created `.claude/`** (CLAUDE.md, context/vision.md, decisions.md, progress.md) as the project's memory; the decisions log moved here from plan.md §2.
- **Created the GitHub repository** `JVGdev/streaktron` (private) with the planning docs, `.claude/` memory, README and `.gitignore`.

### 2026-11-03 — Phase 0 (Foundation)
- **Workspace:** pnpm 11 monorepo (`apps/server`, `apps/web`, `packages/shared`), TypeScript 6.0 (TS 7 breaks typescript-eslint), ESLint 10 flat config, Prettier (Markdown excluded so the docs keep their hand formatting), Vitest 5 projects.
- **Shared:** prefixed ULIDs (`ids.ts`, one prefix table), day helpers (`time/`: `YYYY-MM-DD` arithmetic at noon UTC, `userDay`/`userDayRange` from time zone + day-start hour, DST-safe `zonedTime`), Zod schemas (setup, user settings + defaults, API error shape).
- **Server:** Hono + Drizzle (node-postgres, snake_case) + Better Auth 1.7 (plural tables, `usr_`/`ses_` ids, base URL per allowed host for localhost/Vite/tailnet). Migrations run on every start: `0000_extensions` (unaccent, pg_trgm) and `0001_auth_and_settings`. Routes: health, setup (GET/POST), me (includes the server-computed `today`), admin/backup. One error shape. Sign-up: the public endpoint answers 403; `/api/setup` makes the first account only, and a Better Auth hook rejects any later one. A `user_settings` row is created with every user.
- **Jobs:** pg-boss 12 (`pgboss` schema). A backup queue (exclusive, 3 retries with backoff) runs hourly and at startup and makes one `pg_dump -Fc` per owner day, keeping 14 (D18). Host `pg_dump` is optional (`PG_DUMP` can use the DB container's).
- **Web:** Vite 8, React 19, TanStack Router (file routes) + Query, Tailwind 4 + shadcn/ui (new-york, stone neutrals with an ember accent, Manrope; dark mode follows the system). First-run setup / sign-in page, authenticated shell (sidebar on desktop, bottom tab bar on phones, user menu with sign-out), Today greeting with the server's day, placeholder pages for Inbox/Projects/Calendar/Stats. Typed Hono RPC client + `call()`/`ApiError`; the global query/mutation error toasts send 401s to sign-in. Autosave: Quire's `Saver` ported (`saver.ts`) plus `useAutosave`, with everything flushed when the page is hidden.
- **Docker:** `docker-compose.yml` (Postgres 17 + app), multi-stage `Dockerfile` (Node 26 trixie with postgresql-client 17; pnpm via npm because Node 25+ dropped corepack). Verified: the container migrates, serves the SPA and API, signs in, and writes a real backup.
- **Tests (56):** shared ids/time (DST, ±14 h, day-start edges), server API against a fresh `streaktron_test` DB each run (setup, closed sign-up, sessions, settings cascade, backup create/skip/prune/fail with a fake pg_dump), web `Saver` and `call()`.
- **Gotchas:** shadcn's CLI couldn't resolve the `@/` alias and imported an unrelated npm package `cn` (and `next-themes`); both were removed and the imports pointed to `@/lib/utils`. pnpm 11 needs `allowBuilds` in `pnpm-workspace.yaml` for esbuild.
- **Decision:** D18 (backups once per day, checked hourly).
- The Chrome extension wasn't connected, so the UI was checked through the build, typecheck and HTTP flows (sign-in, `/me`, sign-out through the Vite proxy), not visually.
- **Tailscale (same day):** stopped `pnpm dev`, started the Docker app (`docker compose up -d --build`), and ran `tailscale serve --bg --https=8443 http://127.0.0.1:3001`. Quire keeps the root (`/` → :8788). `.env` `APP_ORIGINS` now includes the :8443 origin.
