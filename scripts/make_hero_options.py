# -*- coding: utf-8 -*-
"""히어로 배경색 시안 — amber / 세이지 / 딥포레스트."""
from PIL import Image, ImageDraw
import os
from store_lib import (W, H, SRC, font, vgradient, center_text, drop_shadow,
                       build_phone, logo_badge)

OUT = os.path.join(SRC, "appstore", "hero_options")
os.makedirs(OUT, exist_ok=True)

# (이름, 배경위, 배경아래, 메인텍스트, 서브텍스트, 그림자색)
VARIANTS = [
    ("amber",  (224, 165, 95), (197, 126, 56), (255, 255, 255), (255, 246, 233), (120, 70, 25)),
    ("sage",   (150, 170, 128), (108, 132, 92),  (255, 255, 255), (244, 248, 238), (52, 70, 44)),
    ("forest", (92, 122, 88),   (54, 82, 56),    (255, 255, 255), (232, 242, 228), (28, 48, 30)),
]

# 폰 한 번만 빌드
phone0 = build_phone("Screenshot_20260626_212527.jpg", screen_w=760)
phone0 = phone0.rotate(-8, expand=True, resample=Image.BICUBIC)
pw, ph = phone0.size
badge = logo_badge(184)

for name, top, bot, main, sub, shcol in VARIANTS:
    canvas = vgradient(W, H, top, bot).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    cx = W // 2

    canvas.paste(badge, ((W - 184) // 2, 196), badge)
    center_text(draw, cx, 410, "펫무브", font(True, 104), main)
    y = 590
    for line in ["반려동물과 함께", "해외로 떠나는 길"]:
        center_text(draw, cx, y, line, font(True, 72), main)
        y += 96
    center_text(draw, cx, y + 24, "복잡한 검역 준비, 펫무브가 정리해 드려요",
                font(False, 44), sub)

    px, py = (W - pw) // 2, 1180
    drop_shadow(canvas, [px + 40, py + 60, px + pw - 40, py + ph - 20],
                radius=120, blur=44, alpha=120, color=shcol)
    canvas.paste(phone0, (px, py), phone0)

    out_path = os.path.join(OUT, f"hero_{name}.png")
    canvas.save(out_path, "PNG")
    print("saved", out_path)
print("DONE")
