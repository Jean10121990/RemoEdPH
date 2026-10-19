# RemoEdPH settings / CMS plan

Audit date: 2026-10-19. Evidence is from the current source. Items marked **Needs confirmation** were not re-read line by line in this pass. This document does not change product behavior.

## 1. Executive summary

RemoEdPH is an Express + Mongoose app. Almost every price, payout, booking window, and marketing sentence is a constant in source. The database already stores two settings (`globalRate`, `studentPaymentMethod`) and portal announcements. Admin roles are already dynamic.

Move money and policy numbers first. A wrong plan price or payout tier charges or pays the wrong amount. Seed every new setting from today’s constant so checkout, payroll, and booking stay identical on day one.

Do not put API keys, SMTP passwords, or JWT secrets in the database. Do not rebuild RBAC. Extend `GlobalSettings`, `Announcement`, and `AdminAuditLog`.

Homepage plan cards copy peso prices that are also computed in `server/payments.js`. Those two copies can drift. That is the first content bug a CMS should close.

Gender stays Male / Female only. There is no per-day class cap in code; do not add one. Facebook login stays off until a Super-Admin turns the flag on. The peso exchange rate stays in the environment. Notices are email and in-app only.

Owner decisions (2026-10-19) are in section 9. Production is one PM2 fork process, so the settings cache is in memory on that process.

## 2. System overview

### Stack

| Layer | Evidence |
| --- | --- |
| Runtime | Node `>=18`, `server/index.js` (`package.json` `main`) |
| HTTP | Express 4, Helmet, CORS, `express-rate-limit` |
| Data | Mongoose 8, MongoDB Atlas database name `test` |
| Client | Static HTML/JS/CSS in `public/` and `login/`. A separate `client/` Vite app exists; the live portals are the static pages. |
| Auth | JWT per portal (`remoed_student_token`, `remoed_teacher_token`, `remoed_admin_token`). Admin also has session idle timeout (`server/config/authTokens.js`). Google and Facebook OAuth (`server/config/oauth.js`). Admin Google still requires authenticator. |
| Payments | PayMongo webhook plus MariBank QR. Which one is live is `GlobalSettings.studentPaymentMethod`. |
| Mail | Nodemailer. Host and passwords come from env (`server/emailService.js` around the SMTP block). |
| Class video | Socket.IO in the live classroom. No third-party meeting product. Class length rules are local (`classroomEntryWindow.js`). |
| Files | Multer + GridFS (`presentations/`, `portal-videos/`). |
| Process | One Node process. PM2 fork mode, app name `remoed-api`, one Hostinger VPS. No cluster mode, no Redis, no load balancer. |
| Deploy | Git pull and process restart. No CMS publish step. |

### Roles

- **Student.** One account is the child and the parent. Parent mode is a client view plus a parent PIN (`server/models/Student.js` `parentPinHash`). Level default `Little Seeds` (line 56).
- **Teacher.** Invite or existing account. Payout tier and credential flags are stored on the teacher. The peso amounts are not.
- **Admin.** Dynamic RBAC (`server/services/adminRbac.js`). `nav:settings` and `nav:super_monitor` are Super-Admin only. Other roles (HR, QA, accounting, marketing) get seeded permission lists.
- **No separate parent login.**

### Main flows

1. Assessment, then student register (trial email must match). Login at `login/index.html` (email/username, Google; Facebook hidden).
2. Book a class with credits. `Booking.studentId` is the username. No daily class cap.
3. Live class: join from 10 minutes early, hard stop at 40 minutes.
4. Pay for spark / steady / scholar / summit. Credits = months × 22. Checkout is PayMongo or QR depending on settings.
5. Teacher payroll uses tier math, plus `globalRate` when no tier is stored. Unique-link commission is a fixed peso amount per plan. Admin fee is 2% of subscription gross.
6. Notifications: in-app `StudentNotification` and `Announcement`; email subjects are hardcoded in `emailService.js`.
7. Reviews: class feedback with a 1–5 star scale (portal UI). **Needs confirmation** of a single server enum for that scale.
8. Garden and student referrals are separate reward systems with their own config files.

### What already exists and should be reused

| Piece | What it already does |
| --- | --- |
| `server/models/GlobalSettings.js` | One document: `globalRate` default 100, `studentPaymentMethod` `maribank_qr` or `paymongo`. |
| `POST /api/admin/update-global-rate` | Super-Admin writes `globalRate` (`server/admin.js` near the GlobalSettings import). |
| Payment-method toggle | Super-Admin Settings writes `studentPaymentMethod` (`server/admin.js` around line 2900). |
| `Announcement` + `public/admin-announcements.html` | Portal announcements by role. The public homepage banner is **not** this model. |
| `AdminAuditLog` | Actor, action, IP, details. Used for sensitive admin actions. Extend it for setting changes. |
| `adminRbac.js` | Permission keys. New settings screens should require `nav:settings` (Super-Admin) or a new key that is not grantable to marketing/HR by accident. |
| Config modules | `planCredits.js`, `studentReferral.js`, `care.config.js`, `rewards.config.js`, `garden.config.js`, `share.config.js`. These are the seed values. |

## 3. Hard-coded inventory

Type key: **Setting** single value, **Content** rich text, **Collection** list of records, **Template** email/notice, **Flag** on/off, **Secret** stays in env.

Impact is what happens if the value is wrong in production. Audit = store who changed it and the previous value.

| ID | Name | Location | Current value | Category | Type | Who | Frequency | Impact | Audit | Priority | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Site title | `public/index.html` ~126 | `RemoEdPH - Learn English at Home for Kids` | Branding | Content | Super Admin | Rarely | Low | No | P2 | S |
| S02 | Meta description | `public/index.html` ~81 | Calm, engaging English lessons for children ages 3–6 | Branding | Content | Super Admin | Rarely | Low | No | P2 | S |
| S03 | Open Graph title and image | `public/index.html` ~84–104 | Site name RemoEdPH; image `og-remoedph-1200x630.jpg` | Branding | Content | Super Admin | Rarely | Low | No | P2 | S |
| S04 | JSON-LD locality | `public/index.html` ~105–120 | RemoEdPH, Cabanatuan City, Nueva Ecija | Branding | Setting | Super Admin | Rarely | Low | No | P2 | S |
| S05 | Footer email and Facebook | `public/index.html` ~698–708; copied on `public/site-faq.html` ~62 | `support@remoedph.com`, `facebook.com/remoed` | Branding | Setting | Super Admin | Rarely | Medium | Yes (public contact) | P1 | S |
| S06 | Login tagline and welcome | `login/index.html` subtitle and welcome panel | “Sign in with your email or username.” / live one-on-one with real teachers | Branding | Content | Super Admin | Rarely | Low | No | P2 | S |
| S07 | Login feature lines | `login/index.html` `.features` | Live one-on-one classes; Real, friendly teachers; Personalized dashboard | Content | Collection | Super Admin | Rarely | Low | No | P2 | S |
| S08 | Hero | `public/index.html` ~184–193 | Learn English at Home; Take Free Assessment | Content | Content | Marketing | Monthly | Medium | Yes | P1 | M |
| S09 | Who we are | `public/index.html` ~219–224 | Filipino ESL start-up copy | Content | Content | Marketing | Rarely | Medium | Yes | P2 | M |
| S10 | Principles | `public/index.html` ~232–257 | Christian worldview; Honor each person; Biblical distinction | Content | Collection | Marketing | Rarely | High | Yes | P2 | M |
| S11 | Pillars | `public/index.html` ~266–287 | Joyful Learning; Respect & Care; Integrity & Accountability | Content | Collection | Marketing | Rarely | Medium | Yes | P2 | M |
| S12 | H.E.A.R.T. | `public/index.html` ~296–331 | Hospitality, Excellence, Affection, Respect, Togetherness | Content | Collection | Marketing | Rarely | Medium | Yes | P2 | M |
| S13 | Vision and mission | `public/index.html` ~341–355 | Together we will embody excellence / kids across Asia | Content | Content | Marketing | Rarely | Medium | Yes | P2 | S |
| S14 | Benefits | `public/index.html` ~363–425 | Why Learn at Home (four items) | Content | Collection | Marketing | Rarely | Low | No | P2 | S |
| S15 | Homepage plan cards | `public/index.html` ~578–584 and `planCredits.js` labels | RemoSpark ₱9,244.62 and sibling cards | Pricing | Collection | Super Admin | Monthly | High | Yes | P0 | L |
| S16 | Trial banner | `public/index.html` ~549 | Claim free trial banner. Not the Announcement model | Content | Content | Marketing | Weekly | Medium | No | P1 | S |
| S17 | Register welcome | `public/student-register.html` ~313–397 | Book your 3 free lessons; Welcome to RemoEdPH | Content | Content | Super Admin | Rarely | Medium | No | P1 | S |
| S18 | Public privacy | `public/site-privacy.html` ~45–49 | Privacy Policy, Last updated September 2026 | Content | Content | Super Admin | Rarely | High | Yes | P1 | M |
| S19 | Public terms | `public/site-terms.html` ~45–62 | Terms of Service; support@remoedph.com | Content | Content | Super Admin | Rarely | High | Yes | P1 | M |
| S20 | Short parent terms | `public/legal/terms.html` ~24 | For parents and students | Content | Content | Super Admin | Rarely | High | Yes | P1 | S |
| S21 | Privacy consent version | `server/config/privacyConsent.js` line 2; `public/legal/student-privacy.html` ~24 | `2026-10-01`. A new string forces the checkbox again | Content | Setting | Super Admin | Rarely | High | Yes | P0 | M |
| S22 | Teacher privacy and contract | `public/privacy-policy.html`, `public/terms-of-service.html` | Staff policy and Independent Contractor Agreement. Editable in the browser by Super-Admin only | Content | Content | Super Admin | Rarely | High | Yes | P1 | L |
| S23 | FAQ corpus | `public/js/remoed-faq-data.js` lines 8–33 | Intro says update this JS file. Rendered by `faq.html` and `site-faq.html` | Content | Collection | Marketing | Weekly | Medium | Yes | P1 | M |
| S24 | Site i18n dictionary | `public/js/site-i18n.js` ~8–50 | en/zh/ja/ko hero strings. Culture and legal are not in this file | Content | Collection | Super Admin | Monthly | Medium | Yes | P2 | L |
| S25 | Credits per month | `server/config/planCredits.js` line 14 | `22` | Pricing | Setting | Super Admin | Rarely | High | Yes | P0 | M |
| S26 | Plan catalog | `server/config/planCredits.js` lines 17–22 | spark 1/3, steady 3/6, scholar 6/12, summit 12/24 months (pack / validity) | Pricing | Collection | Super Admin | Monthly | High | Yes | P0 | L |
| S27 | USD per class | `server/payments.js` lines 100–102 | `$7` | Pricing | Setting | Super Admin | Monthly | High | Yes | P0 | M |
| S28 | Founder discount | `server/payments.js` lines 100–123 | `$21` per month; spark discount is `$0` so list stays `$154` | Pricing | Setting | Super Admin | Monthly | High | Yes | P0 | M |
| S29 | FX fallback | `server/payments.js` line 98 | `EXCHANGE_RATE_PHP` or `60.03`. Stays in the environment. Not an admin field | Secrets | Secret | Nobody in the CMS | Rarely | High | No | P0 | S |
| S30 | Teacher payout tiers | `server/utils/teacherPayoutTier.js` lines 11–28 | Trial code 83 = ₱45 / 25 min. Bases 180, 230, 280, 330 PHP/hr. +₱10/hr per credential. 25-min = hourly / 2 | Pricing | Collection | Super Admin | Rarely | High | Yes | P0 | L |
| S31 | Fallback class rate | `server/models/GlobalSettings.js` lines 4–8; `Teacher.js` hourlyRate default 100 | `globalRate` default 100. **Already in the database.** | Pricing | Setting | Super Admin | Monthly | High | Yes | P0 | S |
| S32 | Unique-link commission | `server/utils/referralCommissionTiers.js` lines 11–16 | spark ₱1,000, steady ₱1,500, scholar ₱2,000, summit ₱2,500. Unknown plan uses ₱1,000 | Pricing | Collection | Super Admin | Monthly | High | Yes | P0 | M |
| S33 | Admin fee percent | `server/adminFeeRoutes.js` line 38 | `COMMISSION_RATE = 2` | Pricing | Setting | Super Admin | Rarely | High | Yes | P0 | S |
| S34 | Student referral credits | `server/config/studentReferral.js` line 2 | `REFERRAL_REWARD_CREDITS = 3`. Lines 4–5 keep 1–5 only so old rows can be reversed | Pricing | Setting | Super Admin | Rarely | High | Yes | P0 | S |
| S35 | Referral badge thresholds | `server/config/studentReferral.js` lines 8–13 | 1 / 3 / 5 / 10 purchases | Lists | Collection | Super Admin | Rarely | Medium | Yes | P1 | M |
| S36 | Payment method | `GlobalSettings.studentPaymentMethod`; `server/admin.js` ~2900 | `maribank_qr` or `paymongo`. **Already admin-editable.** | Flag | Flag | Super Admin | Weekly | High | Yes | P0 | S |
| S37 | Emergency cancel window | `server/student.js` lines 883–888 | Closes at 30 minutes before start. Credit forfeited if they do not attend | Rules | Setting | Super Admin | Rarely | High | Yes | P0 | M |
| S38 | Emergency reasons | `server/student.js` lines 821–826 | Power Interruption, Natural Disaster, Accident/Medical Emergency, Other Valid Reason | Lists | Collection | Super Admin | Rarely | Medium | Yes | P1 | S |
| S39 | Teacher cancel penalties | `server/utils/tutorCancellationDeduction.js` lines 7–19 | >72h 0%, 24–72h 50%, 1–24h 75%, <1h 100% of the 25-min rate | Rules | Collection | Super Admin | Rarely | High | Yes | P0 | M |
| S40 | Early join and hard stop | `server/services/classroomEntryWindow.js` lines 7–9 | Join opens 10 minutes early. Session hard-stops at 40 minutes | Rules | Setting | Super Admin | Rarely | High | Yes | P0 | M |
| S41 | Scheduled class length | `server/index.js` ~1973 and student class table ~2290 | Treated as 25 minutes. A 50-minute option was not found as a booking rule | Rules | Setting | Super Admin | Rarely | High | Yes | P0 | M |
| S42 | Credit expiry notices | `server/services/creditExpiry.js` lines 18–19 | Unused credits hit 0 on `subscriptionEndDate`. Notices at 10, 5, and 2 Manila days. Booked classes are not reversed | Rules | Setting | Super Admin | Rarely | High | Yes | P0 | S |
| S43 | Free-plan lesson count | `server/services/freePlanAccess.js` line 13 | 3 Pre-Level lessons | Rules | Setting | Super Admin | Rarely | High | Yes | P1 | S |
| S44 | Test-plan allowlist | `server/services/freePlanAccess.js` lines 18–20 | Only `plflores3303@gmail.com` | Flag | Collection | Super Admin | Rarely | High | Yes | P1 | S |
| S45 | Garden monthly target | `server/garden/garden.config.js` line 19 | `DEFAULT_MONTHLY_TARGET = 22` | Rules | Setting | Super Admin | Rarely | Medium | Yes | P1 | S |
| S46 | Garden timezone | `server/garden/garden.config.js` line 7 | `GARDEN_TIMEZONE` or `Asia/Manila` | Rules | Setting | Super Admin | Rarely | Medium | Yes | P2 | S |
| S47 | Tree rewards | `server/garden/rewards.config.js` lines 2–29 | Max 2 trees, cap 4 credits, expiry 60 days, reminder 7 days, eligibility 0.8. Tier weights 60/30/10 and 50/35/15. `creditsEnabled: true` | Rules | Setting | Super Admin | Rarely | High | Yes | P1 | M |
| S48 | Garden care costs | `server/garden/care.config.js` lines 4–5 | Water 1 drop / +1. Fertilizer 2 drops / +3, once per stage | Rules | Setting | Super Admin | Rarely | Medium | Yes | P2 | S |
| S49 | Share age | `server/garden/share.config.js` line 2 | Sharing on at age 13 unless a parent turns it on | Rules | Setting | Super Admin | Rarely | High | Yes | P1 | S |
| S50 | Species list | `server/garden/garden.config.js` ~32 | Acacia, Narra, Oak, Mahogany, Mango, Banyan, Molave, Cherry Blossom, Pine, Maple | Lists | Collection | Super Admin | Rarely | Low | No | P2 | M |
| S51 | Game drop mode | `server/garden/garden.config.js` line 16 | `once-per-month` | Flag | Flag | Super Admin | Rarely | Medium | Yes | P2 | S |
| S52 | Student levels | `server/models/Student.js` line 56 and progress keys ~170 | Little Seeds, Sprouts, Saplings, Young Stewards | Lists | Collection | Super Admin | Rarely | High | Yes | P1 | L |
| S53 | Email subjects | `server/emailService.js` lines 274, 398, 475, 546, 606, 664 | Welcome teacher, subscription activated, assessment results, set password, welcome team, application update | Notifications | Template | Super Admin | Rarely | Medium | Yes | P1 | L |
| S54 | Later email templates | `server/emailService.js` ~814–1157 use `template.subject` | **Needs confirmation** whether those bodies are already data-driven or still inline HTML | Notifications | Template | Super Admin | Rarely | Medium | Yes | P1 | L |
| S55 | Login rate limits | `server/middleware/apiRateLimits.js` | Login 40/15m, admin login 10/15m, reset 12/hour, upload 120/15m, teacher search 40/min, QR claim 20/15m, register 25/hour, invite lookup 40/15m. Env can raise them. No admin UI | Limits | Setting | Super Admin | Rarely | Medium | Yes | P2 | M |
| S56 | Password rules | `server/auth.js` line 179 vs line 1297 | Teacher invite allows 6 characters. Reset requires 8 with upper, lower, digit, symbol | Limits | Setting | Super Admin | Rarely | High | Yes | P1 | M |
| S57 | Session TTL | `server/config/authTokens.js` lines 7–16 | Student/teacher JWT `1h` unless `JWT_EXPIRES_IN`. Admin JWT `2h`. Admin idle 30 minutes | Limits | Setting | Super Admin | Rarely | High | Yes | P2 | S |
| S58 | Facebook on login | `login/login.js` line 87 | `providers: ['google']` only | Flag | Flag | Super Admin | Weekly | Medium | Yes | P1 | S |
| S59 | OAuth and payment secrets | `server/config/oauth.js`; PayMongo env in `server/webhooks.js` ~121 | Client ids may be shown in admin as “configured: yes/no”. Secrets must not be stored or displayed | Integrations | Secret | Nobody in the CMS | Rarely | High | No | P0 | S |
| S60 | SMTP and JWT | `server/emailService.js` SMTP block; `JWT_SECRET` | Host may be displayed as status. Passwords and JWT stay in env | Integrations | Secret | Nobody in the CMS | Rarely | High | No | P0 | S |
| S61 | Announcements | `server/models/Announcement.js` | content, role, topic. **Already a CMS** for portal dashboards | Content | Collection | Admin | Daily | Low | Yes | — | — |
| S62 | No daily class cap | Booking services | Former cap of 6 was removed. Do not reintroduce via settings | Rules | Setting | Super Admin | Never | High | Yes | — | — |
| S63 | Gender | Profile selects and teacher enum | Male / Female only. Do not add Other through a CMS list | Lists | Setting | Super Admin | Never | Medium | Yes | — | — |

No testimonial block was found. **Needs confirmation:** a single promo-code model (none was found in this pass), SMS provider (none found), and whether `client/` duplicates any of the homepage strings.

### Counts

Counts below use the Category column, so each ID is in one bucket.

| Category | Count | IDs |
| --- | --- | --- |
| Branding | 6 | S01–S06 |
| Page content | 18 | S07–S14, S16–S24, S61 |
| Pricing | 10 | S15, S25–S28, S30–S34 |
| Booking, class, and garden rules | 12 | S37, S39–S43, S45–S49, S62 |
| Lists | 5 | S35, S38, S50, S52, S63 |
| Notifications | 2 | S53–S54 |
| Limits | 3 | S55–S57 |
| Feature flags | 4 | S36, S44, S51, S58 |
| Secrets | 3 | S29, S59–S60 |

| Priority | Count | IDs |
| --- | --- | --- |
| P0 | 20 | S15, S21, S25–S34, S36, S37, S39–S42, S59, S60 |
| P1 | 21 | S05, S08, S16–S20, S22, S23, S35, S38, S43–S45, S47, S49, S52–S54, S56, S58 |
| P2 | 19 | S01–S04, S06, S07, S09–S14, S24, S46, S48, S50, S51, S55, S57 |
| Do not build | 3 | S61 already exists. S62 and S63 must stay fixed. |

Unique IDs: 63. P0 includes three secret rows that stay in env (S29, S59, S60). Editable product settings at P0: 17.

## 4. Proposed settings page structure

Two screens, because `nav:settings` can never be granted to Marketing (`SUPER_ADMIN_ONLY_KEYS` in `server/services/adminRbac.js`).

| Screen | Who | Permission |
| --- | --- | --- |
| Homepage and FAQ | Admin — Marketing (`admin_marketing`) | New keys, for example `content:homepage` and `content:faq`. These keys are grantable. They are not `nav:settings`. |
| Prices, payouts, commissions, booking rules, consent version, feature flags, and teacher legal pages | Super-Admin | Existing `nav:settings`. |

HR, QA, and Accounting do not get either screen. Accounting still enters the per-cutoff bonus on payroll. That amount is per teacher, not a global percent.

| Tab | Findings | Who | Notes |
| --- | --- | --- | --- |
| General | S04, S05, S46, S57 | Super-Admin | Site contact, locality, default timezone, session lengths. Show “secret configured” only. |
| Branding | S01–S03, S06, S07 | Super-Admin | Title, meta, login copy. Logo file stays a static asset until Phase 2 has an upload. |
| Homepage | S08–S14, S16 | Marketing | Culture block order stays fixed. Plan card headlines may be edited here. Peso amounts are computed in Phase 3 and are not a text field. |
| FAQ | S23 | Marketing | Announcements stay on the current announcements page (S61). |
| Languages | S24 | Super-Admin | en/zh/ja/ko hero strings. |
| Classes and booking | S37–S43, S62 | Super-Admin | Windows and free-lesson count. The UI must not offer a daily cap. |
| Pricing and payments | S15, S25–S28, S30–S36, S44 | Super-Admin | Plans, USD rate, founder discount, payout tiers, commissions, admin fee, referral credits, payment method (already built). FX is not on this tab. |
| Garden | S45, S47–S51 | Super-Admin | Target, care, reward weights, share age, species. |
| Notifications | S42, S53, S54 | Super-Admin | Email and in-app only. No SMS templates. |
| Users and roles | existing RBAC | Super-Admin | Do not duplicate the roles screen. Link to it. |
| Public legal | S18–S21 | Super-Admin | Public privacy, terms, and the consent version. Changing S21 re-prompts every parent. |
| Teacher legal | S22 | Super-Admin | Teacher privacy and the contractor agreement may be edited in the browser. No other role. |
| Feature flags | S36, S51, S58 | Super-Admin | Payment method, garden credit kill switch, Facebook on the login page. Facebook defaults to off. |
| Security | S55–S57, S59, S60 | Super-Admin | Rate-limit numbers and password minimums. Secrets are status-only. |

Teachers and students do not edit these tabs. Teachers keep editing their own profile.

## 5. Proposed data model

Three stores. Do not put homepage HTML in the same row as the payout table.

### 5.1 Key-value settings

Extend `GlobalSettings` with a `values` map, or add `site_settings` if the current document should stay small. Recommended: one `site_settings` collection so payroll’s `globalRate` update path does not have to know about FAQ.

```text
site_settings
  key            string, unique
  group          string   // pricing, booking, garden, brand, flags, security
  type           number | string | boolean | json
  value          Mixed
  defaultValue   Mixed
  label          string
  updatedBy      string   // admin username
  updatedAt      date
```

Seed keys (value = today’s constant):

- `creditsPerMonth` = 22
- `usdPerClass` = 7
- `founderDiscountPerMonth` = 21
- `sparkFounderDiscount` = 0
- `adminFeePercent` = 2
- `referralRewardCredits` = 3
- `emergencyCancelMinutes` = 30
- `earlyEntryMinutes` = 10
- `classMaxMinutes` = 40
- `classLengthMinutes` = 25
- `creditNoticeDays` = [10, 5, 2]
- `freePlanLessonCount` = 3
- `gardenMonthlyTarget` = 22
- `gardenTimezone` = Asia/Manila
- `treeCreditCap` = 4
- `treeCreditExpiryDays` = 60
- `treeReminderDays` = 7
- `treeEligibilityRatio` = 0.8
- `gardenCreditsEnabled` = true
- `minShareAge` = 13
- `loginFacebookEnabled` = false (stays false until a Super-Admin turns it on)
- `privacyConsentVersion` = 2026-10-01
- `supportEmail` = support@remoedph.com

`globalRate` and `studentPaymentMethod` stay on `GlobalSettings` so current routes keep working. The new screen reads them too.

Validation examples: percents 0–100, minutes > 0, plan prices > 0, timezone must be an IANA name, consent version must be `YYYY-MM-DD`.

### 5.2 Dedicated collections (own CRUD)

| Collection | Seed from | Fields |
| --- | --- | --- |
| `plan_catalog` | `PLAN_DEFINITIONS` + payments math | planId, label, bundleName, months, validityMonths, sortOrder, active |
| `payout_tiers` | `TIER_VALUES`, trial 45, credential addon 10 | code, name, hourlyPhp or flatPer25, credentialAddonPhp |
| `commission_tiers` | `REFERRAL_COMMISSION_BY_PLAN` | planId, php |
| `faq_entries` | `remoed-faq-data.js` | locale, question, answer, sortOrder, published |
| `cancel_penalty_bands` | tutor cancellation function | minHours, maxHours, percent |
| `garden_species` | `SPECIES` | name, sortOrder, active |
| `email_templates` | Phase 4 only | key, subject, html, text |

Plans are not a single number. Adding a fifth plan later means a row plus a webhook allowlist. Until that allowlist is data-driven, new plan ids need a code change. Call that out in the screen (“contact engineering to enable a new plan id”).

### 5.3 Page blocks

```text
page_blocks
  pageKey     home | privacy | terms | login
  blockKey    hero | who | principles | ...
  locale      en
  bodyHtml    string
  published   boolean
```

Seed by copying the current HTML of each section. The public page reads the block and, if missing, falls back to the HTML still in the file. That fallback is the rollback.

Announcements stay on `Announcement`. Do not merge them into `page_blocks`.

### 5.4 Cache

Production is one Node process: PM2 fork mode, app name `remoed-api`, one Hostinger VPS. There is no cluster mode, no Redis, and no load balancer. One in-memory snapshot is enough.

- On server startup, load all settings (key-value rows, plan catalog, payout tiers, commission tiers, FAQ, and page blocks) from Mongo into one module-level object.
- Each request reads that object. Do not call Mongo for a setting on the request path.
- On admin save, in the same request: write Mongo, append `AdminAuditLog` (`action: 'setting.update'`, `details: { key, from, to }`), then replace the in-memory value. The next request on this process sees the new value immediately.
- Safety net: if the snapshot is older than 5 minutes, reload it from Mongo before the next read. This covers a missed invalidation. It is not the normal publish path.
- Super-Admin action `POST /api/admin/site-settings/refresh` reloads the snapshot immediately. Marketing does not get this action.
- Restore default writes `defaultValue` back to `value`, audits `setting.restore`, and updates the snapshot in that same request.

If the app later runs in PM2 cluster mode or on more than one server, this snapshot will not update the other processes. At that point switch to a short TTL (30–60 seconds) or to Redis. Do not add Redis for the current single process.

### 5.5 Access, validation, rollback

- Marketing writes: `verifyAdmin` + authenticator session + `content:homepage` or `content:faq`. Those routes reject price keys, payout rows, consent version, and teacher legal blocks.
- Every other write: `verifyAdmin` + authenticator session + `requirePermission('nav:settings')`.
- Reject unknown keys. Reject types that do not match the seed (a string in `usdPerClass`).
- Price and consent-version saves require the Super-Admin to retype the key name. No second approver.
- Audit log is append-only. Restore uses `defaultValue`, not a delete.
- Homepage and checkout must use the same plan cache. The peso on the card is computed, not typed a second time. Marketing cannot type a peso amount.

## 6. What stays in environment variables

| Name | Why |
| --- | --- |
| `MONGODB_URI` | Database credential. Must keep ending in `/test`. |
| `JWT_SECRET` and admin session secret | Forging a token if this leaks from an admin screen is worse than a price typo. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | OAuth client secrets. Admin may see “Google configured: yes”. |
| `PAYMONGO_*` and webhook secret | Payment signing secret. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_USER`, `EMAIL_PASS` | Mailbox password. |
| Sentry DSN | If set. **Needs confirmation** of the env name. |
| `EXCHANGE_RATE_PHP` | Stays here. Accounting does not edit it in Settings. Code fallback remains `60.03` when the variable is empty. There is no admin FX field. |
| Rate-limit env vars already in `apiRateLimits.js` | Keep as an emergency override above the admin number. |

Public site URL (`FRONTEND_URL` / `OAUTH_PUBLIC_BASE_URL`) stays env because OAuth redirect URIs are registered with Google and must not be edited from a form (`https://remoedph.com/api/auth/oauth/...`).

## 7. Phased roadmap

### Phase 1 — Foundation

**Tasks.** Add `site_settings` and a seed that inserts the keys in section 5.1 only if missing. In-memory cache with the rules in section 5.4 (load on startup, read from memory, update the snapshot in the save request, 5-minute TTL, Super-Admin refresh). `GET/PUT /api/admin/site-settings` behind `nav:settings`. Audit log on write and restore. Settings tab that lists keys and values. No public page reads it yet. Add `content:homepage` and `content:faq` to the RBAC catalog and to the `admin_marketing` seed. Do not add those keys to `SUPER_ADMIN_ONLY_KEYS`.

**Files.** `server/models/GlobalSettings.js` (read-only reuse), new model, `server/admin.js` or a small new router, `public` settings HTML next to the existing admin settings page, `server/services/adminRbac.js` only if a new permission key is required (prefer existing `nav:settings`).

**Depends on.** Nothing.

**Effort.** M.

**Risk.** A bad seed overwrites `globalRate`. Seed must not touch that field.

**Done when.** Saving `supportEmail` audits the change, restore returns the seed, and checkout amounts are unchanged because nothing reads the cache yet.

### Phase 2 — Branding, contact, FAQ, legal

**Tasks.** Wire S01–S14, S16–S21, S23. Marketing can save homepage blocks and FAQ. Super-Admin saves branding, contact, public legal HTML, and the consent version. Homepage plan **prices** still come from Phase 3; Phase 2 may edit headlines only. Privacy version edit shows the warning that every parent must accept again. Teacher privacy and the contractor agreement (S22) are a Super-Admin editor in this phase.

**Files.** `public/index.html`, `login/index.html`, `public/js/remoed-faq-data.js` (become a fetch with the JS file as fallback), legal HTML pages, settings UI.

**Depends on.** Phase 1 cache.

**Effort.** L.

**Risk.** Culture block order is fixed (Who we are, Principles, Pillars, HEART, Vision/Mission). The CMS must not reorder those blocks.

**Done when.** Changing the support email updates the footer without a deploy, and a missing block still shows today’s HTML.

### Phase 3 — Business rules, pricing, lists

**Tasks.** `computePlanTotals` and `planCredits.js` read the cache, with the current constants as fallback. Payout tier function and commission map read collections. Booking windows read settings. Homepage cards render the computed peso, not a second hardcoded price. Garden configs read settings but keep file fallbacks.

**Files.** `server/payments.js`, `server/config/planCredits.js`, `server/utils/teacherPayoutTier.js`, `server/utils/referralCommissionTiers.js`, `server/adminFeeRoutes.js`, `server/student.js`, `server/services/classroomEntryWindow.js`, `server/services/creditExpiry.js`, `server/config/studentReferral.js`, `server/garden/*.config.js`, `public/index.html` plan section.

**Depends on.** Phase 1. Do this before deleting literals.

**Effort.** L.

**Risk.** PayMongo amount in centavos must match the cached math. FX stays `EXCHANGE_RATE_PHP` (fallback `60.03`) and is not an admin field. Require the retype confirmation on price keys.

**Done when.** A seeded database produces the same spark/steady/scholar/summit peso totals as today’s `computePlanTotals`, and a teacher on tier 180 with no credentials still gets the same 25-minute rate.

### Phase 4 — Templates and flags

**Tasks.** Move S53 subjects and HTML into `email_templates` with the current HTML as seed. Email and in-app notices only. Do not add SMS. Flag S58 (`loginFacebookEnabled`) read by `login/login.js`, seeded false, Super-Admin only. Expose `gardenCreditsEnabled` (already a constant). Do not move SMTP passwords.

**Files.** `server/emailService.js`, `login/login.js`, garden reward service.

**Depends on.** Phase 1. Can follow Phase 2. Independent of Phase 3 except the garden flag.

**Effort.** L.

**Risk.** A broken HTML template sends a blank receipt. Preview with sample data before save. Keep the file body if the DB row is empty.

**Done when.** The login page shows Google only while the flag is false. Turning it on shows Facebook on the login page only. A receipt email still sends if the template row is missing.

### Phase 5 — Cleanup

**Tasks.** Remove duplicated peso strings from `index.html` once Phase 3 is live. Add node tests that seed values match the old constants. Document the keys in `STABLE_BASELINE.md` only when behavior changes. Do not delete fallbacks until one production cycle has passed.

**Files.** Tests under `tests/`, the config modules (fallback remains), homepage.

**Depends on.** Phases 2–4.

**Effort.** M.

**Risk.** Deleting a fallback before the seed runs in production.

**Done when.** Tests fail if spark is not 22 credits at $7 with $0 founder discount, and the homepage price matches the server total.

## 8. Migration and rollback

1. Deploy the model and seed. Seed inserts only missing keys. It does not update keys an admin has already changed.
2. Readers keep using source constants until a later deploy flips them to the cache. Behavior stays the same while the table fills.
3. Flip readers one group at a time (contact email, then plans, then booking).
4. Rollback of a bad value: Restore default in the UI (writes `defaultValue`).
5. Rollback of a bad deploy: the file fallbacks still run if the cache fails to load. Do not remove those fallbacks in the same deploy as the flip.
6. Legal version: store the previous version. Rolling it back stops new prompts but does not delete consents already saved on the student.
7. Never drop the `test` database as part of this work.

## 9. Risks and owner decisions

**Decisions (2026-10-19)**

1. Marketing (`admin_marketing`) edits the homepage and the FAQ. Prices and the privacy consent version stay with Super-Admin. Marketing must not receive `nav:settings`, because that key cannot be granted to other roles. Use new `content:homepage` and `content:faq` keys.
2. The peso exchange rate is not an admin setting. It stays `EXCHANGE_RATE_PHP`, with code fallback `60.03`.
3. Teacher privacy and the contractor agreement may be edited in the browser, by Super-Admin only.
4. Facebook login stays off. The flag defaults to false until a Super-Admin turns it on.
5. One Node process: PM2 fork mode, `remoed-api`, one Hostinger VPS. Cache rules are in section 5.4. If the app later moves to cluster mode or more than one server, switch to a 30–60 second TTL or Redis.
6. No SMS. Templates cover email and the existing in-app notices only.

**Risks**

- Two price sources (HTML and `payments.js`) already can disagree. Phase 3 must make the server the only price. Marketing can edit the card headline and cannot edit the peso.
- `globalRate` (100) and payout tiers (180+) are different ideas. The screen must label them so a Super-Admin does not overwrite the tier table thinking it is the global rate.
- Changing `privacyConsentVersion` locks booking and checkout until parents accept. That is intended and easy to do by mistake. Only Super-Admin can change it.
- A second Node process would keep the old snapshot until restart, because there is no Redis. The 5-minute TTL only reloads the process that is running. The current VPS has one process, so a save updates the live snapshot in that request.
- New plan ids need webhook and credit-lot code, not only a row.
- Homepage culture order and Male/Female are product rules, not content experiments.

## 10. Quick wins (under a day each)

1. Seed `supportEmail` and read it in the two footers (S05). Fallback to the current address.
2. Settings toggle for Facebook on the login page (S58), default off, Super-Admin only. One boolean, no new collection.
3. Show PayMongo / QR and `globalRate` on the same screen they already save to, with a link, so people stop hunting.
4. Single computed price helper used by the homepage cards, still using today’s formula, so the peso cannot be typed twice (S15). This can ship before the database catalog.
5. Audit log line on the existing global-rate and payment-method saves if those routes do not already write `AdminAuditLog`. **Needs confirmation** of whether they do.
6. Document in the settings screen that there is no daily class cap, so nobody adds the old limit of 6 back.
