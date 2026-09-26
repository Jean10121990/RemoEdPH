# RemoEdPH Product Skills & Specs

Agent-facing product specs that feature work should extend. Lesson slide chrome remains in [`.cursor/skills/remoed-lesson-creation/SKILL.md`](.cursor/skills/remoed-lesson-creation/SKILL.md). Portal layout and auth surfaces: [`docs/STABLE_BASELINE.md`](docs/STABLE_BASELINE.md).

---

## UI icons (Lucide)

**Catalog:** [https://lucide.dev/icons/](https://lucide.dev/icons/) (ISC license). Pick names from that site; do not invent paths or use emoji for chrome.

### How to draw them

- Inline SVG (preferred for password, chips, and one-off controls) or a small helper that injects Lucide markup.
- `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Size with CSS (`width`/`height` ~20px). Color follows the parent (`currentColor`).
- `aria-hidden="true"` on decorative SVGs; put the accessible name on the button (`aria-label`).
- Shared helper: `public/js/lucide-icons.js` (`RemoedLucide.apply`, `applyToggle`, `fillAll` on `[data-lucide]`).

### System icons (use these names)

| UI | Lucide |
|----|--------|
| Camera / webcam on | [video](https://lucide.dev/icons/video) |
| Camera off | [video-off](https://lucide.dev/icons/video-off) |
| Photo camera | [camera](https://lucide.dev/icons/camera) |
| Microphone on | [mic](https://lucide.dev/icons/mic) |
| Microphone off | [mic-off](https://lucide.dev/icons/mic-off) |
| Speaker / peer audio | [volume-2](https://lucide.dev/icons/volume-2) / [volume-x](https://lucide.dev/icons/volume-x) |
| Background / image | [image](https://lucide.dev/icons/image) |
| Send (chat) | [send](https://lucide.dev/icons/send) |
| Waiting / time | [clock](https://lucide.dev/icons/clock) |
| Network | [wifi](https://lucide.dev/icons/wifi) |
| Browser | [globe](https://lucide.dev/icons/globe) |
| Mini-game | [gamepad-2](https://lucide.dev/icons/gamepad-2) |

Live classroom media buttons (`#toggle-camera`, `#toggle-mic`, `#toggle-mute`, `#toggle-camera-settings`) and teacher student-lock chips (`mic` / `mic-off` / `video` / `video-off`) use this set — **icons, not “Mute mic” text**.

### Classroom chat language

Conservative word-boundary filter (`public/js/chat-language-filter.js`, also used in `server/index.js`). Flags are **possible**, not proven.

- Students see asterisks only (no original text in the payload).
- Teachers see the masked line plus **Show possible flagged words** for review, behavior notes, or reporting.

### Password show / hide

Use **eye** (hidden) and **eye-off** (visible) **inside the field** (same bordered box as the input — not a separate “Show” button). Implementation: `public/js/password-toggle.js` + `public/css/password-toggle.css`. Copy the official Lucide paths.

Set-password cards (`reset-password.html`, `student-reset-password.html`) are **desktop-width** (`max-width: 560px`), not a 370px phone column.

### Password format

Required: **8+ characters**, **uppercase**, **lowercase**, **number**, and **a symbol** (e.g. `! @ # $ %`). Meter: weak until all rules pass; strong at 8+; super strong at 12+. Server: `RESET_PASSWORD_REGEX` in `server/auth.js`.

| State | Lucide | Page |
|-------|--------|------|
| Password masked | [eye](https://lucide.dev/icons/eye) | all `input[type=password]` |
| Password revealed | [eye-off](https://lucide.dev/icons/eye-off) | same toggle, `aria-label` Hide password |

### Do not

- Do **not** use emoji as UI icons (nav, toggles, form actions).
- Do **not** mix a second icon set on new portal work. Landing culture cards may still use existing Font Awesome circles (`.remo-culture-icon`) until an explicit Lucide pass — do not swap those for photos.
- Lesson **slide art** stays 3D Pixar characters (lesson skill); Lucide is for **product UI**, not Remo/Ed/Sofie drawings.

---

## Student waiting room (teacher not in class yet)

When a **student** opens `live-classroom.html` and the teacher is not in the Socket.IO room yet, show the **waiting overlay** (`#lc-student-waiting`, `public/js/student-class-wait.js`). Do not dump them into an empty classroom.

- Play: tap falling stars (mini-game). Watch: looping calm animation.
- Dismiss when `GET /api/signaling/room-status` reports `teacherPresent` or socket `user-joined` with `userType: teacher`.
- Standalone page `public/student-waiting-room.html` keeps device check + the same Play/Watch host, then redirects to live classroom when the teacher arrives.
- Overlay is body-level (`--z-blocking`). Do not nest it in `.center-panel`.

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
