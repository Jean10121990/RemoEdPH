"""Parse the Level 2 Month 1 Google Doc export into lesson description and teacher notes."""
import json
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2])
content = json.loads(src.read_text(encoding="utf-8"))["content"]


def clean(value):
    text = str(value or "").replace("\u00a0", " ")
    text = re.sub(r"\\(?=\S)", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip().strip("*").strip()


lessons = []
parts = re.split(r"\n(?=# Lesson \d+)", content)
for part in parts:
    heading = re.match(r"# Lesson (\d+)\s+[–-]\s+(.+)", part)
    if not heading:
        continue
    number = int(heading.group(1))
    title = clean(heading.group(2))

    def grab(pattern):
        match = re.search(pattern, part)
        return clean(match.group(1)) if match else ""

    unit = grab(r"Unit:\s*(.+?)\s*\|")
    pillars = grab(r"\*\*Core Pillars:\*\*\s*(.+?)\s*\|")
    vocab = grab(r"\*\*Target Vocabulary:\*\*\s*(.+?)\s*\|")
    sentence = grab(r"\*\*Target Sentence:\*\*\s*(.+?)\s*\|").strip("\"'")
    goals = grab(r"\*\*Teaching Goals:\*\*\s*(.+)")
    strategies = grab(r"\*\*Classroom Strategies:\*\*\s*(.+)")
    values = grab(r"\*\*Values Integration:\*\*\s*(.+)")
    success = grab(r"\*\*Success Indicators:\*\*\s*(.+)")

    slides = []
    slide_re = re.compile(
        r"\*\*Slide (\d+)\s+[–-]\s+(.+?)\*\*(.*?)(?=\*\*Slide \d+\s+[–-]|\Z)",
        re.S,
    )
    script_re = re.compile(
        r"Teacher Script\s*&\s*TPR:\*?\s*(.+?)(?:\n\s*\n|\n\*\*|\Z)",
        re.S,
    )
    for match in slide_re.finditer(part):
        script_match = script_re.search(match.group(3))
        slides.append(
            {
                "n": int(match.group(1)),
                "title": clean(match.group(2)),
                "script": clean(script_match.group(1)) if script_match else "",
            }
        )

    description = "\n".join(
        [
            "Unit: " + unit,
            "Core Pillars: " + pillars,
            "Target Vocabulary: " + vocab,
            'Target Sentence: "' + sentence + '"',
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
        }
    )

out.write_text(json.dumps(lessons, ensure_ascii=False), encoding="utf-8")
print("wrote %d" % len(lessons))
for lesson in lessons:
    print(
        lesson["lessonNumber"],
        lesson["slideCount"],
        lesson["scriptCount"],
        lesson["title"],
        len(lesson["description"]),
        len(lesson["teacherNotes"]),
    )
