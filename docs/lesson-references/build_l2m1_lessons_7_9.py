"""Build L2M1 Lessons 7–9 PPTX with Sample Lesson chrome over unique 3D art."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(r"d:\Users\Window11\Documents\RemoEd-Jean\RemoEdPH")
ASSETS = Path(r"C:\Users\Window11\.cursor\projects\d-Users-Window11-Documents-RemoEd-Jean-RemoEdPH\assets")
LOGO = ROOT / "docs" / "lesson-references" / "remoedph-logo.jpg"
OUT_ROOT = ROOT / "docs" / "lesson-references" / "lessons"
# Laptop copies by curriculum level (Jean Desktop lesson materials).
LAPTOP_LESSONS_ROOT = Path(
    r"D:\Users\Window11\Desktop\JeanDesktop\RemoEdPH\A Lesson and Training Materials"
)
# Optional Google Drive folder (manual upload): https://drive.google.com/drive/folders/14Fd0Miq10eEIVPCFVgXG36055a9ho3Xk

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
PX_W, PX_H = 1920, 1080

NAVY = RGBColor(0x1A, 0x56, 0x96)
NAVY_DARK = RGBColor(0x1E, 0x3A, 0x5F)
INDIGO = RGBColor(0x5A, 0x67, 0xD8)
GREEN = RGBColor(0x22, 0x8B, 0x22)
YELLOW = RGBColor(0xFA, 0xD6, 0x48)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

FONT_NAME = "Arial Rounded MT Bold"


def find_font() -> str | None:
    candidates = [
        Path(r"C:\Windows\Fonts\ARLRDBD.TTF"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\ARIALBD.TTF"),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


FONT_PATH = find_font()


LESSONS = [
    {
        "num": 7,
        "title": "Lesson 7 – Letter B is for Brave",
        "folder": "L2M1-Lesson-7",
        "pptx": "L2M1-Lesson-7-Letter-B-is-for-Brave.pptx",
        "prefix": "l2m1-l7-slide-",
        "pages": [
            ("Hello!", True),
            ("Bb", False),
            ("/b/ /b/ /b/", False),
            ("B is for Brave.", False),
            ("Stand brave!", False),
            ("Bounce", False),
            ("Draw B", False),
            ("Draw b", False),
            ("God makes me brave.", False),
            ("Touch B!", False),
            ("Touch the brave friend!", False),
            ("Your turn!", False),
            ("Bb /b/", False),
            ("Phonics complete!", False),
            ("Goodbye!", False),
        ],
    },
    {
        "num": 8,
        "title": "Lesson 8 – Walking for Energy",
        "folder": "L2M1-Lesson-8",
        "pptx": "L2M1-Lesson-8-Walking-for-Energy.pptx",
        "prefix": "l2m1-l8-slide-",
        "pages": [
            ("Hello explorers!", True),
            ("Walk", False),
            ("I walk for energy.", False),
            ("March!", False),
            ("Grass", False),
            ("Sun", False),
            ("Save energy.", False),
            ("Thank you, God.", False),
            ("Touch the walker!", False),
            ("Touch the grass!", False),
            ("Your turn!", False),
            ("I walk for energy.", False),
            ("Grass. Walk.", False),
            ("Goodbye!", False),
            ("See you soon!", False),
        ],
    },
    {
        "num": 9,
        "title": "Lesson 9 – Good Morning, Sun!",
        "folder": "L2M1-Lesson-9",
        "pptx": "L2M1-Lesson-9-Good-Morning-Sun.pptx",
        "prefix": "l2m1-l9-slide-",
        "pages": [
            ("Good Morning!", True),
            ("Sun", False),
            ("It is morning.", False),
            ("Stretch!", False),
            ("Clean teeth.", False),
            ("Smile!", False),
            ("Open window.", False),
            ("Thank you, God.", False),
            ("Touch the morning!", False),
            ("Touch the stretch!", False),
            ("Your turn!", False),
            ("It is morning.", False),
            ("Morning. Sun.", False),
            ("Goodbye!", False),
            ("See you soon!", False),
        ],
    },
]


def round_rect(draw: ImageDraw.ImageDraw, xy, radius, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if FONT_PATH:
        return ImageFont.truetype(FONT_PATH, size)
    return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def pill_for_text(draw, text, font, pad_x, pad_y, min_w=0):
    tw, th = text_size(draw, text, font)
    return max(min_w, tw + pad_x * 2), th + pad_y * 2, tw, th


def knock_out_white(im: Image.Image) -> Image.Image:
    """Drop the logo's white plate so it sits on the slide art."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 246 and g > 246 and b > 246:
                px[x, y] = (r, g, b, 0)
            elif r > 228 and g > 228 and b > 228:
                fade = int((min(r, g, b) - 228) / 18 * 255)
                px[x, y] = (r, g, b, max(0, a - fade))
    return im


def draw_footer(img: Image.Image, ix, iy, footer: str = "SPROUTS! MONTH 1") -> Image.Image:
    """Month label + logo, no card. White text and a soft shadow for contrast."""
    canvas = img.convert("RGBA")
    font = load_font(34)
    probe = ImageDraw.Draw(canvas)
    tw, th = text_size(probe, footer, font)

    logo_w, logo_h = ix(0.78), iy(0.78)
    pad_r, pad_b, gap = ix(0.28), iy(0.22), ix(0.14)
    logo_x = PX_W - pad_r - logo_w
    logo_y = PX_H - pad_b - logo_h
    text_x = logo_x - gap - tw
    text_y = logo_y + (logo_h - th) // 2 - 2

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((text_x, text_y + 2), footer, font=font, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=4))
    sharp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sharp).text((text_x, text_y), footer, font=font, fill=(255, 255, 255, 255))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas = Image.alpha_composite(canvas, sharp)

    logo = knock_out_white(Image.open(LOGO)).resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    alpha = logo.split()[-1]
    logo_shadow = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    logo_shadow.putalpha(alpha.point(lambda a: int(a * 0.7)))
    logo_shadow = logo_shadow.filter(ImageFilter.GaussianBlur(radius=3))
    shadow_pad = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_pad.paste(logo_shadow, (logo_x, logo_y + 3), logo_shadow)
    canvas = Image.alpha_composite(canvas, shadow_pad)
    canvas.paste(logo, (logo_x, logo_y), logo)
    return canvas.convert("RGB")


def compose_slide(src: Path, dest: Path, lesson_title: str, page: int, total: int, phrase: str, is_title: bool, footer: str = "SPROUTS! MONTH 1"):
    img = Image.open(src).convert("RGB")
    img = img.resize((PX_W, PX_H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(img)

    font14 = load_font(36)  # ~14pt at 144 dpi-ish on 1920
    font28 = load_font(64)
    title_pt = 92 if len(lesson_title) < 28 else 72
    font54 = load_font(title_pt)

    # inches to px: 1920 / 13.333 ~= 144
    def ix(inches: float) -> int:
        return int(round(inches * PX_W / 13.333))

    def iy(inches: float) -> int:
        return int(round(inches * PX_H / 7.5))

    # top-left lesson pill
    lw, lh, tw, th = pill_for_text(draw, lesson_title, font14, 22, 12, min_w=ix(4.2))
    lx, ly = ix(0.25), iy(0.2)
    round_rect(draw, (lx, ly, lx + lw, ly + iy(0.45)), 22, (255, 255, 255))
    draw.text((lx + 18, ly + (iy(0.45) - th) // 2 - 2), lesson_title, font=font14, fill=(26, 86, 150))

    # top-right page badge
    badge = f"{page} / {total}"
    bw, bh = ix(1.5), iy(0.45)
    bx, by = ix(11.55), iy(0.2)
    round_rect(draw, (bx, by, bx + bw, by + bh), 22, (90, 103, 216))
    tw, th = text_size(draw, badge, font14)
    draw.text((bx + (bw - tw) // 2, by + (bh - th) // 2 - 2), badge, font=font14, fill=(255, 255, 255))

    img = draw_footer(img, ix, iy, footer)
    draw = ImageDraw.Draw(img)

    if is_title:
        banner_w, banner_h = ix(10.3), iy(1.6)
        bx, by = ix(1.5), iy(2.55)
        round_rect(draw, (bx, by, bx + banner_w, by + banner_h), 28, (255, 255, 255))
        tw, th = text_size(draw, lesson_title, font54)
        while tw > banner_w - 40 and title_pt > 48:
            title_pt -= 4
            font54 = load_font(title_pt)
            tw, th = text_size(draw, lesson_title, font54)
        draw.text((bx + (banner_w - tw) // 2, by + (banner_h - th) // 2 - 4), lesson_title, font=font54, fill=(26, 86, 150))

    # yellow learner-phrase chip (title page lower; body pages lower-center)
    chip_font = font28
    tw, th = text_size(draw, phrase, chip_font)
    pad_x, pad_y = 36, 16
    cw, ch = tw + pad_x * 2, max(iy(0.7), th + pad_y * 2)
    cx = (PX_W - cw) // 2
    cy = iy(4.5) if is_title else iy(6.05)
    # keep chip above footer
    if cy + ch > iy(6.5):
        cy = iy(6.05)
        if cy + ch > iy(6.48):
            cy = iy(5.85)
    round_rect(draw, (cx, cy, cx + cw, cy + ch), 26, (250, 214, 72))
    draw.text((cx + (cw - tw) // 2, cy + (ch - th) // 2 - 4), phrase, font=chip_font, fill=(30, 58, 95))

    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=92)


def add_picture_slide(prs: Presentation, image_path: Path):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    slide.shapes.add_picture(str(image_path), Emu(0), Emu(0), width=SLIDE_W, height=SLIDE_H)


def build_lesson(lesson: dict):
    folder = OUT_ROOT / lesson["folder"]
    art_dir = folder / "art"
    composed_dir = folder / "composed"
    art_dir.mkdir(parents=True, exist_ok=True)
    composed_dir.mkdir(parents=True, exist_ok=True)

    composed_paths = []
    for i, (phrase, is_title) in enumerate(lesson["pages"], 1):
        src = ASSETS / f"{lesson['prefix']}{i:02d}.png"
        if not src.exists():
            raise FileNotFoundError(src)
        copied = art_dir / f"{lesson['prefix']}{i:02d}.png"
        shutil.copy2(src, copied)
        dest = composed_dir / f"{lesson['prefix']}{i:02d}.jpg"
        total = len(lesson["pages"])
        footer = lesson.get("footer", "SPROUTS! MONTH 1")
        compose_slide(copied, dest, lesson["title"], i, total, phrase, is_title, footer)
        composed_paths.append(dest)

    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    for p in composed_paths:
        add_picture_slide(prs, p)

    out = folder / lesson["pptx"]
    prs.save(str(out))
    also = ROOT / "docs" / "lesson-references" / lesson["pptx"]
    shutil.copy2(out, also)

    # Laptop download copy: …/A Lesson and Training Materials/Level {N}/RemoEd {pptx}
    level_num = int(lesson.get("level", 2))
    level_dir = LAPTOP_LESSONS_ROOT / f"Level {level_num}"
    try:
        level_dir.mkdir(parents=True, exist_ok=True)
        laptop_name = lesson.get("laptop_name") or f"RemoEd {lesson['pptx']}"
        if not str(laptop_name).startswith("RemoEd "):
            laptop_name = f"RemoEd {laptop_name}"
        laptop_dest = level_dir / laptop_name
        shutil.copy2(out, laptop_dest)
        print("wrote", out)
        print("laptop", laptop_dest)
    except OSError as e:
        print("wrote", out)
        print("WARN laptop copy failed:", e)
    return out


def main():
    if not LOGO.exists():
        raise FileNotFoundError(LOGO)
    for lesson in LESSONS:
        build_lesson(lesson)


if __name__ == "__main__":
    main()
