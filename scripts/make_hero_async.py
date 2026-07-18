# -*- coding: utf-8 -*-
"""히어로 비대칭 레이아웃 시안 — 폰 좌측 기울임 + 입체 구성."""
from PIL import Image, ImageDraw
import os
from store_lib import (W, H, SRC, font, vgradient, drop_shadow, build_phone, logo_badge)

OUT = os.path.join(SRC, "appstore", "hero_async")
os.makedirs(OUT, exist_ok=True)

SHOT = "Screenshot_20260628_140611.jpg"
WHITE = (255, 255, 255)
SUB = (255, 246, 233)


def bg():
    return vgradient(W, H, (224, 165, 95), (197, 126, 56)).convert("RGB")


def ltext(draw, x, y, text, fnt, fill, anchor="la"):
    draw.text((x, y), text, font=fnt, fill=fill, anchor=anchor)


def tilted_phone(screen_w, angle):
    p = build_phone(SHOT, screen_w=screen_w)
    return p.rotate(angle, expand=True, resample=Image.BICUBIC)


# ---------- A: 텍스트 좌상단 + 폰 우하단 ----------
def variant_A():
    c = bg(); d = ImageDraw.Draw(c)
    x0 = 120
    b = logo_badge(150); c.paste(b, (x0, 210), b)
    ltext(d, x0, 392, "펫무브", font(True, 98), WHITE)
    ltext(d, x0, 524, "반려동물과 함께", font(True, 66), WHITE)
    ltext(d, x0, 610, "해외로 떠나는 길", font(True, 66), WHITE)
    ltext(d, x0, 716, "복잡한 검역 준비,", font(False, 42), SUB)
    ltext(d, x0, 770, "펫무브가 정리해 드려요", font(False, 42), SUB)
    ph = tilted_phone(860, 10); pw, phh = ph.size
    px, py = W - pw + 150, 1090
    drop_shadow(c, [px + 60, py + 70, px + pw - 60, py + phh - 10],
                radius=130, blur=46, alpha=125, color=(120, 70, 25))
    c.paste(ph, (px, py), ph)
    return c


# ---------- B: 텍스트 우상단 + 폰 좌하단 ----------
def variant_B():
    c = bg(); d = ImageDraw.Draw(c)
    xr = W - 120
    b = logo_badge(150); c.paste(b, (xr - 150, 210), b)
    ltext(d, xr, 392, "펫무브", font(True, 98), WHITE, anchor="ra")
    ltext(d, xr, 524, "반려동물과 함께", font(True, 66), WHITE, anchor="ra")
    ltext(d, xr, 610, "해외로 떠나는 길", font(True, 66), WHITE, anchor="ra")
    ltext(d, xr, 716, "복잡한 검역 준비,", font(False, 42), SUB, anchor="ra")
    ltext(d, xr, 770, "펫무브가 정리해 드려요", font(False, 42), SUB, anchor="ra")
    ph = tilted_phone(860, 10); pw, phh = ph.size
    px, py = -150, 1090
    drop_shadow(c, [px + 60, py + 70, px + pw - 60, py + phh - 10],
                radius=130, blur=46, alpha=125, color=(120, 70, 25))
    c.paste(ph, (px, py), ph)
    return c


# ---------- C: 텍스트 좌상단 + 폰 크게 중앙하단(과감한 각도) ----------
def variant_C():
    c = bg(); d = ImageDraw.Draw(c)
    x0 = 120
    b = logo_badge(140); c.paste(b, (x0, 196), b)
    ltext(d, x0 + 168, 226, "펫무브", font(True, 84), WHITE)
    ltext(d, x0, 420, "반려동물과 함께", font(True, 72), WHITE)
    ltext(d, x0, 514, "해외로 떠나는 길", font(True, 72), WHITE)
    ltext(d, x0, 624, "복잡한 검역 준비, 펫무브가 정리해 드려요", font(False, 40), SUB)
    ph = tilted_phone(940, 14); pw, phh = ph.size
    px, py = (W - pw) // 2 + 110, 1140
    drop_shadow(c, [px + 70, py + 80, px + pw - 70, py + phh - 10],
                radius=140, blur=50, alpha=130, color=(120, 70, 25))
    c.paste(ph, (px, py), ph)
    return c


for name, fn in [("A_left-text", variant_A), ("B_right-text", variant_B), ("C_bold", variant_C)]:
    img = fn()
    p = os.path.join(OUT, f"hero_{name}.png")
    img.save(p, "PNG")
    print("saved", p)
print("DONE")
