# RemoEdPH Product Skills & Specs

Agent-facing product specs that feature work should extend. Lesson slide chrome remains in [`.cursor/skills/remoed-lesson-creation/SKILL.md`](.cursor/skills/remoed-lesson-creation/SKILL.md).

---

## Gamification: Virtual Garden & Eco-Drop Engine

### Vision

Preschool and young learners nurture a digital garden as they complete Learning Journey lessons. Progress is rewarded with **Eco-Drops** — a kid-friendly currency separate from paid lesson **credits**.

| Event | Eco-Drops |
|-------|-----------|
| 1 completed Learning Journey lesson (first time) | **+1** earned |
| Buy Seeds | **−5** → plant a seed in an empty soil plot |
| Water Plant | **−5** → advance one growth stage |
| Buy Flowers & Trees | **−22** → place a fully grown blooming flower/tree |

**22 Eco-Drops earned** aligns with one Learning Journey batch (22 lessons / monthly learning cycle) and unlocks the tree milestone.

### Growth stages

| Stage | Name | Notes |
|-------|------|--------|
| 0 | Seed | After Buy Seeds |
| 1 | Sprout | After first Water |
| 2 | Young Tree | After second Water |
| 3 | Blooming Tree | After third Water, or instantly via Buy Flowers & Trees |

Water on stage 3 is rejected (no charge). Default garden has **8 soil plots** (`positionIndex` 0–7).

### Inventory & item types

- Collection: `StudentGardenItem` — `studentId` (username), `itemType` (`seed` | `plant` | `flower` | `tree`), `growthStage` (0–3), `positionIndex`, `plantedAt`, optional `variant`.
- As a seed is watered, `itemType` may promote (`seed` → `plant` → `tree`); Buy Flowers & Trees places `flower` or `tree` at stage 3.
- Stats: **Available Eco-Drops** (`ecoDropsBalance`), **Total Eco-Drops Earned** (`totalEcoDropsEarned`), **Plants & Trees Grown** (count of items with `growthStage >= 1` or type flower/tree).

### Milestone unlocks

Tracked on Student as `gardenUnlockedMilestones` (string codes):

| Code | Trigger | Unlocks (v1 catalog) |
|------|---------|----------------------|
| `drops_5` | `totalEcoDropsEarned >= 5` | Garden butterfly companion |
| `drops_11` | `totalEcoDropsEarned >= 11` | Rainbow flower décor |
| `drops_22` | `totalEcoDropsEarned >= 22` | Remo treehouse / monthly tree badge |

Future: color/phonics achievement badges can add further codes without changing the Eco-Drop economy.

### Award rules (idempotent)

- Primary hook: first transition of `LessonProgress` → `status: 'completed'` in `upsertLessonProgressFromBooking`.
- Ledger: `EcoDropLedger` with unique `(studentId, lessonId)` for `reason: lesson_complete` — never double-award the same lesson.
- Celebration: increment `pendingEcoDropCelebration`; student UI shows toast/modal on next Garden / Journey / Dashboard visit, then acknowledges.

### Student APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/garden` | Balance, stats, items, milestones; `?ackCelebration=1` clears pending celebration |
| GET | `/api/student/eco-drops` | Light balance for sidebar/header badge |
| POST | `/api/student/garden/action` | `{ action: 'buy_seed' \| 'water_plant' \| 'buy_tree', positionIndex?, itemId? }` |
| POST | `/api/student/lessons/complete` | Backfill grant if lesson already completed; does **not** force-complete from the student client |

Storage uses camelCase on Mongo (`ecoDropsBalance`). JSON may also expose snake_case aliases for the product spec.

### UI surfaces

- Sidebar: **Virtual Garden** (`student-virtual-garden.html`) with Eco-Drop badge.
- Header chip: live Eco-Drop count.
- Garden page: stats bar, 8-plot canvas, shop drawer, Learning Journey CTA banner.
