# -*- coding: utf-8 -*-
"""알림 슬라이드(07) — 잠금화면 알림 연출(예정·마감·만료)."""
from PIL import Image, ImageDraw
import os
from store_lib import (W, H, SRC, font, vgradient, center_text, drop_shadow,
                       rounded_mask, ribbon_badge)

OUT = os.path.join(SRC, "appstore")
SAGE_TOP = (208, 216, 197); SAGE_BOT = (185, 198, 170); INK = (52, 58, 46); ACCENT = (212, 150, 84)
AMBER = (232, 165, 90)
WHITE = (255, 255, 255)

# ── 잠금화면(스크린) 구성 ──
SW, SH = 920, 2005
screen = vgradient(SW, SH, (64, 56, 47), (34, 30, 26)).convert("RGB")
sd = ImageDraw.Draw(screen)
center_text(sd, SW // 2, 210, "9:41", font(True, 150), (255, 255, 255))
center_text(sd, SW // 2, 410, "6월 28일 일요일", font(False, 40), (226, 220, 211))

# 실제 코드(lib/journey/reminders.ts) 의 알림 양식 그대로 — 말랑이 케이스 대입.
NOTI = [
    "내일은 말랑이 광견병 2차 접종 예정일이에요",
    "일본 사전 신고 마감이 일주일 남았어요. 입국 40일 전까지 NACCS에서 사전 신고를 하세요.",
    "말랑이 광견병 항체 검사 유효기간이 한 달 뒤(2026년 9월 1일) 만료돼요.",
]


def wrap(draw, text, fnt, maxw, maxlines=2):
    lines = [""]
    for ch in text:
        if draw.textlength(lines[-1] + ch, font=fnt) <= maxw:
            lines[-1] += ch
        elif len(lines) < maxlines:
            lines.append(ch)
        else:
            while lines[-1] and draw.textlength(lines[-1] + "…", font=fnt) > maxw:
                lines[-1] = lines[-1][:-1]
            lines[-1] += "…"
            return lines
    return lines


cx0, cw = 50, SW - 100
bfont = font(False, 36)
tx = cx0 + 110
maxw = cx0 + cw - 36 - tx
cy = 720
for body in NOTI:
    blines = wrap(sd, body, bfont, maxw, maxlines=2)
    ch = 80 + len(blines) * 46 + 22
    sd.rounded_rectangle([cx0, cy, cx0 + cw, cy + ch], radius=34, fill=(247, 244, 239))
    # 새 브랜드 앱 아이콘(하늘+구름+노란P) — 구 amber 리본P(ribbon_badge) 교체(2026-07-14)
    icon_src = Image.open(r"C:\dev\petmove\docs\brand\app-assets-wip\icon-1024.png").convert("RGBA")
    ic_size = 60
    # 4x 슈퍼샘플에서 둥근 마스크 적용 후 축소 — 모서리 계단 현상 방지
    ss = ic_size * 4
    big = icon_src.resize((ss, ss), Image.LANCZOS)
    big.putalpha(rounded_mask((ss, ss), int(ss * 0.225)))
    ic = big.resize((ic_size, ic_size), Image.LANCZOS)
    screen.paste(ic, (cx0 + 28, cy + 26), ic)
    sd.text((tx, cy + 28), "펫무브", font=font(True, 30), fill=(70, 62, 52))
    sd.text((cx0 + cw - 100, cy + 28), "지금", font=font(False, 28), fill=(150, 142, 130))
    by = cy + 80
    for ln in blines:
        sd.text((tx, by), ln, font=bfont, fill=(42, 38, 32))
        by += 46
    cy += ch + 26

# ── 실버 프레임 ──
R_IN, bezel = 92, 16
R_OUT = R_IN + bezel
fw, fh = SW + bezel * 2, SH + bezel * 2
phone = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
pd = ImageDraw.Draw(phone)
pd.rounded_rectangle([0, 0, fw, fh], radius=R_OUT, fill=(224, 220, 213, 255))
phone.paste(screen, (bezel, bezel), rounded_mask((SW, SH), R_IN))
isl_w, isl_h = 248, 64
ix, iy = (fw - isl_w) // 2, bezel + 26
pd.rounded_rectangle([ix, iy, ix + isl_w, iy + isl_h], radius=isl_h // 2, fill=(20, 18, 16, 255))
hi_w, hi_h = 300, 15
hx, hy = (fw - hi_w) // 2, fh - bezel - 40
pd.rounded_rectangle([hx, hy, hx + hi_w, hy + hi_h], radius=hi_h // 2, fill=(220, 220, 220, 170))

# ── 캔버스(세이지) + 캡션 ──
canvas = vgradient(W, H, SAGE_TOP, SAGE_BOT).convert("RGB")
d = ImageDraw.Draw(canvas)
cx = W // 2
y = 176
d.rounded_rectangle([cx - 46, y - 34, cx + 46, y - 22], radius=6, fill=ACCENT)
center_text(d, cx, y, "중요한 일정은 놓치지 않게", font(True, 76), INK)
center_text(d, cx, y + int(76 * 1.5), "때가 되면 알려드려요", font(False, 42), (94, 102, 84))

px, py = (W - fw) // 2, 600
drop_shadow(canvas, [px, py + 22, px + fw, py + fh + 22], radius=118)
canvas.paste(phone, (px, py), phone)
out = os.path.join(OUT, "05_slide_6.9.png")
canvas.save(out, "PNG")
print("saved", out)
