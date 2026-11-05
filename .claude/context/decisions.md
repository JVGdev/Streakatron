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
- **Confirmed by the user (2026-11-04):** the make quest's box is granted when its follow-up is done, or when it expires with the item still existing, so create-then-delete earns nothing.

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

### D21 · How mentions and links work — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - A mention is a TipTap `mention` node holding the target's **id** and the label it had when inserted (a fallback only). Chips always show the target's current title, fetched in batches through `GET /api/entities/resolve`.
  - Every save of a description **rewrites that source's rows in `links`** in the same transaction. Neither side is a foreign key: either side can be any kind, and a link to something deleted stays (it shows a **broken chip**, struck through, with its old label).
  - **Deleted sources:** a soft-deleted task or goal drops out of backlinks until it's restored. Rows whose source is gone for good (purged, or deleted with a project/area snapshot) are removed by the hourly `purge` job. **Restoring a snapshot rebuilds** the links from the restored descriptions.
  - **Backlinks** show the line each mention is in, built when read, so the mentions in it read with their current titles.
  - Self-mentions aren't links. Asking for the backlinks of another account's id answers 404, like any of their ids.
- **Why:** Links derived from the document can't drift from it (Quire's LOG-8: one function per question). Keeping them across deletes is what makes "deleting shows a broken chip" and undo/restore work without bookkeeping.

### D22 · Detail sheets for goals and areas; descriptions edited in place — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - Goals and areas open in **side sheets** like tasks (`?goal=` and `?area=` over any page), with title and description autosaved, their tasks or projects, and the backlinks panel. Clicking a goal in the goals panel, or an area's title in the overview, opens its sheet. Projects keep their page; their description is edited in place on the "Goals & details" tab, with backlinks under it.
  - The project dialog no longer edits an existing project's description (only a new one's), so the rich text has one editor and is never rebuilt from plain text.
  - A sheet's editor only starts from **freshly fetched** data, never from a cached copy, so text changed on another device (the phone) isn't saved over.
- **Why:** The Phase 2 acceptance needs a goal's backlinks panel, and goals and areas had no page. Sheets open from a chip without leaving the page you're on, as tasks already did.

### D23 · Search: full-text with prefixes, typo-tolerant titles — accepted (2026-11-03, Claude's choice)
- **Decision:** Postgres FTS with the `simple` configuration (no stemming, so text in any language matches the same way) over unaccented titles (weight A) and descriptions (weight B); every query word is a prefix, in any order. Titles also match by trigram similarity when **every** query word is close to a word of the title (≥ 0.5, e.g. "algerba" → "Linear algebra"). Ranking: title starts with the query, title contains it, FTS rank, similarity, then open before closed, shorter, recent. Description-only matches return the words around the match. An empty query lists recently changed open things (the mention picker's first view).
- **Why:** The UI is English (D7) but the user may write in Portuguese; stemming for one language would mis-handle the other. Requiring every word to be similar stops one shared word from carrying a multi-word query.

### D24 · UI polish rules — accepted (2026-11-04, Claude's choices after the user's UI review)
- **Context:** The user found the UI "not exactly usable" and said it looks like an office tool or a spreadsheet manager; Duolingo is their reference for an app that feels good. They asked for a polish pass first, then a visual-identity discussion.
- **Decision:**
  - **One page width** for every page (`max-w-6xl` on `<main>` in the shell); pages don't set their own, so content never shifts sideways between pages or project tabs. Narrow content (Today, Inbox, Settings) is limited inside it, left-aligned.
  - **Desktop has no top bar:** the sidebar holds the logo, search and the account menu (at its bottom). Phones keep their top bar.
  - **Unbuilt pages are hidden from navigation** (`later` in `nav.ts`) until their phase lands; their routes still exist.
  - **Today shows the focus list** of plan.md §4.3 from existing data (overdue, due or scheduled today, next action of each active project; 5 visible) instead of placeholder cards. Phase 3 adds habits and the gamification header around it.
  - **Days are picked with `DayField`** (quick picks + calendar, shown like the rest of the app: "Tomorrow", "Mon"), never native date inputs, which follow the browser's locale (D7).
  - **Completing a task plays a ~0.4 s pop and burst** on its check before the optimistic move takes it away (skipped with reduced motion).
  - Effort shows as **1–3 bars**, not boxed letters; a project chip isn't repeated under a "by project" group heading; inbox rows offer **Move to…** on hover; the task sheet's properties read as text until hovered, and its footer has a **Complete** button.
- **Why:** The fastest usability wins that don't depend on the visual identity, which is decided separately.

### D25 · Visual identity — chosen by the user and applied (2026-11-04)
- **Context:** After the D24 polish, Claude mocked up three directions on a design canvas (https://claude.ai/artifact/14XHtFFDd29N8PjRNg2R1C, private to the user): A Arcade (chunky, Duolingo-like energy), B Cozy room (warm paper and wood, gift-like quests, a room preview), C Calm + moments (quiet work screens, wins take over the screen).
- **Decision:** **B's structure** (rounded, pressable panels and chips; a progress strip with streak, freezes, level and week across Today; quests as gift cards; the room preview in the sidebar; roomy task rows) **in C's colors** (ink `#1D1B19`, ember `#F05A1A` with `#C2410C` for text and buttons, glow `#FFE7D6`, white surfaces on `#FAFAF9`, warm grey lines `#ECEAE7`), with **A's quest-complete screen** (big loot box, stat boxes for XP, streak and level, chunky "Open your box" button). **Icons follow A** (added the same day): the ember rounded-square logo with a bolt, heavier line icons, bare filled icons in the progress strip, and quests as chunky colored icon tiles (daily ember, time ink, quick peach) instead of gift boxes. **The loot box itself is B's wrapped gift** (bow, lid, ribbon) in C's colors, on A's quest-complete screen. Mocked up as the "Merged" row on the canvas.
- **Typeface (2026-11-04, the user):** **Rounded**: Fredoka for headings, buttons and navigation, Nunito for body text (self-hosted through `@fontsource-variable`; Manrope removed).
- **Applied to the app (2026-11-04):** tokens in `index.css` (`ember`, `glow`, `peach`, `primary-shade`, `ledge`, and `shadow-ledge`/`shadow-press` utilities; a matching dark palette), a larger radius, solid and outline buttons standing on a ledge that press down, cards and panels as 2px-bordered rounded surfaces with a ledge, Lucide icons at 2.25 stroke (2.6 in the navigation), the ember logo tile and favicon, a sidebar of rounded pills (the active page is a white pill with an ember icon), Today with roomy task tiles and a big dashed check, and an ember completion (fill, ring and ember/peach sparks). Board, lists and sheets took the same tokens, which settles how the work screens take the style for now. The progress strip, quests, room preview and quest-complete screen come with their features (Phase 3 onward).
- **Still open:** loot rarity colors (C's palette has a single accent) and sound.
- **Why:** The user found the app too much like an office tool; Duolingo is their reference for a good feel, but they preferred C's calmer colors.

### D26 · The app is called Streakatron, internals included (2026-11-04, the user)
- **Decision:** The name changes from Streaktron to **Streakatron** everywhere: the UI (logo, page title, sign-in), the auth app name, the server log and the docs, and the internals: `@streakatron/*` packages, the root package, the `streakatron` database, role and password, the `streakatron_test` database, the `streakatron-db` and `streakatron-app` containers, `streakatron-YYYY-MM-DD.dump` backups and the dev seed account (`dev@streakatron.local`). `docker-compose.yml` pins the project name (`name: streakatron`), so the volume is `streakatron_pgdata` wherever the repository is checked out.
- **Renamed later the same day (the user):** the GitHub repository is now `JVGdev/Streakatron` (the old URL redirects); the local folder is `Streakatron`.
- **Why:** The user's choice of name; they asked for the internals too ("it will be better going forward"), so no old name lingers in code.

### D27 · Phase 3 in three slices; the game starts fresh; unset effort earns like S (2026-11-04, the user)
- **Decision:**
  - **Phase 3 ships in three slices**, each tried before the next: **3a** activity log, XP/levels/daily and weekly streaks/freezes, `game` blocks on writes with celebrations, the Today progress strip, day/streak settings, admin recompute; **3b** focus sessions; **3c** quest engine with the MVP quest types and the basic heatmap.
  - **No backfill:** tasks completed before the activity log exists earn nothing and don't make active days. The game starts on the day 3a is deployed.
  - **A task with no effort set earns 10 XP**, the same as S.
- **Why:** The user's answers. Slices keep each piece testable on real use; starting fresh makes the MVP day 1 of dogfooding (the existing data is partly testing); a small default keeps quick inbox tasks cheap and makes setting effort the way to earn more.

### D28 · How the game runs on the server and reaches the UI (2026-11-04, Claude's choice, confirm when convenient)
- **Decision:**
  - **The log stores what each activity earned** (`activity.xp`), computed in the write's transaction by the shared rules (`xpFor`), with a per-user advisory lock so earn-once and the soft cap can't race. It's a cache: `POST /api/admin/recompute` replays the log with `foldXp` and rewrites it. `local_date` is fixed when the activity happens and never re-dated, so a later time-zone change can't move past days.
  - **Game state is read from the log** on demand (total XP, distinct active days); no `stats_snapshot` yet. Fine for one user; a cache comes with the product phase if needed.
  - **Write responses carry `game: { events, state } | null`.** Routes wrap the service in `withGame`, which collects what the call logged (AsyncLocalStorage) and compares the state with and without it. The client's `call()` takes `game` off every body and hands it to one listener (`GameMoments`): it replaces the cached game state, shows one short toast for XP / the day counting / a freeze / the weekly target, and a level up takes the screen (A's stat boxes).
  - **Streak details:** a day kept by a freeze doesn't add to the count and restarts the run toward the next freeze; today never breaks a streak (it's in progress); the weekly streak's current week only adds once met; past weeks are judged by today's target and week start. **A completed subtask makes the day active** (0 XP). Reopening never takes an active day back.
  - **Time zone changes:** the first change is free, then once every 7 days (`429 timezone_locked`). Day start, week start and weekly target change freely.
- **Why:** Storing the award keeps "+25 XP" stable and cheap to sum while the log stays the source of truth; one place that takes the game block off responses means no action has to know about the game.

### D29 · Focus sessions: overtime with a cap, client-side breaks, mini timer + focus page (2026-11-04, the user; details Claude's choice)
- **Decision (the user):**
  - **At the planned time the timer chimes (and notifies) and keeps counting as overtime** until you finish. Overtime earns XP, but a running session **finishes on its own 60 minutes past the plan** (`GAME.focus.overtimeMinutes`), so a timer left on can't farm XP.
  - **Breaks are offered, not stored:** after a session, the finish card offers the preset's break as a countdown that lives only in the browser (localStorage), with a chime at the end. Breaks earn nothing; skipping is one click.
  - **A mini timer on every page** (sidebar on desktop, above the bottom bar on phones; hidden on the focus page itself) **plus a full `/focus` page** (big ring, pause/resume, finish, abandon, the finish card, the break, the start panel).
- **Details (Claude's choice, confirm when convenient):**
  - **The server owns the timer:** `focus_sessions` keeps `started_at`, finished pauses (`paused_ms`) and the open pause (`paused_at`); the shared rules (`packages/shared/focus`) compute focus time. One open session per user (partial unique index + `409 focus_open`). Responses carry the server's `now`; the client times against it.
  - **Credited minutes are whole minutes of focus, pauses left out, capped at plan + 60.** A completed session of **≥ 10 min logs `focus_completed`** (1 XP/min, earn once per session, no soft cap) and so makes the day active; shorter ones still complete and show in today's total but log nothing. Abandoning counts nothing.
  - **The cap is settled lazily:** the next request that touches the open session finishes it, dated when it reached the cap (`logActivity` takes an `occurredAt`), so XP and the active day land on the right day however late anyone looks. The open tab also asks the server at the cap. An action that finds the session just auto-finished answers the new state instead of an error. A paused session never reaches the cap (its clock is stopped).
  - **Finishing is instant;** the note and "mark the task done" come after, on the finish card (`PATCH /api/focus/:id` and the usual task complete), so the XP moment isn't held behind a form. The card survives reloads for 6 hours until closed.
  - **Attaching:** a task (its project comes along), a project, or nothing. **Today's "Start focus" is one click** with the first preset on the top focus-list item; the task sheet's **Focus** button does the same for that task; "Other length or task" opens `/focus?on=…`. The first preset is the default; presets are edited in Settings (1–6, focus 1–240 min, break 0–60).
  - **Notifications:** the browser Notification API, asked for on the first start, shown only when the tab isn't in front (a toast covers the other case). A background tab may chime up to a minute late (browser timer throttling); Web Push (Phase 5) makes it work with the tab closed.
- **Why:** Overtime respects flow (stopping at 25:00 mid-thought is the Pomodoro failure the user wanted to avoid) while the cap keeps XP honest; storing breaks would add rows that mean nothing to the game; server-side state is what makes reloads, other devices and day boundaries correct.

### D30 · Quests in the MVP: what they ask, how they run, and a placeholder box (2026-11-04, the user; details Claude's choice)
- **Decision (the user):**
  - **Big moments only:** daily, time, weekly and comeback quests, and finishing the whole daily board, take the screen (D25's quest-complete screen); quick, make and follow-up quests show in the toast.
  - **No loot box tracking yet:** the user won't use the app daily for a while, so nothing accrues for later. The quest-complete screen shows a **placeholder box** (a wrapped ember gift, tier label, "opens in a later update"); **its visual is to be reworked** with the rewards phase (plan.md Phase 5). `quest_completed` is still logged (it carries the XP), but no box rows and no make-quest box rule (D16's) exist yet.
- **Details (Claude's choice, confirm when convenient):**
  - **Registry as data plus pure planners** in `packages/shared/quests`: types → templates, every number in `QUESTS`, `planDaily`/`planWeekly`/`planQuick`/`planMake`/`planReroll` over a `BoardInput` the server gathers, so selection is unit-tested with a seeded random. Adding a type = a template list entry, a planner branch and a server evaluator.
  - **MVP templates:** daily (pick 3, weighted by waiting time, not yesterday's templates when there's enough else): finish the top Today item, do a project's next action, get back to a project idle 3+ days, complete N tasks (sized from your days, 2–6), complete a large task, do 2 focus sessions. Time: focus N min today (median of recent days ×0.8–1.2, 5-min steps, within Settings' min/max; 30–80 XP). Quick (2 shown, 3 rewarded a day, then the rest are cancelled): clear an inbox item (a project or completing it), pick a project's next action (pin), set a task's effort, write a line on the last focus session. Make (≤ 1 a day, D16's soft cap decides whether there is one): add a task, add a goal (projects without one), break an M/L task into 2 subtasks (no follow-up). Follow-up (until the end of tomorrow): any 2 of the made task's missing parts (description, effort, a date, a goal, subtasks) or goal's (description, deadline, a task); one per thing; cancelled if it's deleted. Weekly (made on the week's first look): the weekly target, every active project (2+; a task or focus in each), a focus total sized from past weeks (60–100 XP). Comeback: after 2+ inactive days, done by **any** active-day work (a task or 10 minutes of focus, FIT-2); after 7+ idle days it's the only quest. Board bonus +25 XP when every daily quest is done.
  - **Boards are made on the first look** (`GET /api/quests`), which also expires what's past and evaluates everything. **After writes, only quests the change can affect** are evaluated: routes pass `touches` (task, focus, goal, project) to `withGame`, which evaluates after the write commits, in its own transaction; errors are logged and never fail the write. Completions log `quest_completed` (XP once per quest) and add `quest_done` / `board_done` events to the game block.
  - **Fit stats come from `quest_instances` itself:** rows are never deleted and end as completed, expired, rerolled or cancelled (plan.md said "logged"; the table is that log). Rerolls: once per quest (`reroll_of`), daily/time/quick/make, and the weekly focus total.
  - **Inbox triage is an activity** (`task_triaged`, 0 XP) so quick quests can see it; task completions now carry `projectId` in their payload.
  - **Today's focus list moved to `packages/shared/structure`** so the server's "top Today item" is the same list Today shows.
  - **Stats shows the heatmap** (a year; active days darker with focus: none, < 30, 30–89, 90+ min), with hover/keyboard tooltips, a legend and a table view; the four ember steps are validated as an ordinal ramp in light and dark.
- **Why:** The rules in plan.md §5 with Quire's lessons (sized from your days, nothing for idle things, count every kind of effort, make quests don't outpace filling in); a placeholder keeps the Arcade screen's shape without building loot before it's needed (FIT-12).

### D31 · Habits become Commitments; Phase 4 reordered around the "Studying Japanese" use case (2026-11-04, the user; details Claude's choice)
- **Context:** The user created a real project (area *Intercâmbio*, project *Studying Japanese*) and found daily goals, reminders and a calendar essential. Claude rebuilt it on a throwaway database and played a day: a "daily" thing can only be a task that disappears once done (tomorrow's copy typed by hand, no history); the weekly time goal shows no progress after a focus session on the project; time spent in other apps (Duolingo, Anki, a course) can't be counted; no reminders, calendar or countdowns. The use case is plan.md Phase 4's acceptance scenario.
- **Decision (the user):**
  - **Habits are called Commitments.** One concept covers every kind of daily or weekly goal, and the user can set it up however they want: measured as **done / not done**, **an amount with a unit they name** (20 cards, 1 class) or **minutes**; **per day or per week**; on **every day**, **chosen weekdays**, or **N times a week**.
  - **Minutes come from focus sessions started on that commitment, plus minutes typed in by hand** (for work done in other apps). Other sessions on its project don't fill it.
  - **Time goals stay alongside commitments;** neither replaces the other. A time goal is total focus on a project; a commitment is one specific routine.
  - **Reminders come before the calendar.** A commitment can **remind you repeatedly over the day until it's done**.
  - **Create from any selector** (`observations.txt`, same day): pickers of existing things offer "New … “typed text”" where it fits, starting with the area selector in the new-project dialog; part of 4a.
  - **Phase 4 order:** 4a Commitments · 4b Reminders (Web Push, installable app) · 4c Calendar and countdowns · 4d time-goal progress, weekly review, Review and Project quests. *Revised by D34: six slices, same order; slice letters in D31–D33 refer to this first split.*
- **Details (Claude's choice, confirm when convenient):**
  - **The goal kind "commitment" is renamed "time goal"** (UI and code, `kind: 'time'`, a migration), so "commitment" means one thing.
  - **Internals use the new name:** `commitments` and `commitment_entries` tables, ID prefix `cmt_` (replaces the planned `hab_`), `/api/commitments`, `?commitment=` sheets; commitments are mentionable like goals.
  - **Shape:** `measure` (check / count / minutes), `target`, `unit` (count only), `period` (day / week), `schedule` (day period: every day or chosen weekdays). "N times a week" is a week-period check with target N (counted as days with a check). Entries are summed per day (count, minutes; a check is one entry a day); each records its source (manual or a focus session).
  - **Focus sessions can attach to a commitment** (or a task, or a project; one of them). On finish, minutes commitments get the credited minutes; check and count commitments offer "Mark done" / "+1", like "mark task done". A session on a commitment counts toward its project's time goals.
  - **Streaks per commitment:** day period: consecutive scheduled days met (unscheduled days don't break it; today is pending); week period: consecutive weeks met. No freezes on commitment streaks at first; tune after dogfooding.
  - **Game:** meeting a commitment's target earns **10 XP, once per commitment per period** (D15) and logs `commitment_met`; every entry logs `commitment_logged` (0 XP) for quests and stats. **Active day:** meeting a day-period commitment, or any entry on a week-period one. Partial day entries (+1 of 20 cards) don't make the day active.
  - **Today:** commitments due today and not yet met sit between "today" tasks and next actions, with the control their measure needs (check, +1 / +N, log minutes, start focus); met ones collapse into a "done today" line.
  - **Reminders (4b):** per commitment: off, once at a time, or repeat (from a time, every N hours, until a time), only on scheduled days, skipped once met, never past the day's end. The server schedules them (pg-boss, the user's timezone). They show as browser notifications while the app is open and as Web Push otherwise (service worker; HTTPS via Tailscale).
  - **Small fixes the use case found** go in 4a: the new-project dialog preselects the area (opened from an area, or the only one); icon and color pickers get accessible names; project tabs open from the URL.
- **Why:** The user's real setup needs routines that repeat, measure in different ways and nag until done; one flexible concept beats several narrow ones (D6: generic, not study-specific). Typed minutes keep effort done in other apps visible (FIT-2: count every kind of effort). Reminders first because without them a daily commitment is easy to forget; the calendar matters most once the course and exam dates exist.

### D32 · Gaps from brainstormed use cases, "required" projects, and the UI stays easy (2026-11-04, the user; details Claude's choice)
- **Context:** After D31, Claude brainstormed seven use cases aimed at parts of the app the Japanese one didn't touch: getting ready to leave (visa, documents), moving to Japan (timezones, travel), a full semester, finishing a course or textbook, an exam in 5 days, phone-only moments, and a group assignment.
- **Decision (the user):**
  - **Every gap found is in scope** except **shared group projects**, which go to the backlog as a suggestion **to be reworked later** (not rejected).
  - **"Required" projects:** a project option that makes it an exception to a few rules meant for chosen projects (details below).
  - **The UI has to stay easy and good to use** as these features land (rules below).
- **Where each gap goes (Claude's choice, confirm when convenient; slice letters before D34's split — see D34 for the current ones):**
  - **4a:** a **waiting** column category (tasks blocked on someone else: never the next action, not on Today, and back on Today as "follow up" on their scheduled date); **required** projects.
  - **4b:** **task reminders** (a date and time on any task); **actions on notifications** (Done, +1, Snooze 1 h).
  - **4c:** **recurring tasks** (a repeat rule on a task: every weekday X, monthly on day N, or N days after completion, which also covers "review this again in 2 days"; completing one creates the next with the next date, so each instance earns once, D15); **tentative dates** (a goal, event or countdown can be "a month" or "TBD": "~March 2027"); **day load** in the calendar's week view.
  - **4d:** **number goals** (an outcome goal with a target and unit, "40 lessons", "800 words"; progress typed in or fed by a commitment with the same unit; pace to the deadline).
  - **Phase 6, earlier if the departure comes first:** **moving timezones** (a move is its own action, outside the weekly limit, and the day of the switch can't break the streak); **planned breaks** (declared ahead, never after the fact; the streak neither grows nor breaks, quests and reminders pause; a yearly allowance so it can't replace showing up).
  - **Backlog:** spreading tasks over the days until a deadline; file attachments (links in descriptions cover it for now); shared group projects.
- **Required projects (Claude's choice):** don't count toward the active limit (D5 still caps the projects you *choose*), are never offered in "Park one to continue", show a small "Required" badge, and are listed apart in the weekly review's park/activate step. Everything else (quests, next action, stats) treats them like any active project.
- **Keeping the UI easy (Claude's choice):**
  - **Defaults first:** every new thing is made in one step with the common case (a commitment starts as "done / not done, every day, no reminder"); more options sit behind "More options", never in the first view.
  - **Grow existing surfaces before adding pages:** a field in a sheet, a column type, a menu item; a new page only when a feature has its own daily use (commitments, calendar).
  - **Same patterns everywhere:** one sheet, one picker (with create, D31), one date field, one reminder control reused by commitments, tasks and events.
  - **Every slice ends with a UI review:** screenshots of the changed screens on desktop, phone and dark (as in the 2026-11-04 polish pass), checked for clutter and plain wording, before it's called done.
- **Why:** The Japanese use case found what the plan missed for one project; these find what it misses for the user's next year (exchange paperwork, the move, a semester). Adding this much risks an "office tool" feel the user already disliked (D24, D25), so ease of use becomes a checked rule, not a hope.

### D33 · Spotlight: tasks and goals featured on Today (2026-11-04, the user's idea; details Claude's choice)
- **Decision (the user, `observations.txt`):** tasks or goals can be pinned so they're featured on the home screen, mostly for ongoing tasks (e.g. "Learn katakana", worked on for weeks).
- **Details (Claude's choice, confirm when convenient):**
  - **Called Spotlight**, not "pin": "pin" already means a project's next action (D20). "Spotlight on Today" / "Remove from spotlight" in the task and goal sheets, menus and the palette.
  - **A Spotlight section at the top of Today**, above the focus list: tasks with their project and a one-click focus start; goals with their progress (tasks, time, numbers) and days left. **At most 4**, so it stays a highlight (principle 4); adding a fifth asks which one to drop.
  - A task leaves the spotlight when it's completed or deleted; a goal when it's achieved, dropped or deleted. Spotlighted tasks aren't repeated in the focus list below.
  - **Countdowns (4c) use the same section** instead of a separate widget: spotlighting an event or a dated goal shows "N days left" there (D32: one pattern).
  - Built in **4a**, since Today changes for commitments anyway. *(4b since D34.)*
- **Why:** Ongoing work has no due date and isn't always the next action, so it falls off Today; a small, capped spotlight keeps it in view without breaking "focus over abundance".

### D34 · Phase 4 in six slices (2026-11-04, the user asked for a proper split; slices Claude's choice)
- **Context:** With D31–D33, Phase 4 grew to about 30 items and 4a alone held 11 of mixed kinds.
- **Decision:** six slices, keeping D31's order (commitments → reminders → calendar → the rest), each usable on its own with its own "done when" and a closing UI review (D32):
  - **4a Commitments** — commitments, entries, focus on a commitment, Today/project/palette, the time-goal rename **and time-goal progress** (moved up from the old 4d: the use case's "4 h a week" needs it, and it's small once sessions can attach to commitments).
  - **4b Today & boards** — Spotlight (D33), waiting column, required projects, create from any selector, the small fixes (moved out of the old 4a).
  - **4c Reminders** — PWA, Web Push, one reminder control, commitment and task reminders, focus ended, streak at risk, notification actions.
  - **4d Calendar & countdowns** — events (recurring), month/week views, drag to schedule, day load, tentative dates, countdowns in Spotlight, event reminders.
  - **4e Recurring tasks** — on their own: they touch task completion and the next-instance logic, and reuse 4d's repeat rules.
  - **4f Goals & weekly review** — number goals, weekly review, Review and Project quests (Project quests read goals and their numbers).
  - "Weekly quests fully wired" is ticked: 3c built them (D30).
- **Old → new letters:** old 4a → 4a + 4b · old 4b → 4c · old 4c → 4d + 4e · old 4d → 4a (time-goal progress) + 4f.
- **Why:** one theme per slice keeps each session's change reviewable and testable against the use case; 4b's small changes to existing screens are separate from the new commitments model so neither hides the other's UI problems.

### D35 · Proprietary license, all rights reserved (2026-11-04, the user)
- **Decision:** `LICENSE` is an "all rights reserved" notice; every `package.json` says `"license": "UNLICENSED"` (npm's marker for proprietary code), and the README links the license.
- **Alternatives:** AGPL-3.0, MIT, Apache-2.0.
- **Why:** the repo is private and Streakatron may become a product; proprietary keeps every option open, and it can still be open-sourced later (the reverse isn't possible once code is released).

### D36 · Commitments as built in 4a (2026-11-04, Claude's choices, confirm when convenient)
- A parked/completed/archived project's commitments rest with it (off Today, out of quests), like its tasks.
- Deleting a project takes its commitments and entries into its snapshot; restore brings them back. Commitments themselves soft-delete (undo, purged after 30 days) and archive.
- Entries are for today only (no backfilling yet). A weekly check takes one entry a day; met on N distinct days.
- A finished session on a minutes commitment adds its minutes (any length); checks and amounts get "Mark done" / "+1" on the finish card, once per session.
- `commitment_met` earns under `cmt_…:<period start>`; active day = `commitment_met`, or any `commitment_logged` on a weekly one.
- Time-goal progress counts completed focus sessions (10+ min) on the project, its tasks or its commitments; typed minutes don't count.
- "Meet every commitment due today": target = commitments scheduled today, offered while any is left; a weekly check ticked today counts as done.
- Entry id prefix `cme_`; the `reminder` column waits for 4c; Commitments is in the phone bottom bar (five items).

### D37 · Today & boards as built in 4b (2026-11-04, Claude's choices, confirm when convenient)
- **Spotlight (D33):** a `spotlighted_at` timestamp on tasks and goals, oldest first, at most 4. It shows while the task is open (the goal open) and its project active, so completing, achieving, dropping, deleting or parking takes it off without clearing the flag (an undo brings it back). Spotlighting something of a parked project is refused with the reason. A fifth asks which one to replace. Placed between "Start focus" and Today's focus list; when nothing is urgent, "Start focus" goes to the first spotlighted task. Toggled by a star next to the title in the task and goal sheets, the goal's menu, and the palette (for the open sheet).
- **Waiting (D32):** a fourth column category. Waiting tasks are never the next action, even pinned (pinning one is refused); they never get quests; new and reopened tasks never land there; a board still needs a to-do or in-progress column. On Today they come back under "Follow up" once their scheduled date (shown as "Follow up" in the sheet), or else due date, has come. The board offers "Add a Waiting column" (placed before Done) until it has one.
- **Required (D32):** a project flag; outside the active limit (create, activate, restore), not in "Park one to continue". Turning it off on an active project needs room under the limit (refused otherwise). Set in the project dialog (checkbox under Status) and the project menu; badge on the project page and cards; "N of 3 active (+1 required)".
- **Create from pickers:** one picker (`ComboPicker`, type to filter, "New … “typed”") for the area in the project dialog, the project and goal in the task sheet, and "Move to…". New projects made there start active when there's room, else parked (a toast says so); new goals are outcomes; new areas take the project's color. Focus attach offers a new task (inbox), commitment (done / not done, every day) or project. The mention picker offers "New task “typed”" (inbox) when it reads like a title (≤ 6 words, no final punctuation); with no match, Enter stays a new line and picking it takes an arrow key or a click.
- **Small fixes:** the new-project dialog preselects the area it was opened from, or the only one; icon and color options are named ("Book open", "Sky") with tooltips; `?tab=goals` (and board/list/tasks/details/commitments) opens the matching project view. Found in the UI review: the task sheet overflowed phones (the effort row now wraps).

### D38 · Reminders as built in 4c (2026-11-04, Claude's choices, confirm when convenient)
- **Scheduling:** one pg-boss job every minute computes what is due from the data (no job per reminder), for users with at least one device. Each reminder goes out once: a `reminder_log` row keyed by target and due instant is written before sending (pruned after 3 days). A slot missed by more than its grace (commitments 1 h, tasks 12 h, focus 10 min, streak nudge 1 h) is skipped instead of sent late; only the latest due slot of a commitment goes out.
- **Commitment reminders:** off / once at a time / "until done" from a time, every 30 min–6 h (15 min–12 h allowed), until a later time; times are wall-clock in the user's zone and read inside the user's day (before the day start = that night); never past the day's end. Sent only while the commitment is due (its day, not met, project active or none). Default when picked: 10:00–22:00 every 3 h. Set in the commitment dialog and the sheet.
- **Task reminders:** a `remind_at` instant (day + time, in the user's zone), sent once while the task is open, even in a parked project. A bell chip shows today's and upcoming ones. New reminders start at 09:00 on the task's scheduled/due day or today, else the next full hour.
- **Snooze 1 h:** a task's `remind_at` moves to now + 1 h; a commitment gets `remind_again_at` (nothing before it, one reminder at it, slots inside that hour skipped). Changing a commitment's reminder clears it.
- **Notification buttons:** commitments "Done" (checks) or "+1" (amounts), minutes get only Snooze; tasks "Done". The service worker sends them as the signed-in browser to the normal endpoints (XP and streaks as usual); a failure (signed out) opens the app there. Open windows refresh after.
- **Push:** VAPID keys made on first use and kept in the database (`server_keys`, so backups carry them); subject = the first HTTPS app origin. Devices are named from the User-Agent ("Chrome on Android"); 404/410 from the push service removes a device. Messages carry a 1 h TTL. While the app is in front on that device, the worker shows a toast (with the first button) instead of a notification.
- **Focus ended:** pushed at a running session's planned end (on by default, a Settings checkbox), with the same tag as the open app's own notification so they replace each other. **Streak at risk:** opt-in, a time (default 20:00), once a day, only when the current streak is at least 1 and today isn't active.
- **Turning notifications on is one step (the user's ask, 2026-11-04):** setting a reminder (commitment or task) turns them on for that device from the same click (the browser asks once); a browser that already allows notifications (the focus timer asked, or it was on before) is subscribed silently when the app opens; Today shows a one-tap "Turn on" banner when there are reminders but this device isn't getting them (an "Add to Home Screen" hint on an iPhone in Safari; "Not now" hides it for 14 days on that device). "Turn off" in Settings is remembered on that device and nothing turns it back on by itself. The reminder picker says when this device won't show it (off, blocked, iPhone not installed). Settings keeps the full card.
- **After setting a reminder this device won't show (the user's ask: the quiet hint was missed):** the app checks right away. It turns notifications on when it can (asking the browser from that click); otherwise a dialog says why (closed the browser's question, turned off here, blocked, iPhone not installed, browser refused) with the fix (a Turn on button, or the steps), and which other devices still get it. Once per visit per reason. A set reminder this device won't show keeps an amber "Not on this device" mark (in the commitment's reminder button; on its own line under a task's, clickable to turn on or see why), and the picker opens with an amber box saying so.
- **PWA:** manifest (start `/today`, standalone, orange maskable icon) and a service worker that caches nothing. iPhone/iPad: Settings says to add the app to the Home Screen first. The Settings "Notifications" card: this device on/off, Send a test, other devices with Remove, and the two extras.

### D39 · Calendar & countdowns as built in 4d (2026-11-05, Claude's choices, confirm when convenient)
- **Events:** a new `events` table (`evt_`), optionally in a project (deleted with it into its snapshot, restored with it), soft delete with undo, searchable and mentionable like goals (a sheet at `?event=`). A date is **a day**, **a month** ("~March 2027", stored as the month's first day) or **not decided yet** ("Date TBD", no date) (D32 tentative dates). Only day events get a time (all day by default; a start and a length), a repeat and a reminder; switching to a month or TBD drops them instead of failing.
- **Repeats are a small structured rule, not RRULE strings** (plan.md said RRULE via the `rrule` lib): every N days, weeks (on chosen weekdays), months (on the first day's date, the last day in shorter months) or years, optionally until a day. Pure functions in `packages/shared/calendar` work on `YYYY-MM-DD` only, are unit-tested and need no dependency; 4e's recurring tasks reuse them. An RRULE can be written from it if Google Calendar (Phase 6) needs one. Skipping one occurrence (a holiday) is not supported yet.
- **Times** are wall-clock in the user's zone, on the calendar date (not the user's day: a 01:00 event on the 5th is on the 5th).
- **Event reminders** go through 4c's job and control: minutes before the start (at start, 5, 10, 15, 30 min, 1 h, 2 h, 1 day); all-day events at 09:00 on the day or 1, 2 or 7 days before. Never sent once a timed event has started; grace 30 min; sent whatever the project's status (like task reminders). No buttons on the notification; a click opens the event.
- **Countdowns are the Spotlight (D33):** a star on the event sheet ("Count down on Today"); the card shows a big "243 days" / "~4 months" / "TBD". An event stays while it's ahead (a repeat with a next day, a month not over, TBD always) and its project is active or it has none. Dated goals show their deadline in their card as before; goals can now have a **month deadline** (due at the month's end, shown "~July 2027 · ~8 months left"); "no date" stays their TBD.
- **Calendar page:** month and week views (`?view=week&day=`), events (repeats expanded), open tasks of active projects and the inbox on their scheduled and due days (one chip when the same day; "Due" flag; "Follow up" for waiting ones), done tasks struck through, and per day the focus minutes and commitments met (from the activity log). **Drag a task chip to another day** to move that date (scheduled or due); a "To schedule" strip above the grid holds open undated tasks (foldable, remembered per browser; desktop and tablet). Months sit in a "Sometime this month" row, undecided dates in "No date yet". Phones: the month grid shows dots and the picked day's list below; the week is a list of days.
- **Day load (D32)** in the week view: open tasks planned that day (scheduled day, else due day) weigh by effort (S 1, M 2, L 3, unsized 1) plus an hour of timed events per point: Free / Light (≤3) / Busy (≤6) / Full.
- **Elsewhere:** Today shows today's events under "On the calendar"; a project page shows its next one-off events and dated goals as small countdowns under the header (repeating events are a schedule, not a countdown) and an "Events" panel on "Goals & details". Palette: "New event", "Go to Calendar" (G then C). Calendar replaces Tasks in the phone bar; on phones Focus, Tasks and Stats moved into the account menu.

### D40 · UI wording: no mottos, no examples from the user's data, short explanations (2026-11-05, the user; wording Claude's choice)
- **Context (`observations.txt`):** small hints felt useless or bothering, and some used the user's own projects as examples. Claude studied every hint in the web app and sorted them into types; the user chose per type.
- **Rules:**
  - **No mottos** (the app preaching its principles: "Capture now, sort later.", "A short active list is the point…", "…so it stays a highlight", "…each one actually moves"). **Kept by the user:** the Today question ("What's the smallest meaningful thing you can do right now?"), the break's "Stand up, drink water." and the sign-in line.
  - **No clever empty states** ("Inbox zero…" → "The inbox is empty.").
  - **Short explanations of what a thing is stay**, worded neutrally and still specific to the app: page subtitles (Inbox, Commitments, All tasks, Stats) and dialog subtitles (area, project, goal kinds, commitment, event).
  - **No examples from the user's data** (Duolingo, JLPT, "20 cards, 3 classes a week", "4 hours a week", University, Linear Algebra); **placeholders use neutral wording** ("What you do", "Project name", "unit").
  - **Empty states that teach stay, one short line each.** Description editors share one placeholder, "Notes… Type @ to link." (no prompting questions); keyboard tips live in the shortcuts dialog.
  - **Rule explainers stay** (they say what can't be guessed), trimmed where long (Settings cards).
- **Why:** principle 10 (easy as it grows) and the product direction: mottos read as preaching after the first day, and examples from one person's setup look odd to anyone else.

### D41 · Focus time hidden by default mid-focus (2026-11-05, the user; details Claude's choice, confirm when convenient)
- **Context (`observations.txt`, plan.md §13 Q7):** a visible clock can make a session anxious (watching it) or slack (seeing there's time left).
- **Decision (the user):** every new session starts with its time hidden; a click shows or hides it for that session, not remembered for the next one. Hidden **everywhere** the time shows: the `/focus` ring, the mini timer (sidebar and phone bar), the "Focusing" card on Today and the browser tab title.
- **Details (Claude's choice):** hidden means no numbers and no filling ring: the ring stays still with a calm "Focusing" label; paused still says "Paused". The chime at the planned time, overtime and the auto-finish cap are unchanged. Shown or hidden is kept per session on the device (browser storage keyed by session id), so a reload keeps it.
- **Why:** the point is to stop watching the clock; a moving ring is still a clock, and the chime already says when time is up.

### D42 · Notes board: quick notes mid-focus become post-its, as slice 4g (2026-11-05, the user)
- **Context (`observations.txt`, plan.md §13 Q8):** good ideas come up mid-focus and need writing down at once, without leaving the session. Claude studied it (today a session has one line, seen only on the finish card) and proposed cards with sort buttons, kept in the Inbox.
- **Decision (the user):** notes stay with the session and are sorted afterwards on **a real board of small post-its**, with drag and drop and links; they live on **their own Notes page**; they're **rich text with `@`** even mid-focus; written from the focus page and a shortcut. Big enough for **its own slice, 4g**, after 4f.
- **Kept from the study:** each note saved at once as its own row (session + minute); the session's one line stays as the reflection (`focus_note` quest).
- **Alternatives:** cards with action buttons on the finish card and a "From focus" section in the Inbox (Claude's proposal; lighter, but the user wants a board that feels like post-its); plain-text notes (faster to type, no links).
- **Open, settled when 4g starts:** fixed sorting columns or the user's own; notes only mid-focus or anywhere; the post-it look; the quest link.

### D43 · Recurring tasks (2026-11-05, the user on missed ones; the rest Claude's choice, confirm when convenient)
- **Two kinds of repeat:** **on a schedule** (the calendar's rule from D39: every N days, weeks on chosen weekdays, months on the day, years, optionally until a day; anchored on the first occurrence) and **after done** (N days, weeks or months after the day it's completed: "review topic 3 in 2 days").
- **Every occurrence is its own task** (earns once each, D15), in a series (`task_series`, `trs_`) that holds the rule. Each occurrence keeps its series day; one per series and day.
- **The occurrence's day is the task's date:** its due date, or its scheduled date when it had only that (a repeating task with no date gets a due date on the first matching day). The other date and the reminder move by the same number of days (the reminder keeps its time). Title, description, effort, project (its first open column), goal, spotlight and subtasks (open again) carry over.
- **When the next one appears:** completing the newest occurrence makes the next one at once. On a schedule it also appears on its own day when the last one isn't done (a job every few minutes, in the user's day); after many missed days only the latest is made, so nothing piles up. "After done" waits for the completion.
- **A missed one (the user):** the next one still shows on its day, so that day keeps its task, with a warning that an earlier one is still open and quick "Skip it" (deletes the old one, undoable) and "Open it". The old one stays overdue on Today until it's done or skipped.
- **Undo stays clean:** reopening the occurrence whose completion made the next one removes that next one when it's untouched.
- **Editing:** the repeat is set in the task sheet; changing it on any open occurrence changes the series; "Doesn't repeat" stops it (existing occurrences stay). Deleting an occurrence doesn't stop a schedule. Subtasks don't repeat.
- **Calendar:** a schedule's coming days show as faint chips ahead (not draggable); an "after done" series shows only its open occurrence.
- **Alternatives:** one task rescheduled forward (no history of each time, breaks "earn once" per occurrence); only one open at a time (the user preferred seeing the next one on its day).
- **As built (2026-11-05):** the `repeats` job runs every 5 minutes (and once at startup); a repeat is picked in the task sheet's "Repeat" row (a popover with Save, so trying options doesn't save each one; "Some time after it's done" is the last choice); the missed warning shows in the task sheet and, small, under the task's row in every list; a repeating task gets a small repeat mark in its row; on the calendar's **month grid, schedules busier than 3 times a week** (a daily task) are left out of the faint chips ahead, since they'd fill every cell; the week view and day lists show them.

### D44 · Turn any entry into another (2026-11-05, the user; mappings Claude's choice, confirm when convenient)
- **Context (`observations.txt`, plan.md §13 Q6):** a recurring task and a commitment overlap, and the wrong pick should be fixable later.
- **Decision (the user):** **all four kinds** convert into each other (task, commitment, goal, event), shipped with 4e. **Open entries only** (an open task, an open goal, an active commitment, any event). The **old entry is soft-deleted with Undo**; `@` mentions of it are rewritten to the new one in the same transaction (back on undo); XP already earned stays (D15).
- **Mappings (Claude's choice):** title, description and project carry over (a goal needs a project: the dialog asks when there's none); spotlight carries where the new kind has one; dates map (a task's due or scheduled day ↔ a goal's deadline ↔ an event's day; a month carries between goals and events); repeats map where they match (a task's schedule ↔ an event's repeat ↔ a commitment's weekdays); a minutes commitment per week ↔ a time goal. What doesn't map (subtasks, entries and streaks, a task's goal, an event's time) stays with the old entry and comes back on undo. The dialog lists what carries over and what doesn't before converting. Subtasks can't be converted.
- **Why:** converting is a fix for a wrong pick; a new entry with the old one soft-deleted keeps ids type-prefixed and every history intact.
- **As built (2026-11-05):** "Turn into…" sits in a **"⋯" (More) menu** next to Delete in the task, commitment, goal and event sheets (D32: options behind More; a fifth footer button wrapped the task sheet's). Reminders don't carry between kinds (listed as staying behind). Converting a repeating task stops its series at the same instant, so an undo starts it again; the undo (offered for 10 minutes) removes the new entry for good. The new entry's sheet opens at once with an Undo toast; toasts are now clickable while a sheet is open (they weren't, app-wide).

---

## Rejected ideas (don't propose again)

- **Quire integration** (Quire writing days counting as Streakatron activity) — rejected by the user, 2026-11-03.
- **Familiar / pet companion** that grows with level and reacts (from Quire) — rejected by the user, 2026-11-03.
- **All data in Firestore** — rejected by Claude's analysis (breaks the relational model); superseded anyway by D14.

## Deferred, not rejected

- Typed relations and links with behavioral effects (D4) → backlog.
- Production hosting (D13), friend-streak ordering, bedroom art, business model, medals vs. prizes → plan.md §13.
