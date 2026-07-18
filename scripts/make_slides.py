# -*- coding: utf-8 -*-
"""펫무브 스토어 기능 슬라이드(2~) — 세이지 배경 + 캡션 + 아이폰 목업."""
from PIL import ImageDraw
import os
from store_lib import W, H, SRC, font, vgradient, center_text, drop_shadow, build_phone

OUT = os.path.join(SRC, "appstore")
os.makedirs(OUT, exist_ok=True)

SAGE_TOP = (208, 216, 197)
SAGE_BOT = (185, 198, 170)
INK = (52, 58, 46)
ACCENT = (212, 150, 84)

# (번호, 스크린샷, 헤더, 세부설명)
SLIDES = [
    (1, "Screenshot_20260628_175701.jpg", "단계별 가이드",
     ["해야 할 일을 한눈에", "단계를 탭하면 자세한 설명을 볼 수 있어요"]),
    (2, "Screenshot_20260628_175807.jpg", "상세 설명",
     ["준비 방법과 필요한 정보까지 알려드려요"]),
    (3, "Screenshot_20260628_171904.jpg", "준비 상황도 한눈에",
     ["진행 상황과 남은 기간을 볼 수 있어요"]),
    (4, "Screenshot_20260628_185127.jpg", "실수를 미리 막아줘요",
     ["잘못된 날짜를 입력하면 알려드려요"]),
    # 05 = 주요 일정 알림 (make_alarm.py 에서 별도 생성)
    (6, "Screenshot_20260628_180406.jpg", "서류 체크리스트",
     ["필요한 서류를 빠짐없이 확인하세요"]),
    (7, "Screenshot_20260628_180418.jpg", "상세 설명",
     ["발급 방법과 주의할 점을 알려드려요"]),
    (8, "Screenshot_20260628_201106.jpg", "우리 아이 정보를 한곳에",
     ["검역에 필요한 보호자와 반려동물 정보를 관리하세요"]),
    (9, "Screenshot_20260628_202221.jpg", "보관함",
     ["백신 라벨, 증명서, 허가증 등을", "사진·PDF로 저장하고 필요할 때 확인하세요"]),
]

INK2 = (94, 102, 84)  # 세부설명용 — 헤더보다 연한 세이지 잉크

for idx, fname, heading, sub in SLIDES:
    canvas = vgradient(W, H, SAGE_TOP, SAGE_BOT).convert("RGB")
    d = ImageDraw.Draw(canvas)
    cx = W // 2

    y = 176
    d.rounded_rectangle([cx - 46, y - 34, cx + 46, y - 22], radius=6, fill=ACCENT)
    # 헤더 — 길이에 맞춰 폰트 자동 축소
    fsize = 80
    f = font(True, fsize)
    while fsize > 52 and d.textlength(heading, font=f) > W - 180:
        fsize -= 4
        f = font(True, fsize)
    center_text(d, cx, y, heading, f, INK)
    # 세부 설명(있으면, 여러 줄) — 길면 자동 축소
    if sub:
        ssize = 42
        sf = font(False, ssize)
        while ssize > 30 and max(d.textlength(s, font=sf) for s in sub) > W - 150:
            ssize -= 2
            sf = font(False, ssize)
        sy = y + int(fsize * 1.5)
        for sline in sub:
            center_text(d, cx, sy, sline, sf, INK2)
            sy += int(ssize * 1.38)

    # 폰을 작게 — 사방에 여유 있는 여백 + 실버(웜) 프레임.
    phone = build_phone(fname, screen_w=920, bezel=16,
                        frame=(224, 220, 213, 255), home_color=(150, 145, 135, 220))
    pw, phh = phone.size
    px, py = (W - pw) // 2, 600
    drop_shadow(canvas, [px, py + 22, px + pw, py + phh + 22], radius=118)
    canvas.paste(phone, (px, py), phone)

    name = f"{idx:02d}_slide" if isinstance(idx, int) else f"cand_{idx}"
    out = os.path.join(OUT, f"{name}_6.9.png")
    canvas.save(out, "PNG")
    print("saved", out)
