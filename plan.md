# Streakatron — Development Plan

> A web app that builds consistency for studies and personal projects with light gamification (quests, streaks, XP) and a cosmetic reward layer (loot boxes, collectibles, a bedroom) on top of real project management (areas, projects, goals, tasks, Kanban, calendar). Built for one user first, designed to become a product.

**Status:** Phases 0 (Foundation) and 1 (Structure & views) done, 2026-11-03 · open questions deferred (§13) · Next up: Phase 2 (Linking system)
**Last updated:** 2026-11-03

**How to use this file across sessions:** It is the source of truth for *what to build and how*. Project memory lives in `.claude/` (`CLAUDE.md` is loaded automatically): the vision, the **decisions log** (`.claude/context/decisions.md`, referenced here as D1…) and progress. When a task is done, tick its checkbox, update the status line above and add to `.claude/context/progress.md`. When a decision changes, record it in the decisions log rather than silently diverging. New ideas go to the backlog (§12), not into the current phase.

---

## 1. Vision & principles

**Core question the app answers every time it opens:** *"What's the smallest meaningful thing I can do right now — and does it count?"*

Design principles:

1. **Lower friction than the work it tracks.** Capturing a task or starting a focus session takes seconds and is keyboard-first.
2. **Forgiving, never punishing.** Missing a day must never make quitting the rational choice. Reward coming back. **XP is never taken away** (D15).
3. **Reward effort, not busywork.** XP comes from focus time and task effort, not from task count (no farming by splitting or re-completing tasks).
4. **Focus over abundance.** Today shows only a few items. A limited number of projects can be active.
5. **Light core loop, cosmetic meta-layer.** Streaks, XP, levels, and quests drive the daily loop. Loot boxes, collectibles, the bedroom, and its wardrobe of medals are *cosmetic* rewards on top of it. No character stats, combat, or other RPG systems.
6. **Rewards follow real effort.** Loot only comes from quests tied to meaningful actions; low-effort quest types are capped and give smaller rewards. Rewards are **never** purchasable with real money.
7. **Quests reward the work you actually do.** Quests must match real usage, be sized from your own recent days, and never pile up work faster than it gets done (lessons from Quire, §11).
8. **Product-ready from day one, personal-scale for now.** Multi-tenant data model, real auth, server-authoritative rewards — running on one machine for one user until it's worth more (D14).
9. **Dogfood early.** The MVP must be usable daily as early as possible; later features are driven by what's actually missing.
10. **Easy to use as it grows.** Defaults first, options behind "More"; grow existing screens before adding pages; the same patterns everywhere; every slice ends with a UI review (D32).

### Failure modes this app targets

| Failure mode | Countermeasure |
|---|---|
| Forgetting / never starting | Today view as home, per-project *next action*, daily quests with tiny first steps, push reminders (PWA) |
| Overwhelm / not knowing what's next | Today capped at ~5 items, subtasks, suggested next action |
| Missing a day → quitting | Weekly streak targets, earned streak freezes, comeback quests, XP never lost |
| Too many projects at once | Hard active-project limit (configurable, default 3); others are *parked* |
| Novelty wearing off | Rotating quests of several types, loot boxes, collectibles + bedroom + medals as long-term goals, weekly review ritual, long-term stats |
| No external accountability | Friend streaks (social phase) — identified as a main motivation factor |

---

## 2. Decisions

The full decisions log, with rationale, alternatives and status, lives in **`.claude/context/decisions.md`** (canonical). This plan refers to decisions by ID:

| ID | Decision (summary) |
|---|---|
| D1 | Single user now, friends later; `user_id` everywhere |
| D2 | Runs locally and over Tailscale (HTTPS via `tailscale serve`) |
| D3 | Light gamification + cosmetic meta-layer |
| D4 | Linking = free-form mentions only, no behavioral effect |
| D5 | Hard active-project limit, default 3 |
| D6 | No study-specific features; generic calendar/schedules/countdowns |
| D7 | English UI; strings kept i18n-ready |
| D8 | Gamification derived from an activity log |
| D9 | *(superseded by D14)* |
| D10 | Typed quests via a registry |
| D11 | A loot box per completed quest; server-side rolls; never sold |
| D12 | Bedroom is cosmetic, with a wardrobe of medals and prizes |
| D13 | Production hosting / social backend: deferred |
| D14 | Stack: React + Vite, Hono, PostgreSQL + Drizzle, Better Auth, pg-boss |
| D15 | XP is never taken away; each source earns once |
| D16 | Make quests with follow-up quests and a soft cap |
| D17 | Server-authoritative rewards and days |
| D18 | Daily backups checked hourly, named by the owner's day |
| D19 | Deleting: tasks/goals soft-deleted with Undo; projects/areas into a snapshot; 30 days to restore |
| D20 | Board rules: "done" follows the column category; next action prefers in-progress tasks |
| D21 | Mentions: TipTap nodes by id; links rewritten with every description save |
| D22 | Goal and area sheets; editors start from freshly fetched data |
| D23 | Search: full-text with prefixes, typo-tolerant titles |
| D24 | UI polish rules: one page width, no desktop top bar, unbuilt pages hidden, day picker, completion pop |
| D25 | Visual identity: B's structure, C's colors, A's icons and quest-complete screen, rounded type (Fredoka + Nunito); applied to the app (rarity colors open) |
| D26 | The app is called Streakatron, internals included (packages, database, containers, backups) |
| D27 | Phase 3 in three slices; the game starts fresh (no backfill); unset effort earns like S |
| D28 | The game runs on the server; write responses carry a `game` block the UI turns into moments |
| D29 | Focus sessions: overtime capped at plan + 60 min, browser-only breaks, mini timer + focus page |
| D30 | MVP quests: big moments on screen, small in the toast; placeholder loot box; templates and evaluation |
| D31 | Habits become Commitments (any measure, period, schedule; remind until done); "commitment goal" → time goal; Phase 4 = commitments, reminders, calendar, then the rest |
| D32 | Use-case gaps placed (waiting, required projects, task reminders, recurring tasks, tentative dates, number goals, timezone moves, planned breaks); group projects to the backlog; the UI stays easy (defaults first, UI review per slice) |
| D33 | Spotlight: up to 4 tasks or goals featured on Today; countdowns use it too |
| D34 | Phase 4 in six slices: commitments (+ time-goal progress), Today & boards, reminders, calendar, recurring tasks, goals & review |
| D35 | Proprietary license, all rights reserved |
| D36 | Commitments as built in 4a |
| D37 | Today & boards as built in 4b (Spotlight, waiting, required, create from pickers) |
| D38 | Reminders as built in 4c: a minute job sends what's due once, with grace; snooze; push to every device; installable app |
| D39 | Calendar & countdowns as built in 4d: events (day, month or TBD; structured repeats instead of RRULE), countdowns in Spotlight, month/week views with drag to schedule, day load |

Rejected ideas are listed at the end of the decisions log so they aren't proposed again.

---

## 3. Core concepts (glossary)

- **Area** — a long-lived sphere of life (e.g. *University*, *Side projects*, *Health*). Contains projects.
- **Project** — a bounded effort with a status: `active`, `parked`, `completed`, `archived`. Has goals, tasks, a board, and one *next action*.
- **Goal** — something a project is aiming for. Two kinds:
  - **Outcome goal** — a result, optionally with a deadline ("Pass Linear Algebra exam", "Ship v1").
  - **Time goal** — a recurring effort target ("4 hours/week of focus on this project"), counted from focus sessions on the project. *(Called "commitment goal" until D31.)*
- **Task** — a unit of work. Has status (via board column), effort (S/M/L), optional due date, optional scheduled date, optional parent task (subtasks). Tasks without a project live in the **Inbox**.
- **Commitment** (D31; planned as *habit*) — a recurring routine that is never "done", set up however the user wants: measured as done / not done, an amount with their own unit, or minutes; per day or per week; every day, chosen weekdays or N times a week ("Duolingo lesson daily", "Anki: 20 cards a day", "3 course classes a week", "15 min listening a day"). Optionally belongs to a project; can remind you until it's done.
- **Calendar event** — a dated item: one-off (exam, presentation, meetup) or recurring (*schedule block*, e.g. "Mon/Wed 14:00–16:00 lecture"). Can belong to a project.
- **Countdown** — any event or due date pinned to show "N days left". Dates may be tentative (a month, or TBD) until known (D32).
- **Focus session** — a timed work block (Pomodoro-style), optionally attached to a task or project. The primary unit of effort.
- **Activity** — an immutable log entry for anything that counts (task completed, focus session finished, commitment logged or met, weekly review done…).
- **Active day** — a day with at least one qualifying activity (see §5).
- **Quest** (a.k.a. mission) — a time-boxed challenge of a given *type* that grants XP and a loot box.
- **Follow-up quest** — a quest spawned when a make quest is completed, asking to fill in the details of what was just made.
- **Loot box** — a reward earned per completed quest; opening it rolls one collectible. Comes in tiers (Small / Standard / Large / Special) that shift rarity odds.
- **Collectible** — a cosmetic item (furniture, desk, poster, plant, lamp, rug, wallpaper, floor…) with a **rarity**: Common, Uncommon, Rare, Epic, Legendary.
- **Bedroom** — the user's customizable room where owned collectibles are placed.
- **Wardrobe** — a piece of the bedroom that displays earned **medals** (achievements) and **prizes** (milestone trophies).
- **Friend streak** — a shared streak between two friends that grows on days when *both* have an active day.
- **Link / mention** — an inline reference from a text field to any other entity, shown with the target's live title. Each entity shows its **backlinks**.

---

## 4. Feature specification

### 4.1 Structure & project management

- CRUD for areas, projects, goals, tasks, commitments, calendar events.
- Project status lifecycle: `active ↔ parked → completed → archived`. Enforce the active limit (D5): trying to activate beyond the limit opens a dialog: "Park one of these to continue". **Required** projects (D32: a course, an obligation) don't count toward the limit and are never offered for parking.
- **Next action** per project: a pinned task, or automatically the top open task on the board if none is pinned.
- **Subtasks**: one level of nesting is enough for now.
- **Recurring tasks** (D32): a repeat rule (every weekday X, monthly on day N, or N days after completion); completing one creates the next instance.
- **Inbox**: quick-captured tasks with no project; triage later (weekly review prompts it).
- **Views** (all over the same data, no duplication):
  - **List view** — grouped/sorted/filtered tasks (by project, status, due date).
  - **Kanban board** — per project, with custom columns. Each column maps to a status *category* (`todo` / `in_progress` / `waiting` / `done`) so the rest of the app knows what "done" means. **Waiting** tasks (blocked on someone else, D32) are never the next action and come back on Today as "follow up" on their scheduled date. Drag & drop between and within columns.
  - **Calendar view** — month and week views showing calendar events, recurring schedule blocks, task due/scheduled dates, and logged focus sessions.
  - **Today view** — see §4.3.
- **Countdowns**: pin any event or due date; shown on Today and on the project page.
- **Command palette** (`Ctrl+K`): quick capture ("new task in …"), jump to any entity, start focus session.
- **Search**: Postgres full-text search (accent-insensitive, prefix matching, titles ranked first) plus trigram fuzzy matching; powers the palette and the link picker.

### 4.2 Linking system (D4)

- Every entity has a **global, type-prefixed ID** (e.g. `tsk_01J…`, `prj_01J…`, `gol_…`, `are_…`, `cmt_…`, `evt_…`) so a reference alone tells you what it points to.
- Every free-text field (descriptions, notes, review answers) is a **rich-text field** (TipTap) supporting inline mentions:
  - Typing `@` or `[[` opens a fuzzy picker across all entity types (shows type icon + parent context).
  - A mention renders as a chip with the **target's current title** and icon; renames propagate automatically because only the ID is stored.
  - Clicking a chip navigates to (or previews) the target. Mentions of deleted entities render as a "broken link" chip.
- On save, mentions are extracted from the document into the `links` table (`source → target`, plus which field). This powers:
  - **Backlinks panel** on every entity: "Mentioned in…", grouped by source type, with a text snippet.
- Links have **no behavioral effect** (no progress propagation, no blocking).
- Titles: plain text initially; mentions inside titles are a backlog item (§12).

### 4.3 Today view (home screen)

- Header: level + XP bar, current daily streak, weekly target progress, streak freezes banked.
- **Focus list** (max 5 visible, "show more" collapses the rest), ordered:
  1. Overdue tasks
  2. Tasks due or scheduled today
  3. Commitments due today and not yet met (check, +1 / +N, log minutes or start focus, by measure); met ones collapse into a "done today" line
  4. Next action of each active project
- **Spotlight** (D33): at most 4 tasks or goals the user chose to feature, at the top (tasks with a one-click focus start, goals with progress and days left); countdowns show here too.
- Today's calendar events/schedule blocks.
- Quest board (daily + quick + follow-ups, and comeback quest when active).
- Big "Start focus session" button (optionally pre-attached to the top item).
- **Day boundary** is configurable (default 04:00) so late-night work counts for the previous day.

### 4.4 Focus sessions

- Timer with presets (25/5, 50/10, custom); attach to a task, a project or a commitment (or none). On a commitment, the minutes go to it (minutes measure) or finishing offers "Mark done" / "+1" (D31).
- Pause/resume; sessions survive page reloads (state stored server-side with start timestamp).
- At the planned time: chime and notification, then overtime counts until you finish; a running session finishes on its own 60 minutes past the plan (D29).
- On finish: optional one-line note, optional "mark task done" (or the commitment's "Mark done" / "+1"), the preset's break offered as a browser-only countdown (D29).
- A mini timer on every page plus a full `/focus` page; Today starts one in one click on the top item (D29).
- Browser notification + sound when a session ends (Web Push once the PWA lands, so it works with the tab closed).

### 4.5 Gamification (see §5 for rules)

- XP and levels, daily streak with freezes, weekly target streak, typed quests (§5), contribution heatmap, achievements (medals) later.
- **Immediate feedback:** every write response carries the game events it caused (XP gained, quest done, box earned, level up), so the UI celebrates at once without polling (Quire's pattern, §11).
- Every completed quest feeds the rewards layer (§4.9).

### 4.6 Consistency tools

- **Commitments** (D31): measure (done / amount with a unit / minutes), target, period (day / week), schedule (every day, chosen weekdays; "N times a week" is a week-period check). Filled by a tick, +1 / +N, typed minutes (work done in other apps), or focus sessions started on the commitment (not other sessions on its project). Each has a streak and a history; a commitments page and a section on the project page.
- **Weekly review** (guided, ~5 min): what got done (auto-summary from activity), what stalled (active projects without activity), inbox triage, pick next actions, swap active/parked projects, a short reflection (rich text). Completing it is a quest and an activity.
- **Time goal tracking**: progress bar from focus minutes on the project in the current period; pace ("X min/day to hit this week's target").
- **Reminders** (PWA + Web Push, D31): per commitment off / once at a time / **repeat until done** (from a time, every N hours, until a time; only on scheduled days, skipped once met, never past the day's end); **task reminders** at a date and time (D32); focus session ended; "streak at risk" evening nudge (opt-in, at most one per day). Browser notifications while the app is open, Web Push otherwise. Notifications carry actions (Done, +1, Snooze 1 h).

### 4.7 Stats

- Contribution heatmap (active days, intensity by focus minutes).
- Focus time per project/area per week; trend over time.
- Streak history, quest completion rate, XP over time.
- **Quest fit stats** (offered / done / rerolled / expired by type) — used for the usage review after dogfooding (§11).

### 4.8 Integrations (later)

- **GitHub**: link a repo to a project; commits (via the GitHub API, polled) become activities and count toward active days.
- **Google Calendar**: quests, deadlines and countdowns as events in a calendar the app creates itself (OAuth scope limited to app-created calendars — Quire's approach).

### 4.9 Rewards: loot boxes & collectibles (D11)

- Each completed quest grants one **loot box** (unopened boxes accumulate; a badge shows the count).
- **Box tier by quest type:** quick/follow-up → Small · daily/time/make/comeback → Standard · weekly/review/project → Large · friend/co-op/events → Special.
- **Rarity odds** (base, Standard box): Common 60% · Uncommon 25% · Rare 10% · Epic 4% · Legendary 1%. Small boxes shift odds down, Large/Special shift up. All values in one config module.
- **Pity timer:** guaranteed Rare-or-better if none in the last 10 boxes; Epic-or-better if none in the last 30.
- **Duplicates** are kept (you may want two plants). Recycling duplicates into shards for a shop is a backlog item.
- **Opening**: short reveal animation colored by rarity; skippable; "open all" for backlogs.
- **Collection view** (album): every catalogue item grouped by category/set, owned vs. silhouette, completion %. Useful before the bedroom exists.
- **Catalogue** is static data in the repo (`packages/shared/collectibles`): `key`, name, category, rarity, set/theme, sprite(s), footprint (grid w×h), placement surface (floor / wall / on-top-of), rotations.
- **Retroactive boxes:** when the rewards phase ships, one box is granted per quest already completed in the activity log (unique per quest instance).
- Outcomes are rolled **server-side** (crypto RNG) at open time and stored; recompute never rerolls.

### 4.10 Bedroom & wardrobe (D12)

- An **isometric 2D room**: floor grid (e.g. 8×8 to start) plus two walls with wall slots.
- **Edit mode**: drag items from the inventory drawer onto the grid, rotate, move, send back to inventory. Collision/footprint validation; wall items only on walls; small items can sit on top of desks/shelves.
- Wallpaper and floor are collectibles too.
- **Wardrobe**: a fixed piece of the room that opens into a showcase of everything earned:
  - **Medals** — achievements (first 7-day streak, 100 focus hours, 10 weekly reviews…), each with its earned date.
  - **Prizes** — milestone trophies (completed projects, streak milestones, future seasonal events).
  - The user picks a few favorites to display on the wardrobe's outside / shelves in the room; the rest live inside.
- **View mode** shown as a Room page, with a small preview widget (Today or profile).
- Rendering with **PixiJS** (depth sorting, smooth drag); layout saved as a list of placements.
- **Art is the main cost.** Start with a CC0 isometric asset pack as placeholders; the catalogue format makes swapping art trivial. Final art style and source decided later (§13, Q3). For a product, every asset needs a license that allows commercial use.
- Later: visit friends' bedrooms (read-only), room expansions unlocked by level (backlog).

### 4.11 Social (later — D1, D13)

- Lives in the main backend (D14): friendships and friend streaks are ordinary tables; no separate social service.
- **Friend streaks (headline feature):** a streak per friend pair that increments on each day both users have an active day (each evaluated on their own local date). Pair freezes follow the same rules as personal freezes. Gentle nudge when your friend is active and you aren't yet ("Alex kept your streak alive — your turn").
- Accounts, friend invites (code or link), friend requests, friend list, remove/block.
- Privacy by default: friends see only minimal facts — active-day yes/no, streak counts, level, bedroom and wardrobe. **Never** task/project titles or contents unless explicitly shared.
- Later: activity feed (opt-in), friend/co-op quests (Special boxes), visit bedrooms. No competitive leaderboards by default.
- Server-authoritative (D17): friend streaks are computed from each user's server-side activity.

---

## 5. Gamification rules (initial values — tune after dogfooding)

All values live in one config module in `packages/shared/game` and are applied by pure functions over the activity log (D8). The server is the only place they run for real (D17).

### XP

| Activity | XP |
|---|---|
| Task completed — effort S / M / L (unset = S, D27) | 10 / 25 / 50 |
| Subtask completed | 0 (the parent task carries the XP) |
| Focus session completed (≥ 10 min) | 1 XP per minute |
| Commitment met (once per commitment per period, D31) | 10 |
| Weekly review completed | 50 |
| Quest completed | quest-defined (10–100) |

- **XP is never taken away (D15).** Each source earns once, ever: a task's completion XP is credited the first time it's completed; reopening keeps it, and completing it again earns 0. Deleting something doesn't remove XP either.
- Soft cap: task XP per day above 200 is halved (guards against bulk-closing).

### Levels

- Cumulative XP to reach level *n*: `50 · n · (n − 1)` → L2 = 100, L3 = 300, L4 = 600, L5 = 1000, L10 = 4500.

### Active day & streaks

- **Active day**: at least one of — a completed focus session ≥ 10 min, a completed task, a day-period commitment met, any entry on a week-period commitment (D31).
- **The user's day** comes from their stored timezone and day-start hour (D17). Changing the timezone is allowed but rate-limited (e.g. once a week) so it can't be used to farm streaks.
- **Daily streak**: consecutive active days.
  - Earn **1 streak freeze** per 7 consecutive active days; bank at most 2.
  - A missed day automatically consumes a banked freeze, keeping the streak alive.
- **Weekly streak** (the "main" forgiving metric): consecutive weeks meeting the weekly target (default **4 active days/week**, configurable).
- Week starts Monday (configurable).

### Quests (D10, D16)

Quests come from an **extensible type registry**. Each type defines: cadence, generator (which instances appear and with what params), evaluator (progress from the activity log), XP reward, and loot box tier. New types are added by registering a module — no schema change.

| Type | Cadence / availability | Examples | XP | Box |
|---|---|---|---|---|
| **Quick** | Always available, ≤ 5 min, **max 3 rewarded per day** | Clear 1 inbox item · Set the next action for project X · Log one commitment · Write a 1-line reflection | 10 | Small |
| **Daily** | 3 per day from a pool, no repeats of yesterday | Finish your top Today item · Complete a task in a project untouched for 3+ days · Meet every commitment due today | 20–40 | Standard |
| **Time** | Daily and weekly variants | Focus 60 min today · Focus 3 h this week on project X (sized from your own days, below) | 30–80 | Standard (daily) / Large (weekly) |
| **Make** | At most 1 per day, **soft-capped** (below) | Add a task to project X · Add a goal to project Y (one with no goals) · Break task Z into subtasks | 15 | Standard |
| **Follow-up** | Spawned when a make quest is done; lasts until the end of the next day | Add details to "<new task>": any 2 of description, effort, due/scheduled date, goal, subtasks | 15 | Small |
| **Weekly** | Fixed set per week | Touch every active project · Hit the weekly active-day target | 60–100 | Large |
| **Review** | Weekly (later: monthly) | Complete the weekly review · Revisit one parked project and decide keep/drop | 50–100 | Large |
| **Project** | Generated from goals and deadlines | Finish 3 tasks of goal X before Friday · Reach 50% of time goal Y this week | 50–100 | Large |
| **Comeback** | After ≥ 2 consecutive inactive days | Do one 10-minute focus session — friendly message, never shaming | 50 | Standard |
| **Friend / co-op** *(social phase)* | Per friend pair | You and Alex both do a 25-min session today | 50 | Special |
| **Event / seasonal** *(backlog)* | Limited time | Exam-season sprint, themed collectible sets | — | Special |

**Make quests, follow-ups and the soft cap (D16)** — designed against Quire's FIT-3 (make quests created blank entries faster than they were filled):

- A make quest is done when an item of the asked kind is created in the target project after the quest was offered.
- Completing it immediately spawns a **follow-up quest** pointing at the new item: "Add details to *X*". It asks for **any 2** of the item's missing parts — all of them doable in a minute (no part that needs outside work). For a goal: description, target/deadline, at least one task under it.
- If the made item is deleted the same day, its follow-up is cancelled and the make quest's box is not granted (it's granted on completion, so: the box is granted when the follow-up is done *or* expires with the item still existing).
- **Soft cap** — a make quest's weight shrinks as the project (and the whole account) fills up:
  - `weight = base × 1 / (1 + (open / cap)²) × 1 / (1 + 2 · undetailed)` where `open` = open tasks (or goals) in the project, `cap` = a per-kind threshold (e.g. 15 tasks, 3 goals), `undetailed` = items still missing details (pending follow-ups count here).
  - Above a hard ceiling (e.g. 3 pending follow-ups, or 2× `cap`), no make quests are offered at all.
- Make quests only target **active** projects.

**Selection and sizing** (patterns proven in Quire, §11):

- **Weighted picks with waiting time:** a candidate's weight is `need × (1 + daysWaiting / 7)²`, where `daysWaiting` counts days since it was last offered or worked on. Neglected projects and tasks surface sooner or later; nothing is left out forever.
- **Sized from your own days:** time quests target the median of your recent active days (last 28 days, at least 3 of them) × 0.8–1.2, rounded to 5 minutes, clamped to configurable min/max. With too little history, a default range is used.
- **One reroll per quest per day.** Rerolls are logged: a type that keeps getting rerolled is a misfit signal.
- **Board bonus:** finishing every daily quest grants bonus XP.
- **Resting types:** each quest type (except comeback) can be turned off in settings.
- **Nothing for idle things:** parked/completed projects never get quests; after 7+ days with no activity at all, only the comeback quest appears (no full board waiting as noise).
- Quests never count only one kind of work when you do another (Quire's FIT-2): time quests count focus on any project unless they name one.
- Quest progress is evaluated incrementally from new activity (only the quests that activity can affect), and fully when the board is viewed.
- Every completion is logged as a `quest_completed` activity from the MVP on, so loot boxes can be granted retroactively (§4.9).

---

## 6. Architecture & tech stack (D14)

### Why this stack (product direction)

Two candidates were compared: Quire's proven stack and a mainstream product stack.

| Concern | Quire's stack (Svelte 5 + Fastify + node:sqlite) | **Chosen: React + Hono + Postgres** |
|---|---|---|
| Multi-user, concurrent writes, social queries | SQLite: one writer, one machine; fine personally, a constraint for a hosted product | Postgres: the default for multi-tenant apps; managed hosting everywhere |
| Dev = prod | Would need a SQLite → Postgres migration before launch | Same database locally (Docker) and in production |
| Mobile | PWA or Capacitor | PWA first, then **React Native / Expo** sharing `packages/shared` and the API client; home-screen streak widgets are a strong retention feature |
| Ecosystem | Smaller; Quire built its own DnD and components | TipTap React, dnd-kit, shadcn/ui, PixiJS React, calendar libs |
| Hiring / contributors | Smaller pool | Largest pool |
| Reuse from Quire | High (components and server modules) | Medium: the framework-agnostic TypeScript logic ports as-is (§11); Svelte components wouldn't port to React Native anyway |

Svelte 5 would be a perfectly good web framework; the deciding factors are Postgres for a multi-user product and the React Native path for mobile.

### Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | Shared types/validation between client and server. |
| Monorepo | **pnpm workspaces** | Simple, fast. |
| Frontend | **React + Vite** SPA | The app lives behind login; a marketing site can be separate later. |
| Routing / data | **TanStack Router** + **TanStack Query** | Type-safe routes; caching + optimistic updates for snappy Kanban. |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) | Accessible primitives, fast to build, easy to theme. |
| Rich text / mentions | **TipTap** (ProseMirror) + Mention extension | Inline mention nodes stored as JSON. |
| Drag & drop | **dnd-kit** | Kanban columns and cards. |
| Command palette | **cmdk** | Ctrl+K palette. |
| Calendar | Custom month/week grid (date-fns) — evaluate FullCalendar if it gets heavy | Keeps styling consistent. |
| Charts | Recharts (or plain SVG for the heatmap) | Stats page. |
| Bedroom rendering | **PixiJS** (+ `@pixi/react`) | Isometric depth sorting, drag & drop on a canvas. |
| Backend | **Hono** on Node | Small, fast, portable (Node, Bun, edge); typed RPC client (`hc`). |
| Validation | **Zod** | Shared schemas in `packages/shared`. |
| Database | **PostgreSQL** + **Drizzle ORM** + drizzle-kit migrations | Multi-user ready; same DB in dev and prod. |
| Search | Postgres FTS (`tsvector` + `unaccent`) + `pg_trgm` | Accent-insensitive prefix search; fuzzy link picker. |
| Auth | **Better Auth** (self-hosted, sessions in Postgres) | Email + password now; OAuth providers later; no vendor lock-in. |
| Jobs / cron | **pg-boss** (Postgres-backed queue) | Daily rollover per timezone, quest generation, backups, reminders, retries — no Redis. |
| Realtime (later) | Server-Sent Events from Hono | Friend streak updates, nudges. |
| Push (later) | Web Push (VAPID) via service worker | Reminders on desktop and phone (installed PWA). |
| IDs | **ULID** with type prefix | Sortable, global, type-revealing. |
| Testing | **Vitest** (game rules, API against a real Postgres in Docker), **Playwright** (key flows) | Game rules and save paths tested from the start. |
| Lint/format | ESLint + Prettier | — |
| Run | **Docker Compose** (app + Postgres); `tailscale serve` for HTTPS on the tailnet | D2. The same image deploys to a VPS / Fly / Railway later. |

### Key architectural notes

- **Activity log as source of truth for gamification (D8).** Mutations that "count" (complete task, finish session, log a commitment, finish review) write an `activity` row in the same DB transaction. XP, level, streaks, freezes, and quest progress are computed by pure functions in `packages/shared/game` from the activity log. A cached `stats_snapshot` can be rebuilt any time ("recompute" admin action).
- **Earn once, never lose (D15).** The rules engine credits each source once (keyed by e.g. `task_completed:<taskId>`); later duplicates earn 0 and reopenings are ignored for XP. Recompute reproduces this exactly.
- **Server-authoritative (D17).** Clients never send XP, streak, or loot values. The user's local day is computed on the server from their stored timezone and day-start hour.
- **Game events on responses.** Each write returns the game events it caused (`{ data, game: { xp, levelUp, questsDone, boxesEarned } }`) so the UI reacts immediately.
- **Time handling.** Timestamps as `timestamptz`; calendar dates (due dates, commitment days) as `date`. Day arithmetic only on `YYYY-MM-DD` values (Quire's SH-7: never shift days through local-time `Date` objects). All "which day does this count for" logic lives in one tested helper.
- **References are real columns.** Every reference to another row is a foreign-key column with an explicit `ON DELETE` rule; JSON (`jsonb`) only holds leaf data (Quire's LOG-12: ids buried in JSON dangled after deletes). Mention links are the one exception by design (they live in rich text, extracted to `links`, and render as broken chips).
- **Rich text storage.** TipTap JSON in `jsonb`, plus a derived plain-text column for FTS. Mentions extracted to `links` on every save (delete-and-reinsert per source field).
- **One way to save.** A single autosave helper on the client (value-driven, one request in flight, flushed on page hide) and a single merge rule for optimistic updates (Quire's DES-3/4/6).
- **Optimistic UI** for Kanban moves, checkboxes, and check-ins via TanStack Query.
- **Backups (D18).** One `pg_dump` per day to `data/backups/`, keeping the last 14 (named by the owner's local day). The job checks hourly and at startup, so a machine that was off at night still gets one. Optional copy to a folder or Google Drive later. Retries on failure.
- **Deleting (D19).** Tasks and goals are soft-deleted (`deleted_at`, Undo in the toast). Projects and areas are written to a JSON snapshot and then deleted, restorable from Settings. Both last 30 days, then an hourly purge job removes them.
- **Multi-tenant from day one (D1).** Better Auth users; every table has `user_id`; every query is scoped. Sign-up is closed (invite-only / first user) until the product is opened.
- **Offline is out of scope** for now. If it's ever added, start from Quire's final design (a route table of every write, client-made ids so creates are idempotent, one merge rule), not from scratch (Quire's OFF-1…13).

### Repository layout

```
streakatron/
├── apps/
│   ├── web/                # React + Vite SPA
│   │   └── src/
│   │       ├── routes/     # TanStack Router file routes
│   │       ├── features/   # today, projects, board, calendar, focus, quests, rewards, bedroom, stats, review, links
│   │       ├── components/ # shared UI (shadcn-based)
│   │       └── lib/        # api client, query hooks, editor setup, autosave helper
│   └── server/             # Hono API
│       └── src/
│           ├── db/         # Drizzle schema, migrations, seed
│           ├── auth/       # Better Auth setup
│           ├── routes/     # route modules per entity
│           ├── services/   # business logic (activity writes, link extraction, quest engine, loot)
│           ├── jobs/       # pg-boss workers (rollover, backups, reminders)
│           └── index.ts
├── packages/
│   └── shared/
│       ├── schemas/        # Zod schemas + inferred types
│       ├── game/           # XP, levels, streaks, quest type registry, weighting, sizing, loot odds — pure, unit-tested
│       ├── collectibles/   # static catalogue (items, rarities, sets, footprints)
│       └── time/           # day-boundary / week helpers
│   (apps/web/public/assets/collectibles/ holds the sprites)
├── data/                   # backups, snapshots (gitignored)
├── docker-compose.yml      # app + Postgres
├── plan.md
└── package.json            # pnpm workspace root; `pnpm dev` runs web + server
```

Dev setup: `docker compose up -d db` for Postgres, then `pnpm dev` starts the Hono server (e.g. `:3001`) and Vite (`:5173`) with `/api` proxied. `tailscale serve` exposes it over HTTPS on the tailnet.

---

## 7. Data model (initial)

Postgres. All tables include `id` (prefixed ULID, `text`), `user_id` (FK to the auth user), `created_at`, `updated_at` (`timestamptz`); soft delete via `deleted_at` where noted. `rich` = TipTap JSON (`jsonb`) + derived `*_text` column. Areas, projects, goals and tasks have a generated `search_vector` (title weight A, description B) with a GIN index, and a trigram index on the title (D23, migration `0004_search`). References are FK columns with explicit `ON DELETE` (usually `SET NULL`).

| Table | Key columns |
|---|---|
| Better Auth tables | `user`, `session`, `account`, `verification` (managed by Better Auth) |
| `user_settings` | `user_id` (PK), `timezone`, `timezone_changed_at`, `day_start_hour`, `week_start`, `active_project_limit`, `weekly_active_day_target`, `focus_presets`, `quest_settings` (resting types, time-quest min/max) |
| `areas` | `title`, `description` (rich), `color`, `icon`, `sort_order`, `archived_at` (deleted into a snapshot, D19) |
| `projects` | `area_id?`, `title`, `description` (rich), `status` (active/parked/completed/archived), `status_changed_at`, `next_action_task_id?`, `color`, `icon`, `start_date?`, `due_date?`, `sort_order` (deleted into a snapshot, D19) |
| `board_columns` | `project_id`, `title`, `category` (todo/in_progress/done), `sort_order` |
| `goals` | `project_id`, `title`, `description` (rich), `kind` (outcome/time; `commitment` until D31), `target_minutes?`, `period?` (week/month), `due_date?`, `status` (open/achieved/dropped), `deleted_at` |
| `tasks` | `project_id?` (null = inbox), `goal_id?`, `parent_task_id?`, `column_id?`, `title`, `description` (rich), `effort` (S/M/L, nullable = not set), `due_date?`, `scheduled_date?`, `sort_order`, `completed_at?`, `deleted_at` |
| `commitments` (D31) | `project_id?`, `title`, `description` (rich), `measure` (check/count/minutes), `target`, `unit?` (count), `period` (day/week), `schedule` (jsonb, day period: every day or `{days: [...]}`), `reminder` (jsonb: off / once `{at}` / repeat `{from, every_minutes, until}`), `sort_order`, `archived_at` |
| `commitment_entries` | `commitment_id`, `local_date`, `amount`, `source` (manual/focus), `focus_session_id?`, `note?` — summed per day; one per day for check |
| `calendar_events` | `project_id?`, `title`, `description` (rich), `start_at`, `end_at?`, `all_day`, `recurrence?` (RRULE string), `is_countdown`, `deleted_at` |
| `focus_sessions` | `task_id?`, `project_id?`, `commitment_id?` (one of the three), `started_at`, `ended_at?`, `planned_minutes`, `paused_ms`, `status` (running/paused/completed/abandoned), `note?` |
| `weekly_reviews` | `week_start` (date), `answers` (jsonb), `completed_at?` |
| `activity` | `type` (task_completed, task_reopened, focus_completed, commitment_logged, commitment_met, review_completed, quest_completed, item_created, …), `entity_id?`, `occurred_at`, `local_date`, `payload` (jsonb, e.g. effort, minutes) — append-only |
| `quest_instances` | `type`, `template_key`, `period_start`, `period_end`, `target`, `reward_xp`, `box_tier`, `params` (jsonb), `target_entity_id?`, `parent_quest_id?` (follow-up chain), `status` (offered/completed/expired/rerolled/cancelled), `offered_at`, `completed_at?` |
| `loot_boxes` | `quest_instance_id` (unique), `tier`, `earned_at`, `opened_at?`, `item_key?`, `rarity?` — pity counters derived from opened history |
| `inventory_items` | `item_key`, `acquired_at`, `loot_box_id?` — one row per owned copy |
| `room_placements` | `inventory_item_id` (unique), `room_id` (default room for now), `surface` (floor/wall_left/wall_right/on_item), `x`, `y`, `rotation`, `parent_placement_id?` |
| `achievements` | `key`, `earned_at`, `kind` (medal/prize), `params` (jsonb) — unique (`user_id`, `key`) |
| `showcase` | `achievement_id`, `slot` — which medals/prizes are displayed on the wardrobe |
| `links` | `source_id`, `source_field`, `target_id` — no FKs (any kind on either side); unique (`source_id`, `source_field`, `target_id`), index (`user_id`, `target_id`) for backlinks (D21) |
| `countdown_pins` | `target_id` (event / task / goal / project with a date) — or reuse `is_countdown` where the entity has it |
| `snapshots` | `kind` (project/area), `entity_id`, `title`, `data` (jsonb: the rows that went with it), `expires_at` |
| *(social phase)* `friendships` | `user_a`, `user_b`, `status` (pending/accepted/blocked), `created_at` |
| *(social phase)* `friend_invites` | `code`, `created_by`, `expires_at`, `used_by?` |

Gamification state (XP total, level, streaks, freezes, friend streaks) is **derived**, optionally cached in a `stats_snapshot` row; never hand-edited.

---

## 8. API sketch

JSON over Hono with Zod validation; typed client via Hono RPC. Write responses include a `game` block with the events they caused.

- `/api/auth/*` — Better Auth
- `GET/POST/PATCH/DELETE /api/{areas|projects|goals|tasks|commitments|events}`
- `POST /api/projects/:id/status` — enforces active limit; returns conflict payload listing active projects if over limit
- `POST /api/tasks/:id/complete` · `POST /api/tasks/:id/reopen` · `POST /api/tasks/:id/move` (column + sort order)
- `POST /api/commitments/:id/entries` (check, +N, minutes) · `DELETE /api/commitments/:id/entries/:entryId`
- `POST /api/focus/start` · `/pause` · `/resume` · `/finish` · `/abandon` · `GET /api/focus/current`
- `GET /api/today` — aggregated Today payload
- `GET /api/calendar?from&to` — events (expanded recurrences), due/scheduled tasks, focus sessions
- `GET /api/game/state` — XP, level, streaks, freezes, weekly progress
- `GET /api/quests?period=today|week` · `POST /api/quests/:id/reroll`
- `GET /api/goals/:id` — the goal sheet
- `GET /api/search?q&types&limit` — palette + link picker; an empty `q` lists recently changed open things
- `GET /api/entities/:id/backlinks` (lines read with current titles) · `GET /api/entities/resolve?ids=` (≤ 100; titles and state for mention chips; unknown ids left out)
- `GET /api/stats/heatmap?from&to` · `GET /api/stats/focus?groupBy=project|area&from&to` · `GET /api/stats/quests`
- `POST /api/reviews/:weekStart/complete`
- `GET /api/loot` (unopened count + history) · `POST /api/loot/:id/open` · `POST /api/loot/open-all`
- `GET /api/collection` (catalogue + owned) · `GET /api/inventory`
- `GET /api/room` · `PUT /api/room/placements` (validated layout save)
- `GET /api/achievements` · `PUT /api/showcase`
- `GET /api/snapshots` · `POST /api/snapshots/:id/restore`
- `POST /api/admin/recompute` · `POST /api/admin/backup`
- *(social phase)* `GET /api/social/friends` · `POST /api/social/invites` · `POST /api/social/invites/:code/accept` · `GET /api/social/friend-streaks` · `GET /api/social/stream` (SSE)

---

## 9. Development phases

Each phase ends with a usable app. **Phase 3 completion = MVP = start using it daily.**

### Phase 0 — Foundation
- [x] Initialize git repo, pnpm workspace, TypeScript configs, ESLint/Prettier
- [x] `docker-compose.yml` with Postgres (+ `unaccent`, `pg_trgm`); app service for running over Tailscale
- [x] `apps/server`: Hono app, health route, Drizzle schema + migrations, seed
- [x] Better Auth: sign-in, sessions; sign-up closed after the first user
- [x] pg-boss wired with a sample cron job; nightly `pg_dump` backup job (keep 14)
- [x] `apps/web`: Vite + React + Tailwind + shadcn/ui + TanStack Router/Query, sign-in page, app shell (sidebar: Today, Inbox, Areas/Projects, Calendar, Stats; top bar)
- [x] `packages/shared`: Zod schemas, prefixed-ULID helper, time helpers (day boundary, week start, `YYYY-MM-DD` arithmetic) with tests
- [x] Client autosave helper + API wrapper that surfaces errors clearly (one pattern from the start)
- [x] `pnpm dev` runs everything; Vitest wired in all packages, with API tests against the Docker Postgres
- [x] Document `tailscale serve` setup in the README

**Acceptance:** `pnpm dev` opens an app shell at localhost after signing in; the same app is reachable over HTTPS from the phone on the tailnet; DB migrates automatically; tests pass.

### Phase 1 — Structure & views
- [x] Areas CRUD (sidebar tree, colors/icons, reorder)
- [x] Projects CRUD with status lifecycle and **hard active-project limit** dialog
- [x] Goals CRUD on project page (outcome + commitment kinds; commitment progress placeholder)
- [x] Tasks CRUD: effort, due/scheduled dates, subtasks, inbox
- [x] Kanban board per project: custom columns with categories, drag & drop (dnd-kit), optimistic updates
- [x] List view with filters (project, status, due) and sorting
- [x] Next action: pin or auto-derive
- [x] Command palette (Ctrl+K): quick-capture task, jump to entity
- [x] Keyboard shortcuts for common actions (new task, complete, open palette)
- [x] Snapshots before deleting a project or area; restore from settings

**Acceptance:** You can model a real semester + side projects: areas → projects → goals → tasks, move tasks across a board, capture tasks to the inbox in < 5 seconds.

### Phase 2 — Linking system
- [x] TipTap editor component (shared) for all rich-text fields; JSON + plain-text storage
- [x] Mention extension with `@` and `[[` triggers; fuzzy picker across all entity types
- [x] Postgres search: `tsvector` columns + `unaccent`, `pg_trgm` for fuzzy titles
- [x] Mention chips resolve live titles (batched `resolve` endpoint, cached); broken-link state
- [x] Link extraction into `links` table on save
- [x] Backlinks panel on every entity page (goals and areas got detail sheets for it, D22)
- [x] Hover preview / click-to-navigate for chips

**Acceptance:** Mention a goal inside a task description; rename the goal and the chip updates; the goal's backlinks panel lists the task; deleting the goal shows a broken chip.

### Phase 3 — Today + gamification core → **MVP**

Ships in three slices (D27): **3a** activity, XP/levels/streaks, game events, progress strip, settings, recompute *(done)* · **3b** focus sessions *(done, D29)* · **3c** quests and heatmap *(done, D30)*. No backfill: the game starts when 3a is deployed.

- [x] `activity` table and service; all counting mutations write activity in the same transaction *(3a: task completions and reopens; focus and habits add theirs in 3b/Phase 4)*
- [x] `packages/shared/game`: XP rules with **earn-once / never-lose** (D15), level curve, active-day calc, daily streak + freezes, weekly streak — **thorough unit tests** (edge cases: day boundary, timezone change, reopen/re-complete, freeze banking)
- [x] Server-side user day from timezone + day-start hour; rate-limited timezone changes (D17)
- [x] Game events returned on every write response; UI toasts/animations (subtle) *(D28)*
- [x] Focus sessions: timer UI, presets, attach to task/project, persistence across reloads, end notification + sound *(3b, D29: overtime capped at plan + 60 min, browser-only breaks, mini timer + `/focus`)*
- [x] Today view: header (level/XP/streaks/freezes/weekly target), capped focus list, start-focus button *(3a: progress strip; 3b: one-click start-focus on the top item)* *(focus list without habits done early in the 2026-11-04 polish pass, D24: `lib/focus.ts`)*
- [x] Quest engine with **type registry** (D10): weighted picks with waiting time, sizing from your own days, one reroll per quest per day, board bonus, resting types, nothing for idle projects *(D30: pure planners in `packages/shared/quests`)*
- [x] MVP quest types: quick (with daily cap), daily, time, weekly (basic), comeback, **make + follow-up with soft cap** (D16) *(templates listed in D30)*
- [x] Incremental quest evaluation (only quests an activity can affect); `quest_completed` activity logged for future loot; offered/rerolled/expired logged for fit stats *(the `quest_instances` statuses are that log, D30)*
- [x] Contribution heatmap (basic) on Stats page
- [x] Settings page: timezone, day-start hour, week start, active-project limit, weekly target, focus presets, quest types on/off, time-quest min/max *(3a: day and week; 3b: focus presets; 3c: quests)*
- [x] Admin "recompute" action *(`POST /api/admin/recompute`; no button yet)*

**Acceptance:** A full day of real use works end-to-end: plan on Today, run focus sessions, complete tasks, see XP/level/streak update immediately and correctly, complete daily quests. A make quest spawns a follow-up for the new task. Missing a day with a banked freeze keeps the streak. **Start dogfooding.**

### Phase 4 — Commitments, reminders & calendar

Shaped by the use case below and the gaps from brainstormed use cases (D32). **Every slice ends with a UI review** (D32): screenshots of the changed screens on desktop, phone and dark, checked for clutter and plain wording; defaults first, options behind "More".

**Six slices (D34), in this order:** **4a** Commitments (+ time-goal progress) · **4b** Today & boards (Spotlight, waiting, required, create from selectors, small fixes) · **4c** Reminders · **4d** Calendar & countdowns · **4e** Recurring tasks · **4f** Goals & weekly review. Each one is usable on its own and has its own "done when".

**Use case: Studying Japanese** (the user's real setup, 2026-11-04; dates are placeholders until the real ones exist). Area *Intercâmbio* → project *Studying Japanese*: "Get to conversational Japanese before the exchange. Duolingo every day for now; Anki and an online course later."
- **Goals:** "Read and write hiragana and katakana" (outcome, mid-December) · "Pass JLPT N5" (outcome, July) · "4 hours of Japanese a week" (time goal).
- **Tasks:** learn the hiragana rows, the rest of hiragana, katakana; set up Anki with a kana deck; choose an online course.
- **Commitments:** "Duolingo lesson" (done / not done, every day; reminders from 10:00 every 3 h until 22:00) · "Anki reviews" (20 cards a day, once Anki starts) · "Course class" (3 a week, done through focus sessions on it) · "Listening" (15 min a day, minutes typed in).
- **Calendar:** the course's class slots once it starts, the JLPT date and the departure date, both as countdowns on Today and the project page.
- **Found by playing a day on the MVP** (D31): a "daily" thing can only be a task that disappears once done; the time goal shows nothing after a focus session on the project; time spent in Duolingo can't be counted; no reminders, calendar or countdowns; the new-project dialog starts on "No area"; the icon picker has no accessible names; `?tab=` links don't open project tabs.

#### 4a — Commitments
- [x] Rename the goal kind "commitment" to **time goal** (UI, code, migration: `kind: 'time'`; ids `habit`/`habitCheckin` → `commitment`/`commitmentEntry`, `cmt_`)
- [x] `commitments` + `commitment_entries`; CRUD, archive; measure / target / unit / period / schedule; mentionable (linkable kind)
- [x] Entries: check, +1 / +N, typed minutes, delete an entry; focus sessions attach to a commitment (minutes go to it; "Mark done" / "+1" on finish)
- [x] Pure rules in `packages/shared`: day/week met, per-commitment streaks (unscheduled days don't break them), due today — unit-tested
- [x] Game: `commitment_logged` / `commitment_met` activity, 10 XP once per commitment per period, active-day rule (§5); quest templates "Log one commitment" (quick) and "Meet every commitment due today" (daily)
- [x] Today: commitments due and not yet met in the focus list, a "done today" line; commitments page; a section on the project page; sheet `?commitment=`; palette (create, open, log)
- [x] **Time goal progress** from focus minutes (sessions on the project or its commitments), with pace — the use case's "4 hours of Japanese a week"
- [x] UI review (D32)

**Done when:** the four Japanese commitments run for a day: Duolingo ticked (10 XP, active day, its streak), Anki filled with +N to 20, Listening with typed minutes, a 50-minute session on "Course class" counts one class and 50 minutes toward "4 hours of Japanese a week".

#### 4b — Today & boards
- [x] **Spotlight** on Today (D33): tasks and goals, at most 4, from sheets, menus and the palette; not repeated in the focus list
- [x] **Waiting** column category (D32): never the next action, off Today, back as "follow up" on its scheduled date; a "Waiting" column offered on new boards
- [x] **Required** projects (D32): option in the project dialog and menu; outside the active limit; never offered for parking; "Required" badge
- [x] **Create from any selector** (`observations.txt`, D31): every picker of an existing thing offers "New … “typed text”" when it fits — area in the project dialog, project in the task sheet / Move to… / focus attach, goal in the task sheet, commitment in focus attach, and the mention picker (moved from §12)
- [x] Small fixes from the use case: new-project dialog preselects the area; accessible names on icon and color pickers; project tabs from the URL
- [x] UI review (D32)

**Done when:** "Learn katakana" stays in Spotlight for weeks; "Waiting for the acceptance letter" never becomes the next action and comes back on its follow-up date; a required course doesn't count toward the limit; a new area is made from the project dialog.

#### 4c — Reminders
- [x] PWA: manifest, service worker (no offline data), install on phone and desktop over Tailscale HTTPS *(D38; installing and receiving on the real PC and phone still to be checked after deploy)*
- [x] Web Push: VAPID keys, subscriptions per device, a Settings card (enable on this device, test notification)
- [x] One reminder control (D32) reused by commitments, tasks and, later, events
- [x] Commitment reminders: off / once / repeat until done, scheduled server-side (pg-boss) in the user's timezone; skipped once met; never past the day's end
- [x] **Task reminders** at a date and time (D32)
- [x] Focus ended (with the tab closed) and opt-in "streak at risk" evening nudge (max one per day)
- [x] **Notification actions** (D32): Done, +1, Snooze 1 h — without opening the app
- [x] UI review (D32)

**Done when:** Duolingo not done by 10:00 notifies the PC and the phone, again every 3 hours, none after it's ticked (also from the notification's Done); "check the visa status" reminds on its day and time.

#### 4d — Calendar & countdowns
- [x] Calendar events: one-off + recurring, project association *(D39: a structured repeat rule in `packages/shared/calendar` instead of RRULE strings)*
- [x] Calendar view: month + week, showing events, schedule blocks, task due/scheduled dates, focus sessions, commitments met; drag a task onto a day to schedule it
- [x] **Day load** in the week view (how much is scheduled each day)
- [x] **Tentative dates** (D32): goals, events and countdowns can be a month or TBD ("~March 2027") *(goals: a month; no date is their TBD)*
- [x] Countdowns: events and dated goals in Today's Spotlight (D33) and on the project page
- [x] Event reminders (e.g. 15 min before a class) through 4c's control
- [x] UI review (D32)

**Done when:** the JLPT and departure dates show on the calendar and as countdowns in Spotlight (the departure as "~March" until it's known); the course's classes show every week and remind 15 minutes before.

#### 4e — Recurring tasks
- [ ] **Recurring tasks** (D32): every weekday X, monthly on day N, N days after completion ("review again in 2 days"); completing one creates the next with the next date (earn once each, D15); shown on the calendar ahead
- [ ] UI review (D32)

**Done when:** "Problem set every Friday" and "pay the installment on the 5th" come back after each completion; "review topic 3 in 2 days" reappears two days after it's done.

#### 4f — Goals & weekly review
- [ ] **Number goals** (D32): target + unit ("40 lessons"), typed in or fed by a commitment with the same unit, pace to the deadline
- [ ] Weekly review flow (summary, stalled projects, inbox triage, next actions, active/parked swap with required projects apart, reflection)
- [x] Weekly quests fully wired (touch all active projects, weekly target) *(built in 3c, D30)*
- [ ] **Review** quest type (weekly review, revisit a parked project)
- [ ] **Project** quest type generated from goals and deadlines
- [ ] UI review (D32)

**Done when:** "Finish the course: lesson 12 of 40 by June" shows the pace needed; the weekly review is guided and takes ~5 minutes.

**Acceptance (the whole phase):** each slice's "done when", together: On Today, "Duolingo lesson" is due every day until ticked; ticking it earns 10 XP, makes the day active and grows its own streak, and it's due again tomorrow. "Anki reviews" fills with +N to 20; "Listening" fills with typed minutes; a 50-minute focus session on "Course class" counts one class and 50 minutes toward "4 hours of Japanese a week". Duolingo not done by 10:00 sends a notification to the PC and the phone, again every 3 hours, none after it's ticked. The JLPT and departure dates show on the calendar and as countdowns on Today; the course's classes show every week. The weekly review is guided and takes ~5 minutes.

### Phase 5 — Rewards: loot boxes & collection
- [ ] Collectible catalogue format + initial catalogue (~40–60 items across categories and all rarities) with placeholder art (CC0 pack, license checked for commercial use)
- [ ] `loot_boxes` + `inventory_items` tables; box granted on quest completion with tier by type
- [ ] Loot rolling server-side: tiered odds, pity timer — unit-tested with seeded RNG (distribution + pity guarantees); crypto RNG in production
- [ ] Retroactive grant: one box per previously completed quest *(optional since D30: the user isn't relying on boxes accruing before this phase)*
- [ ] Make-quest boxes per D16: granted when the follow-up is done or expires with the item still existing
- [ ] **Rework the loot box visual:** the quest-complete screen shows a placeholder wrapped box since 3c (D30, `LootBoxPlaceholder` in `game-moments.tsx`); replace it with the real box art per tier and the "Open your box" button
- [ ] Opening UI: reveal animation by rarity, skip, open-all; unopened badge in the app shell
- [ ] Collection/album view: owned vs. silhouettes, completion % by category/set

**Acceptance:** Completing a quest yields a box; opening it adds an item to the collection; over 100 simulated openings, rarity distribution and pity rules hold; all pre-existing quest completions produced boxes exactly once.

### Phase 6 — Stats, achievements, polish & integrations
- [ ] **Usage review** after 2–3 weeks of dogfooding (like Quire's `review/fit.md`): quest fit stats, what's used vs. ignored; tune §5 values
- [ ] Stats page: focus per project/area, trends, streak history, quest completion rate, XP over time
- [ ] Achievements → **medals** (first 7-day streak, 100 focus hours, 10 weekly reviews…) and **prizes** (completed projects, streak milestones), stored with earned dates
- [ ] GitHub integration: link repo to project, poll commits, commits → activity (count toward active days)
- [ ] Google Calendar integration: quests, deadlines, countdowns in an app-created calendar
- [ ] Project templates (e.g. "Course": default columns, goals, recurring events, marked required)
- [ ] **Moving timezones** (D32; earlier if the departure comes first): a move is its own action outside the weekly limit; the switch day can't break the streak; reminders follow the new zone
- [ ] **Planned breaks** (D32; same timing): declared ahead, never after the fact; streak neither grows nor breaks; quests and reminders pause; yearly allowance
- [ ] Data export (JSON) and import
- [ ] UX polish pass: empty states, loading states, keyboard shortcut cheat sheet, dark mode
- [ ] Playwright tests for key flows (capture → board → complete → XP → quest → box)

**Acceptance:** After several weeks of use, the stats page tells a truthful story of where time went; medals appear as milestones are reached.

### Phase 7 — Bedroom & wardrobe (D12)
- [ ] Decide art style and source (§13, Q3); finalize sprite specs (isometric angle, tile size, rotations)
- [ ] PixiJS isometric room renderer: floor grid, two walls, depth sorting
- [ ] Edit mode: inventory drawer, drag to place, rotate, move, return to inventory; footprint/collision and surface validation (floor / wall / on-top-of)
- [ ] Wallpaper and floor collectibles
- [ ] Layout persistence (`room_placements`), validated server-side
- [ ] **Wardrobe**: opens into a showcase of all medals and prizes; pick favorites to display in the room (`showcase`)
- [ ] Room page + small preview widget (e.g. on Today or profile)

**Acceptance:** Items from loot boxes can be placed, rotated, stacked on desks, and the room looks the same after reload; invalid placements are impossible; earned medals show in the wardrobe and chosen ones appear in the room.

### Phase 8 — Social foundation & friend streaks
- [ ] Open sign-up behind invites; account settings (email, password, delete account)
- [ ] Friend invites (code or link), friend requests, friend list, remove/block
- [ ] **Friend streaks**: per-pair streak with freezes, computed server-side, shown on Today and the friends page
- [ ] Realtime updates via SSE; nudges ("your friend kept the streak alive — your turn") in-app and via Web Push
- [ ] Privacy settings: what friends see (defaults to minimal)

**Acceptance:** Two accounts can become friends, see each other's streak status within seconds, and a friend streak grows only on days both were active.

### Phase 9 — Social expansion
- [ ] Friend / co-op quest type (Special boxes)
- [ ] Visit friends' bedrooms and wardrobes (read-only)
- [ ] Activity feed (opt-in, minimal)

### Phase 10 — Launch readiness (when it's time to become a product)
- [ ] Decide production hosting (§13, Q1): app host + managed Postgres + backups
- [ ] Transactional email (verification, password reset)
- [ ] Rate limiting, abuse controls on invites, security review
- [ ] Privacy policy, terms, data export and account deletion (already built) documented
- [ ] Error monitoring and privacy-friendly product analytics (opt-in)
- [ ] Landing page; onboarding flow (first area, project, and quest in 2 minutes)
- [ ] Business model decided (§13, Q4) — never paid loot
- [ ] Later: native app with Expo (shared game logic and API client; home-screen streak widget)

---

## 10. Testing strategy

- **Game rules & time helpers:** exhaustive unit tests (they are pure functions — highest ROI). Include fixtures replaying synthetic activity histories (streaks across timezone changes, re-completions, follow-up chains, soft-cap weights).
- **API / save paths:** Vitest integration tests against a real Postgres in Docker — every write route, including "earn once" and quest progress. Quire's lesson (DES-11): untested save paths were where most bugs lived.
- **UI:** component tests where logic is non-trivial (editor mentions, board DnD state); Playwright for the critical flows.

---

## 11. Lessons and reuse from Quire

Quire (`~/Documentos/quire`) is the user's earlier project: a worldbuilding and writing app with XP, levels, streaks, daily quests, mentions, search, backups and Google Calendar sync, plus several review documents of what went wrong. Not integrated with Streakatron (rejected, §2), but its code and lessons are reused.

### Code worth porting (framework-agnostic TypeScript)

| Quire | Streakatron use |
|---|---|
| `shared/quests.ts`: `questWeight`, `pickWeighted`, `questWords` (median-based sizing), reroll and bonus flow | Quest engine selection and sizing (§5) |
| `server/activity.ts`: "marks" (count only growth past the highest value reached), `quietly()` for imports, game events on responses | Earn-once rule (D15), imports that don't count as work, immediate feedback |
| `shared/goals.ts`: `goalStreak`, `pace` | Time goal pace, commitment streaks, countdown pacing |
| `shared/familiar.ts`: `addDays`, `daysBetween` (noon-UTC day arithmetic, SH-7 fix) | `packages/shared/time` |
| `web/src/editor/` (`entryLink.ts`, `suggestList.ts`) | TipTap mention + suggestion extensions (re-render the list in React) |
| `server/search.ts`: ranking rules (names first, prefix, accent-insensitive) | Search behavior, re-implemented on Postgres FTS |
| `server/gcal.ts`: OAuth with app-created-calendar scope, debounced sync | Google Calendar integration (Phase 6) |
| `server/backups.ts`: retention, folder/Drive copy, retries | Backup job behavior (on `pg_dump`) |
| `shared/sound.ts`: Web Audio synth | Timer chime, loot reveal sounds |
| `dev/` harness: route tests, phone-size Playwright crawl | Testing approach |

### Lessons from how Quire was actually used (`review/fit.md`)

- **Quests that reward the wrong work go undone** (FIT-2: write quests done 0 of 15, because they counted manuscript words while most writing went into the codex). → Count every kind of real effort; review fit with real data after dogfooding.
- **Size quests from your own days** (fixed ranges were bigger than almost any real day). → Median-based sizing.
- **Quests must not create work faster than it's finished** (FIT-3: make quests produced blank entries; 46 of 94 stayed blank). → Make quests come with a follow-up quest and a soft cap (D16).
- **Inactive things get no quests** (FIT-9: the unused sample universe got a board every day). → Parked projects get none; idle accounts get only the comeback quest.
- **Don't build far ahead of use** (FIT-12, FIT-15: big features used once or never). → Applies to loot, bedroom and social: build after the MVP proves the daily loop.

### Lessons from Quire's code reviews (`review.md`, `review/logic.md`, `review/patterns.md`)

- **References in JSON blobs dangle** (LOG-2, LOG-3, LOG-12). → FK columns with explicit `ON DELETE`.
- **One function per question** ("what refers to X", "what names does this go by"); copies drift (LOG-8, LOG-13).
- **Offline sync is the most expensive feature** (OFF-1…13). → Out of scope; if ever needed, start from Quire's final design.
- **One autosave helper, one merge rule** (DES-3/4/6: 15 debounced saves written 6 ways).
- **Don't recheck everything on every save** (SRV-8). → Incremental quest evaluation.
- **Failures in follow-up work must not fail the write** (SRV-4: an error in the quest check turned a committed save into a 500). → Game evaluation errors are logged and retried, never returned as a failed save.
- **Day math in local time breaks at the edges** (SH-7). → `YYYY-MM-DD` arithmetic only.

---

## 12. Backlog / ideas (not scheduled)

- Mentions inside titles (single-line TipTap editor, plain-text fallback for compact views)
- Mention labels in stored text: `description_text` keeps the label a mention had when inserted, so search still finds the old name and palette snippets show it (chips and backlinks already read current titles)
- "Names not linked yet": plain-text mentions of an entity's title suggested as links (Quire has this)
- Typed relations (blocks / blocked by, contributes to) — explicitly out of scope per D4
- Links with behavioral effects (e.g. goal progress from linked tasks)
- Timeline / Gantt view
- Graph view of links
- Markdown import/export of descriptions
- Notes as a first-class entity (linkable documents not tied to a task)
- Time-of-day focus analytics ("you focus best at…")
- Offline mode (see §6 note)
- Spread tasks over the days until a deadline, with a warning for overloaded days (D32; the week view's day load comes first, 4d)
- File attachments on tasks and projects (passport scans, letters); links in descriptions cover it for now (D32)
- **Shared group projects** with classmates — a suggestion to be reworked later; must fit the privacy defaults of §4.11 (D32)
- Google Calendar / iCal import
- i18n (Portuguese) — out of scope per D7
- Recycle duplicate collectibles into shards; rotating shard shop to buy specific items
- Themed collectible sets with a cosmetic set-completion bonus (e.g. animated variant)
- Room expansions / extra rooms unlocked by level
- Seasonal / event quests with limited-time collectible sets and prizes
- Monthly review quest
- Gifting collectibles to friends

---

## 13. Open questions (deferred by the user, 2026-11-03)

- **Q1 — Production hosting / social backend (D13).** With D14 the social features live in the main backend; what remains is where production runs: a VPS (e.g. Hetzner) with Docker, a PaaS (Fly.io, Railway), managed Postgres (Neon, Supabase as a Postgres host), or a mix. Decide before Phase 10.
- **Q2 — Ordering of friend streaks.** Currently Phase 8 (after rewards, stats/polish, bedroom). Since it's a main motivation factor, it could move right after Phase 5.
- **Q3 — Bedroom art.** Style (pixel art vs. clean vector isometric) and source (CC0 packs, self-made, commissioned, AI-assisted — check commercial licensing for a product). Placeholders unblock development either way.
- **Q4 — Business model** (for the product): free, freemium (e.g. integrations, extra rooms), or subscription. Fixed constraint: loot is never sold.
- **Q5 — Medals vs. prizes in the wardrobe.** Working definition: medals = achievements, prizes = milestone trophies (projects completed, streak milestones, events). Confirm when designing Phase 6–7.
- Revisit gamification numbers (§5) and loot odds (§4.9) after ~2 weeks of dogfooding.
