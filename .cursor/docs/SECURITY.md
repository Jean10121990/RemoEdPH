# RemoEdPH Security Guidelines

Checklist for every feature that adds a route, socket event, page, or query. Read with [`STABLE_BASELINE.md`](STABLE_BASELINE.md) (§ Security) and [`.cursor/rules/remoed-stable-surfaces.mdc`](../rules/remoed-stable-surfaces.mdc).

The database is MongoDB (Mongoose). There is no SQL layer, so "SQL injection" here means **NoSQL / operator injection** and unescaped `$regex`.

## 1. Every API route needs an explicit auth decision

Pick one when you add a route and write it in the handler signature:

| Kind | Pattern |
|------|---------|
| Public on purpose | Listed in § Public allowlist below. Return only public fields (nickname, not legal name). Add a rate limit if it accepts writes or email lookups. |
| Signed-in role | `verifyToken` + `requireTeacher` / `requireStudent`; admin routes go through `adminRoleGate` / `requirePermission(key)`. |
| Owner only | Role middleware **plus** an ownership check: identity comes from the JWT / `req.teacher` / `req.student`, never from `req.query.teacherId` or `req.body.studentId` alone. Compare canonical ids (`resolveToCanonicalTeacherId`, `normalizeId`). |

Rules:

- Never trust `teacherId`, `studentId`, `username`, or `email` from the query or body to pick *whose* data to return. Use it only to reject a mismatch.
- `Booking.studentId` is the student **username**; `Booking.teacherId` is canonical `Teacher.teacherId`.
- Free-plan identity comes from the student JWT, not the request body. A student is paid when a `creditLots` entry is `spark` / `steady` / `scholar` / `summit` with `creditsRemaining > 0`, or `isSubscribed` with `subscriptionStatus === 'active'` and `paymentStatus === 'paid'`. Everyone else is free. Super-Admin `GET`/`POST /api/admin/settings/test-student-plan` (admin JWT + Settings) may set `planModeOverride` to `free` or `paid` only for the allowlist in `server/services/freePlanAccess.js` (`plflores3303@gmail.com`). POST `student` is a string that must match that list (username or email). Other students ignore `planModeOverride`.
- Student portal mode: `GET /api/student/portal-mode`, `POST /api/student/portal-mode/pin`, and `POST /api/student/portal-mode/verify` use the student JWT. The PIN is a 4-digit bcrypt hash on the student record and is never returned. A wrong PIN returns 403 with code `WRONG_PIN` and does not end the student session. Verify locks out for 10 minutes after 5 failures. A wrong account password on PIN reset returns 403 with code `WRONG_ACCOUNT_PASSWORD` and also keeps the session. `POST /api/student/portal-mode/pin/reset` (student JWT, own record from `req.user.studentId`) replaces a forgotten PIN only after the account password matches; it has its own 5-failure / 10-minute lockout. Kids mode is a client view; parent-only pages redirect while Kids mode is on.
- Missed time-out: an open teacher or admin session is closed at 12:00 midnight Asia/Manila (`ATTENDANCE_CLOSE_HOUR` and `ATTENDANCE_ADMIN_CLOSE_HOUR`, both default 0). `POST /api/teacher/time-tracking/clock-in` and `POST /api/admin/time-tracking/clock-in` return `403 ATTENDANCE_EXCEPTION_REQUIRED` while that worker has a blocking attendance exception. The account stays active. Correction routes use the JWT worker id, never a body employee id. HR approve/reject/clarify/classify require `hr:attendance_review`. `GET /api/admin/attendance-exceptions/report` also allows `acct:payroll_view`. Self-approval is rejected. A Super-Admin (owner) is exempt: their missed time-out is still closed by the server, but it does not open a blocking exception, and an existing blocking exception for that role is excused.
- A live class books only when `creditBalance` is greater than 0 (`INSUFFICIENT_CREDITS` or `CREDITS_EXPIRED`). `requirePaidPlan` runs first on both book-class routes and returns 402 `INSUFFICIENT_CREDITS` when `isPaidSubscriber` is false. The Credits page is `student-credits.html`.
- Interactive trial (`GET /api/trials/mine`, `POST /api/trials`, `POST /api/trials/:id/progress`, `POST /api/trials/:id/complete`, `GET /api/trials/:id`) requires a student JWT. The trial parent is `req.student._id`. A body `childId` must match that id or be omitted. One trial per student (`childId` unique). A progress, complete, or load call with a bad id (`current` or any non-ObjectId) loads that same student's trial. Starting again reopens that trial: the chosen theme is saved, answers from the previous run are cleared, and a passed `expiresAt` is renewed for 7 days. Progress and complete save that student's words even when the previous run was completed or expired. They do not answer 410.
- Level assessment leads: `GET /api/admin/level-assessments`, `GET /api/admin/level-assessments/:id/trial-invite`, `POST /api/admin/level-assessments/invite`, and `POST /api/admin/level-assessments/:id/trial-invite` require an admin JWT and `hr:level_assessments`. Signup invites go only to the email stored on an unregistered `AssessmentTrial`. The preview and the trial-invite link are that lead’s own register URL (`trial` + stored email) and are not taken from the request body. `GET /api/admin/level-assessments/proficiency-invite` returns the public free-assessment link (`/index.html#assessment`) and does not send email. `POST /api/admin/level-assessments/proficiency-invite` sends that same message only to the email typed in the request.
- `GET /api/student/lesson-checkpoint` and `POST /api/student/lesson-checkpoint` require a student JWT. Level and lesson number are coerced (level through `normalizeCurriculumLevel`, lesson number 1–220). The student id stored on the attempt is the username from the token. The GET response omits correct answers. The POST scores the submitted choices and returns pass or fail, score percent, and counts. A class that is not finished returns `400 CLASS_NOT_FINISHED`. A lesson with no published checkpoint returns `404 NO_CHECKPOINT`. Booking a later lesson before a required pass returns `400 CHECKPOINT_REQUIRED`.
- Privacy consent is the current version in `server/config/privacyConsent.js`. `POST /api/auth/student-register` returns `400 CONSENT_REQUIRED` unless `privacyConsentAccepted === true`. `POST /api/student/book-class` and a logged-in `POST /api/payments/create-link` return `403 CONSENT_REQUIRED` when that version is missing. `POST /api/student/privacy-consent` (student JWT) records a later acceptance from booking, checkout, or the student profile. The student id comes from the token. IP is stored only on the consent row.
- Social OAuth (`server/routes/oauthRoutes.js`, `server/services/oauthService.js`): `GET /api/auth/oauth/{google|facebook}/start|callback`, `POST /api/auth/oauth/exchange`, `GET /api/auth/oauth/providers` (public, rate-limited). Link/unlink/set-password use the portal JWT (`/me/*`, `/:provider/link`). **Student create via OAuth requires an unredeemed `AssessmentTrial` and a verified provider email matching `parentEmail`**; cold login never inserts a Student. **Teachers** only complete an invite or log in / link an existing account — no public teacher social signup. Admin Google (`intent=admin_login`) matches an existing Admin email or username only — it never creates an admin and never issues a portal JWT. `POST /api/auth/oauth/admin-gate` returns the same authenticator enrollment or 6-digit challenge as password login. Facebook is not offered for admin. State and finish tickets are HMAC-signed (`OAUTH_STATE_SECRET`). Secrets: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`. Issue the same `remoed_student_token` / `remoed_teacher_token` JWTs as password login.
- `POST /api/teacher/classroom-sos` and `POST /api/teacher/classroom-sos/:id/withdraw` require a teacher JWT. The booking owner is the canonical teacher id, not a body id. Withdraw is only while status is `open` and within 15 seconds. Each new case gets a `caseRef`. Tier 1 cannot observe, pause, or end the class (`TIER1_NO_INTERVENTION`) until an admin with `incident:manage` escalates it. Ending a class, pausing Tier 2, resolving Tier 3, parent contact, and supervisory review require a reason. Escalation only raises the tier. Tier 3 resolve or end sets `reviewStatus` to `pending`; it is not closed by a timer.
- Live-class chat is stored per room in `classroom_chats` and deleted when that class ends (`class-finished`, or `POST /api/booking/:id/end-session` for the booking’s teacher). The room is the socket’s joined room, not a room id from the chat body. Typing events use the same room. This is not the teacher/admin Messages store.
- `GET /api/admin/incidents` and `POST /api/admin/incidents/:id/action` require admin auth plus `incident:manage`. The acting admin id comes from the JWT. A `note` action also writes a `PeerMessage` from `admin:<JWT username>` to the incident's stored `teacherId` (never a body id) and emits `peer-message:new` to `teacher-msg:<teacherId>` and that admin's `admin-msg:` room. Observer classroom join (`userType: observer`) is rejected unless `resolveSocketIdentity` returns an admin (`OBSERVER_FORBIDDEN`). A second teacher or student socket in the same room is disconnected. Camera offer, answer, and ICE go only to the other role's current socket.
- `GET /api/admin/time-log-requests` and `POST /api/admin/review-time-log-request` require an admin JWT. They review teacher `time_edit` notifications. The time log id comes from that notification, not from a teacher id in the body. `POST /api/teacher/request-time-edit` is the signed-in teacher and only for that teacher’s own log.
- `GET /api/student/portal-videos` lists titles for free students and omits file URLs. A direct `GET` of `/uploads/portal-videos/…` with a free student token returns `FREE_PLAN_LOCKED`.
- Virtual Garden (`GET /api/garden/current`, `/history`, `/forest`, `/parent`, `/trees/:treeId`, `/trees/:treeId/certificate`, `/:monthKey`, `POST /api/garden/care`, `/plant`, `/decorate`, `/trees/:treeId/claim`, `/parent/sharing`, `/shares`, `/shares/:shareId/revoke`) and Play & Learn. A request with `X-Remoed-View: parent` cannot water, claim, plant, or buy a decoration. `GET /share/:shareId` is public, `noindex`, and shows a first name only. `GET /api/admin/garden-credits` requires an admin JWT with `nav:reports`. (`POST /api/play-learn/games/:gameId/start|finish`) require a student JWT. The student id is `req.student.username` from the token; no route accepts a student id from the client. `monthKey` must match `YYYY-MM`. `POST /care` accepts only `{ action, requestId }` (optional `monthKey` must match the current month or it is `READ_ONLY_TREE`); clients cannot send cost or growth. Unique `requestId` and a conditional spend update prevent double-charge or a negative balance. There is no client “add Eco-Drop” route — awards run only after a lesson, task, or ticket-checked game finish. `GET /api/garden/current` stays readable for free students (`locked: true`). `GET /history` does not create a tree. `GET /api/student/eco-drops` returns `totalEcoDrops` (available), `availableDrops`, `totalEarned`, and `pendingCelebration`.
- Student JWTs may call only the teacher-route allowlist in `server/authMiddleware.js` (`studentMayCallThisTeacherRoute`). **Extend** it for new student needs; do not remove the `WRONG_PORTAL_TOKEN` gate.
- Do not apply blanket `verifyAdminApiAuth` to all `/api/admin/*` — first-time 2FA enrollment (`POST /verify-2fa` with an enrollment Bearer) must still work.
- Scoped admin roles get plain 403 on forbidden APIs; only 401 or `ADMIN_2FA_REQUIRED` / `WRONG_PORTAL_TOKEN` / `ADMIN_SESSION_REVOKED` end the session.

### Public allowlist (keep open)

- `GET /api/teacher/slots`, `GET /api/teacher/available-teachers`, `/api/teacher/public/*`, `GET /api/teacher/public-profile/:id`, `GET /api/teachers/landing`
- `POST /api/student/book-class` (student JWT) and the equivalent `POST /api/teacher/book-class`
- `GET /api/auth/admin-login-path` and the obfuscated admin login page (path hiding is not the access control — 2FA + RBAC are)
- `/api/public/*` assessment routes (rate limited, `express-validator`), `POST /api/applications`. The public landing quiz is anonymous for 5 questions. Name, email, and password are sent only after question 5: `POST /api/student/send-assessment-email` stores the score on `AssessmentTrial`, then `POST /api/auth/student-register` redeems that row onto the new student. The browser then logs in and opens `/trial.html`. Auth on those routes is unchanged.
- `GET /api/payments/plans` (`server/payments.js`): read-only plan price list from `computePlanTotals` (same totals as checkout). Takes no input. Checkout never trusts client prices; `create-link` recomputes from the plan id.
- `GET /api/public/fx-rates` (`server/fxRatesRoutes.js`): read-only USD exchange rates for the landing plan converter and the portal converter (`public/js/currency-converter.js`). Takes no input. The server calls the live source (`api.coinbase.com` exchange rates, no key) at most once a minute, falls back to `open.er-api.com` (daily), and serves the cached copy (2-minute back-off on failure), so visitors cannot make it call out per request. The response has only `base`, `rates` (ISO 4217 currencies only), `updatedAt`, and `live`; no user, payment, or server details. Browsers fetch it same-origin with `credentials: 'omit'`, so the third party never sees users. Page amounts (fees, payroll, payouts, credits) are converted in the browser and are never sent to the server or any third party.
- `GET /api/office-viewer/presentation/:fileId/:token/:name` — Microsoft PowerPoint fetches the lesson deck here with no login. The token is a per-file JWT signed with `JWT_SECRET + ':office-viewer'` (cannot pass as a portal login), valid 6 hours, issued only by authenticated `local-preview` / `secure-embed`. Serves `.ppt` / `.pptx` only; rate limited.
- Lesson embed links (`POST /api/lessons/lesson/:lessonId/upload-file`, teacher or admin JWT) accept Microsoft Office hosts and `https://docs.google.com/presentation/d/{id}/` only. The stored URL is the Google `/embed` form. Other Google hosts and file types are rejected.
- `GET /api/rtc-config` also returns shared, 24-hour Cloudflare TURN credentials when `CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN` are set (`server/services/hostedTurn.js`); the API token stays server-side and the credentials are cached, so this public route does not call Cloudflare per request.
- `GET /api/rtc-config` (registered before the `/api` routers that run `verifyToken`, or it returns 401 and the classroom loses TURN), `/api/health`, `/api`
- Uploads under `teacher-profiles/` only (`server/middleware/uploadsAccess.js`); every other `/uploads/*` needs a token

## 2. No debug or test endpoints in production routers

Do not add routes that echo request headers, return raw bookings, or prove "route is working". Removed on 2026-09-30 and must stay gone:

- `GET /api/teacher/test`, `/timezone-debug`, `/booking-test/:classroomId`, `/test-remove-slide`
- `GET /api/teacher/teacher/completed-classes` (unauthenticated duplicate of `GET /api/teacher/completed-classes`)

Use local scripts or logs for debugging. `GET /api/debug/compression-check` returns padding only; set `DISABLE_COMPRESSION_DEBUG=1` to remove it.

## 3. Socket.IO rooms follow the verified token

- Classroom rooms (`join`, `join-room`) require a valid JWT on the handshake (`disconnectIfClassroomUnauthenticated` in `server/index.js`).
- Personal rooms (`teacher-msg:`, `student-msg:`, `admin-msg:`, `notif:teacher:` / `notif:student:` / `notif:admin:`) are joined only through `resolveSocketIdentity`. The room id comes from the JWT (join payload `token` or handshake), **not** from `data.teacherId` / `data.username`.
- Clients send their portal token in the join payload: `public/js/remoed-notifications.js`, `public/js/admin-notifications.js`, `public/teacher-messages.html`, `public/student-messages.html`.
- New per-user socket rooms must use the same helper. Do not emit private payloads to a room a client can name freely.

## 4. Cross-site scripting (XSS)

- Treat every API string (names, messages, notes, issue text, lesson titles) as untrusted. When building HTML with template strings / `innerHTML`, escape it first (`escapeHtml` helpers already exist in the header and notification scripts) or use `textContent`.
- Do not put user data inside inline `onclick="..."` strings without `encodeURIComponent` / `decodeURIComponent` (pattern used in `public/admin-users.html`).
- Server-rendered HTML (invite error page, emails) escapes `& < >` before interpolating.
- Helmet is on; **CSP is intentionally off** because static pages still use inline handlers. Turning CSP on is a dedicated project — do not flip it in a feature PR.
- Password toggles stay Lucide **eye** / **eye-off** (`public/js/password-toggle.js`).

## 5. NoSQL / regex injection

- Never pass `req.body`, `req.query`, or `req.params` objects straight into `find`, `findOne`, `updateOne`, or `$or`. Cast each field: `String(x).trim()`, `Number(x)`, `mongoose.isValidObjectId(x)`.
- A value like `{ "$ne": null }` in JSON must not reach a query as an object. If a field must be a string, coerce it.
- User search uses escaped regex only: `escapeRegexForSearch` (`server/admin.js`) / `escapeRegexForTeacherLookup` (`server/services/teacherSlotResolve.js`). Never build `new RegExp(userInput)` raw.
- No `$where`, no `eval`, no `new Function` on user input. `child_process` is used only with fixed commands (`execFile` / `spawn` with argument arrays), never a shell string containing user data.

## 6. Tokens, secrets, and logs

- Client keys: `remoed_admin_token` / `remoed_teacher_token` / `remoed_student_token`. Read them via `public/js/remoed-auth-token.js` / `RemoedAdminSession.getAuthToken()`, not bare `localStorage.getItem('token')` in new code.
- Production refuses a weak `JWT_SECRET` (`server/config/jwtSecret.js`). Set `SESSION_SECRET` too. Secrets live in `.env` only — never commit `.env`, credentials, or Atlas URIs.
- Do not log Authorization headers, raw JWTs, decoded token payloads, passwords, or reset tokens. The error handler already masks `user:pass@` in Mongo URIs.
- Logout blacklists the JWT (`server/services/jwtBlacklist.js`); new auth paths must check `isTokenBlacklisted`.
- Admin sessions: 2FA required, `sessionVersion` invalidates other sessions, idle logout in `public/js/admin-session.js`.

## 7. Uploads and files

- Serve uploads through `server/middleware/uploadsAccess.js` (auth-gated). Do not add a new `express.static` on `uploads/`.
- Validate MIME type and size in multer (`limits.fileSize`, `fileFilter`). Keep path joins under the upload root (no `..`).
- Do not delete GridFS `presentations/` or `portal-videos/` to free space.

## 8. Rate limits and abuse

- Login, register, password reset, uploads, peer search, and invite routes use `server/middleware/apiRateLimits.js`. New public write or lookup routes add a limiter.
- `/api/admin` and `/api/credits` sit behind `adminRouterLimiter`.
- CORS allows only configured origins with credentials (`isAllowedOrigin` in `server/index.js`); do not widen to `*`.

## 9. Payments and credits

- PayMongo webhooks verify the signature on the raw body (`/api/webhooks/paymongo` uses `express.raw`). Keep that mount before `express.json`.
- Credits and bookings change only on the server (`creditBalance`, credit lots). Never trust a client-sent price, plan, or credit count.
- Student referral rewards (`GET /api/student/referrals`, `POST /api/student/referrals/ack`, `POST /api/student/referrals/privacy`) use the student JWT and `req.student`. The credit amount is the fixed `REFERRAL_REWARD_CREDITS` inside the PayMongo webhook, never a client value. `GET /signup` redirects to register. `GET /badges/:id` and `GET /u/:username` are public and return only a masked name plus earned badge fields. `/u/:username` is empty when `showBadgesOnProfile` is off.
- Student checkout method is `GlobalSettings.studentPaymentMethod`, set only by Super-Admin `POST /api/admin/settings/payment-method` (`system:settings`). `GET /api/payments/plan-quote` is public and reports which method is on. PayMongo `POST /api/payments/create-link` and the webhook stay. `POST /api/payments/qr-claim` is a student JWT and is refused while PayMongo is selected. The student id comes from the token. It stores a transaction number and does not add credits. `POST /api/admin/qr-payments/:id/confirm` (admin JWT, permission `acct:qr_confirm`) is what adds the plan credits. Amount and plan are computed on the server.

## 10. Before push

1. `node --check` every edited server file (`server/index.js`, `server/teacher.js`, `server/student.js`, `server/authMiddleware.js`, …).
2. For each new route: call it with **no token**, the **wrong portal** token, and **another user's id** — expect 401 / 403.
3. Bump `?v=` on edited shared scripts so browsers load the fix.
4. After deploy, run the smoke checklist in `STABLE_BASELINE.md`.

## Change log

| Date | Change |
|------|--------|
| 2026-10-20 | `GET` and `POST /api/admin/level-assessments/:id/trial-invite` (admin JWT, `hr:level_assessments`) preview or email the stored address on an unregistered assessment only. The signup link is built from that row. The GET does not send mail. `GET`/`POST /api/admin/level-assessments/proficiency-invite` share the public free-assessment link; POST emails only the address in the body. |
| 2026-10-20 | Interactive trial uses the student JWT and the signed-in student id. Starting again reopens that trial (theme saved, answers cleared, passed expiry renewed 7 days). Progress and complete save the same student’s words when the id is `current` or the previous run was completed or expired. They do not answer 410. Live book-class returns 402 until `isPaidSubscriber`. `GET`/`POST /api/admin/level-assessments` (`hr:level_assessments`) lists assessment leads and emails only the stored address. |
| 2026-10-19 | Student referral reward is a fixed 3 credits per first paid plan (`REFERRAL_REWARD_CREDITS`), still granted only in the PayMongo webhook. |
| 2026-10-19 | Wrong parent PIN on `POST /api/student/portal-mode/verify` returns 403 `WRONG_PIN` and does not clear the student session. Wrong account password on PIN reset returns 403 `WRONG_ACCOUNT_PASSWORD` and also keeps the session. |
| 2026-10-18 | Student referral rewards and badge pages. Student JWT for `/api/student/referrals*`. Public `GET /badges/:id` and `GET /u/:username` (masked name; profile hidden when the privacy toggle is off). Credit amount is rolled only in the payment webhook. |
| 2026-09-30 | Removed teacher debug routes and unauthenticated completed-classes duplicate. `GET /api/teacher/booking/by-classroom/:id` requires the booking's teacher, student, or an admin (student allowlist extended). `GET /api/teacher/dashboard-stats` uses the signed-in teacher. `GET /api/teacher/classes?teacherId&week` requires the matching teacher Bearer (`teacher-open-class.html` sends it). Message / notification socket rooms bound to the JWT. `verifyToken` no longer logs headers or decoded tokens. |
| 2026-10-01 | Student privacy consent gate on register, book, and logged-in checkout. Teacher SOS and admin incident actions use the JWT. Observer join is admin-only. Permission `incident:manage` (QA and Super-Admin seed; grantable; not Super-Admin-only). |
| 2026-10-22 | Public level quiz collects name, email, and password only after 5 questions. `POST /api/student/send-assessment-email` stores the score; `POST /api/auth/student-register` redeems it. No new public route. |
| 2026-10-22 | Missed time-out for teachers and admins closes at 12:00 midnight Asia/Manila. Teacher default moved off 07:00 (`ATTENDANCE_CLOSE_HOUR`, default 0). The time-log day is midnight to midnight. |
| 2026-10-08 | InstaPay QR claim (`POST /api/payments/qr-claim`, student JWT) does not add credits. Confirm (`POST /api/admin/qr-payments/:id/confirm`, `acct:qr_confirm`) does. |
| 2026-10-08 | Teacher time-log edit review (`GET /api/admin/time-log-requests`, `POST /api/admin/review-time-log-request`) requires an admin JWT. |
| 2026-10-08 | `POST /api/feedback/submit` (teacher JWT, booking owner) can update wrap-up feedback until that class’s salary date. After the cut-off it stays closed. A second save does not consume the credit again. |
| 2026-10-08 | `POST /api/student/book-class` (and the teacher book-class equivalent) returns 400 `LESSON_AHEAD_OF_PROGRESS` when the lesson is past the student’s next stop on that level. Identity comes from the student JWT. |
| 2026-10-08 | `POST /api/feedback/submit` (teacher JWT, booking owner) rejects student-absent classes and classes with a pending or resolved report issue. The teaching fee for a report stays with QA’s resolution. |
| 2026-10-08 | `GET /api/admin/referral-link/stats` (admin JWT, `mkt:commissions_view`) lists only the signed-in admin’s referral rows. Owner id comes from the token, not the query. |
| 2026-10-08 | Lesson files stay inside RemoEd. `GET /api/lessons/lesson-file/:id/raw?download=1` (any signed-in role) returns 403. The Office viewer file link refuses a browser-tab open. |
| 2026-10-09 | `GET`/`POST /api/admin/settings/test-student-plan` (admin JWT, Settings) sets free or paid for the allowlist in `freePlanAccess.js` only. |
| 2026-10-15 | Test-plan allowlist is `plflores3302@gmail.com` (CTO) and `jean10121990@gmail.com` (CEO). POST `student` must match that list. |
| 2026-10-16 | Test-plan allowlist is `plflores3303@gmail.com` only. |
| 2026-10-13 | Lesson embeds accept Microsoft Office hosts and `https://docs.google.com/presentation/d/{id}/` only. The handler stores the Google `/embed` URL. |
| 2026-10-13 | `GET /api/teacher/slots` resolves an email-shaped id with `resolveToCanonicalTeacherId` (stored `teacherId`, current email, username). A teacher Bearer must still match that canonical id (`SLOTS_TEACHER_SCOPE`). Profile email and username edits do not change `Teacher.teacherId`. |
| 2026-10-15 | Classroom SOS QA notes. `note` on `POST /api/admin/incidents/:id/action` also messages the incident's teacher from the acting admin (JWT). Recipient comes from the incident record. |
| 2026-10-15 | Every action on `POST /api/admin/incidents/:id/action` (not only `note`) now messages the incident's teacher from the acting admin (JWT). Same auth (`incident:manage`), recipient from the incident record, text is plain (teacher Messages escape it). |
| 2026-10-15 | Forgotten parent PIN. `POST /api/student/portal-mode/pin/reset` (student JWT, own record only) needs the account password before it saves a new 4-digit PIN hash. Wrong passwords lock the reset for 10 minutes after 5 tries. |
| 2026-10-14 | Helmet `Cross-Origin-Resource-Policy` is `cross-origin` so link previews can load the public homepage image. `/` and `/index.html` set that image URL to the host of the shared link. |
| 2026-10-13 | Super-Admin is exempt from attendance exceptions. A missed time-out still closes the session. It does not block that owner's Time In, and an open exception for that role is excused. Other employees still cannot approve their own request. |
| 2026-10-12 | Attendance exceptions. Time In is blocked server-side while a mandatory exception is open. HR review requires `hr:attendance_review`. Employees cannot approve their own request. |
| 2026-10-12 | Student Kids / Parents mode. `POST /api/student/portal-mode/pin` and `POST /api/student/portal-mode/verify` (student JWT) store and check a 4-digit PIN hash. The PIN is not returned. |
| 2026-10-12 | `GET` and `POST /api/student/lesson-checkpoint` (student JWT) load and score a lesson assessment. Answers are not returned. The stored student id is the token username. Booking ahead of an unpassed checkpoint returns `400 CHECKPOINT_REQUIRED`. |
