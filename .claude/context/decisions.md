# Decisions log

The canonical record of what was decided, why, and what was considered instead. `plan.md` refers to these IDs (D1…).

**Rules:** add new decisions with the next ID and a date; when one changes, mark the old one *superseded* (keep it) and link the new one. Status is one of: **accepted**, **revised**, **superseded**, **deferred**, **pending confirmation**.

---

### D1 · Single user now, friends later — accepted (2026-11-03)
- **Decision:** One user (the author) at first; social features later. Every table has `user_id` from day one.
- **Why:** The author is the first user; friends are a known future goal, and scoping data per user from the start avoids a rewrite.

### D2 · Runs locally and over Tailscale — revised (2026-11-03)
- **Decision:** Desktop-first UI, running locally and reachable over Tailscale (`tailscale serve` provides HTTPS on the tailnet), so the phone can use it and later install it as a PWA. No public deployment yet.
- **History:** First "desktop browser, localhost only". Revised after studying Quire, which the author uses from an iPhone over Tailscale.

### D3 · Light gamification + cosmetic meta-layer — revised (2026-11-03)
- **Decision:** XP, levels, streaks, quests and stats, plus loot boxes, collectibles, a bedroom and a wardrobe. Everything beyond the core loop is cosmetic; no RPG stats or combat.
- **History:** First "light: streaks, XP, quests; no inventories". Revised when `observations.txt` added loot boxes and the bedroom.

### D4 · Linking = free-form mentions only — accepted (2026-11-03)
- **Decision:** `@`/`[[` mentions in any text field, rendered as live-title chips, plus a backlinks panel on every entity. No typed relations (blocks/depends on) and no behavioral effect (e.g. no goal progress from linked tasks).
- **Why:** The user wants to link tasks, goals, projects or areas inside any field of any other entry; typed and behavioral links were explicitly deferred.

### D5 · Hard active-project limit — accepted (2026-11-03)
- **Decision:** A hard limit on active projects, configurable, default 3. Activating another requires parking one.
- **Why:** The strongest countermeasure to "too many projects at once". The default of 3 was Claude's choice.

### D6 · No study-specific features — accepted (2026-11-03)
- **Decision:** Calendar, recurring schedule blocks, deadlines and countdowns are generic and usable by any project. Courses are ordinary projects (templates later).

### D7 · English UI — accepted (2026-11-03)
- **Decision:** English only; no i18n framework yet. UI strings stay in one place per feature so i18n can be added later without a hunt.

### D8 · Gamification derived from an activity log — accepted (2026-11-03)
- **Decision:** Counting mutations write an append-only `activity` row in the same transaction. XP, levels, streaks and quest progress are computed from it by pure functions; a cached snapshot can be rebuilt.
- **Why:** Rules can change and history can be recomputed; supports retroactive rewards (loot for past quests) and future friend feeds.

### D9 · Stack: React + Vite, Hono, SQLite + Drizzle, TipTap — superseded by D14 (2026-11-03)

### D10 · Typed quests via a registry — accepted (2026-11-03)
- **Decision:** Quest types (quick, daily, time, make, follow-up, weekly, review, project, comeback; friend/co-op and events later) are modules in an extensible registry: cadence, generator, evaluator, XP, box tier. "Missions" and "quests" are the same thing; the UI says "Quests".
- **Source:** `observations.txt` (reviewing, weekly, time and quick missions).

### D11 · A loot box per completed quest — accepted (2026-11-03)
- **Decision:** Every completed quest grants a loot box; the tier depends on the quest type and shifts rarity odds (Common → Legendary), with a pity timer. Outcomes are rolled **server-side** and stored; recompute never rerolls. **No real-money purchases, ever.**
- **Why:** Source is `observations.txt`. Claude added the constraints: quick quests are capped and give the smallest box so they can't be farmed; no paid loot, for ethics and trust.

### D12 · Bedroom is cosmetic, with a wardrobe — accepted (2026-11-03)
- **Decision:** An isometric room where collectibles are placed; no gameplay effects. A **wardrobe** in it shows off earned medals (achievements) and prizes (milestone trophies), with favorites displayed in the room.
- **Source:** `observations.txt` (bedroom, then the wardrobe).
- **Open:** medals vs. prizes definition (plan.md §13, Q5).

### D13 · Production hosting / social backend — deferred (2026-11-03)
- **Decision:** Deferred by the user. Since D14, social features live in the main backend (no separate Firebase layer). What remains open is where production runs (VPS, PaaS, managed Postgres, Supabase as a host).
- **History:** First posed as Firebase vs. Supabase vs. self-hosted for a hybrid "social layer" while the app was localhost-only.

### D14 · Stack for a potential product — accepted (2026-11-03)
- **Decision:** A TypeScript pnpm monorepo:
  - **Web:** React + Vite SPA, TanStack Router/Query, Tailwind + shadcn/ui, TipTap, dnd-kit, cmdk, PixiJS.
  - **Server:** Hono on Node, Zod, PostgreSQL + Drizzle, Better Auth, pg-boss for jobs.
  - **Tooling:** Vitest + Playwright; Docker Compose.
- **Why:** The project may become a product.
  - Postgres suits a multi-user app with concurrent writes and social queries, and runs the same way in dev and production.
  - React opens the React Native/Expo path for mobile (home-screen widgets, push), and has the largest ecosystem and hiring pool.
- **Alternatives considered:**
  - **Quire's stack (Svelte 5 + Fastify + node:sqlite):** highest code reuse, but SQLite would need a migration before launch, and there's no native-mobile code sharing.
  - **Next.js:** more framework than an app behind a login needs.
  - **BaaS-first (Firebase/Supabase):** quest, streak and loot logic must be server-authoritative anyway, and it means lock-in. Moving *all* data into Firestore would break the relational model (links, backlinks, search).
- **Consequence:** Quire's framework-agnostic TypeScript logic is still reused (plan.md §11).

### D15 · XP is never taken away — accepted (2026-11-03)
- **Decision:** Each source earns XP once, ever. Reopening a task keeps its XP; completing it again earns 0; deleting doesn't remove XP.
- **Why:** Fits "forgiving, never punishing" and prevents farming at the same time. Adapted from Quire's "marks" (only growth past the highest point counts).

### D16 · Make quests with follow-ups and a soft cap — accepted (2026-11-03)
- **Decision:** Make quests (add a task or goal, break a task into subtasks) exist; at most 1 per day, only for active projects. Completing one spawns a **follow-up quest** to fill in any 2 missing details of the new item (all doable in a minute). A **soft cap** makes make quests much less likely as open and undetailed items accumulate, with a hard ceiling (e.g. 3 pending follow-ups).
- **Why:** The user's design, addressing Quire's FIT-3 (make quests produced blank entries faster than fill quests emptied them).
- **Pending confirmation:** the make quest's box is granted when its follow-up is done, or when it expires with the item still existing, so create-then-delete earns nothing (Claude's choice, flagged to the user).

### D17 · Server-authoritative rewards and days — accepted (2026-11-03)
- **Decision:** Only the server computes XP, streaks, quest progress and loot. The user's day comes from their stored timezone and day-start hour, not the client clock; timezone changes are rate-limited.
- **Why:** A consequence of D14 (product) and social features: friend streaks and collectibles must be cheat-resistant. Quire trusted the client's day, which is fine only for a personal app.

### D18 · Daily backups, checked hourly — accepted (2026-11-03)
- **Decision:** The backup job runs every hour and at startup. It writes one `pg_dump` per day (named by the owner's local day) if that day's file doesn't exist yet, and keeps the newest 14. `POST /api/admin/backup` forces one.
- **Why:** The app runs on a laptop that is often off at night. A fixed nightly cron would skip those days; an hourly "make today's backup if missing" check still gives one backup per day of use.
- **History:** plan.md first said "nightly `pg_dump` job". Claude changed it while implementing Phase 0.

### D19 · How deleting works — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - **Tasks and goals** are soft-deleted (`deleted_at`), with an **Undo** in the toast. Deleting a task takes its subtasks with it, and Undo brings them back together.
  - **Projects and areas** are written to a **snapshot** (JSON of every row that goes with them: board columns, goals, tasks), then really deleted. Settings → "Deleted projects and areas" restores them with their original ids. A restored active project comes back **parked** if the active limit is full.
  - **Deleting an area** asks what happens to its projects: **keep them** (they move to "No area" and go back into the area on restore) or **delete them with it**.
  - Both kinds last **30 days**; an hourly pg-boss job (`purge`) then removes them for good.
- **Why:** Undo has to be instant for small things, and a soft-deleted task keeps its id for mentions (Phase 2). A project or area takes a lot with it, and a snapshot avoids filtering `deleted_at` across every query that touches projects. Archive remains the way to put something away; delete is for mistakes.
- **History:** plan.md §7 first listed `deleted_at` on areas and projects as well as snapshots; implementing Phase 1 settled on one mechanism per kind.

### D20 · Board and next-action rules — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - **Done means `completed_at` is set**, and on a board it always agrees with the column's category. Moving a card into a done column completes it; completing a task moves it to the top of the first done column; reopening moves it to the top of the first open column. Changing a column's category completes or reopens its tasks.
  - **A board always keeps** at least one done column and one open column. Deleting a column moves its tasks to another column of the same category.
  - **Subtasks** are one level deep, always in their parent's project and never on the board. Moving a parent to another project takes its subtasks along.
  - **Next action:** a pinned task while it's open. Otherwise the board picks the top task of the in-progress columns first, then of the to-do columns, left to right. Completing or deleting a pinned task unpins it.
  - **Project lifecycle:** active ↔ parked; either one → completed; completed → active (reopen) or parked; anything → archived; archived → parked only. Activating checks the limit (D5) inside a locked transaction, and the "Park one to continue" dialog parks and activates in one request.
- **Why:** The app needs one definition of "done" (Phase 3 counts completions for XP). Preferring in-progress work is closer to what "next action" means than taking the leftmost column.

---

## Rejected ideas (don't propose again)

- **Quire integration** (Quire writing days counting as Streaktron activity) — rejected by the user, 2026-11-03.
- **Familiar / pet companion** that grows with level and reacts (from Quire) — rejected by the user, 2026-11-03.
- **All data in Firestore** — rejected by Claude's analysis (breaks the relational model); superseded anyway by D14.

## Deferred, not rejected

- Typed relations and links with behavioral effects (D4) → backlog.
- Production hosting (D13), friend-streak ordering, bedroom art, business model, medals vs. prizes → plan.md §13.
