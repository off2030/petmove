# -*- coding: utf-8 -*-
"""펫무브 스토어 1번 슬라이드(히어로) — 확정본.
구도 A(텍스트 좌상단·폰 우하단 좌측기울임) + 한글 워드마크 '펫무브' + amber 로고."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import (W, H, SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge)

OUT = os.path.join(SRC, "appstore")
os.makedirs(OUT, exist_ok=True)

SHOT = "Screenshot_20260628_171904.jpg"   # 펫무브(한글) 헤더 최신 화면
WHITE = (255, 255, 255)
SUB = (255, 246, 233)
AMBER = (232, 165, 90)

c = vgradient(W, H, (224, 165, 95), (197, 126, 56)).convert("RGB")
d = ImageDraw.Draw(c)
x0 = 120

# 로고 (약한 그림자, 평면 amber) — 살짝 키움
SZ = 106
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([x0 + 2, 196 + 6, x0 + SZ + 2, 196 + SZ + 6],
                                     radius=int(SZ * 0.225), fill=(80, 44, 16, 48))
sh = sh.filter(ImageFilter.GaussianBlur(10))
c.paste(Image.new("RGB", (W, H), (80, 44, 16)), (0, 0), sh.split()[3])
badge = ribbon_badge(SZ, AMBER, WHITE)
c.paste(badge, (x0, 196), badge)

# 워드마크 '펫무브' (한글) — 배지 세로 중앙, 살짝 줄임
badge_mid = 196 + SZ // 2
d.text((x0 + SZ + 26, badge_mid - 2), "펫무브", font=font(True, 78), fill=WHITE, anchor="lm")

# 헤드라인
d.text((x0, 430), "반려동물 해외여행", font=font(True, 88), fill=WHITE)

# 서브
d.text((x0, 580), "검역 준비가 막막하셨죠?", font=font(False, 42), fill=SUB)
d.text((x0, 640), "펫무브로 시작하세요", font=font(False, 42), fill=SUB)

# 폰 (좌측 기울임, 우하단)
phone = build_phone(SHOT, screen_w=860, bezel=16, frame=(224, 220, 213, 255),
                    home_color=(150, 145, 135, 220)).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size
px, py = W - pw + 150, 1090
drop_shadow(c, [px + 60, py + 70, px + pw - 60, py + phh - 10],
            radius=130, blur=46, alpha=125, color=(120, 70, 25))
c.paste(phone, (px, py), phone)

out_path = os.path.join(OUT, "00_hero_6.9.png")
c.save(out_path, "PNG")
print("saved", out_path)
