# -*- coding: utf-8 -*-
"""확정 시안 A에 로고 약한 그림자만 입혀 최종 피처 그래픽으로 저장(원본 스크린샷 불필요)."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import SRC, ribbon_badge

OUT = os.path.join(SRC, "appstore")
WHITE = (255, 255, 255)
AMBER = (232, 165, 90)

# variant_a 의 로고 좌표와 동일
x0, y0, SZ = 70, 92, 70

c = Image.open(os.path.join(OUT, "play_feat_A.png")).convert("RGB")
W, Hh = c.size

# 약한 그림자(히어로와 동일 톤) → 배지 다시 올리기
sh = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle(
    [x0 + 2, y0 + 5, x0 + SZ + 2, y0 + SZ + 5],
    radius=int(SZ * 0.225), fill=(80, 44, 16, 48))
sh = sh.filter(ImageFilter.GaussianBlur(8))
c.paste(Image.new("RGB", (W, Hh), (80, 44, 16)), (0, 0), sh.split()[3])

badge = ribbon_badge(SZ, AMBER, WHITE)
c.paste(badge, (x0, y0), badge)

out = os.path.join(OUT, "play_feature_1024x500.png")
c.save(out, "PNG")
print("saved", out, c.size)
