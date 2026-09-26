"""Build L2M1 Lessons 19–22 PPTX using the Lesson 7–9 chrome composer."""
import shutil
from pathlib import Path

from build_l2m1_lessons_7_9 import build_lesson

LESSONS = [
    {
        "num": 19,
        "title": "Lesson 19 – Honoring My Friends",
        "folder": "L2M1-Lesson-19",
        "pptx": "L2M1-Lesson-19-Honoring-My-Friends.pptx",
        "prefix": "l2m1-l19-slide-",
        "pages": [
            ("My Friends!", True),
            ("Friend", False),
            ("You are special.", False),
            ("Point and smile!", False),
            ("Love", False),
            ("Shake hands.", False),
            ("Share", False),
            ("Celebrate friends!", False),
            ("God made my friends.", False),
            ("Touch the kind friend!", False),
            ("Touch the smile!", False),
            ("Your turn!", False),
            ("You are special.", False),
            ("Friend. Special.", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 20,
        "title": "Lesson 20 – Virtual Garden Challenge 1",
        "folder": "L2M1-Lesson-20",
        "pptx": "L2M1-Lesson-20-Virtual-Garden-Challenge-1.pptx",
        "prefix": "l2m1-l20-slide-",
        "pages": [
            ("Hello! Game Time!", True),
            ("Let's match the sounds!", False),
            ("Speak loud!", False),
            ("Aa /a/", False),
            ("Unlocked!", False),
            ("Bb /b/", False),
            ("Unlocked!", False),
            ("Cc /k/", False),
            ("You won!", False),
            ("Fast!", False),
            ("Touch A!", False),
            ("Touch B!", False),
            ("Letters check!", False),
            ("Challenge Complete!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 21,
        "title": "Lesson 21 – Virtual Garden Challenge 2",
        "folder": "L2M1-Lesson-21",
        "pptx": "L2M1-Lesson-21-Virtual-Garden-Challenge-2.pptx",
        "prefix": "l2m1-l21-slide-",
        "pages": [
            ("Hello! Game Time!", True),
            ("Let's sort the day!", False),
            ("Match to win!", False),
            ("Brush teeth!", False),
            ("Unlocked!", False),
            ("Sleep tight!", False),
            ("Unlocked!", False),
            ("Morning and Night!", False),
            ("You won!", False),
            ("Fast!", False),
            ("Touch morning!", False),
            ("Touch night!", False),
            ("God's perfect times.", False),
            ("Morning and Night.", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 22,
        "title": "Lesson 22 – Monthly Celebration",
        "folder": "L2M1-Lesson-22",
        "pptx": "L2M1-Lesson-22-Monthly-Celebration.pptx",
        "prefix": "l2m1-l22-slide-",
        "pages": [
            ("Party Time!", True),
            ("Your Garden!", False),
            ("Identity Champion!", False),
            ("Phonics Champion!", False),
            ("Brave and Kind!", False),
            ("I do my best.", False),
            ("Thank You, God!", False),
            ("Eco-Drop Shower!", False),
            ("Let's dance!", False),
            ("We love you!", False),
            ("Show your family!", False),
            ("Month 2 is next!", False),
            ("High Five!", False),
            ("Goodbye!", False),
            ("Complete!", False),
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
