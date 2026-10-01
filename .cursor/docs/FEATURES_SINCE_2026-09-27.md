# Features added since 27 September 2026

Covers commits from **28 September** through **1 October 2026**. Use this as a deploy and smoke checklist. Durable rules stay in [STABLE_BASELINE.md](STABLE_BASELINE.md).

## 28 September — Announcements

- [ ] Admin **Announcements** can post by topic (Family Day, Teachers’ Day, Students’ Day, Feeding Program, Waste Management, Mental Health, Sustainability, Others).
- [ ] **Others** asks for a topic name.
- [ ] Post history can filter by topic.

## 30 September — Accounts, phones, layout, credits, security

- [ ] Forgot-password still sends a **link**, not a temporary password. Teaching Fee copy matches the payroll bonus / incentive rules.
- [ ] Phone fields use a **country calling code** plus the local number (student profile, booking, and related admin/teacher forms).
- [ ] Student, teacher, and admin sidebar icons stay on **one vertical line** when the window is resized and when the rail is collapsed.
- [ ] Portal notification bells open **under the bell**. Mark all read still works.
- [ ] Waiting room and Play & Learn include the **typing quiz**. Credit lots still expire on their own dates; class finish still burns the older lot first.
- [ ] Security notes live in [SECURITY.md](SECURITY.md). New routes still take identity from the JWT.

## 1 October — Free Trial / Pre-Level

- [ ] Lessons Library lists **Pre-Level** (Free Trial) first. It is not one of the four growth levels.
- [ ] A student without a paid plan books **the next** Pre-Level lesson, once per student-local month (22 lessons, in order).
- [ ] Paid students (a plan lot with credits left, or an active paid subscription) still book growth levels with credits.
- [ ] A leftover welcome credit does not unlock growth levels. New registration does not grant that credit.
- [ ] Videos, the learning journey, and the garden stay locked on the free plan. Play & Learn stays open.
- [ ] Cancelling a free booking before it starts clears that month. Completing it advances the lesson index and does not debit a credit.

## 1 October — Student privacy

- [ ] Current policy version is `2026-10-01`. A parent or student must accept it before register, book, or logged-in checkout.
- [ ] Pages: `/legal/student-privacy` and `/legal/terms`. Copy covers students in the Philippines and in other countries.
- [ ] **My Profile → Personal Information → Student Privacy** has the accept checkbox. Checking it saves the version. An already-accepted version stays checked.
- [ ] Booking confirmation and the student waiting room say classes are recorded for safety, quality assurance, and parent review.
- [ ] Marketing use of quotes or media stays a separate optional choice.

## 1 October — Class finish and student absent

- [ ] The live classroom has **Finish** only. **Student Absent** is on Class Schedule, including the feedback form.
- [ ] Marking the student absent finishes that class. It is not pending feedback and does not ask for stars or a comment.
- [ ] A class already marked absent is stored as absent even if Finish had left it pending.

## 1 October — Classroom SOS

- [ ] Teacher **Emergency SOS** sits beside Settings. Students do not see it. Confirm sends one incident. A second confirm in the same open class does not create a duplicate.
- [ ] The teacher can withdraw for 15 seconds. Admins still see a withdrawn alert.
- [ ] Admin **Classroom SOS** keeps the sidebar and top bar. Status legend: Open, Withdrawn, Observing, Paused, Ended, Resolved, All.
- [ ] **Observe** joins with no camera and does not clear the student waiting state. **Pause** and **End class** stop media in that room only.
- [ ] Ending a technical failure restores a lesson credit only if one was already spent. Other reasons do not change credits.
- [ ] QA and Super-Admin can manage incidents (`incident:manage`). Other roles without that permission get 403.
- [ ] **Emergency guidelines** (`/teacher/emergency-guidelines`) shows the teacher sidebar, the top bar, the three tiers, and the same status legend.
