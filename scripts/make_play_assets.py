# -*- coding: utf-8 -*-
"""구글 플레이 자산: ① 스크린샷 8장(2:1 이내로 좌우 여백) ② 앱 아이콘 512².
승인된 iOS 슬라이드(1290x2796)를 디자인 손대지 않고 Play 비율에 맞춤."""
from PIL import Image
import os
from store_lib import SRC

# 슬라이드 원본 위치(사용자가 appstore\appstore 로 이동) — 없으면 기존 위치 폴백
OUT = os.path.join(SRC, "appstore", "appstore")
if not os.path.exists(os.path.join(OUT, "00_hero_6.9.png")):
    OUT = os.path.join(SRC, "appstore")
PLAY = os.path.join(SRC, "appstore", "play")
os.makedirs(PLAY, exist_ok=True)

# 선별 8장(02·07 '상세설명' 제외) — 노출 순서대로
CHOSEN = [
    "00_hero_6.9.png",
    "01_slide_6.9.png",
    "03_slide_6.9.png",
    "04_slide_6.9.png",
    "05_slide_6.9.png",
    "06_slide_6.9.png",
    "08_slide_6.9.png",
    "09_slide_6.9.png",
]

TOTAL_PAD = 112  # 좌우 합 → 1290+112=1402 (2796/1402=1.994 < 2:1, Play 통과)


def edge_bleeds(img, side):
    """해당 가장자리 열이 배경(세로 그라데=행마다 단색)과 다르면 콘텐츠가 가장자리에
    닿은 것 → True. 좌측 열을 배경 기준으로 삼아 비교."""
    w, h = img.size
    x = 0 if side == "left" else w - 1
    bg = img.crop((0, 0, 1, h))                 # 좌측 열 = 배경 기준
    col = img.crop((x, 0, x + 1, h))
    diff = sum(abs(a - b) for a, b in zip(bg.tobytes(), col.tobytes()))
    return diff / (h * 3) > 6                    # 행평균 채널차 6 초과면 bleed


for i, fname in enumerate(CHOSEN, start=1):
    img = Image.open(os.path.join(OUT, fname)).convert("RGB")
    w, h = img.size
    # 풀블리드 판별: 오른쪽이 꽉 차면 왼쪽에만, 왼쪽이 꽉 차면 오른쪽에만,
    # 둘 다 여백이면 양쪽 균등. 세로 그라데 배경은 좌측 열을 늘려 채우면 이음새 없음.
    r_bleed, l_bleed = edge_bleeds(img, "right"), edge_bleeds(img, "left")
    if r_bleed and not l_bleed:
        lpad, rpad = TOTAL_PAD, 0
    elif l_bleed and not r_bleed:
        lpad, rpad = 0, TOTAL_PAD
    else:
        lpad, rpad = TOTAL_PAD // 2, TOTAL_PAD - TOTAL_PAD // 2
    fill = img.crop((0, 0, 1, h))               # 깨끗한 좌측 열(배경)
    canvas = Image.new("RGB", (w + TOTAL_PAD, h))
    if lpad:
        canvas.paste(fill.resize((lpad, h), Image.NEAREST), (0, 0))
    if rpad:
        canvas.paste(fill.resize((rpad, h), Image.NEAREST), (lpad + w, 0))
    canvas.paste(img, (lpad, 0))
    out = os.path.join(PLAY, f"play_shot_{i}.png")
    canvas.save(out, "PNG")
    print(f"shot {i} {canvas.size} pad(L{lpad}/R{rpad}) bleed(L{int(l_bleed)}/R{int(r_bleed)}) <- {fname}")

# ── 앱 아이콘 512x512 (풀square, 알파 없음) ──
icon = Image.open(r"C:\dev\petmove\apps\portal\assets\icon.png").convert("RGB")
icon = icon.resize((512, 512), Image.LANCZOS)
icon_out = os.path.join(PLAY, "play_icon_512.png")
icon.save(icon_out, "PNG")
print("icon", icon.size, "->", icon_out)
print("DONE ->", PLAY)
