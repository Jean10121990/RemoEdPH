# Slide chrome — bottom-right footer

Applies to **every** RemoEd lesson deck (Sample Lesson and all generated Sprouts lessons), not only a single month batch.

On every lesson page, draw `{LEVEL}! MONTH {M}` (for Sprouts Month 1: `SPROUTS! MONTH 1`) and the RemoEd PH logo **on the slide art**.

- No white rounded rectangle, card, padding box, border, or drop-shadow panel behind the pair.
- Text color: `#FFFFFF`.
- Text shadow: `0px 2px 4px rgba(0, 0, 0, 0.7)`.
- Logo shadow: `drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.6))`. Knock out the logo file’s white plate before placing it.
- Layout: one row, bottom-right. Label first, then logo. About 0.28" from the right edge and 0.22" from the bottom, with a small gap between label and logo.

Implemented in `docs/lesson-references/build_l2m1_lessons_7_9.py` (`draw_footer`). Re-apply across Sample + L2M1 Lessons 7–12 with `docs/lesson-references/restyle_all_lesson_footers.py`. Top-left lesson pill, top-right page badge, title banner, and yellow learner chip stay as they are.
