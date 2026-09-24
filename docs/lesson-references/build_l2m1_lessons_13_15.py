"""Build L2M1 Lessons 13–15 PPTX using the Lesson 7–9 chrome composer."""
from build_l2m1_lessons_7_9 import build_lesson

LESSONS = [
    {
        "num": 13,
        "title": "Lesson 13 – Goodnight, Moon",
        "folder": "L2M1-Lesson-13",
        "pptx": "L2M1-Lesson-13-Goodnight-Moon.pptx",
        "prefix": "l2m1-l13-slide-",
        "pages": [
            ("Goodnight!", True),
            ("Night", False),
            ("It is night.", False),
            ("Head on hands.", False),
            ("Moon", False),
            ("Stars", False),
            ("Clean teeth.", False),
            ("Pajamas on!", False),
            ("Soft voice.", False),
            ("Touch night!", False),
            ("Touch the moon!", False),
            ("Your turn!", False),
            ("It is night.", False),
            ("Goodnight, garden!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 14,
        "title": "Lesson 14 – Tracing Curves for C",
        "folder": "L2M1-Lesson-14",
        "pptx": "L2M1-Lesson-14-Tracing-Curves-for-C.pptx",
        "prefix": "l2m1-l14-slide-",
        "pages": [
            ("Hello, curves!", True),
            ("Cc", False),
            ("/k/ /k/", False),
            ("Curves!", False),
            ("Around we go.", False),
            ("Draw C", False),
            ("Trace with me!", False),
            ("Big curve!", False),
            ("C for cat", False),
            ("Touch the curve!", False),
            ("Touch C!", False),
            ("Your turn!", False),
            ("Around we go.", False),
            ("Curve garden!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 15,
        "title": "Lesson 15 – The Creative Cat Review",
        "folder": "L2M1-Lesson-15",
        "pptx": "L2M1-Lesson-15-The-Creative-Cat-Review.pptx",
        "prefix": "l2m1-l15-slide-",
        "pages": [
            ("Review Time!", True),
            ("Cc", False),
            ("Creative!", False),
            ("Kind", False),
            ("Night", False),
            ("I am kind.", False),
            ("/k/ /k/ /k/", False),
            ("Around we go.", False),
            ("It is night.", False),
            ("Touch C!", False),
            ("Touch kind!", False),
            ("Touch night!", False),
            ("C. Kind. Night.", False),
            ("Cat garden win!", False),
            ("Goodbye!", False),
        ],
    },
]


if __name__ == "__main__":
    for lesson in LESSONS:
        build_lesson(lesson)
