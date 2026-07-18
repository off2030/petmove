# -*- coding: utf-8 -*-
"""구글 플레이 피처 그래픽(배너) — 1024x500. 앱스토어 히어로와 같은 amber 톤."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge

OUT = os.path.join(SRC, "appstore")
os.makedirs(OUT, exist_ok=True)

FW, FH = 1024, 500
SHOT = "Screenshot_20260628_171904.jpg"   # 펫무브(한글) 헤더 최신 화면
WHITE = (255, 255, 255)
SUB = (255, 246, 233)
AMBER = (232, 165, 90)

# 배경 — 히어로와 동일한 amber 세로 그라데이션
c = vgradient(FW, FH, (224, 165, 95), (197, 126, 56)).convert("RGB")
d = ImageDraw.Draw(c)

# --- 우측: 폰 목업(살짝 좌로 기울임, 상/하단 살짝 크롭) ---
phone = build_phone(SHOT, screen_w=300, bezel=10, frame=(224, 220, 213, 255),
                    home_color=(150, 145, 135, 220)).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size
px, py = FW - pw + 40, 60
drop_shadow(c, [px + 30, py + 40, px + pw - 30, py + phh - 10],
            radius=70, blur=34, alpha=120, color=(120, 70, 25))
c.paste(phone, (px, py), phone)

# --- 좌측: 로고 + 워드마크 ---
x0 = 70
SZ = 70
sh = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([x0 + 2, 92 + 5, x0 + SZ + 2, 92 + SZ + 5],
                                     radius=int(SZ * 0.225), fill=(80, 44, 16, 48))
sh = sh.filter(ImageFilter.GaussianBlur(8))
c.paste(Image.new("RGB", (FW, FH), (80, 44, 16)), (0, 0), sh.split()[3])
badge = ribbon_badge(SZ, AMBER, WHITE)
c.paste(badge, (x0, 92), badge)
d.text((x0 + SZ + 18, 92 + SZ // 2), "펫무브", font=font(True, 52), fill=WHITE, anchor="lm")

# --- 헤드라인 ---
d.text((x0, 222), "반려동물 해외여행", font=font(True, 60), fill=WHITE)

# --- 서브 ---
d.text((x0, 318), "검역 준비가 막막하셨죠?", font=font(False, 30), fill=SUB)
d.text((x0, 362), "펫무브로 준비하세요", font=font(False, 30), fill=SUB)

out_path = os.path.join(OUT, "play_feature_1024x500.png")
c.save(out_path, "PNG")
print("saved", out_path, c.size)
