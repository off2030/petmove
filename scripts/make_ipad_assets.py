# -*- coding: utf-8 -*-
"""iOS 앱스토어 iPad 13형 스크린샷(2064x2752) — 폰 슬라이드를 iPad 비율로 재구성.
배경=세로 그라데(행마다 단색)라 좌우만 가장자리 열 늘려 채움(이음새 X). 풀블리드는 반대쪽만."""
from PIL import Image
import os
from store_lib import SRC

OUT = os.path.join(SRC, "appstore", "ipad")
os.makedirs(OUT, exist_ok=True)
SRCDIR = os.path.join(SRC, "appstore", "appstore")
if not os.path.exists(os.path.join(SRCDIR, "00_hero_6.9.png")):
    SRCDIR = os.path.join(SRC, "appstore")

IW, IH = 2064, 2752  # iPad 13형 세로

order = ["00_hero_6.9.png"] + [f"{i:02d}_slide_6.9.png" for i in range(1, 10)]


def edge_bleeds(img, side):
    w, h = img.size
    x = 0 if side == "left" else w - 1
    bg = img.crop((0, 0, 1, h))
    col = img.crop((x, 0, x + 1, h))
    diff = sum(abs(a - b) for a, b in zip(bg.tobytes(), col.tobytes()))
    return diff / (h * 3) > 6


for i, fname in enumerate(order, 1):
    src = Image.open(os.path.join(SRCDIR, fname)).convert("RGB")
    # 높이를 iPad 높이에 맞춰 스케일
    scale = IH / src.height
    sw = round(src.width * scale)
    slide = src.resize((sw, IH), Image.LANCZOS)
    total_pad = IW - sw  # 양옆 채울 총량
    if total_pad <= 0:
        # iPad보다 넓으면 가운데 크롭
        x0 = (sw - IW) // 2
        canvas = slide.crop((x0, 0, x0 + IW, IH))
    else:
        r_bleed, l_bleed = edge_bleeds(slide, "right"), edge_bleeds(slide, "left")
        if r_bleed and not l_bleed:
            lpad, rpad = total_pad, 0
        elif l_bleed and not r_bleed:
            lpad, rpad = 0, total_pad
        else:
            lpad, rpad = total_pad // 2, total_pad - total_pad // 2
        fill = slide.crop((0, 0, 1, IH))  # 깨끗한 좌측 열(배경)
        canvas = Image.new("RGB", (IW, IH))
        if lpad:
            canvas.paste(fill.resize((lpad, IH), Image.NEAREST), (0, 0))
        if rpad:
            canvas.paste(fill.resize((rpad, IH), Image.NEAREST), (lpad + sw, 0))
        canvas.paste(slide, (lpad, 0))
    p = os.path.join(OUT, f"ipad_shot_{i:02d}.png")
    canvas.save(p, "PNG")
    print("ok", os.path.basename(p), canvas.size, "<-", fname)
print("DONE 10 ->", OUT)
