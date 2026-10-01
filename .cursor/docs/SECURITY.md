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
- Free-plan identity comes from the student JWT, not the request body. A student is paid when a `creditLots` entry is `spark` / `steady` / `scholar` / `summit` with `creditsRemaining > 0`, or `isSubscribed` with `subscriptionStatus === 'active'` and `paymentStatus === 'paid'`. Everyone else is free.
- Free students may book only the next Pre-Level lesson, once per student-local month (`FREE_PLAN_LESSON_ONLY`, `FREE_PLAN_SEQUENCE`, `FREE_PLAN_MONTHLY_LIMIT`, `FREE_PLAN_SEQUENCE_DONE` on `POST /api/student/book-class`). The booking does not spend credits. Cancel before the class starts clears that month so the same lesson can be booked again.
- Privacy consent is the current version in `server/config/privacyConsent.js`. `POST /api/auth/student-register` returns `400 CONSENT_REQUIRED` unless `privacyConsentAccepted === true`. `POST /api/student/book-class` and a logged-in `POST /api/payments/create-link` return `403 CONSENT_REQUIRED` when that version is missing. `POST /api/student/privacy-consent` (student JWT) records a later acceptance from booking, checkout, or the student profile. The student id comes from the token. IP is stored only on the consent row.
- `POST /api/teacher/classroom-sos` and `POST /api/teacher/classroom-sos/:id/withdraw` require a teacher JWT. The booking owner is the canonical teacher id, not a body id. Withdraw is only while status is `open` and within 15 seconds.
- `GET /api/admin/incidents` and `POST /api/admin/incidents/:id/action` require admin auth plus `incident:manage`. The acting admin id comes from the JWT. Observer classroom join (`userType: observer`) is rejected unless `resolveSocketIdentity` returns an admin (`OBSERVER_FORBIDDEN`). A second teacher or student socket in the same room is disconnected. Camera offer, answer, and ICE go only to the other role's current socket.
- `GET /api/student/portal-videos` lists titles for free students and omits file URLs. A direct `GET` of `/uploads/portal-videos/…` with a free student token returns `FREE_PLAN_LOCKED`. `POST /api/student/garden/action` returns the same code. `GET /api/student/garden` stays readable with `locked: true`.
- Student JWTs may call only the teacher-route allowlist in `server/authMiddleware.js` (`studentMayCallThisTeacherRoute`). **Extend** it for new student needs; do not remove the `WRONG_PORTAL_TOKEN` gate.
- Do not apply blanket `verifyAdminApiAuth` to all `/api/admin/*` — first-time 2FA enrollment (`POST /verify-2fa` with an enrollment Bearer) must still work.
- Scoped admin roles get plain 403 on forbidden APIs; only 401 or `ADMIN_2FA_REQUIRED` / `WRONG_PORTAL_TOKEN` / `ADMIN_SESSION_REVOKED` end the session.

### Public allowlist (keep open)

- `GET /api/teacher/slots`, `GET /api/teacher/available-teachers`, `/api/teacher/public/*`, `GET /api/teacher/public-profile/:id`, `GET /api/teachers/landing`
- `POST /api/student/book-class` (student JWT) and the equivalent `POST /api/teacher/book-class`
- `GET /api/auth/admin-login-path` and the obfuscated admin login page (path hiding is not the access control — 2FA + RBAC are)
- `/api/public/*` assessment routes (rate limited, `express-validator`), `POST /api/applications`
- `GET /api/office-viewer/presentation/:fileId/:token/:name` — Microsoft PowerPoint fetches the lesson deck here with no login. The token is a per-file JWT signed with `JWT_SECRET + ':office-viewer'` (cannot pass as a portal login), valid 6 hours, issued only by authenticated `local-preview` / `secure-embed`. Serves `.ppt` / `.pptx` only; rate limited.
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

## 10. Before push

1. `node --check` every edited server file (`server/index.js`, `server/teacher.js`, `server/student.js`, `server/authMiddleware.js`, …).
2. For each new route: call it with **no token**, the **wrong portal** token, and **another user's id** — expect 401 / 403.
3. Bump `?v=` on edited shared scripts so browsers load the fix.
4. After deploy, run the smoke checklist in `STABLE_BASELINE.md`.

## Change log

| Date | Change |
|------|--------|
| 2026-09-30 | Removed teacher debug routes and unauthenticated completed-classes duplicate. `GET /api/teacher/booking/by-classroom/:id` requires the booking's teacher, student, or an admin (student allowlist extended). `GET /api/teacher/dashboard-stats` uses the signed-in teacher. `GET /api/teacher/classes?teacherId&week` requires the matching teacher Bearer (`teacher-open-class.html` sends it). Message / notification socket rooms bound to the JWT. `verifyToken` no longer logs headers or decoded tokens. |
| 2026-10-01 | Student privacy consent gate on register, book, and logged-in checkout. Teacher SOS and admin incident actions use the JWT. Observer join is admin-only. Permission `incident:manage` (QA and Super-Admin seed; grantable; not Super-Admin-only). |
