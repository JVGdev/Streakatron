# Progress

## Status

- **Current phase:** Planning complete → **Phase 0 (Foundation) next**.
- **Code:** none yet. **Repository:** https://github.com/JVGdev/streaktron (private, `main`).
- **Open questions:** deferred by the user (plan.md §13). Pending confirmation: the loot-box timing for make quests (decisions.md D16).

## Next steps

1. Phase 0 (plan.md §9):
   - pnpm monorepo (git repo already exists)
   - Docker Compose with Postgres; Hono + Drizzle
   - Better Auth (sign-up closed after the first user)
   - pg-boss and the nightly backup job
   - React shell
   - shared time helpers with tests; the autosave helper
   - Tailscale serve docs
2. Then Phases 1–3 to reach the MVP and start dogfooding.

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
