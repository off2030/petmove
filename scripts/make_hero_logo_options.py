# -*- coding: utf-8 -*-
"""히어로 A 구도 + 로고 색상 시안."""
from PIL import Image, ImageDraw
import os
from store_lib import (W, H, SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge)

OUT = os.path.join(SRC, "appstore", "hero_logo")
os.makedirs(OUT, exist_ok=True)

SHOT = "Screenshot_20260628_140611.jpg"
WHITE = (255, 255, 255)
SUB = (255, 246, 233)


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


# (이름, 배지 배경, P 색)
LOGOS = [
    ("amber",     hx("e8a55a"), hx("ffffff")),
    ("cream",     hx("faf9f5"), hx("e08a64")),
    ("mint",      hx("6fb89a"), hx("ffffff")),
    ("dark-mint", hx("1f1c17"), hx("6fb89a")),
    ("dark",      hx("1f1c17"), hx("fbf8f2")),
]

# 폰은 한 번만
phone = build_phone(SHOT, screen_w=860).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size


def render(name, bg, stroke):
    c = vgradient(W, H, (224, 165, 95), (197, 126, 56)).convert("RGB")
    d = ImageDraw.Draw(c)
    x0 = 120
    badge = ribbon_badge(130, bg, stroke)
    c.paste(badge, (x0, 196), badge)
    d.text((x0 + 152, 228), "펫무브", font=font(True, 66), fill=WHITE)
    d.text((x0, 408), "반려동물과", font=font(True, 80), fill=WHITE)
    d.text((x0, 506), "함께하는 여행", font=font(True, 80), fill=WHITE)
    d.text((x0, 648), "어떻게 해야 할지 막막하셨나요?", font=font(False, 42), fill=SUB)
    d.text((x0, 708), "어려운 검역 준비, 펫무브 앱으로", font=font(False, 42), fill=SUB)
    d.text((x0, 762), "쉽게 준비하세요.", font=font(False, 42), fill=SUB)
    px, py = W - pw + 150, 1090
    drop_shadow(c, [px + 60, py + 70, px + pw - 60, py + phh - 10],
                radius=130, blur=46, alpha=125, color=(120, 70, 25))
    c.paste(phone, (px, py), phone)
    p = os.path.join(OUT, f"logo_{name}.png")
    c.save(p, "PNG")
    print("saved", p)


for name, bg, stroke in LOGOS:
    render(name, bg, stroke)
print("DONE")
