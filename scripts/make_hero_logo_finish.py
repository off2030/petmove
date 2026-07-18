# -*- coding: utf-8 -*-
"""히어로 로고 마감 3안 — 1)테두리 2)워드마크만 3)입체배지."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import (W, H, SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge)

OUT = os.path.join(SRC, "appstore", "hero_finish")
os.makedirs(OUT, exist_ok=True)

SHOT = "Screenshot_20260628_140611.jpg"
WHITE = (255, 255, 255)
SUB = (255, 246, 233)
AMBER = (232, 165, 90)

phone = build_phone(SHOT, screen_w=860).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size


def base():
    c = vgradient(W, H, (224, 165, 95), (197, 126, 56)).convert("RGB")
    return c


def texts(c, wordmark_only=False):
    d = ImageDraw.Draw(c)
    x0 = 120
    if not wordmark_only:
        d.text((x0 + 152, 228), "펫무브", font=font(True, 66), fill=WHITE)
    d.text((x0, 408), "반려동물과", font=font(True, 80), fill=WHITE)
    d.text((x0, 506), "함께하는 여행", font=font(True, 80), fill=WHITE)
    d.text((x0, 648), "어떻게 해야 할지 막막하셨나요?", font=font(False, 42), fill=SUB)
    d.text((x0, 708), "어려운 검역 준비, 펫무브 앱으로", font=font(False, 42), fill=SUB)
    d.text((x0, 762), "쉽게 준비하세요.", font=font(False, 42), fill=SUB)


def place_phone(c):
    px, py = W - pw + 150, 1090
    drop_shadow(c, [px + 60, py + 70, px + pw - 60, py + phh - 10],
                radius=130, blur=46, alpha=125, color=(120, 70, 25))
    c.paste(phone, (px, py), phone)


def badge_shadow(c, x, y, size):
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x + 6, y + 12, x + size + 6, y + size + 12],
                                         radius=int(size * 0.225), fill=(90, 50, 18, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    c.paste(Image.new("RGB", (W, H), (90, 50, 18)), (0, 0), sh.split()[3])


# ---- 1) amber 배지 + 흰 테두리 ----
def v1_outline():
    c = base()
    b = ribbon_badge(130, AMBER, WHITE, outline=(WHITE, 4))
    c.paste(b, (120, 196), b)
    texts(c)
    place_phone(c)
    c.save(os.path.join(OUT, "v1_outline.png"), "PNG"); print("v1")


# ---- 2) 워드마크만 ----
def v2_wordmark():
    c = base()
    d = ImageDraw.Draw(c)
    d.text((120, 214), "펫무브", font=font(True, 92), fill=WHITE)
    texts(c, wordmark_only=True)
    place_phone(c)
    c.save(os.path.join(OUT, "v2_wordmark.png"), "PNG"); print("v2")


# ---- 3) 입체 배지(그림자+그라데이션+광택) ----
def v3_3d():
    c = base()
    badge_shadow(c, 120, 196, 130)
    b = ribbon_badge(130, None, WHITE, bg_grad=((244, 190, 130), (210, 140, 70)),
                     highlight=True)
    c.paste(b, (120, 196), b)
    texts(c)
    place_phone(c)
    c.save(os.path.join(OUT, "v3_3d.png"), "PNG"); print("v3")


v1_outline()
v2_wordmark()
v3_3d()
print("DONE")
