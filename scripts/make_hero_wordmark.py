# -*- coding: utf-8 -*-
"""PETMOVE 워드마크 색 비교 — 흰색 / 아이보리 / 진브라운."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import (W, H, SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge)

OUT = os.path.join(SRC, "appstore", "hero_wordmark")
os.makedirs(OUT, exist_ok=True)

SHOT = "Screenshot_20260628_140611.jpg"
WHITE = (255, 255, 255)
SUB = (255, 246, 233)
AMBER = (232, 165, 90)
x0 = 120
SZ = 98

phone = build_phone(SHOT, screen_w=860).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size


def tracked(draw, x, ymid, text, fnt, fill, track):
    for ch in text:
        draw.text((x, ymid), ch, font=fnt, fill=fill, anchor="lm")
        x += draw.textlength(ch, font=fnt) + track


def render(name, wordmark_color):
    c = vgradient(W, H, (224, 165, 95), (197, 126, 56)).convert("RGB")
    d = ImageDraw.Draw(c)

    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0 + 2, 196 + 6, x0 + SZ + 2, 196 + SZ + 6],
                                         radius=int(SZ * 0.225), fill=(80, 44, 16, 48))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    c.paste(Image.new("RGB", (W, H), (80, 44, 16)), (0, 0), sh.split()[3])

    badge = ribbon_badge(SZ, AMBER, WHITE)
    c.paste(badge, (x0, 196), badge)

    badge_mid = 196 + SZ // 2
    tracked(d, x0 + SZ + 24, badge_mid - 7, "PETMOVE", font(True, 84), wordmark_color, 6)

    d.text((x0, 408), "반려동물과", font=font(True, 80), fill=WHITE)
    d.text((x0, 506), "함께하는 여행", font=font(True, 80), fill=WHITE)
    d.text((x0, 648), "어떻게 해야 할지 막막하셨나요?", font=font(False, 42), fill=SUB)
    d.text((x0, 708), "어려운 검역 준비, 펫무브 앱으로", font=font(False, 42), fill=SUB)
    d.text((x0, 762), "쉽게 준비하세요.", font=font(False, 42), fill=SUB)

    px, py = W - pw + 150, 1090
    drop_shadow(c, [px + 60, py + 70, px + pw - 60, py + phh - 10],
                radius=130, blur=46, alpha=125, color=(120, 70, 25))
    c.paste(phone, (px, py), phone)
    c.save(os.path.join(OUT, f"wm_{name}.png"), "PNG"); print("saved", name)


render("white", (255, 255, 255))
render("ivory", (250, 244, 234))
render("brown", (74, 51, 32))
print("DONE")
