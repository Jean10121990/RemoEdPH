# RemoEdPH Stable Baseline

Working beta surfaces that new features should **extend around**, not rewrite. Agents: also follow [`.cursor/rules/remoed-stable-surfaces.mdc`](../.cursor/rules/remoed-stable-surfaces.mdc).

Treat **repo `main` after a successful production deploy** as the source of truth. Re-run this checklist after every VPS restart / deploy.

## Critical file paths

| Area | Files |
|------|--------|
| Portal tokens | `public/js/user-session.js`, `public/js/remoed-auth-token.js`, `server/authMiddleware.js` |
| Student book UI | `public/student-book.html` |
| Book API | `server/student.js` (`POST /book-class`), `server/studentController.js`, `server/services/studentBookSlotService.js`, legacy `POST /api/teacher/book-class` in `server/teacher.js` |
| Teacher ID resolve | `server/services/teacherSlotResolve.js`, `teacherBookingKey` in `server/teacher.js` |
| Credits / expiry | `server/services/studentCreditSummary.js`, `server/services/creditExpiry.js` |
| Class schedule / issue | `public/teacher-class-table.html`, `POST /report-issue` + `GET /check-class-issues` in `server/teacher.js` |
| Applicant → teacher docs | `server/utils/applicantDocuments.js`, teacher signup in `server/auth.js` |
| Live classroom (AV / locks) | `public/live-classroom.html`, `public/css/live-classroom-redesign.css`, `public/js/virtual-background.js`, `public/images/virtual-bg/`, socket maps in `server/index.js` |
| Phone app chrome / scroll | `public/js/portal-layout.js`, `public/css/remoed-layers.css`, `public/css/mobile-first.css`, `public/css/portal-chrome-compact.css`, `public/mobile-utils.js` |
| Portal header chips | `public/css/portal-header-actions.css` (bell / calendar dropdowns) |
| Landing culture / about | `public/index.html` (`#who-we-are` … `#vision-mission`), `public/landing-brand.css` (`.remo-culture*`) |
| Gender (profiles) | `public/teacher-profile.html`, `public/student-profile.html`, `server/models/Teacher.js`, profile save in `server/teacher.js` / `server/student.js` |
| Admin Marketing hub | `public/admin-marketing-hub.html`, `public/admin-unique-link-commission.html`, `public/js/admin-sidebar.js`, `public/js/admin-hub-guard.js`, `public/js/admin-standalone-redirect.js` |
| Admin Marketing role (`admin_marketing`) | `server/models/Admin.js` (`ADMIN_ROLES`), `server/admin.js` create/update `allowedRoles`, `server/authMiddleware.js` `adminRoleGate`, `public/admin-users.html` role select, `public/js/admin-sidebar.js` `MARKETING_NAV_IDS`, hub-guard, `public/js/portal-layout.js` bottom-tab fallback |
| Admin first-time password setup | `public/admin-first-setup.html`, `POST /api/auth/admin-first-setup`, create-admin blank password → one-time `setupToken` (7 days) |
| Admin Accounting hub | `public/admin-accounting-hub.html` (Payroll + Student Subscriptions only) |
| Teaching Fee bonus / incentive | `public/teacher-service-fee.html`, `public/admin-payroll.html`, `Teacher.periodIncentives`, `PUT /api/admin/teacher-period-incentive`, `GET /api/teacher/period-incentive` |
| Mongo safety scripts | `scripts/archive-legacy-mongo-db.js`, `scripts/purge-beta-recordings.js` |
| Ensure marketing admin (ops) | `scripts/ensure-admin-marketing.js` (create/update `adminmktg@remoedph.com` → `admin_marketing` + fresh setup token) |

## Feature-add rule of thumb

1. Prefer new endpoints under `/api/student/...` or `/api/teacher/...` with thin wrappers.
2. Touch shared middleware (`authMiddleware`), book-slot service, or teacher-id resolve **only** when the feature cannot work otherwise.
3. If students need another teacher-mounted route, **extend** the `studentMayCallThisTeacherRoute` allowlist — do not remove portal gates.
4. Before push: `node --check server/student.js` (and any other edited server entry files). Never duplicate `require('./studentController')` in `server/student.js`.

## Smoke checklist (before and after a feature PR)

### Health / data

- [ ] `GET /api/health` returns OK and `databaseName: "test"`.
- [ ] Local/production `MONGODB_URI` still points at `/test` (not a blank path or `online-distance-learning`).
- [ ] Lesson library presentations still load (GridFS `presentations/` untouched).

### Student booking

- [ ] Signed-in student with `creditBalance > 0` can open **Book a Class**, see open slots, and complete `POST /api/student/book-class` (Network 2xx).
- [ ] Student with expired / zero credits gets a clear credit/subscription error code, not a 500 or `WRONG_PORTAL_TOKEN`.
- [ ] Booking for a teacher whose slot `teacherId` is a username (not email) still succeeds when the UI sends their email.

### Teacher schedule / issue

- [ ] Class Schedule loads without console `resolveTeacherPortalToken is not defined`.
- [ ] Teacher can open a booked class → **Report Issue** → submit with screenshot → success toast.
- [ ] After submit, schedule refresh does not clear the teacher session.

### Live classroom (teacher Settings + student locks)

- [ ] Teacher **Settings** gear (tab bar) opens the overlay — not a dropdown clipped under the lesson stage.
- [ ] Unchecking **Videos tab** hides Videos for the student and bounces them to Lesson; teacher Videos still works.
- [ ] Unchecking **Pen / annotate** stops student drawing on the lesson and the board; teacher pen still works. Leaving Board still sends students back to Lesson.
- [ ] **Student microphone** / **Student camera** switches match the rail pills: one side of each pair is highlighted (Allow = green, Mute/Cam off = amber). Student is muted / cam-off until Allow.
- [ ] **Your camera background** in Settings applies Off / Blur / Office / Classroom / Nature / Custom on the teacher camera (photos under `public/images/virtual-bg/*.jpg`). Hard-refresh after deploy so `?v=` cache-bust is not stale.

### Auth isolation

- [ ] Student token cannot call a random `/api/teacher/*` route outside the allowlist (`WRONG_PORTAL_TOKEN`).
- [ ] Teacher token cannot call `/api/student/*` profile/bookings as a student.

### Portal / classroom responsive

- [ ] Phone (375px): student/teacher/admin `.remoed-content` has **no** 260px left gutter; **no sidebar drawer**. App chrome is a titled top bar + 4 tabs + More sheet (`#remoed-more-sheet` on `document.body`).
- [ ] Phone Dashboard and Class Schedule **scroll and stay** (finger-drag down/up does not jump to the top or the bottom). `.remoed-main` is the scroller; `window.scrollY` stays `0`.
- [ ] Desktop (1440px): content is offset by `--sidebar-width` (260px); tablet 769–1024 keeps the icon rail. Time In, notification bell, and calendar stay in `.nav-header` (not inside the hidden `#remoed-mobile-shell`).
- [ ] Teacher Profile / Student Profile on phone is a **single column** (Quick Info stacked above the form). Desktop ≥1025 stays two-column.
- [ ] `#tour-button` / `#chatbot-toggle` sit above the 64px tab bar, not on top of it.
- [ ] Classroom Settings / VBG / class-info stay body-level and use `--z-modal` / `--z-toast` / `--z-blocking` from `public/css/remoed-layers.css`. Classroom phone dock stays Lesson / Camera / Chat (no portal tabs).

### Landing / culture

- [ ] Homepage after hero shows, in order: **Who we are?** → Foundational Principles → Core Cultural Pillars → H.E.A.R.T. Framework → Vision & Mission, then existing Why Learn / Teachers / Assessment / Plans.
- [ ] Pillars and HEART use **Font Awesome icon circles** (`.remo-culture-icon`), not cropped stock photos under `public/images/culture/`.
- [ ] Nav **About** and footer **About RemoEd** jump to `#who-we-are`.

### Profile gender

- [ ] Teacher and student Gender selects offer only **Male** and **Female** (plus empty “Select Gender”). No Other / Others / non-binary options.

### Admin hubs / Marketing role

- [ ] Sidebar order includes **Accounting Hub** then **Marketing Hub** (Marketing Hub directly below Accounting).
- [ ] **Marketing Hub** opens Unique Link Commissions (filters, ₱ totals, enrollee table). Accounting Hub tabs are only **Payroll Management** and **Student Subscriptions**.
- [ ] Opening `admin-unique-link-commission.html` standalone redirects to `admin-marketing-hub.html` (not Accounting `#commissions`). Old `#commissions` on Accounting Hub redirects to Marketing Hub.
- [ ] Accounting Hub → Payroll: **Bonus / Incentive** column can Save an amount for the selected cut-off; Teaching Fee shows the same amount under Period fee and includes it in Net Payable.
- [ ] Super-Admin → Admins role dropdown includes **Admin — Marketing** (`admin_marketing`). Creating with blank password shows a one-time setup token; first-time setup page is `admin-first-setup.html`.
- [ ] `admin_marketing` login sidebar shows only: Dashboard, Marketing Hub, Leaderboard, Announcements, Videos, Reports, Messages, Profile settings, Logout (no HR / QA / Accounting hubs; no Settings / System monitor).
- [ ] `admin_marketing` opening HR / QA / Accounting hub URLs redirects to Dashboard; Unique Link APIs work; payroll / user-mgmt / pipeline / issues / recordings APIs return 403.

### Deploy hygiene

- [ ] No second `const studentController = require(...)` in `server/student.js`.
- [ ] Hard-refresh portals after deploy (`Ctrl+F5`) so cached HTML/JS is not stale.
- [ ] After Admins UI / sidebar RBAC changes, bump HR Hub users iframe `embedVer=` and `admin-sidebar.js?v=` so Super-Admin sees the new role option without a stale iframe.

## Live classroom — do not “simplify”

These were easy to regress. Extend them; do not flatten to a checkbox in the tab bar or delete the in-memory room maps.

### Teacher Settings overlay

- Gear is `#lc-class-settings-btn`. Panel lives in **`#lc-class-settings-overlay`** (body-level, `z-index: var(--z-modal)`). Do not put the panel back inside `.tabs` / `.center-panel` — both clip or paint over it (`overflow: hidden`, `backdrop-filter`).
- Overlay holds: Videos tab, Pen / annotate, student mic, student camera, and **Your camera background** (`#lc-settings-vbg-panel`). Teacher BG tile may open this same overlay.
- Cache-bust `live-classroom-redesign.css` and `virtual-background.js` query strings when those files change.

### Socket `classroom-settings` (`videosAllowed`, `penAllowed`)

- Source of truth: `classroomSettingsByRoom` via `applyClassroomSettings` / `defaultClassroomSettings()` in `server/index.js`.
- Teacher emit may arrive **before** async `join` finishes. Queue on `pendingClassroomSettingsBySocket` and flush in `join` / `join-room`. Do not ignore early emits.
- Teacher `join` payload may include `videosAllowed: false` and/or `penAllowed: false` from `sessionStorage` (`remoed_lc_settings_*`). After join, re-emit **only** stored locks — never broadcast default `true` and unlock the room.
- Students pull state with `classroom-settings-request` after connect. Always send current settings to joiners.
- **Do not** `classroomSettingsByRoom.delete` when the last socket leaves. A teacher refresh must not unlock Videos/pen.
- Client: students hide `#lc-videos-tab-btn` + `#videos-panel` when locked (`body.lc-student-videos-locked`). Pen lock sets `window.__lcStudentPenAllowed` and gates PDF annotate + whiteboard (`body.lc-student-pen-locked`). Teacher can still draw. `whiteboard-mode-stop` still sends students to Lesson.

### Teacher → student mic / camera

- Socket `media-control` + `media-control-state`. Payload `audio`/`video` **true** = allowed, **false** = locked.
- Rail is four pills **outside** the peer video tile (`#lc-teacher-media-controls`). Do not put `video-control-btn` (30px circles) on these labels — that stacked “MuteAllowicam”.
- Exclusive pairs: sync `is-active` on **both** Allow and Mute/Cam off (`syncTeacherMediaUi`). Settings checkboxes `#lc-setting-student-mic` / `#lc-setting-student-cam` must stay in sync.

### Virtual backgrounds

- `public/js/virtual-background.js` is **canvas-first**. Presets are real JPEGs: `office.jpg`, `classroom.jpg`, `nature.jpg`. Keep SVG files only as unused leftovers; do not point presets back at `.svg` (canvas load / taint failed).
- Remap stored `*.svg` preset URLs to `.jpg` in `applyMode`. Do not let `applyTeacherCameraReadyLook()` overwrite an active VBG (`mode !== 'off'`).
- MediaPipe person cutout is optional; blur and photo presets must work without it.

## Responsive / overlay contract

Do not “fix” overlaps by inventing a higher raw `z-index`. Use [public/css/remoed-layers.css](../public/css/remoed-layers.css). Phone chrome and scroll are easy to regress — see **Phone app shell** below before changing overflow, `position: fixed`, or `portal-layout.js`.

- Breakpoints: phone `≤768`, tablet `769–1024`, desktop `≥1025`. Classroom column stack may stay at 1100px. **Do not add 560 / 720 / 992** for new portal rules.
- Sidebar offset: `--sidebar-width` (260) / `--sidebar-collapsed` (72). On phone, `.remoed-content` margin is 0 (token sheet). Phone has **no sidebar drawer** — overflow is the More sheet (`#remoed-more-sheet`, `--z-modal`). Tablet keeps the 76px icon rail; desktop keeps 260px. Do not restore `global-portal.css` `max-width: 992px` teacher drawer (`z-index: 9999`).
- Layers: `--z-base` 1, `--z-sticky` 100, `--z-drawer-backdrop` 200, `--z-drawer` 210, `--z-dropdown` 400, `--z-classroom-chrome` 6000, `--z-modal` 9000, `--z-toast` 9500, `--z-blocking` 100000.
- Dialogs (Settings, VBG, class-info, issue, toasts) are `position: fixed` on `document.body`. A parent with `overflow: hidden`, `transform`, `filter`, or `backdrop-filter` cannot host a popover.
- Phone tap targets ≥ 44px. Do not put `.video-control-btn` (30px circles) on labeled classroom actions.

## Phone app shell — do not “simplify”

Working phone layout after the snap/scroll regressions. Extend around it; do not flatten overflow back onto `html`/`body` or add scroll-reset JS.

### Chrome (`public/js/portal-layout.js`)

- Phone (`max-width: 768`): hide `nav.remoed-sidebar`. Chrome is a titled top bar (`#remoed-mobile-shell`) + 4 tabs (`#remoed-bottom-nav`) + More sheet (`#remoed-more-sheet` on `document.body`). Classroom keeps `#lc-mobile-dock` (Lesson / Camera / Chat) — skip `page-live-classroom`.
- **Adopt header actions only when `isMobile()`.** `adoptHeaderActions()` moves `.nav-right` into `#remoed-app-actions`. On ≥769 the shell is `display: none`, so adopting on desktop **hides Time In, the bell, and the calendar**. `releaseHeaderActions()` must run on the `matchMedia('(max-width: 768px)')` change to desktop/tablet.
- `remoedSetNavDropdownOpen` hoists `.nav-dropdown` onto `document.body` so a 40px chip cannot clip the panel. Keep `public/css/portal-header-actions.css`.
- Do not wrap `portal-layout.js` in a way that drops `onclick` handlers on host pages. Do not add a hamburger drawer or a second teacher drawer at 992 (`z-index: 9999`).
- Cache-bust **both** `js/portal-layout.js?v=` **and** the sidebar loader (`teacher-sidebar.js` / `student-sidebar.js` / `admin-sidebar.js` `?v=`) in the HTML that loads them. Bumping only the inner script leaves browsers on the old loader.

### One scroller (≤768)

Dual scrollers (window + `.remoed-main` + `.remoed-content`) yanked the page to the bottom or the top.

In `remoed-layers.css` `@media (max-width: 768px)` for student/teacher portals **except Messages**:

- `html` / `body`: `overflow: hidden`; `body { position: fixed; inset: 0 }`.
- **`.remoed-main` is the only scroller:** `position: absolute; top/right/bottom/left: 0; height: 100%; max-height: 100%; min-height: 0; box-sizing: border-box; overflow-y: auto`. Padding for the top bar and tab bar stays on `.remoed-main` (`mobile-first.css`). **Do not** set `.remoed-main { height: auto; max-height: none }` — that grows the column with content, the window becomes the scroller, and the page snaps.
- `.remoed-content` and week grids: `overflow: visible` (no inner `60vh` trap from `style.css` ≤900px). Messages pages keep their own panel scroller (`portal-chrome-compact.css`).
- Guide FAB `#tour-button` and Remo AI `#chatbot-toggle`: `bottom` above the 64px tab bar (`remoed-layers.css`). Do not let them cover the tabs.

### Do not add scroll-reset JS

These “fixes” **are** the snap bugs:

- `window.scrollTo(0, 0)` on `scroll` (pinned the window; finger moved a few pixels then jumped to the top).
- Restoring `.remoed-main.scrollTop` to a saved `lastY` / jump-to-end guard.
- `PullToRefresh` on `.remoed-content` (`public/mobile-utils.js`). That node has `overflow: visible` so `scrollTop` is always `0`; every downward swipe `preventDefault`s, translates the panel, then snaps it back. Leave PTR off Dashboard / Class Schedule. If it returns, bind it to `.remoed-main` and only when that scroller is at the top.
- `SwipeHandler` `preventDefault` on every `touchmove` (blocks vertical pan on booking cells / cards). Only prevent default for a **clear horizontal** swipe.

`appendPreservingScroll` may restore **both** `window` and `.remoed-main.scrollTop` after DOM inserts. That is not a snap guard.

### Profile / Messages (phone)

- Teacher Profile two-column in `style.css` never collapses: `.page-teacher-profile @media` is invalid (comment between selector and `@media`). Phone stacking lives in late `portal-chrome-compact.css` / `mobile-first.css` on `.profile-content-grid`. Do not “fix” only the broken `style.css` block and assume it applies.
- Messages: list **or** thread on phone, not both. Composer must not be `position: sticky` inside a clipped parent.

### `style.css`

Huge generated sheet. Override later with `remoed-layers.css` / `portal-chrome-compact.css` / `mobile-first.css`. Do not rewrite `style.css` to “simplify” portal layout.

## Landing culture / about — do not “simplify”

Product copy and layout on `public/index.html` after the hero. Style in `public/landing-brand.css` (`.remo-culture*`). Match logo tints (blue / green / yellow), Fredoka/Quicksand, and existing benefit-card patterns.

### Section order (after hero)

1. **Who we are?** (`#who-we-are`) — Filipino ESL start-up, God-centered online education for kids across Asia.
2. **Foundational Principles of RemoEd Culture** (`#foundational-principles`) — Christian worldview, honoring each person, biblical distinction of gender in all conduct.
3. **Core Cultural Pillars** (`#core-cultural-pillars`) — Joyful Learning; Respect & Care; Integrity & Accountability.
4. **H.E.A.R.T. Framework** (`#heart-framework`) — Hospitality, Excellence, Affection, Respect, Togetherness.
5. **Our Vision / Our Mission** (`#vision-mission`, `#our-vision`, `#our-mission`).
6. Then existing `#benefits`, `#our-teachers`, `#assessment`, `#plans`.

### Icons, not cropped comps

Pillars and HEART use brand icon circles (same family as Foundational Principles / Why Learn cards). **Do not** reintroduce cropped mockup PNGs or a `public/images/culture/` photo set — those looked soft and blurry on the live page. Do not paste the full design-comp images as section backgrounds (duplicates titles and breaks a11y).

### Nav / footer

Keep **About** → `#who-we-are` in the landing navbar and **About RemoEd** in the footer Learn column. Cache-bust `landing-brand.css?v=` when culture CSS changes.

## Gender — Male / Female only

RemoEd upholds the biblical distinction of gender (male and female). Profile UIs and saves must stay aligned until product explicitly changes this.

- Selects: `public/teacher-profile.html` (`Male` / `Female`) and `public/student-profile.html` (`male` / `female`). **Do not** add Other, Others, Prefer not to say, or non-binary options.
- Teacher model: `server/models/Teacher.js` enum is `['Male', 'Female', '']` only — no `'Other'`.
- Saves normalize unknowns to empty: teacher profile update in `server/teacher.js`; student `POST /profile` in `server/student.js`. Client load maps only male/female into the select; legacy Other shows as blank until the user picks Male or Female.
- Issue-type **Other** on Class Schedule / QA hub is unrelated — leave those alone.

## Admin Marketing Hub — Unique Link Commissions

Unique Link Commissions are **not** an Accounting Hub tab. They live under sidebar **Marketing Hub**, placed **directly below Accounting Hub**.

- Hub page: `public/admin-marketing-hub.html` embeds `admin-unique-link-commission.html?adminEmbed=1`.
- Sidebar: `public/js/admin-sidebar.js` item `marketing` (label **Marketing Hub**) after `accounting-hub`. Path highlight maps `admin-marketing-hub` and `admin-unique-link-commission` → `marketing`.
- Visibility: `super_admin`, `admin_accounting`, and **`admin_marketing`**. HR/QA (and marketing on non-marketing hubs) redirected by `admin-hub-guard.js` (`data-hub="marketing"|"hr"|"qa"|"accounting"`).
- Standalone redirect: `admin-standalone-redirect.js` sends `admin-unique-link-commission.html` → `admin-marketing-hub.html`.
- Accounting Hub keeps **Payroll** + **Student Subscriptions** only. `#commissions` on Accounting Hub must redirect to Marketing Hub — do not restore the commissions tab inside Accounting.
- Teacher copy: `teacher-referrals.html` points admins to **Marketing Hub → Unique Link Commissions**.

### Role `admin_marketing` (do not widen casually)

Specialty admin for Unique Link / Marketing Hub work. Keep sidebar whitelist, hub-guard, and `adminRoleGate` in sync when extending.

**Assign / create**

- Enum: `server/models/Admin.js` `ADMIN_ROLES` includes `admin_marketing`.
- Super-Admin create/update: `server/admin.js` `allowedRoles` arrays must include `admin_marketing`.
- UI: `public/admin-users.html` select option **Admin — Marketing** (`value="admin_marketing"`). Role labels also in `admin-legal-accept.js`, profile/settings/view-user/hr-documents maps, leaderboard `ADMIN_ROLE_CLAIMS`.
- Example account: `adminmktg@remoedph.com`. Ops helper: `scripts/ensure-admin-marketing.js` (sets role + fresh setup token).
- HR Hub embeds Admins via `admin-users.html?adminEmbed=1&embedVer=…` — bump `embedVer` when the role dropdown changes so Super-Admin does not see a cached iframe without Marketing.

**Sidebar whitelist** (`MARKETING_NAV_IDS` in `admin-sidebar.js`)

- Shown: Dashboard, Marketing Hub, Leaderboard, Announcements, Videos, Reports, Messages, Profile settings, Logout.
- Hidden: HR Hub, QA Hub, Accounting Hub, Settings, System monitor (same Super-Admin-only rule as other specialty roles).
- Phone bottom tabs: `portal-layout.js` `pickTabLis` falls back to **Profile settings** when Settings is hidden for this role.

**API gate** (`adminRoleGate` in `authMiddleware.js`)

- Marketing may use Unique Link / referral commission APIs (not blocked like HR).
- Marketing is blocked from: payroll/dispense/salaries, issues, teacher pipeline, teachers/students/admins lists, user CRUD (`/^\/user/`), classroom recordings, global-rate maintenance, system settings/cleanup (shared Super-Admin block).

**Login / JWT**

- Login returns `adminRole`; client stores `localStorage.adminRole`. After role change, the user must **sign out and sign in again** so sidebar/JWT match.

### Admin first-time password setup (blank password on create)

When Super-Admin creates an admin with **password left blank**, the API returns a one-time **`setupToken`** (valid 7 days, shown once in the create alert). The new admin opens **Admin login → First-time password setup** (`admin-first-setup.html`), enters username + token + new password (`POST /api/auth/admin-first-setup`), then signs in normally. If a password is set in the create/edit form, there is no setup token. Lost tokens: set a password via Edit, or re-issue via ops script / a new create flow — the hash is not recoverable from the DB.

## Teaching Fee — Bonus / Incentive (Accounting)

Below **Period fee (rate × completed classes)** on Teaching Fee (`teacher-service-fee.html`). Not automatic monthly pay.

- **Who enters it:** Accounting (and Super-Admin) on **Accounting Hub → Payroll Management** for the selected bi-monthly cut-off (`periodKey` `YYYY-MM-1` or `YYYY-MM-2`). Teachers see the amount read-only.
- **What it is:** Founder's discretion — e.g. successful student plan purchase referral bonus, internet aid, or other one-off incentives. Amount can be ₱0.
- **Storage:** `Teacher.periodIncentives[]` `{ periodKey, amount, note, updatedAt, updatedBy }`.
- **APIs:** `PUT /api/admin/teacher-period-incentive`; teacher `GET /api/teacher/period-incentive?startDate=YYYY-MM-DD`.
- **Net payable:** period fee + bonus/incentive + issue payments − deductions. Included in salary dispense `breakdown.bonusIncentive` and payslip line when &gt; 0.
- Do not turn this into a fixed monthly entitlement or auto-compute from referrals without an explicit product change.

## Known product gates (not bugs)

| Code | Meaning |
|------|---------|
| `SUBSCRIPTION_REQUIRED_LESSON_2` | Not subscribed / no credits / no trial |
| `CREDITS_EXPIRED` | Unused credits expired after validity window |
| `INSUFFICIENT_CREDITS` | `creditBalance` is 0 |
| `TRIAL_LESSON_1_ONLY` | Free trial may only book Lesson 1 |
| `WRONG_PORTAL_TOKEN` | Wrong role token for this API path |

## Ops notes (out of code scope)

- Atlas M0 storage % may stay high after deletes; Flex upgrade / MongoDB for Startups credits are billing ops.
- Launch wipe of beta users is a separate explicit task — do not drop `test` casually.

## Baseline updates — 2026-09-15

Surfaces locked in on this date (extend around; do not rewrite). Details above.

| Area | What shipped |
|------|----------------|
| Phone app shell / scroll | `.remoed-main` sole scroller ≤768; no `window.scrollTo` / lastY snap / PTR on `.remoed-content`; adopt `.nav-right` only on phone; desktop Time In / bell / calendar stay in `.nav-header`. |
| Landing culture | After hero: Who we are → Principles → Pillars → HEART → Vision/Mission; icon circles not culture photos; About → `#who-we-are`. |
| Gender | Profile selects Male / Female only; Teacher enum rejects Other. |
| Marketing Hub | Unique Link Commissions under sidebar **Marketing Hub** (below Accounting); Accounting Hub = Payroll + Subscriptions only. |
| `admin_marketing` | Restricted sidebar + hub-guard + `adminRoleGate`; role in Admins dropdown; first-time setup token for blank-password creates. |
| Teaching Fee Bonus / Incentive | Period-scoped amount on Payroll; read-only on Teaching Fee; in net pay / dispense / payslip. |
