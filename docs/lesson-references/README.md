# RemoEd lesson references

Canonical source for **slide lesson generation**. The remoed-lesson-creation skill reads this folder — not workspace-root `reference.md`.

Also align with https://www.remoedph.com. If this folder, the website, and the codebase disagree, **stop and ask** before generating.

## Character stills (canonical)

Use these files. Do not invent alternate Remo / Ed / Sofie / Teacher Grace designs.

| Asset | Path | Notes |
|-------|------|--------|
| Ed | `docs/lesson-references/ed.jpg` | Filipino boy; messy black hair; light blue puffer; yellow tee; navy pants; grey sneakers |
| Sofie | `docs/lesson-references/sofie.jpg` | Filipino girl; pigtails with orange flower ties; yellow hoodie; light blue jeans. Outlines may say Sophia — use **Sofie** |
| Teacher Grace | `docs/lesson-references/teacher-grace.png` | Filipino woman; glasses; shoulder-length dark hair; white / royal-blue / yellow polo; black pants |
| Remo | `docs/lesson-references/remo-green.jpg` | Cute **green** round robot; sprout on head. **Never** white |
| Logo | `docs/lesson-references/remoedph-logo.jpg` | Bottom-right on every page (white plate knocked out in compose) |

## Chrome and compose

- Overlay rules: [slide-chrome.md](slide-chrome.md) and `.cursor/skills/remoed-lesson-creation/SKILL.md`
- Shared composer: `build_l2m1_lessons_7_9.py` (`build_lesson`) — footer and page total follow each lesson dict
- Sample look: `Sample-Lesson.pptx` (Lesson 6 – I am Happy!). Do not copy those Happiness Corner layouts
- Drive staging: [drive-upload.md](drive-upload.md) and `drive-upload-stage/`
- Laptop: `D:\Users\Window11\Desktop\JeanDesktop\RemoEdPH\A Lesson and Training Materials\Level {1\|2\|3\|4}\` as `RemoEd ….pptx`

## Curriculum PDFs

| Level | File |
|-------|------|
| 1 Little Seeds | `L1M1-Little-Seeds-Month-1.pdf` |
| 2 Sprouts | `L2M1-Sprouts-Month-1.pdf` |
| 3 Saplings | `L3M1-Saplings-Month-1.pdf` |
| 4 Young Steward | `L4M1-Young-Steward-Month-1.pdf` |

**PDF footer vs track:** Sprouts Month 1 PDFs often say Level 1. User + this folder = **Level 2 – Sprouts**. Saplings PDFs are **Level 3**. Follow the user and this folder, not a mismatched PDF footer.

### Page-count targets

| Level | Name | Pages |
|-------|------|--------|
| 1 | Little Seeds | follow that outline |
| 2 | Sprouts | **15** |
| 3 | Saplings | **18–20** (Month 1 detailed slides are **18**) |
| 4 | Young Steward | **22–25** |

Generate in batches of three. On-screen learner phrases only — no Teacher Scripts. Do not bake letters, words, numbers, or logos into generated art; stamp phonics/name text in code when needed.

## Active / completed briefs

Per-lesson outlines and PPTX live under `lessons/L{level}M1-Lesson-{N}/`.

| Track | Status |
|-------|--------|
| L2M1 Sprouts 7–22 | Completed (15 pages, `SPROUTS! MONTH 1`, laptop Level 2) |
| L3M1 Saplings 1–6 | Completed (18 pages, `SAPLINGS! MONTH 1`, laptop Level 3) |
