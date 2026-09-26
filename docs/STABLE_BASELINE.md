# RemoEdPH Stable Baseline

Working beta surfaces that new features should **extend around**, not rewrite. Agents: also follow [`.cursor/rules/remoed-stable-surfaces.mdc`](../.cursor/rules/remoed-stable-surfaces.mdc).

Treat **repo `main` after a successful production deploy** as the source of truth. Re-run this checklist after every VPS restart / deploy.

## Critical file paths

| Area | Files |
|------|--------|
| Portal tokens | `public/js/user-session.js`, `public/js/remoed-auth-token.js`, `server/authMiddleware.js` |
| Forgot / set password | `POST /api/auth/forgot-password` (link, not a temp password), `POST /api/auth/reset-password`, `public/forgot-password.html`, `public/reset-password.html`, `public/change-password.html`, `POST /api/auth/change-password` |
| UI icons (Lucide) | [lucide.dev/icons](https://lucide.dev/icons/), [`SKILLS.md`](../SKILLS.md) § UI icons; `public/js/lucide-icons.js`; password eye: `public/js/password-toggle.js` |
| Student book UI | `public/student-book.html` |
| Book API | `server/student.js` (`POST /book-class`), `server/studentController.js`, `server/services/studentBookSlotService.js`, legacy `POST /api/teacher/book-class` in `server/teacher.js` |
| Teacher ID resolve | `server/services/teacherSlotResolve.js`, `teacherBookingKey` in `server/teacher.js` |
| Credits / expiry | `server/services/studentCreditSummary.js`, `server/services/creditExpiry.js` |
| Class schedule / issue | `public/teacher-class-table.html`, `POST /report-issue` + `GET /check-class-issues` in `server/teacher.js` |
| Applicant → teacher docs | `server/utils/applicantDocuments.js`, teacher signup in `server/auth.js` |
| Live classroom (AV / locks) | `public/live-classroom.html`, `public/css/live-classroom-redesign.css`, `public/js/virtual-background.js`, `public/images/virtual-bg/`, socket maps in `server/index.js` |
| Student waiting room | Overlay `#lc-student-waiting` + `public/js/student-class-wait.js`; page `public/student-waiting-room.html`; `GET /api/signaling/room-status` |
| Phone app chrome / scroll | `public/js/portal-layout.js`, `public/css/remoed-layers.css`, `public/css/mobile-first.css`, `public/css/portal-chrome-compact.css`, `public/mobile-utils.js` |
| Portal header chips | `public/css/portal-header-actions.css` (bell / calendar dropdowns) |
| Landing culture / about | `public/index.html` (`#who-we-are` … `#vision-mission`), `public/landing-brand.css` (`.remo-culture*`) |
| Gender (profiles) | `public/teacher-profile.html`, `public/student-profile.html`, `server/models/Teacher.js`, profile save in `server/teacher.js` / `server/student.js` |
| Admin Marketing hub | `public/admin-marketing-hub.html`, `public/admin-unique-link-commission.html`, `public/js/admin-sidebar.js`, `public/js/admin-hub-guard.js`, `public/js/admin-standalone-redirect.js` |
| Admin Marketing role (`admin_marketing`) | Seeded in `server/services/adminRbac.js`; assign via Settings → Admin Roles / HR Users; ops helper `scripts/ensure-admin-marketing.js` |
| Admin login / first-setup | `server/utils/adminRouteConfig.js`, `ADMIN_LOGIN_PATH` in `.env`, `public/admin-login.html` (served only at obfuscated path), `public/admin-first-setup.html`, `public/js/admin-session.js`, `GET /api/auth/admin-login-path` + `POST /api/auth/admin-first-setup` in `server/auth.js` |
| Admin HR staff documents | `public/admin-hr-documents.html`, `GET/PATCH /api/admin/hr-documents*` in `server/admin.js`; teacher NBI: `Teacher.nbiClearanceStatus` + `documents.nbiClearances` |
| Student family / emergency (admin view) | `public/student-profile.html`, `public/admin-view-user-profile.html`, `Student.parentEmail` / `emergencyContactPerson` / `emergencyContactNumber` |
| Student My Level / CEFR guides | `public/student-assessment.html`, `public/images/cefr/remoed-kids-cefr-guide.jpg`, `public/images/cefr/remoed-teens-cefr-guide.jpg` |
| Admin Accounting hub | `public/admin-accounting-hub.html` (Payroll + **Admin Payroll** + Student Subscriptions); Admin Payroll UI: `public/admin-admin-payroll.html` |
| Admin Fee & Attendance | `public/admin-fee.html` (no Time In/Out), `server/adminFeeRoutes.js`, `AdminAttendance` / `AdminPayout`; clock via Dashboard / header `public/js/admin-time-tracking.js` + `/api/admin/time-tracking/*` in `server/admin.js` |
| Admin Roles (dynamic RBAC) | `public/admin-settings.html` (Admin Roles and Access), `server/services/adminRbac.js`, `server/adminRbacRoutes.js` (RBAC paths only — skip enrollment), `AdminRole` / `AdminPermission`, `public/js/admin-access-guard.js`, `public/admin-403.html` |
| Admin Messages | `public/admin-messages.html`, `GET/POST /api/admin/messages/*` — teachers, students, **and admins**; desktop viewport-fit messenger |
| System monitor (Super-Admin) | `public/super-monitor.html`, `GET /api/admin/system-stats` — live unique students / teachers / admins via Socket.IO `userType` + `presenceKey` |
| Virtual Garden / Eco-Drops | [`SKILLS.md`](../SKILLS.md), `public/student-virtual-garden.html`, `public/css/student-virtual-garden.css`, `server/services/ecoDropGardenService.js`, `GET/POST /api/student/garden*`; grant on first `LessonProgress` → completed |
| Lesson slide generation (L2M1+) | [`docs/lesson-references/`](lesson-references/) ([`README.md`](lesson-references/README.md)), [`.cursor/skills/remoed-lesson-creation/SKILL.md`](../.cursor/skills/remoed-lesson-creation/SKILL.md), `docs/lesson-references/build_l2m1_lessons_*.py` / `build_l3m1_lessons_*.py` → repo `docs/lesson-references/lessons/` **and** laptop `Level {1–4}` folders |
| Teaching Fee bonus / incentive | `public/teacher-service-fee.html`, `public/admin-payroll.html`, `Teacher.periodIncentives`, `PUT /api/admin/teacher-period-incentive`, `GET /api/teacher/period-incentive` |
| MariBank payroll withdraw | `public/js/payroll-withdraw-modal.js`, `server/services/payrollWithdrawService.js`; withdraw APIs; **Mark Completed** in Accounting Hub Payment History (`POST /api/admin/payroll/complete`, `POST /api/admin/admin-fee/complete`) — email to support is ops-only |
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
- [ ] Student joining before the teacher sees the **waiting overlay** (Play stars / Watch loop). When the teacher joins, the overlay closes. Camera/mic/speaker use Lucide **video** / **mic** / **volume** icons, not C/M/A letters. Teacher student-lock chips are icons only (`mic-off` / `mic` / `video-off` / `video`). Flagged chat shows asterisks to students; teachers can reveal possible flagged words.

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
- [ ] Pillars and HEART use **icon circles** (`.remo-culture-icon`), not cropped stock photos under `public/images/culture/`. New portal chrome uses **[Lucide](https://lucide.dev/icons/)** (see [`SKILLS.md`](../SKILLS.md)); do not put emoji on password fields.
- [ ] Password fields show a Lucide **eye** / **eye-off** toggle **inside** the field (`password-toggle.js`), not emoji or a “Show” chip. Set-password card is ~560px on desktop. New passwords need 8+ mixed case, a number, **and a symbol**.
- [ ] Nav **About** and footer **About RemoEd** jump to `#who-we-are`.

### Profile gender

- [ ] Teacher and student Gender selects offer only **Male** and **Female** (plus empty “Select Gender”). No Other / Others / non-binary options.

### Admin hubs / Marketing role

- [ ] Sidebar order includes **Accounting Hub** → **Admin Fee** → **Marketing Hub**.
- [ ] Super-Admin **Settings → Admin Roles and Access** is visible and can Save Permissions for a non–Super-Admin role. Non–Super-Admin accounts do **not** see that card (or System Settings / System Monitor in the sidebar).
- [ ] **System monitor → Live platform** shows Students / Teachers / Admins online (unique `presenceKey` counts; refreshes with other stats).
- [ ] Student **Virtual Garden** loads at **100% zoom** without horizontal clip (sidebar expanded or collapsed); Eco-Drop badge in sidebar/header; stats load (not “Student not found”); shop Buy Seeds (5) / Water (5) / Flowers & Trees (22) works; completing a lesson awards +1 once.
- [ ] **Accounting Hub** tabs: Payroll Management, **Admin Payroll**, Student Subscriptions. Admin Payroll matches teacher payroll UX (soft rounded `.btn`, period nav, Load + Dispense release, Payment History + **Mark Completed** after MariBank withdraw).
- [ ] After Accounting **Dispense**, Teaching Fee / Admin Fee show **Withdraw (MariBank)** (Open MariBank link works). Submit → Processing + email to `support@remoedph.com` (ops only — **email does not complete**). Accounting Hub → Payroll Management / Admin Payroll → **Payment History** → **Mark Completed** on Processing rows → Completed. Legacy Success/paid rows have no Withdraw.
- [ ] Admin header **notification bell** opens the dropdown **directly under the bell** (not at the bottom of the viewport); badge count loads; Mark all read works.
- [ ] **Marketing Hub** opens Unique Link Commissions (filters, ₱ totals, enrollee table).
- [ ] Opening `admin-unique-link-commission.html` standalone redirects to `admin-marketing-hub.html` (not Accounting `#commissions`). Old `#commissions` on Accounting Hub redirects to Marketing Hub.
- [ ] Accounting Hub → Payroll: **Bonus / Incentive** column can Save an amount for the selected cut-off; Teaching Fee shows the same amount under Period fee and includes it in **Available to Withdraw**.
- [ ] Super-Admin → Admins / Roles can assign **Admin — Marketing** (`admin_marketing`). Creating with blank password shows a one-time setup token; first-time setup page is `admin-first-setup.html`.
- [ ] `admin_marketing` sidebar matches its RBAC seed (Dashboard, Marketing Hub, shared ops — not HR/QA/Accounting hubs; no Settings / System monitor unless Super-Admin). Forbidden hub URLs redirect; Unique Link APIs work; payroll / user-mgmt style APIs stay gated.
- [ ] **Admin Fee** has **no** Time In/Out buttons (status/eligibility/attendance/payslip only). Clock from **header** or **Dashboard** card; both Dashboard header mini and middle card Time In/Out/View Logs work; login does **not** auto clock-in. Time Out shows a confirm. Super-Admin **View Logs** lists any admin and can **Reopen shift** (clear accidental Time Out) or **Edit times** (HH:MM PHT); other roles only see their own history.
- [ ] **Messages:** search finds other admins (e.g. `adminmktg@…`); can open thread and send. Desktop: conversation + composer visible without scrolling the page.

### Admin login / first-time password

- [ ] Root `/admin-login` and `/admin-login.html` return **404 Not found** (intentional). Login works only at `/${ADMIN_LOGIN_PATH}` (or the default segment from `adminRouteConfig.js`).
- [ ] After **First-time password setup** succeeds, the browser redirects to that obfuscated login path — **not** to `/admin-login.html`.
- [ ] “Admin login” on `admin-first-setup.html` and idle/logout via `RemoedAdminSession.redirectToAdminLogin()` also land on the obfuscated path (`GET /api/auth/admin-login-path` when `remoedAdminEntryPath` is missing).
- [ ] First-time **2FA QR enroll** (`require2FASetup`): scan + 6-digit code succeeds via `POST /api/admin/verify-2fa` (must **not** return **403** from RBAC). Delete any old RemoEdPH Admin authenticator entry before scanning a new QR.

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
- `remoedSetNavDropdownOpen` hoists `.nav-dropdown` onto `document.body` so a 40px chip cannot clip the panel. After hoist, **`remoedPositionNavDropdown` / `positionNavDropdown` must set `position: fixed` from the trigger’s `getBoundingClientRect`** (under the bell/calendar). Do **not** rely on `top: 100%` while the panel is on `body` — that anchors to the bottom of the page. Keep `public/css/portal-header-actions.css` (`body > .nav-dropdown` is fixed; in-icon panels stay absolute). Mirror the same open/position helpers in `public/js/remoed-notifications.js` when portal-layout is absent.
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

**Product UI icons** (password, header chips, new controls): use **[Lucide](https://lucide.dev/icons/)** — spec in [`SKILLS.md`](../SKILLS.md) § UI icons. Inline SVG, `currentColor`, 24×24 viewBox. Password visibility is Lucide **eye** / **eye-off** via `public/js/password-toggle.js`. Do not use emoji for those controls. Existing landing Font Awesome circles may stay until a dedicated Lucide restyle; new icons should not introduce a third set.

## Password fields / change password

- Shared toggle: `public/js/password-toggle.js` + `public/css/password-toggle.css` on login, register, reset, change-password, profiles, admin login/setup/users.
- Strength meter (reset + change-password): `public/js/password-strength.js` — 8+ characters, upper, lower, number, **and a symbol**. Server: `RESET_PASSWORD_REGEX` in `server/auth.js`.
- Set-password layout: desktop card `max-width: 560px`; Lucide eye sits in the same box as the input (override `.reset-form button` so it cannot become a full-width “Show” pill).
- Change password: Bearer from `remoed_teacher_token` / `remoed_student_token` (and session), user type from JWT. Admin compare/save `passwordHash`. Clear `hasGeneratedPassword` on success. Unified login with a generated password redirects to `change-password.html`.

### Nav / footer

Keep **About** → `#who-we-are` in the landing navbar and **About RemoEd** in the footer Learn column. Cache-bust `landing-brand.css?v=` when culture CSS changes.

## Gender — Male / Female only

RemoEd upholds the biblical distinction of gender (male and female). Profile UIs and saves must stay aligned until product explicitly changes this.

- Selects: `public/teacher-profile.html` (`Male` / `Female`) and `public/student-profile.html` (`male` / `female`). **Do not** add Other, Others, Prefer not to say, or non-binary options.
- Teacher model: `server/models/Teacher.js` enum is `['Male', 'Female', '']` only — no `'Other'`.
- Saves normalize unknowns to empty: teacher profile update in `server/teacher.js`; student `POST /profile` in `server/student.js`. Client load maps only male/female into the select; legacy Other shows as blank until the user picks Male or Female.
- Issue-type **Other** on Class Schedule / QA hub is unrelated — leave those alone.

## Admin Marketing Hub — Unique Link Commissions

Unique Link Commissions are **not** an Accounting Hub tab. They live under sidebar **Marketing Hub**, placed **below Admin Fee** (Admin Fee sits directly under Accounting Hub).

- Hub page: `public/admin-marketing-hub.html` embeds `admin-unique-link-commission.html?adminEmbed=1`.
- Sidebar: `public/js/admin-sidebar.js` order is Accounting Hub → **Admin Fee** → Marketing Hub. Path highlight maps `admin-marketing-hub` and `admin-unique-link-commission` → `marketing`; `admin-fee.html` → `admin-fee`.
- Default seed for **`admin_marketing`** (editable in Settings → Admin Roles and Access): Dashboard, Marketing Hub, Admin Fee, Leaderboard, Announcements, Videos, Reports, Messages, Profile settings. Settings / System monitor remain Super-Admin (`nav:settings` / `nav:super_monitor`). Example account: `adminmktg@remoedph.com` (ops: `scripts/ensure-admin-marketing.js`).
- Visibility is driven by **dynamic RBAC** (`GET /api/admin/me/permissions`); legacy hub-guard still falls back to role slug checks if permissions fail to load.
- Standalone redirect: `admin-standalone-redirect.js` sends `admin-unique-link-commission.html` → `admin-marketing-hub.html`.
- Accounting Hub tabs: **Payroll Management**, **Admin Payroll** (parity with teacher payroll UX + soft buttons), **Student Subscriptions**. `#commissions` on Accounting Hub must redirect to Marketing Hub — do not restore the commissions tab inside Accounting.
- Teacher copy: `teacher-referrals.html` points admins to **Marketing Hub → Unique Link Commissions**.

## Virtual Garden & Eco-Drops

Product spec: [`SKILLS.md`](../SKILLS.md) § Gamification. Lesson **credits** stay separate from Eco-Drops.

- Page: [`public/student-virtual-garden.html`](../public/student-virtual-garden.html) + [`public/css/student-virtual-garden.css`](../public/css/student-virtual-garden.css) (`?v=garden-3+`). Sidebar id `garden` in `student-sidebar.js`; header Eco-Drop chip in `student-page-header.js`.
- APIs (`server/student.js`, student Bearer): `GET /api/student/eco-drops`, `GET /api/student/garden`, `POST /api/student/garden/action`, `POST /api/student/lessons/complete` (backfill only).
- Identity: routes must use **`gardenStudentKey(req)`** → `req.student.username` (from `requireStudent`). Do **not** pass JWT `studentId` (Mongo `_id`) alone into garden lookup — that caused **404 Student not found**. `findStudentDoc` also accepts `_id` / email / username / `studentCode`.
- Award hook: first `LessonProgress` → `completed` in `upsertLessonProgressFromBooking` (+ direct `POST /api/lessons/progress/update`). Idempotent via `EcoDropLedger`.
- **Layout (100% zoom):** keep portal `remoed-content` max-width `calc(100vw - sidebar)`. Never set `max-width: none` on garden content (overflows past the rail). Use `minmax(0, 1fr)`, `overflow-x: hidden`, and stack shop under the plot ≤1100px.

## Admin Fee & Attendance

- Page: `public/admin-fee.html` — bi-monthly 1% of subscription `creditHistory` purchases, eligibility, attendance history, printable payslip. **No Time In/Out UI on Admin Fee** (clock only from top header or Admin Dashboard via `/api/admin/time-tracking/*`). Login must **never** auto clock-in.
- Admin dashboard Time In (header mini **and** middle card): `public/js/admin-time-tracking.js` (`?v=tt-4+`; also loaded from `admin-page-header.js`). Singleton + document capture + inline `onclick` on card buttons. Status poll is read-only — it does not POST clock-in.
- **One punch per business day** (7 AM PHT cutoff): after Time Out, status is **Daily Time Log Completed** until the next business day. **Time Out must confirm** before POST (accidental outs lock the day).
- **Super-Admin time-log correction** (Dashboard → **View Logs** only; gated by `requireSuperAdminDb`):
  - `GET /api/admin/time-tracking/manage?username=&startDate=&endDate=` — all `logOwnerType: 'admin'` logs (filter by admin).
  - `PATCH /api/admin/time-tracking/logs/:id` — `{ action: 'reopen' }` clears `clockOut` / sets `clocked-in` so the admin can continue; `{ action: 'edit', clockIn, clockOut }` sets HH:MM Philippine time (`clockOut: null` = leave open). Always re-sync `AdminAttendance` via `syncAdminAttendanceFromTimeLog`.
  - UI: admin filter + **Reopen shift** / **Edit times**. Non–Super-Admin still use `GET /api/admin/time-tracking/history` (own logs only) with no edit actions.
  - Do **not** remove Super-Admin-only guards or expose PATCH to other roles.
- Models: `TimeLog` (`teacherId` = `admin:<username>`, `logOwnerType: 'admin'`), `AdminAttendance` (`admin_attendance`), `AdminPayout` (`admin_payouts`); punches sync from TimeLog.
- APIs (Admin Fee): `/api/admin/admin-fee/summary`, `/attendance`, `/payslip`, `/record-payout`, **`/payroll`**, **`/dispense`**, **`/payment-history`**, **`/admins-filter-list`** in `server/adminFeeRoutes.js`.
- Eligibility: at least one completed **8-hour** shift in the cutoff; each eligible admin receives **1%** of that period’s gross subscription sales. Ineligible rows stay listed at ₱0; dispense skips them server-side.
- **Payroll withdraw (MariBank only):**
  1. Accounting **Dispense** → `DISBURSED` / `disbursed` (release — not bank-final).
  2. Teacher Teaching Fee / Admin Fee → **Withdraw (MariBank)** → `WITHDRAWAL_REQUESTED` / `withdrawal_requested` + masked `payoutReference` only. Full account details email to `support@remoedph.com` via `sendRawEmail` — **ops notice only; do not treat email as the completion step**.
  3. Accounting **Mark Completed** in portal UI only: **Accounting Hub → Payroll Management** (teachers) or **Admin Payroll** (admins) → **Payment History Management** → Load Records → **Mark Completed** on Processing / withdrawal-requested rows → `COMPLETED` / `completed` (`POST /api/admin/payroll/complete`, `POST /api/admin/admin-fee/complete`).
  - Legacy `Success` / `paid` = Completed (no Withdraw). Open MariBank: `https://maribank.ph/c/earnfreemoney?referralCode=KB740303`. Shared UI: `public/js/payroll-withdraw-modal.js`. Withdraw APIs: `POST /api/teacher/payroll/withdraw`, `POST /api/admin/admin-fee/withdraw`. Service: `server/services/payrollWithdrawService.js`.
- **Accounting Hub → Admin Payroll** (`public/admin-admin-payroll.html`, hash `#admin-payroll`, iframe `embedVer` bump on UI changes): mirror teacher **Payroll Management** (`public/admin-payroll.html` / `page-admin-payroll`):
  - Soft rounded buttons (`.btn` `border-radius: 6px`, primary/success/danger colors) — do not leave square/edgy browser defaults.
  - Period nav (`Sep 16 - Sep 30`), **Load Admins** + red **Dispense All Admin Fees** (same enable rule as teachers: stay enabled until at least one row is **Paid**/released; gray **Fees Dispensed** after. Do **not** replace with “No Pending Fees” when everyone is Ineligible).
  - `payroll-table` list + **Payment History Management** (filter / Load Records / Export CSV / **Mark Completed** on withdrawal-requested rows — **not** via email).
  - Dispense marks eligible `AdminPayout` `disbursed` and notifies each admin. Same bi-monthly `periodKey` as teacher payroll.
- Header notification bell: `public/js/admin-notifications.js` (delegated click; opens via `remoedSetNavDropdownOpen`). Panel is body-mounted and **fixed under `#admin-notifications-icon`** — do not re-append the dropdown into the 40px chip or inject `position:absolute; top:calc(100% + 8px)` for the open state. Wire via `admin-page-header.js`.

## Admin Roles and Access (dynamic RBAC)

Super-Admin configures page/feature permissions per role instead of hardcoded deny-lists only.

| Piece | Location |
|-------|----------|
| Settings UI | [public/admin-settings.html](public/admin-settings.html) card **Admin Roles and Access** (Super-Admin only) |
| Models | `AdminRole` collection `roles`, `AdminPermission` collection `permissions` |
| Service / seeds | [server/services/adminRbac.js](server/services/adminRbac.js) — catalog + five system role seeds matching legacy access |
| APIs | [server/adminRbacRoutes.js](server/adminRbacRoutes.js): `GET /me/permissions`, `GET /roles`, `POST /roles`, `PUT /roles/:id/permissions`, `GET /permissions/catalog`, `GET /roles/options` — **must not** apply blanket `verifyAdminApiAuth` to all `/api/admin/*` (use `next('router')` for non-RBAC paths). Otherwise first-time `POST /verify-2fa` with an enrollment JWT returns **403** and QR setup fails. |
| Sidebar | [public/js/admin-sidebar.js](public/js/admin-sidebar.js) filters by `nav` from `/me/permissions` (sessionStorage cache); legacy role branches if fetch fails |
| Page guard | [public/js/admin-access-guard.js](public/js/admin-access-guard.js) → [public/admin-403.html](public/admin-403.html); [public/js/admin-hub-guard.js](public/js/admin-hub-guard.js) delegates here |
| API gate | [server/authMiddleware.js](server/authMiddleware.js) `adminRoleGate` + `requirePermission(key)`; Super-Admin always bypasses |
| Assign role | HR User Management loads options from `GET /roles/options`; `Admin.adminRole` is a free slug validated against `AdminRole` |

**Rules:**

- Do **not** remove Super-Admin full bypass. Super-Admin matrix is read-only full access.
- **Admin Roles and Access** (`#rbac-roles-card` on `admin-settings.html`) is **Super-Admin only** — hide the card for everyone else; sidebar **Settings** / **System monitor** ignore RBAC grants (`nav:settings` / `nav:super_monitor` are stripped for non–Super-Admin on save and at `getPermissionsForRole`).
- System roles (`super_admin`, `admin_hr`, `admin_qa`, `admin_accounting`, `admin_marketing`) are seeded once; their permissions are editable (except Super-Admin). Custom roles can be created from Settings.
- Prefer extending the permission catalog + seeds when adding new admin pages — do not reintroduce hard-only role checks without also adding a permission key.
- JWT still carries `adminRole` slug; permissions are resolved from DB on each request (not frozen in the token).

## Admin login path (obfuscated) + first-time setup

Legacy `/admin-login.html` is **blocked on purpose** (404 HTML). The real login page is `public/admin-login.html` served only at `GET /${ADMIN_LOGIN_PATH}`.

- Path source: `getAdminLoginPathSegment()` in `server/utils/adminRouteConfig.js`. Set `ADMIN_LOGIN_PATH` in production `.env` (8–128 chars: `a-zA-Z0-9_-`). If unset, the coded default segment is used (same value the server logs at startup as `Admin login page path`).
- Register the route in `server/index.js` **before** static: root `/admin-login` + `/admin-login.html` → 404; `/${segment}` → `sendFile(admin-login.html)`.
- Client must **never** hardcode redirects to `/admin-login.html` or `/admin/admin-login.html` for sign-in. Use:
  - `localStorage.remoedAdminEntryPath` (set when visiting the obfuscated login URL via `RemoedAdminSession.rememberCurrentPathAsAdminEntry()`), or
  - `GET /api/auth/admin-login-path` → `{ path: "/…" }`, or
  - `loginPath` on successful `POST /api/auth/admin-first-setup`.
- First-time setup UI: `public/admin-first-setup.html` (public). After save, redirect with `loginPath` / API path and remember it in `remoedAdminEntryPath`.
- **Forced 2FA enroll:** password OK + `isTwoFactorEnabled !== true` → login returns `require2FASetup` + QR; client confirms via `POST /api/admin/verify-2fa` with enrollment Bearer (not a full admin JWT). Enrollment handlers in [server/admin.js](server/admin.js) must stay **before** `adminRouterRbac`, and [server/adminRbacRoutes.js](server/adminRbacRoutes.js) must skip non-RBAC paths so enrollment is not 403’d.
- Idle logout / session expiry: `public/js/admin-session.js` → `redirectToAdminLogin()` (API fallback; do not restore the `/admin/admin-login.html` fallback).
- `admin-login.html` sets `window.__REMOED_ADMIN_LOGIN_HTML__ = true` before `security-guard.js` so the obfuscated path is not treated as a protected `/admin-*` portal page.
- **Scoped roles (QA / HR / Accounting / Marketing):** dashboard `adminApiFetch` must **not** treat every HTTP 403 as logout. Role gates return plain 403 (“cannot access this resource”); only `401` or `403` with `ADMIN_2FA_REQUIRED` / `WRONG_PORTAL_TOKEN` / `ADMIN_SESSION_REVOKED` should clear the session. Otherwise QA login → dashboard → `teachers-list` 403 → instant logout loop.
- **Admin Messages** (`GET /api/admin/messages/users`): search must include **teachers, students, and other admins** (peer id `admin:{username}`). Do not search teachers/students only — Super-Admin chatting marketing staff depends on Admin collection matches.
- Admin Messages desktop layout: messenger fills the viewport under the fixed header (`portal-chrome-compact.css`); do not use `min-height: 100vh` on `.messenger` without subtracting the header — that forces page scroll to reach the composer. Short threads use `justify-content: flex-end` so bubbles sit near the input.

## Admin HR Staff Documents + teacher NBI

- Page: `public/admin-hr-documents.html` (HR Hub Documents; Super-Admin / HR).
- Teachers table includes **Gov ID**, **NBI**, **NBI status** (same idea as Admins). Detail modal can **Save status** via `PATCH /api/admin/hr-documents/:personType/:personId/nbi-status`.
- Teachers upload NBI under Profile → Documents → **NBI** (`documents.nbiClearances`, `nbiClearanceStatus`). Upload auto-sets status to `submitted` when previously `none`/`pending`.

## Student family / emergency (admin View Profile)

- Student profile: Parent/Guardian name, contact, **email**; Emergency contact **person** + **number** (`parentEmail`, `emergencyContactPerson`, `emergencyContactNumber`; legacy `emergencyContact` still synced as combined text).
- Admin **View Profile** (`admin-view-user-profile.html?type=student`) shows birthday, parent fields, and emergency person/number. Do not strip these from `GET /api/admin/user/:id?type=student`.

## Student My Level — CEFR alignment images

- `public/student-assessment.html` intro + results show RemoEd Kids / RemoEd Teens guides (`public/images/cefr/*-cefr-guide.jpg`) with tab switch + lightbox. Keep both images; do not remove the guides section when editing assessment copy.

## Teaching Fee — Bonus / Incentive (Accounting)

Below **Period fee (rate × completed classes)** on Teaching Fee (`teacher-service-fee.html`). Not automatic monthly pay.

- **Who enters it:** Accounting (and Super-Admin) on **Accounting Hub → Payroll Management** for the selected bi-monthly cut-off (`periodKey` `YYYY-MM-1` or `YYYY-MM-2`). Teachers see the amount read-only.
- **What it is:** Founder's discretion — e.g. successful student plan purchase referral bonus, internet aid, or other one-off incentives. Amount can be ₱0.
- **Storage:** `Teacher.periodIncentives[]` `{ periodKey, amount, note, updatedAt, updatedBy }`.
- **APIs:** `PUT /api/admin/teacher-period-incentive`; teacher `GET /api/teacher/period-incentive?startDate=YYYY-MM-DD`.
- **Available to Withdraw:** Teaching Fee keeps the cut-off amount visible. After the teacher withdraws, the **Withdrawable this cut-off** label changes to **Withdrawn** (amount is not reset to ₱0.00). Header **Total Earnings** is this cut-off’s earned net. Pending Earnings = not yet released.
- Do not turn this into a fixed monthly entitlement or auto-compute from referrals without an explicit product change.

## Lesson slide generation — laptop Level folders

After generating or rebuilding RemoEd lesson PPTX decks, always keep a laptop copy under the matching **Level** folder (not only the repo).

| Piece | Location |
|-------|----------|
| Brief / character rules | [`docs/lesson-references/README.md`](lesson-references/README.md), [`.cursor/skills/remoed-lesson-creation/SKILL.md`](../.cursor/skills/remoed-lesson-creation/SKILL.md) |
| In-repo canonical | `docs/lesson-references/lessons/L2M1-Lesson-{N}/` (+ flat copy under `docs/lesson-references/`) |
| Build / chrome | `docs/lesson-references/build_l2m1_lessons_7_9.py` (`build_lesson`), `build_l2m1_lessons_10_12.py`, `build_l2m1_lessons_13_15.py`, `build_l2m1_lessons_16_18.py`, `build_l2m1_lessons_19_22.py`, `build_l3m1_lessons_1_3.py`, `build_l3m1_lessons_4_6.py` |
| **Laptop download (required)** | `D:\Users\Window11\Desktop\JeanDesktop\RemoEdPH\A Lesson and Training Materials\Level {1\|2\|3\|4}\` |
| Filename pattern | `RemoEd L2M1-Lesson-{N}-{Title}.pptx` (Level 2 Sprouts Month 1; other levels use their own prefix) |

**Rules:**

- Save **per Level folder** (`Level 1` … `Level 4`) — do not dump all levels into one flat directory.
- `build_lesson` in `build_l2m1_lessons_7_9.py` copies to the laptop `Level {N}` path automatically (`lesson["level"]`, default **2**). If the desktop path is missing, log a warning but still write the repo copy.
- Optional Drive upload remains manual ([Drive – Level 2 Month 1](https://drive.google.com/drive/u/0/folders/14Fd0Miq10eEIVPCFVgXG36055a9ho3Xk)); laptop Level folders are the day-to-day download destination.
- Style / chrome: green Remo, Filipino Ed/Sofie/Teacher Grace, no Teacher Scripts, level-month footer + logo overlays — see remoed-lesson-creation skill. **Lesson briefs, character stills, and curriculum PDFs live in `docs/lesson-references/`** ([`README.md`](lesson-references/README.md)); do not use workspace-root `reference.md` as the lesson brief.
- Sprouts Month 1 lessons **19–22** (Honoring My Friends, Virtual Garden Challenge 1, Virtual Garden Challenge 2, Monthly Celebration) use `build_l2m1_lessons_19_22.py`. Uppercase A, B, and C are drawn in code on the phonics slides so the letter shapes stay correct. PDF footers that say Level 1 still publish as Level 2 – Sprouts.
- `build_lesson` uses `lesson["footer"]` (default `SPROUTS! MONTH 1`) and the length of `lesson["pages"]` for the page badge. Saplings Month 1 lessons **1–6** (`build_l3m1_lessons_1_3.py`, `build_l3m1_lessons_4_6.py`) are Level 3, footer `SAPLINGS! MONTH 1`, **18** pages, laptop folder `Level 3`, filenames `RemoEd L3M1-Lesson-{N}-….pptx`. Phonics letters and the name badge are drawn in code. Lessons 4–6 cover asking before apps, “God made me unique!”, and honoring each person.

## Known product gates (not bugs)

| Code | Meaning |
|------|---------|
| `SUBSCRIPTION_REQUIRED_LESSON_2` | Not subscribed / no credits / no trial |
| `CREDITS_EXPIRED` | Unused credits expired after validity window |
| `INSUFFICIENT_CREDITS` | `creditBalance` is 0 |
| `DAILY_CLASS_LIMIT` | Student may book at most 2 classes (1 hour) per local day |
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
| UI icons | [Lucide](https://lucide.dev/icons/) for portal chrome; password **eye** / **eye-off**; no emoji toggles (`SKILLS.md`). |
| Gender | Profile selects Male / Female only; Teacher enum rejects Other. |
| Marketing Hub | Unique Link Commissions under sidebar **Marketing Hub** (below Accounting); Accounting Hub = Payroll + Subscriptions only. |
| `admin_marketing` | Restricted sidebar + hub-guard + `adminRoleGate`; role in Admins dropdown; first-time setup token for blank-password creates. |
| Teaching Fee Bonus / Incentive | Period-scoped amount on Payroll; read-only on Teaching Fee; in net pay / dispense / payslip. |
