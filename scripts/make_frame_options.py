# -*- coding: utf-8 -*-
"""폰 테두리(베젤) 시안 비교 — 슬라이드 2(전체 일정)로."""
from PIL import ImageDraw
import os
from store_lib import W, H, SRC, font, vgradient, center_text, drop_shadow, build_phone

OUT = os.path.join(SRC, "appstore", "frame_options")
os.makedirs(OUT, exist_ok=True)
SHOT = "Screenshot_20260628_175701.jpg"
SAGE_TOP = (208, 216, 197); SAGE_BOT = (185, 198, 170); INK = (52, 58, 46); ACCENT = (212, 150, 84)

# (이름, bezel, frame색, home색)
FRAMES = [
    ("A_dark",       26, (33, 30, 26, 255),    (70, 62, 52, 235)),
    ("B_dark_thin",  13, (33, 30, 26, 255),    (70, 62, 52, 235)),
    ("C_silver",     22, (224, 220, 213, 255), (150, 145, 135, 220)),
    ("D_none",        0, None,                 None),
]

for name, bezel, frame, home in FRAMES:
    canvas = vgradient(W, H, SAGE_TOP, SAGE_BOT).convert("RGB")
    d = ImageDraw.Draw(canvas)
    cx = W // 2
    y = 176
    d.rounded_rectangle([cx - 46, y - 34, cx + 46, y - 22], radius=6, fill=ACCENT)
    center_text(d, cx, y, "친절한 단계별 가이드", font(True, 80), INK)

    kw = {"screen_w": 920, "bezel": bezel}
    if frame is not None:
        kw["frame"] = frame
    if home is not None:
        kw["home_color"] = home
    phone = build_phone(SHOT, **kw)
    pw, phh = phone.size
    px, py = (W - pw) // 2, 560
    drop_shadow(canvas, [px, py + 22, px + pw, py + phh + 22], radius=118)
    canvas.paste(phone, (px, py), phone)
    canvas.save(os.path.join(OUT, f"frame_{name}.png"), "PNG"); print("saved", name)
