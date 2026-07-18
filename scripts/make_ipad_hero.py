# -*- coding: utf-8 -*-
"""iPad 히어로(2064x2752) — 기존 구도(좌측 텍스트 + 우하단 기울인 폰)를 iPad 넓이로."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge

OUT = os.path.join(SRC, "appstore", "ipad")
os.makedirs(OUT, exist_ok=True)
SHOT = "Screenshot_20260628_171904.jpg"
WHITE = (255, 255, 255)
SUB = (255, 246, 233)
AMBER = (232, 165, 90)

IW, IH = 2064, 2752
c = vgradient(IW, IH, (224, 165, 95), (197, 126, 56)).convert("RGB")
d = ImageDraw.Draw(c)
x0 = 170

# 로고 + 워드마크 (좌측, 약한 그림자)
SZ = 132
ly = 320
sh = Image.new("RGBA", (IW, IH), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([x0 + 3, ly + 7, x0 + SZ + 3, ly + SZ + 7],
                                     radius=int(SZ * 0.225), fill=(80, 44, 16, 50))
sh = sh.filter(ImageFilter.GaussianBlur(13))
c.paste(Image.new("RGB", (IW, IH), (80, 44, 16)), (0, 0), sh.split()[3])
badge = ribbon_badge(SZ, AMBER, WHITE)
c.paste(badge, (x0, ly), badge)
d.text((x0 + SZ + 30, ly + SZ // 2), "펫무브", font=font(True, 98), fill=WHITE, anchor="lm")

# 헤드라인 + 서브 (좌측 정렬)
d.text((x0, 540), "반려동물 해외여행", font=font(True, 122), fill=WHITE)
d.text((x0, 740), "검역 준비가 막막하셨죠?", font=font(False, 60), fill=SUB)
d.text((x0, 826), "펫무브로 시작하세요", font=font(False, 60), fill=SUB)

# 기울인 폰 (우하단, 우측 가장자리로 풀블리드)
phone = build_phone(SHOT, screen_w=940, bezel=20, frame=(224, 220, 213, 255),
                    home_color=(150, 145, 135, 220)).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size
px, py = IW - pw + 210, 980
drop_shadow(c, [px + 70, py + 80, px + pw - 70, py + phh - 20],
            radius=130, blur=52, alpha=120, color=(120, 70, 25))
c.paste(phone, (px, py), phone)

out = os.path.join(OUT, "ipad_shot_01.png")
c.save(out, "PNG")
print("saved", out, c.size)
