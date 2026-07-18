# -*- coding: utf-8 -*-
"""히어로 서브카피 A/B 비교."""
from PIL import Image, ImageDraw, ImageFilter
import os
from store_lib import (W, H, SRC, font, vgradient, drop_shadow, build_phone, ribbon_badge)

OUT = os.path.join(SRC, "appstore", "hero_copy")
os.makedirs(OUT, exist_ok=True)
SHOT = "Screenshot_20260628_171904.jpg"
WHITE = (255, 255, 255); SUB = (255, 246, 233); AMBER = (232, 165, 90)
x0 = 120; SZ = 106

phone = build_phone(SHOT, screen_w=860).rotate(10, expand=True, resample=Image.BICUBIC)
pw, phh = phone.size

OPTS = {
    "A_short": ["어떻게 준비할지 막막하셨죠?", "펫무브로 시작하세요"],
    "B_keep":  ["어떻게 준비할지 막막하셨죠?", "복잡한 검역, 펫무브로 시작하세요"],
}

for name, sub in OPTS.items():
    c = vgradient(W, H, (224, 165, 95), (197, 126, 56)).convert("RGB")
    d = ImageDraw.Draw(c)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0+2, 202, x0+SZ+2, 196+SZ+6], radius=int(SZ*0.225), fill=(80,44,16,48))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    c.paste(Image.new("RGB", (W, H), (80,44,16)), (0,0), sh.split()[3])
    c.paste(ribbon_badge(SZ, AMBER, WHITE), (x0, 196), ribbon_badge(SZ, AMBER, WHITE))
    d.text((x0+SZ+26, 196+SZ//2-2), "펫무브", font=font(True,78), fill=WHITE, anchor="lm")
    d.text((x0, 430), "반려동물 해외여행", font=font(True,88), fill=WHITE)
    d.text((x0, 580), sub[0], font=font(False,42), fill=SUB)
    d.text((x0, 640), sub[1], font=font(False,42), fill=SUB)
    px, py = W-pw+150, 1090
    drop_shadow(c, [px+60, py+70, px+pw-60, py+phh-10], radius=130, blur=46, alpha=125, color=(120,70,25))
    c.paste(phone, (px, py), phone)
    c.save(os.path.join(OUT, f"hero_{name}.png"), "PNG"); print("saved", name)
