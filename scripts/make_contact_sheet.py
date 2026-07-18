# -*- coding: utf-8 -*-
"""전체 슬라이드/후보 비교 시트(한 장)."""
from PIL import Image, ImageDraw
import os
from store_lib import SRC, font

D = os.path.join(SRC, "appstore")
ITEMS = [
    ("00_hero_6.9.png", "0 히어로"),
    ("01_slide_6.9.png", "1 단계별 가이드"),
    ("02_slide_6.9.png", "2 일정 상세설명"),
    ("03_slide_6.9.png", "3 준비 상황"),
    ("04_slide_6.9.png", "4 실수 예방"),
    ("05_slide_6.9.png", "5 알림"),
    ("06_slide_6.9.png", "6 서류 체크"),
    ("07_slide_6.9.png", "7 서류 상세설명"),
    ("08_slide_6.9.png", "8 내 정보"),
    ("09_slide_6.9.png", "9 보관함"),
]

TW = 240
TH = int(TW * 2796 / 1290)
COLS = 4
GAP = 24
LBL = 44
cell_h = TH + LBL + 10
rows = (len(ITEMS) + COLS - 1) // COLS
W = GAP + COLS * (TW + GAP)
H = GAP + rows * (cell_h + GAP)

sheet = Image.new("RGB", (W, H), (238, 234, 228))
d = ImageDraw.Draw(sheet)
fnt = font(True, 26)

for i, (fn, label) in enumerate(ITEMS):
    r, c = divmod(i, COLS)
    x = GAP + c * (TW + GAP)
    y = GAP + r * (cell_h + GAP)
    try:
        im = Image.open(os.path.join(D, fn)).resize((TW, TH), Image.LANCZOS)
        sheet.paste(im, (x, y))
    except FileNotFoundError:
        d.rectangle([x, y, x + TW, y + TH], outline=(180, 170, 160))
    bbox = d.textbbox((0, 0), label, font=fnt)
    d.text((x + (TW - (bbox[2] - bbox[0])) / 2, y + TH + 10), label, font=fnt, fill=(50, 44, 36))

out = os.path.join(D, "_contact_sheet.png")
sheet.save(out, "PNG")
print("saved", out, sheet.size)
