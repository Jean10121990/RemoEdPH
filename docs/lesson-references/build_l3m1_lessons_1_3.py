"""Build L3M1 Saplings Lessons 1–3 PPTX using the shared chrome composer."""
import shutil
from pathlib import Path

from build_l2m1_lessons_7_9 import build_lesson

FOOTER = "SAPLINGS! MONTH 1"

LESSONS = [
    {
        "num": 1,
        "level": 3,
        "footer": FOOTER,
        "title": "Lesson 1 – Writing My First Name",
        "folder": "L3M1-Lesson-1",
        "pptx": "L3M1-Lesson-1-Writing-My-First-Name.pptx",
        "prefix": "l3m1-l01-slide-",
        "pages": [
            ("Welcome Saplings!", True),
            ("Wiggle Your Fingers!", False),
            ("My Name", False),
            ("Write", False),
            ("Pencil", False),
            ("My name is Ed.", False),
            ("Pinch and Rest!", False),
            ("Write in the Air!", False),
            ("Trace Your Name!", False),
            ("God knows my name.", False),
            ("Find Your First Letter!", False),
            ("Write on Paper!", False),
            ("Show Your Name!", False),
            ("Name Verified!", False),
            ("Name. Write. Pencil.", False),
            ("My name is Ed.", False),
            ("Profile Updated!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 2,
        "level": 3,
        "footer": FOOTER,
        "title": "Lesson 2 – Short A Blend: Cat and Mat",
        "folder": "L3M1-Lesson-2",
        "pptx": "L3M1-Lesson-2-Short-A-Cat-and-Mat.pptx",
        "prefix": "l3m1-l02-slide-",
        "pages": [
            ("Hello Phonics Stars!", True),
            ("Short A: /a/", False),
            ("Cat", False),
            ("Mat", False),
            ("On", False),
            ("The cat is on the mat.", False),
            ("Tap and Blend!", False),
            ("Tap M - A - T", False),
            ("-AT Family", False),
            ("Speak clearly.", False),
            ("Spin and Read!", False),
            ("Is the cat on the mat?", False),
            ("The / Is", False),
            ("Build the sentence!", False),
            ("Speed Read!", False),
            ("Cat. Mat.", False),
            ("Phonics Star!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 3,
        "level": 3,
        "footer": FOOTER,
        "title": "Lesson 3 – Short A Blend: Hat and Bag",
        "folder": "L3M1-Lesson-3",
        "pptx": "L3M1-Lesson-3-Short-A-Hat-and-Bag.pptx",
        "prefix": "l3m1-l03-slide-",
        "pages": [
            ("Hello Friends!", True),
            ("Bounce /a/!", False),
            ("Hat", False),
            ("Bag", False),
            ("Red", False),
            ("I have a red hat.", False),
            ("Hat", False),
            ("Bag", False),
            ("-AT and -AG", False),
            ("Thank God for what I have.", False),
            ("What is in the bag?", False),
            ("Match the word!", False),
            ("Show and Tell!", False),
            ("I / Have", False),
            ("I have a red hat.", False),
            ("Hat. Bag.", False),
            ("Red Hat Badge!", False),
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
