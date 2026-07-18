# -*- coding: utf-8 -*-
"""배경색 A/B/C 를 서비스·내정보 화면에도 매칭해 비교."""
from PIL import Image, ImageDraw
import os
from store_lib import (W, H, SRC, font, vgradient, center_text, drop_shadow, build_phone)

OUT = os.path.join(SRC, "appstore", "bg_match")
os.makedirs(OUT, exist_ok=True)

ACCENT = (212, 150, 84)

BGS = {
    "A_sage":  ((208, 216, 197), (185, 198, 170), (52, 58, 46)),
    "B_blue":  ((200, 214, 222), (171, 191, 203), (38, 54, 64)),
    "C_peach": ((244, 219, 190), (235, 198, 158), (74, 52, 30)),
}

SCREENS = {
    "service": ("Screenshot_20260626_212656.jpg", ["혼자 어렵다면", "전문가에게 맡기세요"]),
    "myinfo":  ("Screenshot_20260626_213105.jpg", ["우리 아이 정보를", "한 곳에 모아서"]),
}

# 폰은 화면당 한 번만 빌드
phones = {sk: build_phone(s[0], screen_w=970) for sk, s in SCREENS.items()}

for sk, (fname, lines) in SCREENS.items():
    phone = phones[sk]
    pw, ph = phone.size
    for bk, (top, bot, ink) in BGS.items():
        canvas = vgradient(W, H, top, bot).convert("RGB")
        draw = ImageDraw.Draw(canvas)
        cx = W // 2
        y = 168
        draw.rounded_rectangle([cx - 46, y - 34, cx + 46, y - 22], radius=6, fill=ACCENT)
        for line in lines:
            center_text(draw, cx, y, line, font(True, 86), ink)
            y += 118
        px, py = (W - pw) // 2, 500
        drop_shadow(canvas, [px, py + 22, px + pw, py + ph + 22], radius=118)
        canvas.paste(phone, (px, py), phone)
        out_path = os.path.join(OUT, f"{sk}_{bk}.png")
        canvas.save(out_path, "PNG")
        print("saved", out_path)
print("DONE")
