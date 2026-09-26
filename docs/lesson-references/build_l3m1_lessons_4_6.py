"""Build L3M1 Saplings Lessons 4–6 PPTX using the shared chrome composer."""
import shutil
from pathlib import Path

from build_l2m1_lessons_7_9 import build_lesson

FOOTER = "SAPLINGS! MONTH 1"

LESSONS = [
    {
        "num": 4,
        "level": 3,
        "footer": FOOTER,
        "title": "Lesson 4 – Asking Before Using Apps",
        "folder": "L3M1-Lesson-4",
        "pptx": "L3M1-Lesson-4-Asking-Before-Using-Apps.pptx",
        "prefix": "l3m1-l04-slide-",
        "pages": [
            ("Tech Safety Time!", True),
            ("Polite Hands", False),
            ("Device", False),
            ("Ask", False),
            ("Please", False),
            ("May I use the device, please?", False),
            ("Ask Parents First!", False),
            ("Fold Hands & Ask", False),
            ("Right Choice?", False),
            ("Honor father and mother.", False),
            ("Practice with Teacher!", False),
            ("Touch the Polite Action!", False),
            ("High-Five Permission!", False),
            ("Stop. Ask. Play.", False),
            ("Device. Ask. Please.", False),
            ("Polite Tech Star", False),
            ("Tech Safety Badge Unlocked!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 5,
        "level": 3,
        "footer": FOOTER,
        "title": "Lesson 5 – God Made Me Special",
        "folder": "L3M1-Lesson-5",
        "pptx": "L3M1-Lesson-5-God-Made-Me-Special.pptx",
        "prefix": "l3m1-l05-slide-",
        "pages": [
            ("You Are Special!", True),
            ("Look in the Mirror!", False),
            ("Special", False),
            ("Unique", False),
            ("God", False),
            ("God made me unique!", False),
            ("Check Your Thumb!", False),
            ("Unique Gifts", False),
            ("God's Beautiful Work", False),
            ("I am wonderfully made.", False),
            ("What is the gift?", False),
            ("Hug Yourself!", False),
            ("Show Your Sparkle!", False),
            ("God's Special Child", False),
            ("Special. Unique. God.", False),
            ("God made me unique!", False),
            ("Unique Badge Unlocked!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 6,
        "level": 3,
        "footer": FOOTER,
        "title": "Lesson 6 – Honoring Each Person",
        "folder": "L3M1-Lesson-6",
        "pptx": "L3M1-Lesson-6-Honoring-Each-Person.pptx",
        "prefix": "l3m1-l06-slide-",
        "pages": [
            ("Kindness Time!", True),
            ("Air High-Five!", False),
            ("Respect", False),
            ("Kind", False),
            ("Friend", False),
            ("You are special to God.", False),
            ("Choose Kind Words!", False),
            ("Gentle Hands & Hearts", False),
            ("Your turn, my turn!", False),
            ("Love your neighbor.", False),
            ("Which shows respect?", False),
            ("Kind Word Challenge!", False),
            ("Listen with Respect!", False),
            ("Kindness Shield!", False),
            ("Respect. Kind. Friend.", False),
            ("You are special to God.", False),
            ("Respect Badge Earned!", False),
            ("Goodbye!", False),
        ],
    },
]


def main():
    root = Path(__file__).resolve().parent
    stage = root / "drive-upload-stage"
    stage.mkdir(parents=True, exist_ok=True)
    for lesson in LESSONS:
        out = build_lesson(lesson)
        dest = stage / f"RemoEd {lesson['pptx']}"
        shutil.copy2(out, dest)
        print("stage", dest)


if __name__ == "__main__":
    main()
