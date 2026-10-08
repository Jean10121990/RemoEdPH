# Beta tester — first pass

Run this list **before** a teammate double-checks. The items come from the [Prompts & Fixes tracker](https://docs.google.com/spreadsheets/d/1tGhJqH7iiXamENDNaz_Xy6sOmvHwVJuZ/edit?gid=1148886732#gid=1148886732) (TSK-001 through TSK-023). Those fixes are already built. This pass looks for regressions: bugs, errors, and glitches that came back.

If a check fails, fix it and re-run that check. Hand the team only the items that still fail, with the page, what you did, and what you saw.

Do not retest a passing item as a new task. Do not drop or rewrite production data to force a result.

## How to check

1. Use the live site (remoedph.com) unless the row says a file.
2. Try the happy path, then one bad input (empty required field, wrong password, over a limit).
3. Watch the screen and the browser console. A red error, a stuck button, a wrong amount, or a layout jump is a fail.
4. Record: task id, pass or fail, and one sentence if it failed.

## Checks

### Accounts and passwords

| ID | Pass when |
|---|---|
| TSK-001 | Forgot-password on student, teacher, and admin lets the person set a new password on the spot. No temporary password is emailed. |
| TSK-004 | Password rules sit under the field. The meter shows weak, strong, and super strong. |
| TSK-005 | Every password field uses the Lucide eye / eye-off control. No emoji and no “Show” text. Change-password saves and the new password logs in. |
| TSK-007 | On desktop the password field is wide enough, the eye sits inside the field, and a password without a symbol is rejected. |

### Student profile

| ID | Pass when |
|---|---|
| TSK-002 | Email must be a real email address. Required fields show an error on that field. Save is blocked while a required field is empty. Country is not asked twice. |
| TSK-003 | The phone field accepts a phone number, not a separate “national number” control. Parent or guardian is the emergency contact. |

### Live class

| ID | Pass when |
|---|---|
| TSK-008 | A student who joins before the teacher sees the waiting room (mini-game or video). Camera controls use Lucide video / video-off icons. |
| TSK-009 | The teacher guide can be skipped. A blocked chat word shows as `****` for the student, and the teacher can reveal it. Mic and camera controls are Lucide icons. |
| TSK-010 | After class feedback is submitted, Give Feedback is hidden. A QA issue tells the student to reschedule. Payslip shows the amount that can be withdrawn. Cut-offs stay bi-monthly. |

### Booking

| ID | Pass when |
|---|---|
| TSK-011 | There is **no daily class limit** (the former 6-class cap was removed on 2026-10-05). A student can book more than 6 classes on one local day. The page shows no “Day full” cells. Credits, lesson gates, and slot conflicts still apply. |
| BUG-001 | A student without the current privacy consent presses **Book Class** and **stays signed in**. The Student Privacy box appears, and after accepting it the same booking succeeds. |
| TSK-023 | Booking Details opens as a centered modal, not a side panel. A student cannot book a lesson ahead of the next one. They can book an earlier lesson and reschedule. |

### Live class — camera relay

| ID | Pass when |
|---|---|
| BUG-002 | Teacher and student on **different networks** see and hear each other. The console shows “ICE servers loaded from /api/rtc-config”, no “No TURN relay configured”, and no `TURN allocate request timed out`. |
| BUG-003 | An admin in **Observe** does not black out or restart the teacher-student call. Joining or leaving Observe changes nothing for them. |
| BUG-004 | A second teacher or student tab on the same class is closed and its camera light goes off. Only one tab per role stays connected. |

### Teaching Fee and payslip

| ID | Pass when |
|---|---|
| TSK-012 | The wallet header is Total Earnings. Available to Withdraw is separate. After a withdrawal, the cut-off amount stays visible and is labeled Withdrawn. It does not flip to ₱0. |
| TSK-013 | A payslip that was withdrawn no longer stays Pending. It shows withdrawn or completed. |
| TSK-014 | There is no extra Withdrawn chip next to Pending Earnings. |
| TSK-015 | The payslip total includes the class fee. A known miss was ₱1,000 shown instead of ₱1,140. |
| TSK-017 | When Available to Withdraw is over ₱50,000, the withdraw screen says MariBank’s daily maximum is ₱50,000. |
| TSK-018 | A withdrawal under ₱100 is refused and that amount waits for the next cut-off. Unwithdrawn disbursed pay carries forward. A day cannot withdraw more than ₱50,000. |

### Free Trial teacher tier and referral commission

| ID | Pass when |
|---|---|
| PAY-001 | Admin Users → Professional tier lists **Free Trial — ₱45 per 25-min class** before Tier 1. Picking it shows `Per 25-min class: ₱45` and ignores the credential boxes. Save, reopen: it is still Free Trial. |
| PAY-002 | A Free Trial teacher sees ₱45 per completed class on Teaching Fee. Tier 1 to 4 teachers still see their old rate. |
| PAY-003 | A referred student buys 1 month / 3 months / 6 months / 1 year. Unique Link Commissions shows ₱1,000 / ₱1,500 / ₱2,000 / ₱2,500. The teacher's Referral Rewards page shows the same. |
| PAY-004 | Refreshing Referral Rewards or a repeated payment webhook does not change a commission that was already awarded. Commissions from before 2026-10-05 stay at ₱1,000. |

### Assessment, register, and credits

| ID | Pass when |
|---|---|
| TSK-019 | After the assessment, Plans says the person has taken the assessment and offers Register Now. The same email that tries again is told the assessment was already taken and to check email. |
| TSK-020 | Register asks for first name and last name, then email. The email from the assessment link is filled in. A trial link is not expired unless that email is already registered. “Invalid link” and “already used” do not appear for a link that should still work. |
| TSK-021 | Credits keep the longest plan expiry. Buying a shorter plan does not shorten days the student already has. |
| TSK-022 | Older plan credits are used before newer ones. Example: a 3-month pack is consumed before a later 6-month pack. |

### Do not re-run

| ID | Why |
|---|---|
| TSK-006 | Lucide is the icon set (`public/js/lucide-icons.js`). No screen check beyond “icons are not emoji.” |
| TSK-016 | `scripts/undo-cutoff-salary-dispense.js` undoes a live payroll dispense. Run it only when accounting asks. |

## After the pass

- All pass: tell the team the first pass is clean and which account you used.
- Some fail: fix those, re-check, then send only the remaining failures.
- A failure that needs a product decision (not a broken screen) is listed as a question, not patched on the spot.

## Fixed bugs log (do not repeat these)

Check here **first** when a symptom looks familiar. Each entry: what the user saw, the real cause, the fix, and where it lives. Add a new entry every time a bug is fixed. Do not “simplify” the fixes below.

### Booking and sessions

**Student is logged out when pressing Book Class** (BUG-001, fixed 2026-10-05)
- Cause: `POST /api/student/book-class` answers `403 CONSENT_REQUIRED` when the student has not accepted the current privacy version. The global fetch wrapper in `public/js/user-session.js` treated **every** 401/403 as an expired login and called `logoutToUnifiedLogin()`, so the consent box on `student-book.html` never appeared.
- Fix: `BUSINESS_GATE_CODES` + `isBusinessGateResponse()` in `user-session.js`. A 401/403 whose JSON `code` is a business gate keeps the session. Real 401s and plain 403s still log out.
- Rule: a new gate code that returns 401/403 must be added to `BUSINESS_GATE_CODES`. Never log out on a status code alone.
- Same trap applies to any page using the patched `fetch` (checkout in `student-credits.html` has its own consent row and is safe).

**Student cannot book: “Day full” / “6 classes per day”** (TSK-011, removed 2026-10-05)
- The per-day cap was deleted on purpose (`studentBookSlotService.js`, `student-book.html`). Do not reintroduce it. If a student is blocked now, the cause is credits (`INSUFFICIENT_CREDITS`, `CREDITS_EXPIRED`), the free-plan lesson gate, or a taken slot, not a day limit.

### Live classroom camera

**Teacher and student cannot see each other (black video)**
- Quick triage from the browser console (F12), in this order:
  1. `/api/rtc-config` returns 401 → route order bug (see “rtc-config 401” below).
  2. `STUN binding request timed out` / `TURN allocate request timed out` → the relay is unreachable (see “Camera black / ICE checking”).
  3. `Wrong signaling state for answer: stable` or repeated offers → more than one tab per role is open, or an observer is interfering. Close extra tabs.
  4. “No TURN relay configured” → the Cloudflare keys are missing in the server `.env` (or the server was not restarted with `--update-env`).
- Full emergency routine: `STABLE_BASELINE.md` → “Camera relay configuration and emergency guidelines”.

**Admin Observe broke the lesson** (fixed 2026-10-01)
- Cause: observer sockets took part in WebRTC signaling and a second socket per role replaced the real one.
- Fix (`server/realtime.js`, `server/index.js`, `public/live-classroom.html`): observers (`observer=1`, admin JWT) never create, answer, or reset a call. Signaling goes only to the opposite role’s latest socket (`emitToOppositeRole`). A newer tab of the same role disconnects the older one (`classroom-replaced`, `releaseOlderSameRole`) and the old tab releases its camera. Leaving Observe or resolving an SOS does not call `schedulePeerReady` for the pair.

**Webcam showed on the lesson stage**
- Cause: `isDisplayCaptureTrack` guessed screen shares from labels/contentHint. Fix: it checks only `getSettings().displaySurface`.

**`/api/rtc-config` returned 401** (fixed 2026-10-01)
- Cause: `fileRoutes` is mounted at `/api` and runs `verifyToken` for every `/api/*` route registered after it. Fix: register public routes (`/api/rtc-config`, `/api/office-viewer/...`) **before** `app.use('/api', applicationRoutes)` in `server/index.js`.

**ICE restarted too fast (“checking” loop)**
- Fix: watchdog 15 s, cooldown 20 s in `live-classroom.html`.

**Camera black / ICE checking: relay unreachable** (diagnosed 2026-10-02 to 2026-10-05)
- Symptom: console shows `ICE candidate error 701`, `STUN binding request timed out`, `TURN allocate request timed out` for `187.77.159.63:3478`.
- Where the relay lives: `coturn` on the Hostinger VPS `srv1948835` (187.77.159.63), config `/etc/turnserver.conf`, values `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` in the app `.env`. coturn was not installed at first; it was installed and listens on 3478 (TCP+UDP).
- Root cause found: **the Hostinger hPanel firewall** (`remoed-firewall`, VPS → Security → Firewall) drops everything that is not an accept rule, and a VPS goes **out of sync** after any rule change until the firewall is re-synced. Rules showed 3478 allowed, yet external probes still timed out and `tcpdump` on the VPS saw 0 packets, so the traffic never arrived.
- Needed accept rules: TCP 3478, UDP 3478, UDP `49152:65535` (or `49152:49200` with coturn `min-port`/`max-port` matched), plus TCP 22, 80, 443. Rule ranges use `start:end`.
- Triage without logging in: from any PC, send a STUN request to `187.77.159.63:3478` (UDP) and try TCP 3478. A reply means the relay works. Timeout on 3478 with 443 open means the firewall is not applied. `iptables`/`nft` on the VPS had no rules, so the VPS itself was not the blocker.
- **Resolution (2026-10-05): Cloudflare TURN is now the production relay.** `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` are set in the server `.env` (`server/services/hostedTurn.js`, merged into `/api/rtc-config`; confirmed `turnConfigured: true` with `turn.cloudflare.com` URLs). Port 53 URLs are dropped because Chrome blocks them. Setup: `CLOUDFLARE_TURN_SETUP.md`.
- The own coturn on the VPS was stopped and disabled (`systemctl stop coturn`, `systemctl disable coturn`) and `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` were removed from `.env`. Reason: the dead relay added connection delay and its password was shown publicly by `/api/rtc-config`. Do not bring it back unless an outside probe of 3478 succeeds.
- Emergency steps for a black camera in class: `STABLE_BASELINE.md` → “Camera relay configuration and emergency guidelines”.
- Never put the TURN password or Cloudflare token in chat or in git.

**Teacher or student “disappears” mid-class on a weak connection** (fixed 2026-10-05)
- Symptom: cameras work, then one side shows “Waiting for <name>…” and stays that way until a refresh. The “Poor Connection” chip is on.
- Cause: the `io(...)` options in `public/live-classroom.html` had duplicate keys; the later `reconnectionAttempts: 5` beat `10`. After about 20 seconds offline the socket stopped retrying for good. The `socket.on('reconnect' / 'reconnect_failed')` handlers never fire in Socket.IO 4 (they live on `socket.io`), so nothing recovered it.
- Fix: `reconnectionAttempts: Infinity`, retry delay max 5 s, and an immediate `socket.connect()` on the browser `online` event and when the tab becomes visible again (skipped after `classroom-replaced`). The existing `connect` handler rejoins the room and the call renegotiates.
- If it still happens, it is the network itself: check upload speed, close other uploads, and note that the teacher’s QA recording (“Share this tab”, chunks uploaded during class) shares the same uplink.

**Both cameras show but the call lags, freezes, or the peer “vanishes” (Cloudflare TURN added)** (fixed 2026-10-05)
- Cause: `public/live-classroom.html` switched to `iceTransportPolicy: 'relay'` (and dropped STUN) whenever `/api/rtc-config` listed `turns:…:443?transport=tcp`. Cloudflare TURN lists one, so every call was forced through the relay, with a TCP/TLS fallback that stalls video on a weak line.
- Fix: direct-first (`'all'` policy, TURN gathered in parallel as fallback). Relay-first is now opt-in with `?relay=1` or `localStorage.remoed_force_relay = '1'`. The older fallback “STUN timeout → relay-only + ICE restart” is unchanged. The webcam sender is capped at 500 kbps (`limitCameraSenderBitrate`) so it does not hog a weak uplink while the QA recording also uploads.
- Not changed on purpose: QA recording captures the full tab and also feeds the student’s cropped slide view; lowering its resolution would blur the student’s slides. If lag continues on a weak PC, test one class without recording to compare.
- Check: `chrome://webrtc-internals` → selected candidate pair. `host` / `srflx` means direct; `relay` means the TURN fallback was needed.

**Class chat empty after a refresh** (fixed 2026-10-05)
- Cause: the server keeps the room’s last 50 messages and emits `chat-history` on every `join`, but `public/live-classroom.html` had no `chat-history` listener.
- Fix: the listener re-renders them. The room is also saved in `classroom_chats` (`server/models/ClassroomChat.js`) so a refresh or a server restart still shows the chat. Finish (`class-finished` and `POST /api/booking/:id/end-session`) deletes that room’s chat, so the next class starts empty. A 24-hour TTL deletes a chat if Finish never happens. Teacher/admin Messages (`PeerMessage`) are not deleted.
- Typing: the box shows “Pat is typing...” (first name from the class label) while the other person types (`typing` / `stop-typing`, room taken from the socket’s join).

**Camera becomes “Waiting for student/teacher” on a weak signal, and QA recording stops** (fixed 2026-10-08)
- Symptom: both sides lose the other person’s camera and see “Waiting for…”, so it looks like they left. QA recording then stops.
- Cause: a connection blip called `markPeerVideoDisconnected` (clears the video and shows Waiting). The server also emitted `user-left` the moment the socket dropped, even when they were about to reconnect.
- Fix: if that person was already on camera, the tile stays with their name and goes black only when the picture itself drops (`is-signal-hold`). “Waiting for…” is only before they join, or 20 seconds after they really leave (`schedulePeerLeave`). QA still counts the black tile as the student being in class.

**Chat hidden by huge media buttons**
- Fix (`public/css/live-classroom-redesign.css`): teacher media-lock buttons are 32 px round icons; video tiles are capped; chat keeps a minimum height. Use higher-specificity selectors because `live-classroom.css` has older `min-height: 140px` rules.

### Lessons and uploads

**Lesson PowerPoint will not open in class**
- Cloudmersive was removed. Decks open in Microsoft PowerPoint (Office for the web) through a signed 6-hour per-file link (`server/utils/officeViewerLink.js`, public route `GET /api/office-viewer/presentation/:fileId/:token/:name`).
- Requirements: `FRONTEND_URL=https://remoedph.com` (public https, normalized by `normalizeFrontendOrigin`; production logs `[office-viewer] ... OK` or a WARNING at startup). Localhost cannot use the Microsoft viewer; it falls back to LibreOffice.
- Decks over 10 MB are shrunk on upload by `server/utils/pptxCompress.js` (images only, same entry names). Still over 10 MB → the upload response includes `warning` and the page shows it; reduce videos/large images and re-upload.
- Do not add a paid converter back.

### Security / CI

- **GitHub CI failed on `npm audit`** (fixed: dependency updates in commit `6a20a24`). If CI fails again on audit, run `npm audit` and update the named package; do not disable the step.
- **Production 502 from a duplicated `require('./studentController')` in `server/student.js`.** Declare it once.

## When something breaks again

1. Match the symptom to an entry above and apply that fix first.
2. Reproduce with the console open. Record the first red error.
3. Fix, run `node --check` on edited server files and `npm run lint`.
4. Add or update an entry here, plus a smoke line in `STABLE_BASELINE.md`.
