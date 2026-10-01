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
| TSK-011 | A student can book up to **6 classes (3 hours) on one local day**. The 7th class that day is refused with the daily-limit message. The old “2 classes” rule is not the rule anymore. |
| TSK-023 | Booking Details opens as a centered modal, not a side panel. A student cannot book a lesson ahead of the next one. They can book an earlier lesson and reschedule. |

### Teaching Fee and payslip

| ID | Pass when |
|---|---|
| TSK-012 | The wallet header is Total Earnings. Available to Withdraw is separate. After a withdrawal, the cut-off amount stays visible and is labeled Withdrawn. It does not flip to ₱0. |
| TSK-013 | A payslip that was withdrawn no longer stays Pending. It shows withdrawn or completed. |
| TSK-014 | There is no extra Withdrawn chip next to Pending Earnings. |
| TSK-015 | The payslip total includes the class fee. A known miss was ₱1,000 shown instead of ₱1,140. |
| TSK-017 | When Available to Withdraw is over ₱50,000, the withdraw screen says MariBank’s daily maximum is ₱50,000. |
| TSK-018 | A withdrawal under ₱100 is refused and that amount waits for the next cut-off. Unwithdrawn disbursed pay carries forward. A day cannot withdraw more than ₱50,000. |

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
