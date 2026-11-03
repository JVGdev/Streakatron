# Progress

## Status

- **Current phase:** Phases 0 and 1 done → **Phase 2 (Linking system) next**.
- **Code:** monorepo with server, web and shared packages; 121 tests passing. **Repository:** https://github.com/JVGdev/streaktron (private, `main`).
- **Running over Tailscale:** the Docker app is served at `https://hills.tail99ef4d.ts.net:8443` (port 8443, because the root of that address serves Quire on :8788; never replace it). Verified from the laptop over HTTPS (page, sign-in with a Secure cookie, `/me`); not yet opened from the phone.
- **Open questions:** deferred by the user (plan.md §13). Pending confirmation: the loot-box timing for make quests (decisions.md D16).

## Next steps

1. The user tries Phase 1 on real data (a semester + side projects), on the laptop and the phone, against its acceptance: model areas → projects → goals → tasks, move cards across a board, capture to the inbox in under 5 seconds.
2. The user confirms or changes D19 (deleting) and D20 (board and next-action rules), both Claude's choices.
3. Phase 2 (plan.md §9): TipTap editor, mentions, Postgres full-text search (replacing Phase 1's title search), backlinks.
4. Then Phase 3 to reach the MVP and start dogfooding.

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

### 2026-11-03 — Phase 1 (Structure & views)
- **Shared:** `structure/` (statuses, column categories, effort, color and icon keys, default columns, project transitions, and pure rules: `placeAt`, `checkedOrder`, `boardProblem`, `firstColumnOf`/`firstOpenColumn`, `pickNextAction`). `rich/` (TipTap JSON ↔ plain text). Zod schemas for every structure request.
- **Database:** migration `0002_structure`: `areas`, `projects`, `board_columns`, `goals`, `tasks`, `snapshots`. FKs with explicit `ON DELETE`; CHECK constraints on statuses, categories, effort and the commitment-goal shape. Rich fields are stored as TipTap JSON plus `description_text` from the start; until Phase 2's editor, the web app edits plain text and sends `docFromText(...)`.
- **API:** `/api/areas` (CRUD, reorder, delete keeping or deleting projects), `/api/projects` (list with counts and next action, page with columns and goals, PATCH, `/status` with the limit and `park`, delete, columns create/reorder), `/api/columns/:id`, `/api/goals` (CRUD, restore), `/api/tasks` (list by project/inbox/status/parent, CRUD, complete, reopen, move, restore), `/api/search` (titles, accent-insensitive, prefix first; Phase 2 replaces it with FTS), `/api/snapshots` (list, restore), `PATCH /api/settings` (active limit). Every lookup is scoped by user; another account's ids answer 404. A `purge` job removes deleted things after 30 days.
- **Web:** a sidebar tree of areas → active/parked projects; a Projects overview (areas reordered by drag, project cards with next action and progress); a project page with Board, List, and Goals & details tabs. The board uses dnd-kit: mouse, touch (short press) and keyboard (Space). Moves are optimistic and the next action is pinned on the card. The list view filters by project, status and date, sorts, and groups; its options live in the URL. The Inbox has quick add. A task sheet opens from anywhere via `?task=`: title and description autosave, plus project, column, goal, effort, due and scheduled dates, subtasks, pinning as next action, and delete with Undo. The command palette (Ctrl/⌘ K) captures to the inbox or an active project, searches, runs commands and navigates. Shortcuts: C capture, G+T/I/P/L/S navigation, J/K/X/Enter in lists, ? help. The active-limit dialog says "Park one to continue". Settings has the active limit and deleted projects and areas. Phones get a floating capture button, and Tasks replaces Stats in the bottom bar.
- **One merge rule:** `lib/task-cache.ts` puts every task a write returns, or one predicted optimistically, into each cached task list whose filter it matches, and takes it out of the others; derived data is refetched after.
- **Tests (121):** shared structure and rich-text rules; 30 API tests (access and scoping, active limit and park-swap, lifecycle, next action and pins, board done semantics, drag order, subtasks, triage, goals, columns, delete/restore of tasks, projects and areas, search, purge); web merge rule, list filters/sorts/groups, day formatting.
- **Checked in a real browser:** a headless Chromium smoke run (Playwright from the scratchpad, not added to the project) against `pnpm dev` with the seed account. Signed in, created an area and a project, added cards, dragged one to Doing (it became the next action), completed one, autosaved a description and checked it survived a reload, added a subtask, captured with C, searched with Ctrl K, hit the active-limit dialog and parked one, used the list view, deleted a project and restored it from Settings, and loaded the phone layout. No console errors except the expected 409. That run found one bug, now fixed: Enter right after typing in the palette did nothing, because the capture item waited on a deferred value.
- **Decisions:** D19 (deleting) and D20 (board and next-action rules), both Claude's choices.
- **Not yet:** write responses carry no `game` block (nothing to report before Phase 3). Projects can't be reordered within an area (areas can). Done tasks aren't paginated.
