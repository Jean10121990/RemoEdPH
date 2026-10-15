# RemoEdPH Stable Baseline

Working beta surfaces that new features should **extend around**, not rewrite. Agents: also follow [`.cursor/rules/remoed-stable-surfaces.mdc`](../.cursor/rules/remoed-stable-surfaces.mdc).

Treat **repo `main` after a successful production deploy** as the source of truth. Re-run this checklist after every VPS restart / deploy.

## Critical file paths

| Area | Files |
|------|--------|
| Portal tokens | `public/js/user-session.js`, `public/js/remoed-auth-token.js`, `server/authMiddleware.js` |
| Security guidelines | [`.cursor/docs/SECURITY.md`](SECURITY.md) — route auth decisions, public allowlist, socket room binding, XSS, NoSQL injection, secrets |
| Forgot / set password | `POST /api/auth/forgot-password` (link, not a temp password), `POST /api/auth/reset-password`, `public/forgot-password.html`, `public/reset-password.html`, `public/change-password.html`, `POST /api/auth/change-password` |
| UI icons (Lucide) | [lucide.dev/icons](https://lucide.dev/icons/), [`SKILLS.md`](SKILLS.md) § UI icons; `public/js/lucide-icons.js`; password eye: `public/js/password-toggle.js` |
| Student book UI | `public/student-book.html` |
| Book API | `server/student.js` (`POST /book-class`), `server/studentController.js`, `server/services/studentBookSlotService.js`, legacy `POST /api/teacher/book-class` in `server/teacher.js` |
| Free plan / Pre-Level | `server/services/freePlanAccess.js`, `server/services/studentLessonUnlock.js`, QA Hub Lesson Library curriculum **Free Trial Lessons**. Three lessons only. `scripts/import-free-trial-lessons.js` is retired. |
| Kids / Parents mode | `public/js/student-sidebar.js` (`openPinModal`, kids CSS). PIN card stays inside 420px. Each student account has its own parent PIN (`parentPinHash`); there is no shared default. First switch shows **Set a parent PIN**; later switches show **Enter PIN** with **Forgot the PIN? Set a new one** (account password + new PIN via `POST /api/student/portal-mode/pin/reset`). A 409 on verify opens setup, and a 409 on setup opens verify. |
| Teacher ID resolve | `server/services/teacherSlotResolve.js`, `teacherBookingKey` in `server/teacher.js` |
| Credits / expiry | `server/services/studentCreditSummary.js`, `server/services/creditExpiry.js`, `server/services/creditLots.js` — each purchase is a **credit lot** with its own `expiresAt`. The Credits page countdown is the **longer** remaining date. Class finish burns FIFO by purchase date (older plan first). When a lot expires, only that lot’s remaining credits zero; newer plans keep theirs. Every `Student` read/write inside the wrap-up transaction (`server/services/bookingCreditLedger.js`) must pass the session — a session-less write deadlocks **Complete Class & Submit Feedback**. |
| Class schedule / issue | `public/teacher-class-table.html`, `POST /report-issue` + `GET /check-class-issues` in `server/teacher.js` |
| Applicant → teacher docs | `server/utils/applicantDocuments.js`, teacher signup in `server/auth.js` |
| Live classroom (AV / locks) | `public/live-classroom.html`, `public/css/live-classroom-redesign.css`, `public/js/virtual-background.js`, `public/images/virtual-bg/`, socket maps in `server/index.js` |
| QA lesson recording | `public/js/classroom-qa-recording.js`, `public/live-classroom.css` (`.qa-recording-dock__stop`), `server/classroomRecordingApi.js`, [CLASSROOM_RECORDING.md](CLASSROOM_RECORDING.md) |
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
| Student privacy consent | `server/config/privacyConsent.js` (version `2026-10-01`), `Student.privacyConsents`, `POST /api/student/privacy-consent`, `public/legal/student-privacy.html`, `public/legal/terms.html`. Profile checkbox source is `profile`. Students are international; the Philippine Data Privacy Act still covers the accounts RemoEd holds. |
| Classroom SOS | `server/models/IncidentReport.js`, `server/services/classroomSosService.js`, `server/classroomSosRoutes.js`, `public/admin-incidents.html`, permission `incident:manage` (Super-Admin and QA). Live button is Emergency SOS beside Settings. |
| Teacher emergency guidelines | `GET /teacher/emergency-guidelines` → `public/teacher-emergency-guidelines.html`. Assets and `<base href="/">` must stay root-absolute. A relative `css/` or `js/` path 404s under `/teacher/` and the sidebar and header disappear. |
| Student My Level / CEFR guides | `public/student-assessment.html`, `public/images/cefr/remoed-kids-cefr-guide.jpg`, `public/images/cefr/remoed-teens-cefr-guide.jpg` |
| Admin Accounting hub | `public/admin-accounting-hub.html` (Payroll + **Admin Payroll** + Student Subscriptions); Admin Payroll UI: `public/admin-admin-payroll.html` |
| Admin Fee & Attendance | `public/admin-fee.html` (no Time In/Out), `server/adminFeeRoutes.js`, `AdminAttendance` / `AdminPayout`; clock via Dashboard / header `public/js/admin-time-tracking.js` + `/api/admin/time-tracking/*` in `server/admin.js` |
| Admin Roles (dynamic RBAC) | `public/admin-settings.html` (Admin Roles and Access), `server/services/adminRbac.js`, `server/adminRbacRoutes.js` (RBAC paths only — skip enrollment), `AdminRole` / `AdminPermission`, `public/js/admin-access-guard.js`, `public/admin-403.html` |
| Admin Messages | `public/admin-messages.html`, `GET/POST /api/admin/messages/*` — teachers, students, **and admins**; desktop viewport-fit messenger |
| System monitor (Super-Admin) | `public/super-monitor.html`, `GET /api/admin/system-stats` — live unique students / teachers / admins via Socket.IO `userType` + `presenceKey` |
| Virtual Garden / Eco-Drops | [`SKILLS.md`](SKILLS.md), `public/student-virtual-garden.html`, `public/css/student-virtual-garden.css`, `server/services/ecoDropGardenService.js`, `GET/POST /api/student/garden*`; grant on first `LessonProgress` → completed |
| Lesson slide generation (L2M1+) | [`docs/lesson-references/`](lesson-references/) ([`README.md`](lesson-references/README.md)), [`.cursor/skills/remoed-lesson-creation/SKILL.md`](../skills/remoed-lesson-creation/SKILL.md), `docs/lesson-references/build_l2m1_lessons_*.py` / `build_l3m1_lessons_*.py` → repo `docs/lesson-references/lessons/` **and** laptop `Level {1–4}` folders |
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
- [ ] **Booking Details** opens as a centered body-level modal (not a side column inside `.remoed-content`).
- [ ] A paid student with credits follows Learning Journey order on Little Seeds, Sprouts, Saplings, and Young Stewards: the next stop or any earlier lesson. Pre-Level stays open for a paid student and does not subtract a credit. Growth levels still use one credit. Free-plan students book the next of 3 Pre-Level lessons (How to Navigate the Student Portal, About RemoEd PH, Welcome), with no monthly lesson. One free class can be open at a time. The booked lesson is labeled **Booked**. Later free lessons say **Finish Lesson N first**. **Subscribe to Book** is for levels after those 3.
- [ ] Student with expired / zero credits gets a clear credit/subscription error code, not a 500 or `WRONG_PORTAL_TOKEN`.
- [ ] A student without the current privacy version gets `CONSENT_REQUIRED` on book and logged-in checkout, then can continue after accepting. Booking confirmation and the student waiting room say classes are recorded for safety, quality assurance, and parent review.
- [ ] Super-Admin **Settings** has a Student payment switch: MariBank QR or PayMongo. It is stored on `GlobalSettings.studentPaymentMethod` (default MariBank QR). Credits follows that switch. PayMongo `POST /api/payments/create-link` stays. A QR transaction number does not add credits. Accounting Hub → Student Subscriptions → **Confirm and add credits** does. Reject does not.
- [ ] **My Profile → Personal Information → Student Privacy** shows the accept checkbox for the parent or the student. Checking it saves the current version. If that version is already accepted, the box stays checked.
- [ ] Booking for a teacher whose slot `teacherId` is a username (not email) still succeeds when the UI sends their email.
- [ ] A student with no privacy consent who presses Book **stays signed in** and sees the Student Privacy box on the booking panel (server answers `403 CONSENT_REQUIRED`; `user-session.js` must not treat that as an expired login). After accepting, the same booking succeeds.
- [ ] There is **no per-day class cap**: a student can book a 7th class on the same local day. The page shows no “Day full” cells and no “6 classes per day” text.
- [ ] Book a Class has **Schedule** and **Syllabus** tabs. Syllabus is an accordion of level, month, and lesson titles from `public/data/syllabus.json` (Little Seeds through Month 10 plus two vacation months, Sprouts, Saplings, Young Steward). Topic and Target stay off the page. Schedule remains the week grid.
- [ ] Booking Details lists lessons by month. A later lesson stays visible and locked until the earlier lesson is finished (`Finish Lesson N first`). When that finished lesson has a checkpoint the student has not passed, later lessons stay locked with **Pass the Lesson N assessment first**. A paid growth lesson stays locked when `creditBalance` is under 1 (`Not enough credits`), and Book stays disabled. Pre-Level and the next free lesson do not need a credit. Several teachers on one slot are chosen from photo and nickname cards. The booking request still sends the teacher email. Server gates are unchanged.
- [ ] Learning Journey draws a wall on the path after a finished lesson whose checkpoint is not passed. Remo stands at that wall. **Take assessment** opens the checkpoint (80% to pass, retakes allowed). **Not now** leaves the wall. A pass breaks the wall and opens the next lesson in Book a Class. A lesson with no checkpoint still opens the next lesson. An absence does not raise a wall. The 3 orientation lessons still do not move this map.

### Teacher schedule / issue

- [ ] Class Schedule loads without console `resolveTeacherPortalToken is not defined`.
- [ ] Teacher can open a booked class → **Report Issue** → submit with screenshot → success toast.
- [ ] Live classroom has **Finish** only (locked until 15 minutes after the scheduled start). **Student Absent** and **Report Issue** are on Class Schedule → Class Information, and they show as soon as the class has started, including those first 15 minutes. Closing the classroom tab does **not** mark the student absent. An absent class is not pending feedback and does not ask for stars or a comment.
- [ ] Every live class ends **40 minutes** after its scheduled start, including when the teacher only closes the tab. The stored end is that 40-minute mark, so class history cannot show a multi-hour duration. This does not mark the student absent and does not consume a credit. Credits still move only when feedback is submitted.
- [ ] Teacher **Complete Class & Feedback** can be opened again and saved until the class’s salary date (15th for the 1st–15th, last day for the 16th–end), Philippine time, including classes already marked completed. After that date the cut-off is closed and feedback no longer changes. Updating feedback does not charge the credit again. A completed class that still has no feedback keeps a **Give Feedback** action on the schedule until that cut-off.
- [ ] A class marked **student absent** cannot be turned into Complete Feedback. A **Report Issue** class also cannot use class feedback. QA sets the teaching fee when the report is resolved: system issue or student issue pays the teacher in full, teacher fault pays 20%, and a valid emergency with proof waives the penalty and pays the teacher in full. A dismissed report can still use normal class feedback.
- [ ] Students follow lesson order on their level. Booking allows the next Learning Journey stop or any earlier lesson. A later lesson returns `LESSON_AHEAD_OF_PROGRESS`. The trail advances when the class status is **completed** (after feedback) or Lesson Progress is completed. A student or teacher absence does not advance the trail, even when that booking is still stored as completed. Ending the live room, or a `finishedAt` stamp, does not unlock the next lesson. The 3 orientation lessons do not move the Little Seeds, Sprouts, Saplings, or Young Stewards map. Any other finished class marks the next open stop, so one finished class leaves Remo on lesson 2.
- [ ] QA **Other issue** (natural disaster, calamity, electricity maintenance, scheduled electricity outage, accident, death, emergency) is valid only with proof. After it is accepted, the teacher penalty is waived (100% of the class rate) and the student can reschedule for one month. The same reasons on a teacher cancellation waive the cancellation penalty only after admin approval and only when proof was uploaded. Do not pay 50% for this type.
- [ ] **Emergency guidelines** (`/teacher/emergency-guidelines`) shows the teacher sidebar and top bar, the three tiers, and the SOS status legend. In the teacher sidebar it sits **directly under Class Configuration** (`MENU_ITEMS` order in `public/js/teacher-sidebar.js`: Dashboard, Leaderboard, Class Schedule, Class Configuration, Emergency guidelines, Device Check, …).
- [ ] After submit, schedule refresh does not clear the teacher session.

### Live classroom (teacher Settings + student locks)

- [ ] Teacher **Settings** gear (tab bar) opens the overlay — not a dropdown clipped under the lesson stage.
- [ ] Unchecking **Videos tab** hides Videos for the student and bounces them to Lesson; teacher Videos still works.
- [ ] Unchecking **Pen / annotate** stops student drawing on the lesson and the board; teacher pen still works. Leaving Board still sends students back to Lesson.
- [ ] **Student microphone** / **Student camera** switches match the rail pills: one side of each pair is highlighted (Allow = green, Mute/Cam off = amber). Student is muted / cam-off until Allow.
- [ ] **Your camera background** in Settings applies Off / Blur / Office / Classroom / Nature / Custom on the teacher camera (photos under `public/images/virtual-bg/*.jpg`). Hard-refresh after deploy so `?v=` cache-bust is not stale.
- [ ] Student joining before the teacher sees the **waiting overlay** (Play candies and toys / Watch loop). When the teacher joins, the overlay closes. Camera/mic/speaker use Lucide **video** / **mic** / **volume** icons, not C/M/A letters. Teacher student-lock chips are icons only (`mic-off` / `mic` / `video-off` / `video`). Flagged chat shows asterisks to students; teachers can reveal possible flagged words.
- [ ] Teacher **Emergency SOS** (Lucide siren) sits beside Settings. Students and admin observers do not see that send form. Confirm creates one incident; a second confirm in the same open class returns that incident. Withdraw within 15 seconds marks it withdrawn. An admin already in the room as observer gets a Classroom SOS alert with Close, Pause, Resolved, and End class. Close hides the box and leaves Pause, Resolved, and End class in the top bar. Resolved leaves the room for the observer (also when another admin resolves it) and shows the teacher and student "RemoEd resolved the issue" with a **Continue class** button, which removes the cover and restarts stopped camera/mic. The observer never gets the pause / resume cover. End class ends that room and leaves. The observer does not join the camera call, and joining or leaving Observe does not restart the teacher-student camera, audio, or lesson. Admin Observe (`observer=1`) does not publish a camera and does not clear the student waiting state. Pause and end stop media in that room only and do not delete room settings or virtual backgrounds. Tier-1 end restores a credit only if one was already spent, and the class stays on the schedule with the remark Ended by admin. Resolved stays on the schedule with the remark Resolved. QA still reviews teacher, student, or system issues. Tier 2 and 3 do not change credits. A second teacher or student tab in the same room is disconnected and its camera stops. Camera offers go only between the current teacher and the current student. A webcam is never placed on the lesson.
- [ ] Admin **Classroom SOS** is a tab inside QA Hub (`admin-qa-hub.html#sos`). The status menu has a legend: Open, Withdrawn, Observing, Paused, Ended, Resolved, All. Empty Open means no teacher has sent an SOS. Opening `admin-incidents.html` directly goes to that tab.
- [ ] **Every** QA action on any tier (acknowledge the first time, observe, note, troubleshoot, parent contact, escalate, pause, end class, resolve, review) also sends the teacher a line in **Messages** saying what QA did, with the reason or note (`actOnIncident` → `qaActionLine` / `sendQaMessageToTeacher` in `server/services/classroomSosService.js`). A repeat acknowledge sends nothing. QA **Add note** saves the note on the case and also sends it to the teacher's **Messages** as a direct message from that admin (`PeerMessage`, sender `admin:<username>`, recipient the incident's canonical `teacherId`). The teacher's chat list names that admin "Name (Admin)". Do not move QA notes back to the case log only.
- [ ] **QA spiels** (`public/js/sos-qa-spiels.js`): short copy-ready lines per tier, "This is QA Tier N - <name>, …" with a fixed name per tier (`TIER_NAMES`: Tier 1 Joy, Tier 2 Carl, Tier 3 Renz). Classroom SOS page shows a Tier 1/2/3 panel above the counts (follows the Tier filter); click copies. The observer SOS box in `live-classroom.html` lists that incident's tier; click copies and fills `#chat-input` (admin presses Enter to send). Keep the lines short and do not promise credit returns.

### Classroom camera relay (TURN) and lesson decks

- [ ] `GET /api/rtc-config` works **without** a Bearer token (it must stay registered before the `/api` routers that run `verifyToken`) and returns STUN plus TURN. The browser console shows “ICE servers loaded from /api/rtc-config” and no “No TURN relay configured” warning.
- [ ] Teacher and student on **different networks** see each other. If video is black and the console shows `STUN binding request timed out` / `TURN allocate request timed out`, the relay is unreachable: follow BETATESTER.md → “Camera black / ICE checking”.
- [ ] Class chat survives a refresh and shows “Pat is typing...” (first name) while the other person types. After Finish, that room’s chat is gone (`classroom_chats` deleted on end-session / `class-finished`; 24h TTL if Finish never happens). Teacher/admin Messages stay. Do not store class chat on the Messages collection.
- [ ] A weak connection does not replace the other person’s camera with “Waiting for student/teacher”. The tile stays, black if the picture drops, with their name, until they actually leave. QA recording still treats that black tile as the student being in class.
- [ ] QA **Start** stays disabled until the student is in the room, including a student who arrives a few minutes early. The saved clip is 480p (the student still sees full-size slides). Recording does **not** stop itself. The teacher clicks **Stop** at the usual class end (about **:25** for a 1:00 / 2:00 / 3:00 class, about **:55** for a 1:30 / 2:30 / 3:30 class). That clip is about 25 minutes on time, up to about 30 minutes if the student came early, or shorter if they were late. **Stop** only saves the recording and leaves the classroom tab open. The teacher then clicks **Finish**. Do not close the tab when recording stops.
- [ ] A **Ready** row in QA Hub → Lesson recordings downloads the clip. If several GridFS files share `relativePath`, open the newest one whose length is greater than 0. A later 0-byte copy must not make Download return “File missing” while the row still shows the real size.
- [ ] ICE policy in `live-classroom.html` is **direct-first** (`'all'`) with TURN as fallback. Do not restore the automatic relay-first switch on `turns:443/tcp`; it forced all media through Cloudflare and caused lag and freezes. `?relay=1` is the manual override. The webcam sender cap (`CAMERA_MAX_BITRATE_BPS`, 500 kbps) stays.
- [ ] The classroom socket (`io(...)` in `public/live-classroom.html`) uses `reconnectionAttempts: Infinity` with max delay 5 s and reconnects on `online` / tab visible. Do not re-add a second `reconnectionAttempts` key or a finite limit: a 20-second network drop must not leave a teacher or student gone until refresh. Test by turning Wi-Fi off for 30 s and on again; the peer returns without a refresh.
- [ ] Production relay is **hosted Cloudflare TURN**: `CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN` in the server `.env` (`server/services/hostedTurn.js`). `https://remoedph.com/api/rtc-config` shows `"turnConfigured": true` and `turn.cloudflare.com` URLs. Do not remove this path. The own coturn on the VPS is **stopped and disabled** (2026-10-05) and `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` are removed from `.env`, so no dead `187.77.159.63:3478` entry slows the connection. Re-enable it only after an external probe of 3478 succeeds (see Camera relay configuration below).
- [ ] Lesson PowerPoints open in Microsoft PowerPoint (Office for the web) through a signed 6-hour file link (`server/utils/officeViewerLink.js`, public `GET /api/office-viewer/presentation/...`). Existing slide images or a cached `preview.pdf` are used first. Do not add a paid third-party converter back (Cloudmersive was removed).
- [ ] Decks over 10 MB (Microsoft's limit) get their pictures recompressed on upload by `server/utils/pptxCompress.js` (same entry names; never blocked; the upload response carries a `warning` if still over 10 MB). `FRONTEND_URL` must be `https://remoedph.com`; production logs `[office-viewer] ... OK` at startup.

### Teacher payout tiers and referral commission

- [ ] Admin → Users → add or edit a teacher: **Free Trial — ₱45 per 25-min class (₱90/hr)** is the first Professional tier. Picking it shows `Total hourly: ₱90 · Per 25-min class: ₱45` and ignores credential checkboxes; saving and reopening keeps it. Teachers on Tier 1 to 4 still compute `(base + ₱10 × credentials) ÷ 2`.
- [ ] A Free Trial teacher's Teaching Fee shows ₱45 per class, and Career Growth lists the Free Trial row before Tier 1.
- [ ] A referred student paying 1 month / 3 months / 6 months / 1 year creates a `successful` referral of ₱1,000 / ₱1,500 / ₱2,000 / ₱2,500. Marketing Hub → Unique Link Commissions and the teacher Referral Rewards page show those amounts. A repeat webhook or **Refresh** does not change an already awarded amount.
- [ ] The teacher and admin shared link is `/index.html?ref=CODE#assessment` (Free Level Assessment). Signup lists the student by name as pending with ₱0. **Successful enrollees** counts only the first plan purchase. A later purchase does not add another bonus.

### Auth isolation

- [ ] Student token cannot call a random `/api/teacher/*` route outside the allowlist (`WRONG_PORTAL_TOKEN`).
- [ ] A 401 or a plain 403 from `/api/*` signs the portal out, but a 403 whose JSON `code` is a business gate (`CONSENT_REQUIRED`, `INSUFFICIENT_CREDITS`, `CREDITS_EXPIRED`, `SUBSCRIPTION_REQUIRED_LESSON_2`, `TRIAL_LESSON_1_ONLY`, `LESSON_AHEAD_OF_PROGRESS`, `FREE_PLAN_LESSON_ONLY`, `FREE_PLAN_SEQUENCE`, `FREE_PLAN_ALREADY_BOOKED`, `FREE_PLAN_TRIAL_TEACHER_ONLY`, `FREE_PLAN_SEQUENCE_DONE`, `FREE_PLAN_LOCKED`, `ALREADY_BOOKED`, `SLOT_NOT_AVAILABLE`) must **not** (`BUSINESS_GATE_CODES` in `public/js/user-session.js`). When you add a new gate code that uses 401/403, add it there.
- [ ] Teacher token cannot call `/api/student/*` profile/bookings as a student.
- [ ] No token: `/api/teacher/timezone-debug` and `/api/teacher/booking-test/x` return 404; `/api/teacher/booking/by-classroom/x`, `/api/teacher/dashboard-stats`, and `/api/teacher/classes?teacherId=…&week=…` return 401.
- [ ] Teacher Open Class still shows booked slots; teacher and student bells and Messages still update live (socket rooms joined with the portal token).

### Portal / classroom responsive

- [ ] Phone (375px): student/teacher/admin `.remoed-content` has **no** 260px left gutter; **no sidebar drawer**. App chrome is a titled top bar + 4 tabs + More sheet (`#remoed-more-sheet` on `document.body`).
- [ ] Phone Dashboard and Class Schedule **scroll and stay** (finger-drag down/up does not jump to the top or the bottom). `.remoed-main` is the scroller; `window.scrollY` stays `0`.
- [ ] Desktop (1440px): content is offset by `--sidebar-width` (260px); tablet 769–1024 keeps the icon rail. Time In, notification bell, and calendar stay in `.nav-header` (not inside the hidden `#remoed-mobile-shell`).
- [ ] Student, teacher, and admin sidebar icons sit on **one vertical line** when the window is resized and when the rail is collapsed. Expanded: 20px icons, labels to the right. Collapsed / teacher-admin tablet rail: 40px boxes, icon centered. Student tablet stays the 260px labeled menu with the same left edge.
- [ ] Teacher Profile / Student Profile on phone is a **single column** (Quick Info stacked above the form). Desktop ≥1025 stays two-column.
- [ ] `#tour-button` / `#chatbot-toggle` sit above the 64px tab bar, not on top of it.
- [ ] Classroom Settings / VBG / class-info stay body-level and use `--z-modal` / `--z-toast` / `--z-blocking` from `public/css/remoed-layers.css`. Classroom phone dock stays Lesson / Camera / Chat (no portal tabs).

### Landing / culture

- [ ] Homepage after hero shows, in order: **Who we are?** → Foundational Principles → Core Cultural Pillars → H.E.A.R.T. Framework → Vision & Mission, then existing Why Learn / Teachers / Assessment / Plans.
- [ ] Pillars and HEART use **icon circles** (`.remo-culture-icon`), not cropped stock photos under `public/images/culture/`. New portal chrome uses **[Lucide](https://lucide.dev/icons/)** (see [`SKILLS.md`](SKILLS.md)); do not put emoji on password fields.
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
- [ ] Teacher, student, and admin notification bells open **directly under the bell**. Each panel has **Mark all as read** (`data-notif-mark-all` in `public/js/remoed-notifications.js`, header button in `teacher-page-header.js` / `student-page-header.js`, `#admin-notifications-mark-read` for admin). It calls `PATCH /api/teacher|student/notifications/mark-read` or `PATCH /api/admin/notifications/mark-all-read` for the signed-in user only, then the badge goes to 0. Do not drop that button when rebuilding the bell.
- [ ] **Marketing Hub** opens Unique Link Commissions (filters, ₱ totals, enrollee table).
- [ ] Opening `admin-unique-link-commission.html` standalone redirects to `admin-marketing-hub.html` (not Accounting `#commissions`). Old `#commissions` on Accounting Hub redirects to Marketing Hub.
- [ ] Accounting Hub → Payroll: **Bonus / Incentive** column can Save an amount for the selected cut-off; Teaching Fee shows the same amount under Period fee and includes it in **Available to Withdraw**.
- [ ] Super-Admin → Admins / Roles can assign **Admin — Marketing** (`admin_marketing`). Creating with blank password shows a one-time setup token; first-time setup page is `admin-first-setup.html`.
- [ ] `admin_marketing` sidebar matches its RBAC seed (Dashboard, Marketing Hub, shared ops — not HR/QA/Accounting hubs; no Settings / System monitor unless Super-Admin). Forbidden hub URLs redirect; Unique Link APIs work; payroll / user-mgmt style APIs stay gated.
- [ ] **Admin Fee** has **no** Time In/Out buttons (status/eligibility/attendance/payslip only). Clock from **header** or **Dashboard** card; both Dashboard header mini and middle card Time In/Out/View Logs work; login does **not** auto clock-in. Time Out shows a confirm. Super-Admin **View Logs** lists any admin and can **Reopen shift** (clear accidental Time Out) or **Edit times** (HH:MM PHT); other roles only see their own history.
- [ ] Admin Dashboard → Time Tracking → **Time Log Edit Requests** lists teacher rows waiting on **Pending Approval**. Set Time In and Time Out, then **Approve** (writes the teacher time log) or **Reject**. That button is not the admin’s own View Logs.
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
- Students only see the **Lesson** tab. Board and Videos buttons are hidden, and student clicks do not change tabs. The teacher still opens Board; that follows the student, and leaving Board sends them back to the lesson.
- Client: pen lock sets `window.__lcStudentPenAllowed` and gates the lesson slide Draw overlay, PDF annotate, and whiteboard (`body.lc-student-pen-locked`). Teacher can still draw. Draw starts off for both; each person turns their own pen on. `whiteboard-mode-stop` still sends students to Lesson. Board strokes are stored on the server. A later snapshot is merged into the local board; it must not replace strokes the student just drew. The canvas is sized to its panel once, then redrawn, so a resize does not wipe the student’s own marks.
- Classroom `<video>` elements set `disablePictureInPicture`. The browser Picture-in-Picture hover control stays off.
- Join does not mute either microphone or the other person's speaker. Local preview stays muted so the room does not echo.

### Teacher → student mic / camera

- Socket `media-control` + `media-control-state`. Payload `audio`/`video` **true** = allowed, **false** = locked.
- Rail is four pills **outside** the peer video tile (`#lc-teacher-media-controls`). Do not put `video-control-btn` (30px circles) on these labels — that stacked “MuteAllowicam”.
- Exclusive pairs: sync `is-active` on **both** Allow and Mute/Cam off (`syncTeacherMediaUi`). Settings checkboxes `#lc-setting-student-mic` / `#lc-setting-student-cam` must stay in sync.

### Virtual backgrounds

- `public/js/virtual-background.js` is **canvas-first**. Presets are real JPEGs: `office.jpg`, `classroom.jpg`, `nature.jpg`, `playground.jpg`. Keep SVG files only as unused leftovers; do not point presets back at `.svg` (canvas load / taint failed). Device Check is the camera and microphone check (filter and background stay on that page). The practice room keeps the lesson as the large view (How to Navigate the Student Portal slides) and the camera as the small tile. Camera filter and background stay on that tile. The practice room does not have an upload button.
- Remap stored `*.svg` preset URLs to `.jpg` in `applyMode`. Do not let `applyTeacherCameraReadyLook()` overwrite an active VBG (`mode !== 'off'`).
- MediaPipe person cutout is optional; blur and photo presets must work without it.

### Class chat

- Last 50 messages for the open class are saved in `classroom_chats` (`server/models/ClassroomChat.js`, `server/services/classroomChatStore.js`) and sent as `chat-history` on join. `public/live-classroom.html` must keep a `chat-history` listener. A refresh or a server restart still shows them.
- While the other person types, the box shows “Pat is typing...” using the first name from the class label (`classroomStudentLabel` / `classroomTeacherLabel`). `typing` / `stop-typing` use the socket’s joined room, not a room id from the client. Chat sends use that same room.
- A weak connection (`disconnected` / `failed`) must not call `markPeerVideoDisconnected` if that person was already on camera. Use `holdPeerVideoForWeakSignal` (black tile, name stays, stream kept when the track is still live). “Waiting for…” is only before they join or after `user-left` for the opposite role. The server waits 20 seconds (`schedulePeerLeave`) before emitting `user-left`, and cancels that if the same role rejoins. QA `isStudentPresent` treats `.is-signal-hold` as still in class so recording does not stop.
- Finish deletes that room’s chat (`class-finished`, and `POST /api/booking/:id/end-session` including already-finished / absent / pending-feedback). The next class starts empty. A 24-hour TTL on `updatedAt` deletes a chat if Finish never happens.
- Teacher/admin **Messages** (`PeerMessage`) are a different store. Do not delete those when a class ends, and do not store class chat there.

### QA recording

Details: [CLASSROOM_RECORDING.md](CLASSROOM_RECORDING.md). Client: `public/js/classroom-qa-recording.js`.

- **Start** only after `isStudentPresent()` (student video/audio live, or a black `.is-signal-hold` tile). A student who enters about 5 minutes early can be recorded. The classroom already opens 10 minutes before the slot.
- The recorder does **not** stop itself. Do not put back a `setTimeout` on `state.maxMs` that calls `mediaRecorder.stop()`. `CLASSROOM_QA_RECORDING_MAX_MINUTES` is the usual class length shown in config, not an auto-stop.
- Classes on the hour (1:00, 2:00, 3:00) run to about the **25th** minute. Classes on the half hour (1:30, 2:30, 3:30) run to about the **55th** minute. The teacher cannot end the class in the first 15 minutes. A recording is about **25 minutes** if the student is on time, about **30 minutes** if they arrived early, or shorter if they were late.
- **Stop** (`#qa-rec-stop`) only stops `MediaRecorder` and uploads. It must not call end-session, must not `window.close`, and must not disconnect the socket. The page stays open so the teacher can click **Finish**.
- **Finish** is a separate click. If recording is still on when they click Finish, `stopAndFinalize()` runs first, then the class ends. A normal 25–30 minute class ends before the 40-minute safety stop, so that safety must not cut a recording the teacher is still using.
- The QA file is **480p** (max height 480, 8 fps, about 350 kbps video). `downscaleQaVideo` draws a canvas clone for `MediaRecorder` only. Do not scale `state.screenStream` itself: that same capture is the student’s cropped slide share. After upload, ffmpeg scales to at most 480p (`fps=8`, max 450 kbps) before the MP4 is stored. A 25-minute clip should stay well under the 120 MB cap so QA Hub can download it. Chunk `PUT`s must **not** use `keepalive` (Chrome drops bodies over ~64 KB, which left QA Hub on “Uploading · 0 B”).
- Empty sessions (0 bytes, still “uploading” after 30 minutes) are marked failed. A session that already has bytes and then goes quiet is assembled after a few minutes.
- The clip is stored in GridFS (`uploads` bucket) at `relativePath`. `findUpload` must return the newest file with `length > 0` when several files share that name. A later 0-byte copy (a failed rewrite) must not hide the real clip — that is what made a Ready 37.3 MB row answer “File missing”. Do not delete the stored file until a replacement with bytes is confirmed.
- `POST /api/classroom-recording/session/:id/complete` on a row that is already `complete` returns success and does not assemble again. If the chunk parts are already gone, an existing GridFS file at `relativePath` counts as assembled. QA Hub download of classroom recordings stays allowed. Lesson-file downloads stay blocked.

### Class end, feedback, and lesson order

- Every live class hard-stops **40 minutes** after its scheduled start (`CLASS_MAX_MINUTES` in `server/services/classroomEntryWindow.js`, `server/services/classAutoEnd.js`, and the teacher timer in `live-classroom.html`). The stored end is that mark, so history cannot show a multi-hour duration. This does not mark the student absent and does not consume a credit. Closing the tab does not mark absent. **Finish** stays locked for the first 15 minutes.
- Feedback stays editable through the salary date (15th for the 1st–15th, last calendar day for the 16th–end, Philippine time). A second save must not charge the credit again.
- Student-absent classes (`absent` or `absentMarkedAt`) cannot be completed through feedback. A pending, reviewed, or resolved **Report Issue** also blocks class feedback; QA sets the fee on resolve (system or student issue 100%, teacher fault 20%, valid emergency with proof waived and 100%). A dismissed-only report can still use normal feedback.
- Booking follows Learning Journey order (`LESSON_AHEAD_OF_PROGRESS`): next stop or any earlier lesson. The trail moves when status is **completed** or Lesson Progress is completed. A student or teacher absence does not count, even if status is still completed. The 3 orientation lessons do not move the growth-level map. Any other finished class marks the next open stop, so one finished class leaves Remo on lesson 2. When that finished lesson has a published checkpoint, the class stays done on the map and the next lesson stays locked until the student passes (`CHECKPOINT_REQUIRED`, **Pass the Lesson N assessment first**). A lesson with no checkpoint still opens the next lesson. Questions live in `public/data/lesson-checkpoints.json`. Correct answers live only in `server/data/lesson-checkpoint-answers.json`. Pass is 80 percent. Retakes are allowed, and a later fail does not erase an earlier pass.

### Camera relay configuration and emergency guidelines

Class configuration for video between teacher and student. Setup steps: [CLOUDFLARE_TURN_SETUP.md](CLOUDFLARE_TURN_SETUP.md). Bug history: [BETATESTER.md](BETATESTER.md) → “Camera black / ICE checking”.

**Configuration (do not change without a reason)**
- Relay: Cloudflare TURN through `server/services/hostedTurn.js`, merged into the public `GET /api/rtc-config`. Credentials last 24 hours and are cached about 22 hours; a restart refreshes them.
- Server `.env` needs only `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`. After changing them: `pm2 restart <app> --update-env`.
- Own coturn on the VPS: stopped and disabled. Do not turn it back on or put `TURN_URL` back in `.env` unless a probe from outside the VPS reaches 3478. A dead relay in the list only adds connection delay, and its password would be public on `/api/rtc-config`.
- Never paste the Cloudflare token or any TURN password in chat, screenshots, or git. `.env` is gitignored.

**Emergency: camera is black in a live class**
1. Both sides hard refresh (`Ctrl+Shift+R`). Close extra tabs of the class. Do not Observe the class from an admin tab on the same browser during the test.
2. Open `https://remoedph.com/api/rtc-config`. It must show `"turnConfigured": true` and `turn.cloudflare.com` URLs. If not, the server `.env` is missing the two Cloudflare lines or was not reloaded: fix the lines, then `pm2 restart <app> --update-env`.
3. If the page is fine, look at `pm2 logs <app> --lines 50` for `[hosted-turn] credential request failed`. That means the Key ID or token is wrong or revoked. In Cloudflare → Realtime → TURN, create a new key, update `.env`, restart.
4. One person still black: try the other network (mobile data or Wi-Fi), use Chrome, allow camera permission for the site, and close apps that hold the camera (Zoom, Teams, another browser).
5. Check `chrome://webrtc-internals` during the class. A connection of type `relay` means Cloudflare is carrying the video. No connection at all with Cloudflare listed means the user's network blocks everything; use a different network.
6. If the class cannot proceed, the teacher tells admin or QA. Tier-1 end restores a credit only if one was already spent; do not delete room settings or bookings by hand.
7. Afterwards add the cause to BETATESTER.md → “Fixed bugs log”.

**Do not**
- Re-add Cloudflare port 53 URLs (Chrome blocks them).
- Rely on the Hostinger firewall for 3478 without an outside probe. The firewall must be re-synced after every rule change.
- Share the token with anyone who does not run the server. If it leaks, delete the key in Cloudflare and make a new one.

## Responsive / overlay contract

Do not “fix” overlaps by inventing a higher raw `z-index`. Use [public/css/remoed-layers.css](../public/css/remoed-layers.css). Phone chrome and scroll are easy to regress — see **Phone app shell** below before changing overflow, `position: fixed`, or `portal-layout.js`.

- Breakpoints: phone `≤768`, tablet `769–1024`, desktop `≥1025`. Classroom column stack may stay at 1100px. **Do not add 560 / 720 / 992** for new portal rules.
- Sidebar offset: `--sidebar-width` (260) / `--sidebar-collapsed` (72). On phone, `.remoed-content` margin is 0 (token sheet). Phone has **no sidebar drawer** — overflow is the More sheet (`#remoed-more-sheet`, `--z-modal`). Tablet keeps the 76px icon rail; desktop keeps 260px. Do not restore `global-portal.css` `max-width: 992px` teacher drawer (`z-index: 9999`).
- **Menu icons (student, teacher, admin)** share one vertical line. Expanded rail: each icon is a fixed **20×20** box, row is `justify-content: flex-start`, label sits to the right. Do **not** center the icon together with its label — longer names push the icon sideways and the column looks crooked. Collapsed 72px rail, and the teacher/admin tablet 76px rail: each item is a **40×40** box (`margin: auto`), icon centered, labels hidden. Student tablet (769–1024) keeps the **260px labeled menu** (not the 76px rail) with that same left edge (`student-portal-layout.css`). Shared rules live at the end of `portal-chrome-compact.css`. Bump `portal-chrome-compact.css?v=` when changing them.
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

**Product UI icons** (password, header chips, new controls): use **[Lucide](https://lucide.dev/icons/)** — spec in [`SKILLS.md`](SKILLS.md) § UI icons. Inline SVG, `currentColor`, 24×24 viewBox. Password visibility is Lucide **eye** / **eye-off** via `public/js/password-toggle.js`. Do not use emoji for those controls. Existing landing Font Awesome circles may stay until a dedicated Lucide restyle; new icons should not introduce a third set.

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

Product spec: [`SKILLS.md`](SKILLS.md) § Gamification. Lesson **credits** stay separate from Eco-Drops.

- Page: [`public/student-virtual-garden.html`](../public/student-virtual-garden.html) + [`public/css/student-virtual-garden.css`](../public/css/student-virtual-garden.css) (`?v=garden-3+`). Sidebar id `garden` in `student-sidebar.js`; header Eco-Drop chip in `student-page-header.js`.
- APIs (`server/student.js`, student Bearer): `GET /api/student/eco-drops`, `GET /api/student/garden`, `POST /api/student/garden/action`, `POST /api/student/lessons/complete` (backfill only).
- Identity: routes must use **`gardenStudentKey(req)`** → `req.student.username` (from `requireStudent`). Do **not** pass JWT `studentId` (Mongo `_id`) alone into garden lookup — that caused **404 Student not found**. `findStudentDoc` also accepts `_id` / email / username / `studentCode`.
- Award hook: first `LessonProgress` → `completed` in `upsertLessonProgressFromBooking` (+ direct `POST /api/lessons/progress/update`). Idempotent via `EcoDropLedger`.
- **Layout (100% zoom):** keep portal `remoed-content` max-width `calc(100vw - sidebar)`. Never set `max-width: none` on garden content (overflows past the rail). Use `minmax(0, 1fr)`, `overflow-x: hidden`, and stack shop under the plot ≤1100px.

## Play & Learn — picture games (ages 3–6)

- Page: [`public/student-games-activities.html`](../public/student-games-activities.html) (sidebar id `games`, header `StudentPageHeader.render('games')`). Logic in [`public/js/student-play-learn.js`](../public/js/student-play-learn.js), words in [`public/js/student-play-words.js`](../public/js/student-play-words.js), styles in [`public/css/student-play-learn.css`](../public/css/student-play-learn.css) (scoped to `body.page-student-games-activities`).
- Home lists **categories**. The first category is **Vocabulary and Listening** with four games: Pop the Bubbles, Mystery Box, Feed the Teddy Bear, Hide and Seek. Add a game as an entry in a category's `games` array; add a category as an entry in `CATEGORIES`. Hash routes: `#/`, `#/<category>`, `#/<category>/<game>`; Back from a game returns to its category.
- Client only: no API, no Mongo writes, no scores saved. Play & Learn stays open on the free plan (no `feature-access.js` lock on this page).
- Narration uses browser `speechSynthesis`; effects use Web Audio. Each game opens with a **Start** button so audio unlocks on a real tap. Mystery Box "My turn" uses SpeechRecognition when the browser has it; every round can be finished without the mic.
- Pictures: transparent PNGs in [`public/images/play-learn/`](../public/images/play-learn/) (16 words plus `bubble`, `gift`, `teddy-hungry`) and `room.jpg` for Hide and Seek. Game pictures are storybook 3D illustrations; the feed game uses a hungry teddy bear (the owner rejected the horned monster, so keep the teddy). Lucide is only for controls (back, hear again, star, mic). Word pictures have no faces so children can name them.
- Phone: four bubbles max under 560px stage width; the Hide and Seek room is 780px wide inside its own horizontal swipe strip (`.remoed-main` stays the only vertical scroller). Feed the Teddy Bear places the tray beside the teddy bear above 1024px.
- The old level tabs and five quizzes are gone. `public/js/student-games-data.js` is no longer loaded.

## Admin Fee & Attendance

- Page: `public/admin-fee.html` — bi-monthly 2% (`COMMISSION_RATE` in `server/adminFeeRoutes.js`) of subscription `creditHistory` purchases, eligibility, attendance history, printable payslip. **No Time In/Out UI on Admin Fee** (clock only from top header or Admin Dashboard via `/api/admin/time-tracking/*`). Login must **never** auto clock-in.
- Admin dashboard Time In (header mini **and** middle card): `public/js/admin-time-tracking.js` (`?v=tt-4+`; also loaded from `admin-page-header.js`). Singleton + document capture + inline `onclick` on card buttons. Status poll is read-only — it does not POST clock-in.
- **One punch per business day** (7 AM PHT cutoff): after Time Out, status is **Daily Time Log Completed** until the next business day. **Time Out must confirm** before POST (accidental outs lock the day).
- **Teacher time-log edit requests** (Dashboard → Time Tracking → **Time Log Edit Requests**, any admin): teacher **Request Admin Edit** creates an unread `time_edit` notification. `GET /api/admin/time-log-requests` and `POST /api/admin/review-time-log-request` require an admin JWT. Approve sets that teacher’s Time In / Time Out (Philippine time) and marks the request read. Reject does not change the punch. This is separate from Super-Admin **View Logs**, which only edits **admin** shifts.
- **Super-Admin time-log correction** (Dashboard → **View Logs** only; gated by `requireSuperAdminDb`):
  - `GET /api/admin/time-tracking/manage?username=&startDate=&endDate=` — all `logOwnerType: 'admin'` logs (filter by admin).
  - `PATCH /api/admin/time-tracking/logs/:id` — `{ action: 'reopen' }` clears `clockOut` / sets `clocked-in` so the admin can continue; `{ action: 'edit', clockIn, clockOut }` sets HH:MM Philippine time (`clockOut: null` = leave open). Always re-sync `AdminAttendance` via `syncAdminAttendanceFromTimeLog`.
  - UI: admin filter + **Reopen shift** / **Edit times**. Non–Super-Admin still use `GET /api/admin/time-tracking/history` (own logs only) with no edit actions.
  - Do **not** remove Super-Admin-only guards or expose PATCH to other roles.
- Models: `TimeLog` (`teacherId` = `admin:<username>`, `logOwnerType: 'admin'`), `AdminAttendance` (`admin_attendance`), `AdminPayout` (`admin_payouts`); punches sync from TimeLog.
- APIs (Admin Fee): `/api/admin/admin-fee/summary`, `/attendance`, `/payslip`, `/record-payout`, **`/payroll`**, **`/dispense`**, **`/payment-history`**, **`/admins-filter-list`** in `server/adminFeeRoutes.js`.
- Eligibility (all admin roles, including Super-Admin): a time-in with at least **6 hours** worked on **every Monday to Friday** of the cutoff (`evaluateWeekdayAttendance` in `server/services/adminAttendanceSync.js`, PH business date). Weekends are optional and still count toward hours. Mid-cutoff the page shows **On track** until the last weekday is done; one missed or short weekday makes the period ineligible. Each eligible admin receives **2%** of that period’s gross subscription sales. Ineligible rows stay listed at ₱0; dispense skips them server-side.
- **Payroll withdraw (MariBank only):**
  1. Accounting **Dispense** → `DISBURSED` / `disbursed` (release — not bank-final). Prior cut-off rows still `DISBURSED` (not withdrawn) are folded into the new release as **carry-forward** and marked `ROLLED_OVER`.
  2. Teacher Teaching Fee / Admin Fee → **Withdraw (MariBank)** → `WITHDRAWAL_REQUESTED` / `withdrawal_requested` + masked `payoutReference` only. Full account details email to `support@remoedph.com` via `sendRawEmail` — **ops notice only; do not treat email as the completion step**.
  3. Accounting **Mark Completed** in portal UI only: **Accounting Hub → Payroll Management** (teachers) or **Admin Payroll** (admins) → **Payment History Management** → Load Records → **Mark Completed** on Processing / withdrawal-requested rows → `COMPLETED` / `completed` (`POST /api/admin/payroll/complete`, `POST /api/admin/admin-fee/complete`).
  - **Minimum withdraw:** ₱100. Below that, Withdraw is hidden / rejected; balance stays until next dispense (carry-forward).
  - **Daily MariBank limit:** ₱50,000 (UI note when Available exceeds the cap; teachers may need multiple days).
  - Legacy `Success` / `paid` = Completed (no Withdraw). Open MariBank: `https://maribank.ph/c/earnfreemoney?referralCode=KB740303`. Shared UI: `public/js/payroll-withdraw-modal.js`. Withdraw APIs: `POST /api/teacher/payroll/withdraw`, `POST /api/admin/admin-fee/withdraw`. Service: `server/services/payrollWithdrawService.js` (`MIN_WITHDRAW_PHP`, `MAX_DAILY_WITHDRAW_PHP`, `collectCarryForwardFromHistory`).
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

- HR Hub iframes (`admin-hr-hub.html`) load with `?adminEmbed=1`. Embedded pages must **not** call `AdminSidebar.render` in that mode. Teacher Training and Teacher Schedule follow the same gate as Users and Pipeline. `css/admin-hub-embed.css` hides `#admin-sidebar-root` inside `html.admin-embed`. Bump `embedVer` when those pages change.
- Page: `public/admin-hr-documents.html` (HR Hub Documents; Super-Admin / HR).
- Teachers table includes **Gov ID**, **NBI**, **NBI status** (same idea as Admins). Detail modal can **Save status** via `PATCH /api/admin/hr-documents/:personType/:personId/nbi-status`.
- Teachers upload NBI under Profile → Documents → **NBI** (`documents.nbiClearances`, `nbiClearanceStatus`). Upload auto-sets status to `submitted` when previously `none`/`pending`.

## Student family / emergency (admin View Profile)

- Student profile: Parent/Guardian name, contact, **email**; Emergency contact **person** + **number** (`parentEmail`, `emergencyContactPerson`, `emergencyContactNumber`; legacy `emergencyContact` still synced as combined text).
- Admin **View Profile** (`admin-view-user-profile.html?type=student`) shows birthday, parent fields, and emergency person/number. Do not strip these from `GET /api/admin/user/:id?type=student`.

## Student My Level — CEFR alignment images

- `public/student-assessment.html` intro + results show RemoEd Kids / RemoEd Pre-Teens (7 to 12 years old) guides (`public/images/cefr/*-cefr-guide.jpg`) with tab switch + lightbox. The second guide was RemoEd Teens; the tab, captions, and chart title now say RemoEd Pre-Teens. Keep both images; do not remove the guides section when editing assessment copy.
- Landing `#plans` prices are **PHP first**: `.plan-price`, the Save badges, and the per-class / Founder Discount lines are pesos at the checkout rate `EXCHANGE_RATE_USED` (60.03) in `index.html` (USD × 60.03). If USD prices or that rate change, update these static peso amounts too. The **Also show in** converter (`public/js/plan-currency-converter.js`, `GET /api/public/fx-rates`) fills `.plan-price-local[data-usd]` in USD (default) or any other currency at the live rate (choice saved in `localStorage` `remoed_plan_currency`; PHP is not in the list). Display only; checkout, PayMongo, and QR payments still charge PHP at 60.03. Keep `CHECKOUT_PHP_RATE` in the converter equal to `EXCHANGE_RATE_USED`.
- After guest assessment completes, landing `#plans` shows level + **You have taken the assessment…** with **Register Now** (hides the pre-assessment register note). Same email cannot retake: `GET /api/public/assessment-status` + landing form / guest assessment gate → “Assessment already taken. Please check your email…”.
- Assessment email **Claim Free Trial** link includes `trial` + `email`. Register page asks **student first name → last name → email** (then username/password). Prefill via query + `GET /api/public/assessment-trial/:token`. Trial links **do not expire**; the only hard block is **email already registered**. Stale/invalid tokens must not block first-time signup (`POST /api/auth/student-register` resolves unredeemed trial by email).

## Teaching Fee — Bonus / Incentive (Accounting)

Below **Period fee (rate × completed classes)** on Teaching Fee (`teacher-service-fee.html`). Not automatic monthly pay.

- **Who enters it:** Accounting (and Super-Admin) on **Accounting Hub → Payroll Management** for the selected bi-monthly cut-off (`periodKey` `YYYY-MM-1` or `YYYY-MM-2`). Teachers see the amount read-only.
- **What it is:** Founder's discretion — e.g. successful student plan purchase referral bonus, internet aid, or other one-off incentives. Amount can be ₱0.
- **Storage:** `Teacher.periodIncentives[]` `{ periodKey, amount, note, updatedAt, updatedBy }`.
- **APIs:** `PUT /api/admin/teacher-period-incentive`; teacher `GET /api/teacher/period-incentive?startDate=YYYY-MM-DD`.
- **Available to Withdraw:** Teaching Fee keeps the cut-off amount visible (uses released `paymentHistory.amount`, which may include carry-forward). After the teacher withdraws, the **Withdrawable this cut-off** label changes to **Withdrawn** (amount is not reset to ₱0.00). Header **Total Earnings** is this cut-off’s earned net. Pending Earnings = not yet released.
- **Withdraw rules:** Minimum ₱100; below that, UI notifies that the amount adds to the next cut-off and Withdraw is hidden. Any unwithdrawn `DISBURSED` balance is carried into the next Accounting dispense. MariBank daily max ₱50,000 (informational note when exceeded).
- Do not turn this into a fixed monthly entitlement or auto-compute from referrals without an explicit product change.

## Free Trial teacher tier and referral commission tiers

Source: pricing and margin table (trial rate ₱45 per 25-min class + conversion bonus by plan).

- **Free Trial tier** sits **before Tier 1** (Newbie). Stored as `payoutTierBase: 83` (keep this code; do not switch it to 90 or teachers already on the tier fall off it). Pay is **₱90 per hour, which is ₱45 per 25-minute class**. Credential add-ons do **not** apply. `ratePer25FromTeacher` in [server/utils/teacherPayoutTier.js](server/utils/teacherPayoutTier.js) is what Teaching Fee and payroll use, so a stale `hourlyRate` (the old ₱41.67) does not win. Mirrored in [public/js/teacher-payout-settings.js](public/js/teacher-payout-settings.js) (`TIER_VALUES` starts with 83, `FREE_TRIAL_RATE_PER_25MIN` is 45). Admin sets it in **Users → Professional tier** (`admin-users.html`); Career Growth lists it before Tier 1. Keep server and client tier lists in sync.
- **Referral / Unique Link commission** is tiered by the plan the referred student buys (`server/utils/referralCommissionTiers.js`, used by `awardReferralCommissionOnPayment`): `spark` (1 month) ₱1,000, `steady` (3 months) ₱1,500, `scholar` (6 months) ₱2,000, `summit` (1 year) ₱2,500. Blank or unknown plan falls back to ₱1,000.
- The shared link is `/index.html?ref=CODE#assessment` (Free Level Assessment). Signup writes a **pending** row with the student name and **₱0**. Commission is awarded once, on the first plan purchase. A later purchase does not add another bonus.
- A Free Trial teacher whose own link brings a subscriber earns **both**: the trial rate on their trial classes and the plan-tier commission. They are separate payouts (no automatic Bonus / Incentive entry).
- A commission already marked `successful` keeps its amount. Duplicate webhooks, reconcile, and later renewals must **not** rewrite it. Rows created before 2026-10-05 stay at the old flat ₱1,000 (no backfill).
- Teacher copy lives in `teacher-referrals.html`, `teacher-dashboard.html`, and `admin-unique-link-commission.html`. The admin’s own card on `admin-dashboard.html` uses the same layout and the same ₱1,000 to ₱2,500 range, with stats on `admin-referrals.html` (`GET /api/admin/referral-link/stats`, identity from the admin JWT). Marketing Hub still lists every teacher. Update these pages if the amounts change.
- The link is built in `GET /api/teacher/referral-link` (`server/teacher.js`) and the two admin `subscriptionLink` values in `server/admin.js`. Client fallbacks in `teacher-referrals.html`, `admin-referrals.html`, and the teacher dashboard use the same `#assessment` hash. Do not point a new official link at `#plans`.
- Referral Rewards: the intro says the name appears at signup and the bonus waits for the first plan purchase. **Successful enrollees** uses `successfulCount`. The note under it is `Signed up, waiting for a first plan purchase: N` from `pendingCount`. A pending row reads **Signed up — bonus after first plan**. A successful row reads **Plan purchased**.
- Teacher **Lessons Library** (`teacher-lessons-library.html`) shows each lesson’s **Teacher notes** (read-only). The same notes are the live-class cheat sheet. Students do not receive `teacherNotes`. Admins edit them in Admin → Lessons Library.
- Level 1 Little Seeds (`69cafcd18e3e63155ed30c59`), Level 3 Saplings (`6aa2055cc2cc3a5a0b20f559`), and Level 4 Young Stewards (`6aa20571c2cc3a5a0b20f562`) have Lesson Description and Teacher Notes for lessons 1–22 in Atlas `test`. Level 2 Sprouts and Free Trial Lessons stay as they were. Existing titles and uploaded files stay. Level 3 lessons 7–12 were created with notes and empty `files`. Description is Unit, Core Pillars, Target Vocabulary, and Target Sentence. Notes are the teacher guidebook, then each slide’s **Teacher Script & TPR** only. Duration is 25. Rebuild only with `scripts/build-lesson-notes.py` and `scripts/apply-lesson-notes.js`, and only against database `test`. Do not re-run the Level 2-only scripts.
- Lesson files are view-only inside RemoEd. Do not add a Download button in the teacher or admin Lessons Library, the live classroom, or `video-room.html`. `GET /api/lessons/lesson-file/:id/raw?download=1` returns 403. Opening the Microsoft PowerPoint file link in a browser tab is refused; the in-class viewer still loads it.

## Soft-launch calling cards

Printable 3.5 in × 2 in cards for the launch team. They live in Google Drive folder **RemoEd PH Soft Launch** (`1GEaOAy-RRK5tztI9F-_m1MXksUwvMeew`): [RemoEdPH-Calling-Cards.html](https://drive.google.com/file/d/17Pg84s3YZCGR3pib571qcAfgNyv1cIGJ/view) and the [design spec](https://docs.google.com/document/d/13HEuucegH9zMproOY2atRd-2jF76GqRSBqLMNgff7HA/edit).

- Front mark is the icon-only open book with the yellow signal, and the word RemoEdPH beside it. Keep that icon. Do not swap in the favicon that already includes the wordmark, and do not replace it with a simplified drawing.
- Every QR code opens `https://remoedph.com/index.html#assessment`. There is no per-person referral code on the card and no link editor.
- Each Letter page holds eight cards, two of each person, in this order: Kristine, Kristine, Patrick, Patrick, Jeremiah, Jeremiah, Samuel, Samuel. Page 1 is the fronts. Page 2 is the backs, in the same positions. Do not print the “name · front” or “name · back” labels above the cards.
- Phone and professional email stay blank until they are filled in the `TEAM` list in the HTML. Do not invent them.
- Print from Chrome while online so the QR images can load: Letter, margins None, scale 100%, Background graphics on. Cut on the corner marks.
- The print file the team opens is `D:\Users\Window11\Downloads\RemoEdPH-Calling-Cards.html`. The Drive copy is the earlier four-card version.

## Lesson slide generation — laptop Level folders

After generating or rebuilding RemoEd lesson PPTX decks, always keep a laptop copy under the matching **Level** folder (not only the repo).

| Piece | Location |
|-------|----------|
| Brief / character rules | [`docs/lesson-references/README.md`](lesson-references/README.md), [`.cursor/skills/remoed-lesson-creation/SKILL.md`](../skills/remoed-lesson-creation/SKILL.md) |
| In-repo canonical | `docs/lesson-references/lessons/L2M1-Lesson-{N}/` (+ flat copy under `docs/lesson-references/`) |
| Build / chrome | `docs/lesson-references/build_l2m1_lessons_7_9.py` (`build_lesson`), `build_l2m1_lessons_10_12.py`, `build_l2m1_lessons_13_15.py`, `build_l2m1_lessons_16_18.py`, `build_l2m1_lessons_19_22.py`, `build_l3m1_lessons_1_3.py`, `build_l3m1_lessons_4_6.py` |
| **Laptop download (required)** | `D:\Users\Window11\Desktop\JeanDesktop\RemoEdPH\A Lesson and Training Materials\Level {1\|2\|3\|4}\` |
| Filename pattern | `RemoEd L2M1-Lesson-{N}-{Title}.pptx` (Level 2 Sprouts Month 1; other levels use their own prefix) |

**Rules:**

- Save **per Level folder** (`Level 1` … `Level 4`) — do not dump all levels into one flat directory.
- `build_lesson` in `build_l2m1_lessons_7_9.py` copies to the laptop `Level {N}` path automatically (`lesson["level"]`, default **2**). If the desktop path is missing, log a warning but still write the repo copy.
- Optional Drive upload remains manual ([Drive – Level 2 Month 1](https://drive.google.com/drive/u/0/folders/14Fd0Miq10eEIVPCFVgXG36055a9ho3Xk)); laptop Level folders are the day-to-day download destination.
- Style / chrome: green Remo, Filipino Ed/Sofie/Teacher Grace, no Teacher Scripts, level-month footer + logo overlays — see remoed-lesson-creation skill. **Lesson briefs, character stills, and curriculum PDFs live in `docs/lesson-references/`** ([`README.md`](lesson-references/README.md)); do not use `.cursor/docs/reference.md` as the lesson brief.
- Sprouts Month 1 lessons **19–22** (Honoring My Friends, Virtual Garden Challenge 1, Virtual Garden Challenge 2, Monthly Celebration) use `build_l2m1_lessons_19_22.py`. Uppercase A, B, and C are drawn in code on the phonics slides so the letter shapes stay correct. PDF footers that say Level 1 still publish as Level 2 – Sprouts.
- `build_lesson` uses `lesson["footer"]` (default `SPROUTS! MONTH 1`) and the length of `lesson["pages"]` for the page badge. Saplings Month 1 lessons **1–6** (`build_l3m1_lessons_1_3.py`, `build_l3m1_lessons_4_6.py`) are Level 3, footer `SAPLINGS! MONTH 1`, **18** pages, laptop folder `Level 3`, filenames `RemoEd L3M1-Lesson-{N}-….pptx`. Phonics letters and the name badge are drawn in code. Lessons 4–6 cover asking before apps, “God made me unique!”, and honoring each person.

## Security — do not reopen

Full checklist: [`.cursor/docs/SECURITY.md`](SECURITY.md). Update both files whenever a route, socket room, or auth rule changes.

- Public on purpose (keep open): `GET /api/teacher/slots`, public teacher profile / landing / directory, student booking, obfuscated admin login path, `/api/public/*` assessment, `POST /api/applications`, `teacher-profiles/` uploads.
- Teacher debug routes stay removed: `/api/teacher/test`, `/timezone-debug`, `/booking-test/:id`, `/test-remove-slide`, and the unauthenticated `/api/teacher/teacher/completed-classes`.
- `GET /api/teacher/booking/by-classroom/:id` needs a token for that booking's teacher or student (or an admin). Students reach it through the `studentMayCallThisTeacherRoute` allowlist.
- `GET /api/teacher/dashboard-stats` returns only the signed-in teacher. `GET /api/teacher/classes?teacherId&week` requires the matching teacher Bearer (`teacher-open-class.html` sends it).
- `GET /api/teacher/slots` resolves an email-shaped id with `resolveToCanonicalTeacherId` (stored `Teacher.teacherId`, current email, username in any case). Profile email and username edits do not rewrite `Teacher.teacherId`. A teacher Bearer must still match that canonical id.
- Message / notification socket rooms (`teacher-msg:`, `student-msg:`, `admin-msg:`, `notif:*`) come from the verified JWT via `resolveSocketIdentity` in `server/index.js`; clients send `token` in the join payload.
- `verifyToken` must not log Authorization headers or decoded tokens.
- Helmet CSP stays off until a dedicated inline-script cleanup pass. `Cross-Origin-Resource-Policy` is `cross-origin` so chat apps can show the homepage share picture. `/` and `/index.html` rewrite that picture URL to the host in the shared link.

## Known product gates (not bugs)

| Code | Meaning |
|------|---------|
| `SUBSCRIPTION_REQUIRED_LESSON_2` | Not subscribed / no credits / no trial |
| `CREDITS_EXPIRED` | Unused credits expired after validity window |
| `INSUFFICIENT_CREDITS` | `creditBalance` is 0 |
| `DAILY_CLASS_LIMIT` | Removed: students have no per-day booking cap |
| `TRIAL_LESSON_1_ONLY` | Old client code. The server no longer returns it. Free booking uses the `FREE_PLAN_*` codes. |
| `FREE_PLAN_LESSON_ONLY` | A free student tried to book a growth level. Only the 3 Pre-Level lessons are open. |
| `FREE_PLAN_SEQUENCE` | The free student must book the next of the 3 lessons, in order. |
| `FREE_PLAN_ALREADY_BOOKED` | A free lesson is already booked. Finish it, or cancel it before it starts, before booking the next. |
| `FREE_PLAN_TRIAL_TEACHER_ONLY` | A free student picked a slot owned by a teacher who is not on the Free Trial tier. Free plan classes are with Free Trial teachers only. |
| `FREE_PLAN_SEQUENCE_DONE` | All 3 free lessons are finished. A subscription is required for the growth levels. |
| `FREE_PLAN_LOCKED` | Videos file URLs and garden actions stay closed on the free plan. The garden page itself still loads. |
| `LESSON_AHEAD_OF_PROGRESS` | The lesson is ahead of that level’s Learning Journey. The student can book the next stop or any earlier lesson. |
| `CHECKPOINT_REQUIRED` | The next lesson stays locked until the student passes that lesson’s assessment. The finished class still counts as done. |
| `WRONG_PORTAL_TOKEN` | Wrong role token for this API path |

## Curriculum levels — Pre-Level

- Settings → **Test student plan** is a Free / Paid switch for username **jeanserolf** only (`Student.planModeOverride`, `GET`/`POST /api/admin/settings/test-student-plan`). Do not apply that field to any other student. Paid still spends that student’s real credits. Free books the next of 3 Pre-Level lessons, with no monthly lesson.
- `Pre-Level` (Free Trial Lessons) is a **curriculum-only** level (`PRE_LEVEL` / `CURRICULUM_DOC_LEVELS` / `normalizeCurriculumDocLevel` in `server/config/curriculumLevels.js`). It stays out of `CURRICULUM_LEVELS`. QA Hub → Lesson Library lists it first. The catalog is exactly these 3 lessons, in order (`FREE_PLAN_LESSON_COUNT` in `server/services/freePlanAccess.js`). There is no monthly free lesson and no 22-lesson free trail.

| # | Library title | File on the lesson |
|---|---------------|--------------------|
| 1 | How to Navigate the Student Portal | Google Slides [RemoEd Orientation Part 1 - Student Portal](https://docs.google.com/presentation/d/1UPe8PcZKgNx_g8OOEanCr5GXvPinNDP1/embed). QA Hub hides Upload on this lesson. |
| 2 | About RemoEd PH | `RemoEd Orientation Part 2 - About RemoEd.pptx` |
| 3 | Welcome Lesson | `RemoEd Welcome Lesson - Hello Friends.pptx` |

- A free student books **the next** unfinished number (`freeLessonCompletedCount` + 1, `freeLessonActiveBookingId`). One open free booking at a time. Cancel before the start clears that booking so the same lesson can be booked again. Completing a class advances the count only when `bookingAdvancesFreePlan` sees an active Pre-Level lesson numbered 1–3. An old deleted free-trial deck does not advance the new count and does not spend a credit (`Booking.isFreePlanBooking`). `Student.freeLessonCompletedCount` max is 3. `freeLessonPeriodKey` is unused for the gate. Every new student (all signup paths) starts at 0 of 3. `POST /api/student/reschedule-class` keeps `isFreePlanBooking`, `lessonId` and `studentLevel` on the new booking (same teacher) and moves `freeLessonActiveBookingId` to it.
- Paid students (spark/steady/scholar/summit lot with credits left, or an active paid subscription) keep the credit path and the four growth levels. They may still book these 3 lessons, and that booking does not decrement `creditBalance`. A leftover welcome credit does not unlock growth levels. New registration does not grant that credit.
- These 3 orientation lessons do **not** mark Little Seeds, Sprouts, Saplings, or Young Stewards stops complete. Any other finished class does. A class on a growth level marks that lesson number. A finished class stored as Pre-Level (and not one of these 3) marks the next open stop, so one finished class leaves lesson 1 done and Remo on lesson 2. My Classes shows **Student Absent** or **Teacher Absent** ahead of Finished. A booking stored as `completed` with `absentType` or `absentMarkedAt` is still an absence. `finishedAt` alone, or `pending_feedback`, does not move the map. Remo stands on the first growth lesson that is not finished.
- Free students book **Free Trial teachers only** (`payoutTierBase: 83`, or a legacy ₱45 `hourlyRate`; `isFreeTrialTeacher` in `server/utils/teacherPayoutTier.js`). `runBookSlot` returns 403 `FREE_PLAN_TRIAL_TEACHER_ONLY` for any other teacher. `GET /api/teacher/slots` (all-slots mode) and `GET /api/teacher/available-teachers` add a `freeTrialTeacher` flag; `student-book.html` shows free students only those slots and teachers and ignores the single-teacher calendar prefill. Paid students may book any teacher, including Free Trial teachers.
- Videos, the learning journey, and garden actions stay locked for free students (`FREE_PLAN_LOCKED`). Play & Learn stays open.
- `scripts/import-free-trial-lessons.js` is retired. Do not re-import the old Hello / Letter decks. `scripts/replace-free-trial-lessons.js` replaces the catalog only when it is not already these 3 titles. A second run must leave uploaded files in place.
- Do **not** add it to `CURRICULUM_LEVELS`, `Booking.studentLevel`, or `normalizeCurriculumLevel` — those drive student leveling, credits and the leaderboard.

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

## Baseline updates — 2026-09-27 to 2026-10-01

Checklist: [FEATURES_SINCE_2026-09-27.md](FEATURES_SINCE_2026-09-27.md).

| Area | What shipped |
|------|----------------|
| Announcements | Topic list and post-history filter. |
| Phones / layout | Country calling codes. Sidebar icons stay on one vertical line. Notification dropdown sits under the bell. |
| Credits / Play & Learn | Typing quiz. Credit lots still expire and burn FIFO. |
| Pre-Level free plan | Next of 3 lessons (How to Navigate the Student Portal, About RemoEd PH, Welcome). No monthly lesson. Growth levels stay paid. Videos, journey, and garden stay locked. |
| Privacy | Version `2026-10-01`. Required on register, book, and logged-in checkout. Accept checkbox on My Profile. International students, same rules. |
| Absent | Live classroom is Finish only (after 15 minutes). Student Absent and Report Issue are on Class Information once the class has started. Closing the tab does not auto-tag absent. |
| Emergency excuse | QA Other issue and teacher cancellation: disaster, calamity, power maintenance or outage, accident, death, emergency. Proof required. Penalty waived (teacher still paid 100% on a resolved class). Student reschedule window is one month. |
| Classroom SOS | Teacher Emergency SOS, admin Classroom SOS with status legend, emergency guidelines page with sidebar and header. |

## Baseline updates — 2026-10-02 to 2026-10-05

Bug history and recovery steps live in [BETATESTER.md](BETATESTER.md) → “Fixed bugs log”. Read it before debugging a symptom that sounds familiar.

| Area | What shipped |
|------|----------------|
| Student booking | The per-day class cap is gone (`DAILY_CLASS_LIMIT` helpers deleted from `studentBookSlotService.js`; `MAX_CLASSES_PER_DAY = Infinity` and the “Day full” legend removed in `student-book.html`). Credits, lesson gates, and slot conflicts still apply. |
| Session handling | `public/js/user-session.js` no longer logs a student out on a business-gate 403 (`CONSENT_REQUIRED` etc.). This fixed “I get logged out when I press Book”. |
| Classroom camera | Single socket per role per room, signaling only between the current teacher and student, observers never create or answer offers, webcam never goes to the lesson stage, camera released on replace/pagehide. ICE restart waits 15 s (cooldown 20 s). `/api/rtc-config` is public and registered before the `verifyToken` routers. |
| Camera relay | Hosted Cloudflare TURN is the production relay (confirmed live on `/api/rtc-config`). The own coturn on the Hostinger VPS (187.77.159.63) was blocked by the hPanel firewall, so it was stopped and disabled and its `TURN_*` lines were removed. Emergency steps are in “Camera relay configuration and emergency guidelines”. |
| Teacher payout / referrals | **Free Trial** tier before Tier 1 pays **₱90/hr (₱45 per 25-min class)**, no add-ons. Stored code stays `83`. Payroll uses `ratePer25FromTeacher`, not a stale `hourlyRate`. Referral commission is tiered by plan: ₱1,000 / ₱1,500 / ₱2,000 / ₱2,500. Existing commissions are not rewritten. |
| Class connection | Direct-first ICE (TURN is fallback; `?relay=1` forces relay). Webcam upload cap 500 kbps. Socket reconnects without a limit and again when the network or the tab returns. Do not put a second `reconnectionAttempts` key back. |
| Class chat | Saved per room until Finish, then deleted (`classroom_chats`, 24h TTL if Finish never happens). “Pat is typing...” (first name) while the other person types. Teacher/admin Messages are not cleared. |
| Weak camera | Do not swap a joined camera to “Waiting for…” on a weak connection. Keep the tile black with their name until `user-left`. QA still counts that as the student in class. |
| Notifications | **Mark all as read** is on the teacher, student, and admin bells (panel header and the filter row). |
| Soft-launch QR | Settings → Student payment switch chooses MariBank QR or PayMongo (`GlobalSettings.studentPaymentMethod`). PayMongo `create-link` stays. QR transaction number does not add credits; Accounting confirm does. |
| Lesson decks | Microsoft PowerPoint viewer with signed link; Cloudmersive removed; 10 MB image recompression; `FRONTEND_URL` normalized to https with a startup log. |
| Classroom layout | Teacher media-lock buttons are 32 px icon buttons; chat stays visible beside smaller video tiles. |
| Admin | Classroom SOS is a tab in QA Hub; admin sidebar assets at `?v=app-shell-17`. |

## Student portal Kids mode and Parents mode

The full student menu is **Parents mode**. **Kids mode** keeps Dashboard, My Schedule, Book a Class, Play & Learn, Videos, My Learning Journey, and Virtual Garden, with larger type (`body.student-kids-mode`). My Profile and My Level stay on Parents mode. Direct visits to those pages redirect to the dashboard. The Kids home shows the next class (Book a Class, or Join when a class exists), Play & Learn, Videos, and Virtual Garden, the level name without a lesson count, stars earned from the teacher (`starsEarned` on student dashboard-stats, `feedbackRole: teacher_to_student`), eco-drops, plants in the garden, and the current unfinished lesson. The water-drop toy stays; the numeric eco score stays hidden on the kids home. The header keeps the same title, current level, mode switch, eco-drops, and calendar in both modes. Kids mode hides the profile icon and the notification bell. The page hides parent counts, plan and credit banners, and announcements. The selected menu label is dark blue (`#1e3a8a`) on the white pill. Kids mode also uses the round Nunito face, a sky-to-purple sidebar, and pastel cards. Parents mode keeps the regular portal colors and the full dashboard. The book item stays “Book a Class” in Kids mode. The header switch is in `student-page-header.js`. Opening Parents mode after Kids mode has been used requires the parent’s 4-digit PIN (`Student.parentPinHash`, set on first switch, bcrypt, never returned). Five wrong tries lock the switch for 10 minutes. Kids mode does not ask for a PIN. Do not store the PIN in the browser. The PIN card is at most 420px wide. The PIN field and the confirm field use `box-sizing: border-box` and stay inside the card. The two buttons may wrap.

## Classroom SOS tiers

The existing Emergency SOS button, 15-second withdraw, one open incident per class, observer link, pause, and end stay in place. Categories still map to tiers: technical failure is Tier 1, unaccompanied child under 6 is Tier 2, unauthorized adult and safety or distress are Tier 3. QA does not join or end a Tier 1 class unless they escalate it. Escalation records the previous tier and cannot move down. Tier 3 resolve or end asks for a reason and leaves `reviewStatus` pending until someone records the review. Parent contact is a written note by QA, not an automatic message. The classroom actions are the existing observer page and socket pause or end. They are recorded as `command_sent`, not as a third-party meeting API result.

## Attendance exceptions

Teachers and admins time in through the existing `TimeLog` routes. An open session is closed by the server at the next cutoff (default **07:00 Asia/Manila** the morning after the business date, `ATTENDANCE_CLOSE_HOUR` / `ATTENDANCE_TIMEZONE`). That system time-out is stored as `systemClockOut` and `clockOutSource: SYSTEM_AUTOMATIC`. It is not verified working time and does not deduct salary. The employee submits a correction; HR with `hr:attendance_review` approves or rejects it from HR Hub → Attendance exceptions. Time In stays blocked until every mandatory exception is approved. The account is not locked. Confirmed negligence is a separate classification and is never set by the automatic close. Audit rows in `attendance_audits` are append-only. Super-Admin is exempt: the session still closes, and that owner is not blocked and does not stay in the review queue.

## Baseline updates — 2026-10-06 to 2026-10-12

| Area | What shipped |
|------|----------------|
| Class end | Live classes hard-stop 40 minutes after the scheduled start, including when the teacher only closes the tab. Stored duration is capped at 40. This does not mark the student absent and does not consume a credit. Finish stays locked for the first 15 minutes. |
| Class feedback | Teachers can open and save Complete Class & Feedback until the salary date (15th or last day of the month, Philippine time), including classes already marked completed. A second save does not charge the credit again. A completed class with no feedback keeps Give Feedback until that cut-off. |
| Absent and issues | Student-absent classes cannot be turned into Complete Feedback. A Report Issue class cannot use class feedback while QA is pending or after QA resolves. QA still sets the fee (system or student 100%, teacher fault 20%, valid emergency with proof waived and 100%). A dismissed report can still use normal feedback. |
| Lesson order | Paid students book the next Learning Journey stop or any earlier lesson (`LESSON_AHEAD_OF_PROGRESS`). The map moves when the class is completed or Lesson Progress is completed. An absence does not count. One other finished class marks lesson 1 done and leaves Remo on lesson 2. The 3 orientation lessons do not move that map. A published checkpoint keeps the next lesson locked (`CHECKPOINT_REQUIRED`) until the student passes. The Learning Journey shows a wall until then. A lesson with no checkpoint still opens the next lesson. |
| Free plan lessons | The old 22 monthly free-trial decks are gone. Free Trial Lessons is 3 lessons: How to Navigate the Student Portal (Google Slides, no upload box), About RemoEd PH, and Welcome. A free student books the next one after the current class is finished. There is no monthly lesson. |
| Kids and Parents | Kids home shows the next class, play links, level name, teacher stars, eco-drops, garden, and current lesson. Parent stats, profile, and My Level stay on Parents mode. The parent PIN field stays inside the card. |
| QA issue review | On Issue Management, the card opens Review Issue or Update Review. Mark Resolved and Dismiss are on that review modal. Mark Resolved then opens the existing resolve modal. |
| QA recording | Start only after the student is in the room, including a few minutes early. The recorder does not stop itself and does not close the tab. The teacher clicks Stop at the usual end (:25 on the hour, :55 for a :30 class), then Finish. A clip is about 25 minutes, or about 30 if the student came early, or shorter if late. The QA file is 480p (canvas clone, 8 fps); the student slide share stays full size. Server transcode also caps at 480p so a 25-minute clip stays small enough to download. Chunk uploads are not keepalive requests. An empty upload is marked failed after 30 minutes. Download uses the newest GridFS copy that has bytes. A second Finish on an already complete recording does not rebuild it. |
| Test student plan | Settings has a Free plan / Paid plan switch for username jeanserolf only. Other students keep their real plan. |
| Attendance exceptions | A missed time-out is closed by the server and blocks the next Time In until HR approves a correction. The original system close is kept. Negligence is a separate HR decision and does not change pay by itself. Super-Admin is exempt from that block. |
| Classroom SOS tiers | Same incident record. Tier 1 is technical and does not observe or end the class. Tier 2 and Tier 3 can. Escalation only goes up and keeps the first tier. Tier 3 stays pending review after resolve or end. There is no emergency phone number in the app. |

## Baseline updates — 2026-10-13 to 2026-10-14

| Area | What shipped |
|------|----------------|
| Lesson notes | Level 1 Little Seeds, Level 3 Saplings, and Level 4 Young Stewards have Lesson Description and Teacher Notes for lessons 1–22. Level 3 lessons 7–12 were added with notes and no file. Titles and existing PowerPoint files stayed. Level 2 and Free Trial were not rewritten. |
| Referral link | Official teacher and admin links open `/index.html?ref=CODE#assessment`. Signup writes a pending row with the student name and ₱0. The bonus is paid once, on the first plan purchase. Referral Rewards counts successful enrollees from paid purchases only. |
| Calling cards | Downloads file has eight cards per page, two of each person, fronts then backs. Every QR opens `https://remoedph.com/index.html#assessment`. The name · front and name · back labels are gone. |
| Play & Learn | The quiz page became a category list. Vocabulary and Listening holds Pop the Bubbles, Mystery Box, Feed the Teddy Bear, and Hide and Seek with spoken prompts and storybook pictures. Client only, open on the free plan. See § Play & Learn. |
