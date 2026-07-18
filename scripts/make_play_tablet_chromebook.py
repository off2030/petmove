# -*- coding: utf-8 -*-
"""Play 태블릿(iPad 스샷 재활용) + 크롬북(가로 16:9) 스크린샷 생성.
원본 슬라이드가 정리돼 없어 기존 산출물(ipad_shot, play_shot)에서 파생한다.
배경은 세로 그라데(행마다 단색)라 좌측 열을 가로로 늘려 좌우를 채우면 이음새가 없다."""
from PIL import Image
import os, shutil

SRC = r"C:\Users\off20\Desktop\스크린샷"
PLAY = os.path.join(SRC, "play")
IPAD = os.path.join(SRC, "ipad")

# ── 1) 태블릿 = iPad 스샷 8장 재활용 ──
# play 선별 슬라이드(00,01,03,04,05,06,08,09) → ipad_shot 01,02,04,05,06,07,09,10
TABLET_SRC = [1, 2, 4, 5, 6, 7, 9, 10]
for i, n in enumerate(TABLET_SRC, 1):
    src = os.path.join(IPAD, f"ipad_shot_{n:02d}.png")
    dst = os.path.join(PLAY, f"play_tablet_{i}.png")
    shutil.copyfile(src, dst)
    im = Image.open(dst)
    print("tablet", i, im.size, "<-", os.path.basename(src))

# ── 2) 크롬북 = 세로 슬라이드를 16:9 가로 캔버스 중앙 배치, 좌우는 배경 가장자리색 ──
CW, CH = 2560, 1440
for i in range(1, 9):
    slide = Image.open(os.path.join(PLAY, f"play_shot_{i}.png")).convert("RGB")
    scale = CH / slide.height
    sw = round(slide.width * scale)
    slide_r = slide.resize((sw, CH), Image.LANCZOS)
    canvas = Image.new("RGB", (CW, CH))
    fill = slide_r.crop((0, 0, 1, CH))          # 좌측 열(배경, 행마다 단색)
    total_pad = CW - sw
    lpad = total_pad // 2
    rpad = total_pad - lpad
    canvas.paste(fill.resize((lpad, CH), Image.NEAREST), (0, 0))
    canvas.paste(fill.resize((rpad, CH), Image.NEAREST), (lpad + sw, 0))
    canvas.paste(slide_r, (lpad, 0))
    out = os.path.join(PLAY, f"play_chromebook_{i}.png")
    canvas.save(out, "PNG")
    print("chromebook", i, canvas.size)

print("DONE ->", PLAY)
