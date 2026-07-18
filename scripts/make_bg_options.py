# -*- coding: utf-8 -*-
"""기능 슬라이드 배경색 시안 — 크림 앱 화면이 돋보이는 배경 비교."""
from PIL import Image, ImageDraw
import os
from store_lib import (W, H, SRC, font, vgradient, center_text, drop_shadow, build_phone)

OUT = os.path.join(SRC, "appstore", "bg_options")
os.makedirs(OUT, exist_ok=True)

LINES = ["필요한 서류,", "빠짐없이 체크해요"]
SHOT = "Screenshot_20260626_212628.jpg"
ACCENT = (212, 150, 84)

# (이름, 배경 위, 배경 아래, 헤드라인색)
OPTIONS = [
    ("A_sage",   (208, 216, 197), (185, 198, 170), (52, 58, 46)),   # 세이지 그린
    ("B_blue",   (200, 214, 222), (171, 191, 203), (38, 54, 64)),   # 더스티 블루
    ("C_peach",  (244, 219, 190), (235, 198, 158), (74, 52, 30)),   # 라이트 amber/피치
    ("D_mocha",  (214, 199, 184), (188, 168, 150), (60, 46, 36)),   # 웜 토프/모카
]

phone = build_phone(SHOT, screen_w=970)
pw, ph = phone.size

for name, top, bot, ink in OPTIONS:
    canvas = vgradient(W, H, top, bot).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    cx = W // 2

    y = 168
    draw.rounded_rectangle([cx - 46, y - 34, cx + 46, y - 22], radius=6, fill=ACCENT)
    for line in LINES:
        center_text(draw, cx, y, line, font(True, 86), ink)
        y += 118

    px, py = (W - pw) // 2, 500
    drop_shadow(canvas, [px, py + 22, px + pw, py + ph + 22], radius=118)
    canvas.paste(phone, (px, py), phone)

    out_path = os.path.join(OUT, f"bg_{name}.png")
    canvas.save(out_path, "PNG")
    print("saved", out_path)
print("DONE")
