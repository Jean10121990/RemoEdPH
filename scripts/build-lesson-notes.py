"""Parse a Month 1 Google Doc export into lesson description and teacher notes.

Accepts Level 1, 3, and 4 heading styles:
  # Lesson N – title
  # Lesson N: title
  # LESSON N – title
  # LESSON N: title

Scripts may be labeled "Teacher Script & TPR" or "Teacher Script",
including blockquote and circle-bullet prefixes.
"""
import json
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2])
content = json.loads(src.read_text(encoding="utf-8"))["content"]


def plain(value):
    """Drop markdown stars and escapes so broken bold still matches."""
    text = str(value or "").replace("\u00a0", " ")
    text = re.sub(r"\\(?=\S)", "", text)
    text = text.replace("*", "")
    return text


def clean(value):
    text = plain(value)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def first_cell(value):
    return clean(value).split("|")[0].strip()


def grab(text, pattern):
    match = re.search(pattern, plain(text))
    return first_cell(match.group(1)) if match else ""


HEADING = re.compile(r"#\s+Lesson\s+(\d+)\s*[:\u2013\-]\s+(.+)", re.I)
SLIDE = re.compile(r"\*\*Slide\s+(\d+)\s+[\u2013\-]\s+(.+?)\*\*")
SCRIPT = re.compile(r"Teacher Script(?:\s*&\s*TPR)?\s*:\s*(.+)")

lessons = []
parts = re.split(r"\n(?=#\s+Lesson\s+\d+)", content, flags=re.I)
for part in parts:
    heading = HEADING.match(part)
    if not heading:
        continue
    number = int(heading.group(1))
    title = clean(heading.group(2))
    header = re.split(r"TEACHER GUIDEBOOK", part, maxsplit=1)[0]

    guide = ""
    guide_match = re.search(
        r"TEACHER GUIDEBOOK(.*?)(?:FULL SLIDE CURRICULUM|\*\*Slide\s+\d+)",
        part,
        re.S,
    )
    if guide_match:
        guide = guide_match.group(1)

    unit = grab(header, r"Unit:\s*(.+)")
    pillars = grab(header, r"Core Pillars:\s*(.+)")
    vocab = grab(header, r"Target Vocabulary:\s*(.+)")
    sentence = grab(header, r"Target Sentence:\s*(.+)")
    christian = grab(header, r"Christian Value:\s*(.+)")
    if christian and christian.lower() not in pillars.lower():
        pillars = (pillars + ", Christian Value: " + christian).strip(", ")

    goals = grab(guide, r"Teaching Goals:\s*(.+)")
    strategies = grab(guide, r"Classroom Strategies:\s*(.+)")
    values = grab(guide, r"Values Integration:\s*(.+)")
    success = grab(guide, r"Success Indicators:\s*(.+)")

    matches = list(SLIDE.finditer(part))
    slides = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(part)
        body = part[match.end() : end]
        script = ""
        script_match = SCRIPT.search(plain(body))
        if script_match:
            script = clean(script_match.group(1))
            script = re.split(r"Slide\s+\d+\s+[\u2013\-]", script)[0].strip()
        slides.append(
            {
                "n": int(match.group(1)),
                "title": clean(match.group(2)),
                "script": script,
            }
        )

    if sentence.startswith('"') or sentence.startswith("'"):
        sentence_line = "Target Sentence: " + sentence
    else:
        sentence_line = 'Target Sentence: "' + sentence + '"'

    description = "\n".join(
        [
            "Unit: " + unit,
            "Core Pillars: " + pillars,
            "Target Vocabulary: " + vocab,
            sentence_line,
        ]
    )
    notes = [
        "TEACHER GUIDEBOOK",
        "",
        "Teaching Goals: " + goals,
        "Classroom Strategies: " + strategies,
        "",
        "Values Integration: " + values,
        "Success Indicators: " + success,
        "",
        "2. FULL SLIDE CURRICULUM: %d SLIDES" % len(slides),
        "",
    ]
    for slide in slides:
        notes.append("Slide %d – %s" % (slide["n"], slide["title"]))
        notes.append("Teacher Script & TPR: " + slide["script"])
        notes.append("")

    lessons.append(
        {
            "lessonNumber": number,
            "title": title,
            "description": description,
            "teacherNotes": "\n".join(notes).strip() + "\n",
            "estimatedDuration": 25,
            "slideCount": len(slides),
            "scriptCount": sum(1 for slide in slides if slide["script"]),
            "goals": goals,
            "unit": unit,
            "pillars": pillars,
            "vocab": vocab,
            "sentence": sentence,
        }
    )

out.write_text(json.dumps(lessons, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote %d" % len(lessons))
for lesson in lessons:
    missing = [
        name
        for name in ("unit", "pillars", "vocab", "sentence", "goals")
        if not lesson[name]
    ]
    flag = " MISSING " + ",".join(missing) if missing or lesson["scriptCount"] == 0 else ""
    print(
        "%2d slides=%2d scripts=%2d %s%s"
        % (
            lesson["lessonNumber"],
            lesson["slideCount"],
            lesson["scriptCount"],
            lesson["title"],
            flag,
        )
    )
