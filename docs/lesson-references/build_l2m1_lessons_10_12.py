"""Build L2M1 Lessons 10–12 PPTX using the Lesson 7–9 chrome composer."""
from build_l2m1_lessons_7_9 import build_lesson

LESSONS = [
    {
        "num": 10,
        "title": "Lesson 10 – The Brave Bird Review",
        "folder": "L2M1-Lesson-10",
        "pptx": "L2M1-Lesson-10-The-Brave-Bird-Review.pptx",
        "prefix": "l2m1-l10-slide-",
        "pages": [
            ("Hello! Quest Time!", True),
            ("Bb /b/", False),
            ("I am brave.", False),
            ("It is morning.", False),
            ("Walk", False),
            ("Find the sun!", False),
            ("Touch B!", False),
            ("Pop B!", False),
            ("Fly home!", False),
            ("Rest your eyes.", False),
            ("God makes me brave.", False),
            ("You are a star!", False),
            ("I am brave. It is morning.", False),
            ("Quest Complete!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 11,
        "title": "Lesson 11 – I am Kind",
        "folder": "L2M1-Lesson-11",
        "pptx": "L2M1-Lesson-11-I-am-Kind.pptx",
        "prefix": "l2m1-l11-slide-",
        "pages": [
            ("Hello, Kind Friends!", True),
            ("Share", False),
            ("Friends", False),
            ("I am kind.", False),
            ("Make a heart!", False),
            ("Gentle touch.", False),
            ("Smile!", False),
            ("Help others.", False),
            ("God is kind.", False),
            ("Touch the kind friend!", False),
            ("Touch the heart!", False),
            ("Your turn!", False),
            ("I am kind.", False),
            ("Kind. Share.", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 12,
        "title": "Lesson 12 – Letter C is for Creative",
        "folder": "L2M1-Lesson-12",
        "pptx": "L2M1-Lesson-12-Letter-C-is-for-Creative.pptx",
        "prefix": "l2m1-l12-slide-",
        "pages": [
            ("Hello!", True),
            ("Cc", False),
            ("/k/ /k/ /k/", False),
            ("C is for Creative.", False),
            ("Paint!", False),
            ("I am creative.", False),
            ("Draw C", False),
            ("God is creative.", False),
            ("Touch C!", False),
            ("Touch the painter!", False),
            ("Your turn!", False),
            ("Cc /k/", False),
            ("Creative!", False),
            ("Goodbye!", False),
            ("See you soon!", False),
        ],
    },
]


if __name__ == "__main__":
    for lesson in LESSONS:
        build_lesson(lesson)
