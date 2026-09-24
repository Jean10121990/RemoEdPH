---
name: remoed-lesson-creation
description: >-
  Generate and style RemoEd slide lessons in the exact 3D Pixar-style look with
  Remo (cute green robot), Ed, Sofie, and Teacher Grace. Use when creating,
  restyling, or updating RemoEd lesson slides/pages, Sprouts/Little Seeds/Saplings
  lessons, title pages, page chrome (lesson label, page badge, level footer), or
  when the user pastes Lesson Creation Prompts / attaches lesson reference photos.
---

# RemoEd Lesson Creation

Apply these rules whenever generating or restyling RemoEd lesson slides. Prefer attached reference photos over inventing a new art style.

**Before any lesson or brand work:** read workspace-root [`reference.md`](../../../reference.md) (character paths, logo, brand rules, active lesson brief). Also align with https://www.remoedph.com. If `reference.md`, the website, and the codebase disagree, **stop and ask** before generating.

## Core style (always)

Please generate/style lesson so that all slides match the exact 3D Pixar-style animated look used in previous lessons. Make sure the character Remo is depicted as the cute green friendly robot (like in the reference image) instead of the white robot. Do not include Teacher Scripts. Please make the characters Ed, the boy and Sofie, the girl look more of a Filipino or Asian together with Teacher Grace. Also make the title text bigger fonts around 60 in the title page or first page usually it starts with “Lesson No. – (Lesson Title)”. Always generate new lessons from scratch and do not reuse styles from previous lessons. I will attach some reference photos.

## Characters

| Character | Must look like |
|-----------|----------------|
| **Remo** | Cute **green** friendly robot (reference image). Never the white robot. |
| **Ed** | Boy — Filipino / Asian features |
| **Sofie** | Girl — Filipino / Asian features |
| **Teacher Grace** | Filipino / Asian features |

## Do not

- Do **not** include Teacher Scripts
- Do **not** change existing 3D background artwork or characters when only adding chrome/overlays (see below)
- Do **not** depict Remo as a white robot

## Per-lesson inputs (ask if missing)

- Level track (e.g. Level 2 – Sprouts)
- Month label for footer (e.g. `SPROUTS! MONTH 1`)
- Lesson number and title (e.g. Lesson 6 – I am Happy!)
- Page range (e.g. Pages 1 to 15)
- Reference photos (use if attached)

## Apply to every selected page

Apply these elements to **all** selected pages:

1. **Top-left corner:** Add text `Lesson {N} – {Title}` (same wording as the lesson title)
2. **Top-right corner:** Add page number badge (e.g. `1 / 15`, `2 / 15`, …)
3. **Bottom-right corner:** Add text `{LEVEL}! MONTH {M}` (e.g. `SPROUTS! MONTH 1`) **and** the RemoEd PH logo **directly on the slide art**. No white rounded card, padding box, border, or shadow-card behind them. Text is `#FFFFFF`, with `text-shadow: 0px 2px 4px rgba(0, 0, 0, 0.7)`. Logo uses `filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.6))`. Keep a row aligned to the bottom-right with padding from the edges (label, then logo).
4. **Keep all existing 3D background artwork and characters completely unchanged** when adding or adjusting these overlays

## Title page / first page

- Format: `Lesson {N} – {Title}`
- Font size: **around 60**
- Example: Title Page/First Page: Lesson 6 – I am Happy! (font size: 60)

## Example (Level 2 – Sprouts)

When the user specifies this lesson, use:

- Level: Level 2 - Sprouts
- Title Page/First Page: Lesson 6 – I am Happy! (font size: 60)
- Top-left: `Lesson 6 – I am Happy!`
- Top-right: page badge `1 / 15` … `15 / 15`
- Bottom-right: `SPROUTS! MONTH 1` in white with a dark drop shadow, plus the RemoEd PH logo with a drop shadow — no white card behind them
- Pages: 1 to 15
- Keep all existing 3D background artwork and characters completely unchanged

## Workflow checklist

Copy and track:

```
Lesson Progress:
- [ ] Confirm level, month footer, lesson No., title, page count
- [ ] Match 3D Pixar-style to previous lessons / reference photos
- [ ] Remo = cute green robot (not white)
- [ ] Ed, Sofie, Teacher Grace = Filipino / Asian look
- [ ] No Teacher Scripts
- [ ] Title page: “Lesson No. – (Lesson Title)” ~font 60
- [ ] Every page: top-left lesson label, top-right N / total badge
- [ ] Every page: bottom-right “{LEVEL}! MONTH {M}” (white, drop shadow) + RemoEd PH logo (drop shadow), no white card
- [ ] Overlays only — do not alter existing 3D backgrounds/characters unless user asks to regenerate art
- [ ] Copy finished PPTX to laptop: `D:\Users\Window11\Desktop\JeanDesktop\RemoEdPH\A Lesson and Training Materials\Level {N}\` as `RemoEd …pptx` (Level 1–4 folders)
```

## Output

- Produce or restyle the requested page range only
- Keep chrome text consistent across pages (same lesson label; badge increments)
- If regenerating art, still follow character and style rules above
- **After generation:** save/copy each deck into the matching **Level 1 / Level 2 / Level 3 / Level 4** folder under `D:\Users\Window11\Desktop\JeanDesktop\RemoEdPH\A Lesson and Training Materials\` (build scripts do this for L2M1 via `build_l2m1_lessons_7_9.build_lesson`)

# RemoEd PH Mission

To provide kids across Asia with an accessible, God-centered online education that fosters English proficiency, moral integrity, and environmental stewardship—investing our grace-given success back into local communities to build a sustainable and hopeful future for all.
