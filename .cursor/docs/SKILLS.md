# RemoEdPH Product Skills & Specs

Agent-facing product specs that feature work should extend. Lesson slide chrome remains in [`.cursor/skills/remoed-lesson-creation/SKILL.md`](../skills/remoed-lesson-creation/SKILL.md). Portal layout and auth surfaces: [`.cursor/docs/STABLE_BASELINE.md`](STABLE_BASELINE.md).

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

One monthly tree. Eco-Drops are separate from paid lesson **credits**. The student never spends drops; they only grow the current tree.

| Event | Eco-Drops |
|-------|-----------|
| Finished lesson (first time ever) | **+1** |
| Passed lesson check / task (first time ever) | **+1** |
| Finished Play & Learn game | **+1** per game per month (`GAME_REWARD_MODE = once-per-month`) |

There is no shop and no plot grid. Stage = `monthEcoDrops / monthlyTarget` (Seed 0%, Sprout 20%, Small Plant 40%, Medium Plant 60%, Large Tree 80%, Fully Grown 100%). Overflow clamps at Fully Grown.

`monthlyTarget` = bookings in the month (not cancelled / absent) + distinct lesson checks opened that month + registered games. If the student has no bookings yet, `DEFAULT_MONTHLY_TARGET` (12). Timezone `GARDEN_TIMEZONE` (`Asia/Manila`). Months the student never opened have no tree.

### Collections

- `eco_drop_ledger` — unique `(studentId, sourceType, sourceId, monthKey)`. `totalEcoDropsEarned` on Student is a cached lifetime count; `monthEcoDrops` is an indexed count.
- `garden_trees` — unique `(studentId, monthKey)`. Stage is computed; `finalStage` is stored only when the next month starts.

### Award (server only)

`ecoDropService.award({ studentId, sourceType, sourceId, now })`. Clients cannot add drops. Hooks: `upsertLessonProgressFromBooking`, `POST /api/lessons/progress/update`, `POST /api/student/lesson-checkpoint` (on pass), Play & Learn `POST /api/play-learn/games/:id/finish`, `POST /api/student/lessons/complete` (backfill only).

Add a game: one row in `server/garden/games.config.js` plus the same id in `public/js/student-play-learn.js`. The finish route already awards.

### APIs (student Bearer; identity is `req.student.username`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/garden/current` | Live tree, stage, progress, `hasHistory`, `locked` |
| GET | `/api/garden/history` | Past trees only |
| GET | `/api/garden/:monthKey` | One tree (read-only if past) |
| POST | `/api/garden/seen-stage` | `{ monthKey, stage }` — unlock animation shown |
| GET | `/api/student/eco-drops` | Header chip (`totalEcoDrops`) |
| POST | `/api/student/eco-drops/ack` | Clears the away-from-class celebration |
| POST | `/api/play-learn/games/:gameId/start` \| `/finish` | Signed play ticket, then award |

Placeholder art: `public/images/garden/stage-*.svg` (swap files, keep names). Watering character: student photo or `/images/remo-green.png`.
