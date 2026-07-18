# -*- coding: utf-8 -*-
"""구글 플레이 피처 그래픽(1024x500) 시안 여러 종 + 컨택트시트."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge

OUT = os.path.join(SRC, "appstore")
os.makedirs(OUT, exist_ok=True)

FW, FH = 1024, 500
SHOT = "Screenshot_20260628_171904.jpg"
WHITE = (255, 255, 255)
SUB = (255, 246, 233)
AMBER = (232, 165, 90)
AMBER_DK = (212, 150, 84)
INK = (46, 42, 36)
INK_SUB = (120, 108, 92)


def logo_wordmark(c, x, y, sz, wm_color, badge_bg=AMBER, badge_stroke=WHITE, gap=18, fs=52):
    """로고 배지 + '펫무브' 워드마크."""
    d = ImageDraw.Draw(c)
    badge = ribbon_badge(sz, badge_bg, badge_stroke)
    c.paste(badge, (x, y), badge)
    d.text((x + sz + gap, y + sz // 2), "펫무브", font=font(True, fs), fill=wm_color, anchor="lm")


def phone_right(c, screen_w=300, frame=(224, 220, 213, 255), rot=10, px_off=40, py=60,
                home=(150, 145, 135, 220)):
    phone = build_phone(SHOT, screen_w=screen_w, bezel=10, frame=frame,
                        home_color=home).rotate(rot, expand=True, resample=Image.BICUBIC)
    pw, phh = phone.size
    px = FW - pw + px_off
    drop_shadow(c, [px + 30, py + 40, px + pw - 30, py + phh - 10],
                radius=70, blur=34, alpha=120, color=(120, 70, 25))
    c.paste(phone, (px, py), phone)
    return px, py, pw, phh


# ── 시안 A: 히어로(확정 후보) — amber 그라데, 폰 우측 ──────────────
def variant_a():
    c = vgradient(FW, FH, (224, 165, 95), (197, 126, 56)).convert("RGB")
    d = ImageDraw.Draw(c)
    phone_right(c)
    x0 = 70
    logo_wordmark(c, x0, 92, 70, WHITE)
    d.text((x0, 222), "반려동물 해외여행", font=font(True, 60), fill=WHITE)
    d.text((x0, 318), "검역 준비가 막막하셨죠?", font=font(False, 30), fill=SUB)
    d.text((x0, 362), "펫무브로 준비하세요", font=font(False, 30), fill=SUB)
    return c


# ── 시안 B: 라이트 스톤 — 스크린샷 슬라이드 톤, 다크 베젤 폰 ──────────
def variant_b():
    c = vgradient(FW, FH, (246, 239, 231), (236, 225, 212)).convert("RGB")
    d = ImageDraw.Draw(c)
    phone_right(c, frame=(33, 30, 26, 255), home=(70, 62, 52, 235))
    x0 = 70
    logo_wordmark(c, x0, 92, 70, INK, badge_bg=AMBER_DK)
    # amber 포인트 바
    d.rounded_rectangle([x0, 210, x0 + 64, 218], radius=4, fill=AMBER_DK)
    d.text((x0, 234), "반려동물 해외여행", font=font(True, 60), fill=INK)
    d.text((x0, 330), "검역 준비가 막막하셨죠?", font=font(False, 30), fill=INK_SUB)
    d.text((x0, 374), "펫무브로 준비하세요", font=font(False, 30), fill=INK_SUB)
    return c


# ── 시안 C: 타이포 센터 — 폰 없음, 큰 워드마크 + 태그라인 ───────────
def variant_c():
    c = vgradient(FW, FH, (224, 165, 95), (197, 126, 56)).convert("RGB")
    d = ImageDraw.Draw(c)
    # 은은한 대형 리본 워터마크(우하단)
    wm = ribbon_badge(560, None, (255, 255, 255))
    wm.putalpha(wm.split()[3].point(lambda a: int(a * 0.10)))
    c.paste(wm, (FW - 470, FH - 360), wm)
    cx = FW // 2
    SZ = 92
    badge = ribbon_badge(SZ, AMBER, WHITE)
    c.paste(badge, (cx - SZ // 2, 78), badge)
    d.text((cx, 232), "펫무브", font=font(True, 78), fill=WHITE, anchor="mm")
    d.text((cx, 320), "검역 준비가 막막하셨죠?", font=font(False, 36), fill=SUB, anchor="mm")
    d.text((cx, 380), "펫무브로 준비하세요", font=font(False, 36), fill=SUB, anchor="mm")
    return c


# ── 시안 D: 스플릿 — 좌 amber 패널(텍스트) / 우 스톤 패널(폰) ────────
def variant_d():
    c = Image.new("RGB", (FW, FH), (240, 232, 222))
    d = ImageDraw.Draw(c)
    split = 600
    panel = vgradient(split, FH, (224, 165, 95), (200, 132, 62)).convert("RGB")
    c.paste(panel, (0, 0))
    # 우측 스톤 패널에 폰
    phone = build_phone(SHOT, screen_w=300, bezel=10, frame=(33, 30, 26, 255),
                        home_color=(70, 62, 52, 235)).rotate(8, expand=True, resample=Image.BICUBIC)
    pw, phh = phone.size
    px, py = split - 40, 64
    drop_shadow(c, [px + 30, py + 40, px + pw - 30, py + phh - 10],
                radius=70, blur=34, alpha=90, color=(90, 70, 40))
    c.paste(phone, (px, py), phone)
    x0 = 64
    logo_wordmark(c, x0, 92, 66, WHITE, fs=48)
    d.text((x0, 196), "반려동물", font=font(True, 64), fill=WHITE)
    d.text((x0, 268), "해외여행", font=font(True, 64), fill=WHITE)
    d.text((x0, 372), "검역 준비가 막막하셨죠?", font=font(False, 26), fill=SUB)
    d.text((x0, 408), "펫무브로 준비하세요", font=font(False, 26), fill=SUB)
    return c


# ── 시안 E: 폰 포워드 — 폰 크게, 컴팩트 텍스트 좌상단 ───────────────
def variant_e():
    c = vgradient(FW, FH, (216, 156, 88), (188, 118, 50)).convert("RGB")
    d = ImageDraw.Draw(c)
    phone = build_phone(SHOT, screen_w=360, bezel=11, frame=(224, 220, 213, 255),
                        home_color=(150, 145, 135, 220)).rotate(12, expand=True, resample=Image.BICUBIC)
    pw, phh = phone.size
    px, py = FW - pw + 70, 40
    drop_shadow(c, [px + 34, py + 44, px + pw - 34, py + phh - 10],
                radius=80, blur=38, alpha=125, color=(110, 64, 22))
    c.paste(phone, (px, py), phone)
    x0 = 66
    logo_wordmark(c, x0, 80, 60, WHITE, fs=44)
    d.text((x0, 188), "반려동물", font=font(True, 58), fill=WHITE)
    d.text((x0, 256), "해외여행", font=font(True, 58), fill=WHITE)
    d.text((x0, 356), "검역 준비가 막막하셨죠?", font=font(False, 28), fill=SUB)
    d.text((x0, 396), "펫무브로 준비하세요", font=font(False, 28), fill=SUB)
    return c


VARIANTS = [("A", variant_a), ("B", variant_b), ("C", variant_c),
            ("D", variant_d), ("E", variant_e)]

imgs = []
for name, fn in VARIANTS:
    img = fn()
    p = os.path.join(OUT, f"play_feat_{name}.png")
    img.save(p, "PNG")
    print("saved", p)
    imgs.append((name, img))

# ── 컨택트시트(세로 스택) ──────────────────────────────────────
cw = 512
ch = int(FH * cw / FW)
labelh = 34
sheet = Image.new("RGB", (cw, (ch + labelh) * len(imgs)), (250, 250, 250))
sd = ImageDraw.Draw(sheet)
for i, (name, img) in enumerate(imgs):
    y = i * (ch + labelh)
    sd.text((10, y + 6), f"시안 {name}", font=font(True, 22), fill=(40, 40, 40))
    sheet.paste(img.resize((cw, ch), Image.LANCZOS), (0, y + labelh))
sheet.save(os.path.join(OUT, "play_feat_contact.png"), "PNG")
print("DONE ->", OUT)
