"""Build L2M1 Lessons 16–18 PPTX using the Lesson 7–9 chrome composer."""
from build_l2m1_lessons_7_9 import build_lesson

LESSONS = [
    {
        "num": 16,
        "title": "Lesson 16 – This is My Family",
        "folder": "L2M1-Lesson-16",
        "pptx": "L2M1-Lesson-16-This-is-My-Family.pptx",
        "prefix": "l2m1-l16-slide-",
        "pages": [
            ("My Family!", True),
            ("Mother", False),
            ("Father", False),
            ("This is my family.", False),
            ("Hold hands!", False),
            ("Home", False),
            ("Eat together.", False),
            ("I help my family.", False),
            ("Thank you, God.", False),
            ("Touch Mother!", False),
            ("Touch the home!", False),
            ("Your turn!", False),
            ("This is my family.", False),
            ("Family. Home.", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 17,
        "title": "Lesson 17 – Letter E is for Excellent",
        "folder": "L2M1-Lesson-17",
        "pptx": "L2M1-Lesson-17-Letter-E-is-for-Excellent.pptx",
        "prefix": "l2m1-l17-slide-",
        "pages": [
            ("Hello!", True),
            ("Ee", False),
            ("/e/ /e/ /e/", False),
            ("E is for Excellent.", False),
            ("I am excellent.", False),
            ("High thumbs!", False),
            ("Draw E", False),
            ("Draw e", False),
            ("God made me excellent.", False),
            ("Touch E!", False),
            ("Touch the star!", False),
            ("Your turn!", False),
            ("Ee /e/", False),
            ("Ee. Excellent.", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 18,
        "title": "Lesson 18 – Tracing D and E",
        "folder": "L2M1-Lesson-18",
        "pptx": "L2M1-Lesson-18-Tracing-D-and-E.pptx",
        "prefix": "l2m1-l18-slide-",
        "pages": [
            ("Let's Draw!", True),
            ("Down", False),
            ("Curve", False),
            ("Trace the path.", False),
            ("Draw D!", False),
            ("Draw E!", False),
            ("Trace the drum.", False),
            ("Trace the egg.", False),
            ("Steady fingers.", False),
            ("Touch the curve!", False),
            ("Where is D?", False),
            ("Your turn!", False),
            ("Down and around.", False),
            ("Down. Around.", False),
            ("Goodbye!", False),
        ],
    },
]


if __name__ == "__main__":
    for lesson in LESSONS:
        build_lesson(lesson)
