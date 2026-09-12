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
| Mongo safety scripts | `scripts/archive-legacy-mongo-db.js`, `scripts/purge-beta-recordings.js` |

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

### Auth isolation

- [ ] Student token cannot call a random `/api/teacher/*` route outside the allowlist (`WRONG_PORTAL_TOKEN`).
- [ ] Teacher token cannot call `/api/student/*` profile/bookings as a student.

### Deploy hygiene

- [ ] No second `const studentController = require(...)` in `server/student.js`.
- [ ] Hard-refresh portals after deploy (`Ctrl+F5`) so cached HTML/JS is not stale.

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
