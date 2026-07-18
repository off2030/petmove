# -*- coding: utf-8 -*-
"""펫무브 스토어 이미지 공용 부품."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

SRC = r"C:\Users\off20\Desktop\스크린샷"
W, H = 1290, 2796

FONT_BD = r"C:\Windows\Fonts\malgunbd.ttf"
FONT_RG = r"C:\Windows\Fonts\malgun.ttf"

AMBER = (212, 150, 84)        # 로고 amber
INK = (46, 42, 36)
TOP_STATUSBAR = 90


def font(bold, size):
    return ImageFont.truetype(FONT_BD if bold else FONT_RG, size)


def vgradient(w, h, top, bot):
    base = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(base)
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    return base


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return m


def center_text(draw, cx, y, text, fnt, fill):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    draw.text((cx - (bbox[2] - bbox[0]) / 2, y), text, font=fnt, fill=fill)
    return bbox[3] - bbox[1]


def detect_bottom_navbar(img):
    gray = img.convert("L")
    w, h = gray.size
    px = gray.load()
    crop = 0
    for y in range(h - 1, -1, -1):
        vals = [px[int(w * i / 10) if i < 10 else w - 1, y] for i in range(11)]
        if sum(vals) / len(vals) < 95:
            crop = h - y
        else:
            break
    return crop


def build_phone(fname, screen_w=970, bezel=26, frame=(33, 30, 26, 255),
                island=True, home_color=(70, 62, 52, 235)):
    """스크린샷 → 아이폰 목업(RGBA). 상/하 시스템바 제거 + 베젤/아일랜드/홈바.
    bezel=0 이면 베젤 없는 라운드 스크린샷(테두리 X). frame=베젤 색."""
    shot = Image.open(os.path.join(SRC, fname)).convert("RGB")
    sw, sh = shot.size
    # 하단: 안드로이드 내비바(반투명이라 어두움 감지 실패 가능)와 플로팅 탭바 아래의
    # 흐릿한 스크롤 본문을 함께 제거 — 탭바 바로 아래에서 잘리도록 최소 크롭 보장.
    crop_b = max(detect_bottom_navbar(shot), int(sh * 0.064))
    content = shot.crop((0, TOP_STATUSBAR, sw, sh - crop_b))

    # 상/하단 여백 채울 배경색 — 가로 여러 곳을 샘플해 중앙값(배경이 다수 → amber 로고
    # 같은 국소 요소에 휘둘리지 않음).
    def _bg_row(y):
        cols = [content.getpixel((int(content.width * i / 10), y)) for i in range(1, 10)]
        return tuple(sorted(c[k] for c in cols)[len(cols) // 2] for k in range(3))
    bg_top = _bg_row(3)
    bg_bot = _bg_row(content.height - 3)
    STRIP_T, STRIP_B = 132, 122
    screen_src = Image.new("RGB", (content.width, content.height + STRIP_T + STRIP_B), bg_top)
    ImageDraw.Draw(screen_src).rectangle(
        [0, content.height + STRIP_T, content.width, content.height + STRIP_T + STRIP_B],
        fill=bg_bot)
    screen_src.paste(content, (0, STRIP_T))

    scale = screen_w / screen_src.width
    screen_h = int(screen_src.height * scale)
    screen = screen_src.resize((screen_w, screen_h), Image.LANCZOS)

    # 아일랜드/홈바/코너 반경은 화면 폭에 비례(기준 screen_w=970 의 원본 치수에서 산출).
    R_IN = max(8, round(screen_w * 92 / 970))
    if bezel <= 0:
        out = Image.new("RGBA", (screen_w, screen_h), (0, 0, 0, 0))
        out.paste(screen, (0, 0), rounded_mask((screen_w, screen_h), R_IN))
        return out

    R_OUT = R_IN + bezel
    fw, fh = screen_w + bezel * 2, screen_h + bezel * 2
    phone = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    pd = ImageDraw.Draw(phone)
    pd.rounded_rectangle([0, 0, fw, fh], radius=R_OUT, fill=frame)
    phone.paste(screen, (bezel, bezel), rounded_mask((screen_w, screen_h), R_IN))

    if island:
        isl_w = round(screen_w * 248 / 970)
        isl_h = round(screen_w * 64 / 970)
        ix, iy = (fw - isl_w) // 2, bezel + round(screen_w * 26 / 970)
        pd.rounded_rectangle([ix, iy, ix + isl_w, iy + isl_h], radius=isl_h // 2, fill=(20, 18, 16, 255))
    hi_w = round(screen_w * 300 / 970)
    hi_h = max(2, round(screen_w * 15 / 970))
    hx, hy = (fw - hi_w) // 2, fh - bezel - round(screen_w * 40 / 970)
    pd.rounded_rectangle([hx, hy, hx + hi_w, hy + hi_h], radius=hi_h // 2, fill=home_color)
    return phone


def drop_shadow(canvas, box, radius, blur=34, alpha=110, color=(40, 33, 26)):
    sh = Image.new("RGBA", (canvas.width, canvas.height), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(box, radius=radius, fill=(60, 50, 40, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.paste(Image.new("RGB", (canvas.width, canvas.height), color), (0, 0), sh.split()[3])


def _cubic(p0, p1, p2, p3, n=64):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = (u**3) * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = (u**3) * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


# 원본 SVG ribbon-p path (viewBox 0..100)
_RIBBON_SEGS = [
    ((34, 80), (28, 62), (29, 42), (41, 31)),
    ((41, 31), (53, 23), (68, 28), (68, 43)),
    ((68, 43), (68, 55), (57, 60), (49, 56)),
    ((49, 56), (43, 53), (43, 47), (48, 45)),
]


def ribbon_badge(size, bg, stroke, radius_ratio=0.225, stroke_w=9.5,
                 bg_grad=None, outline=None, highlight=False):
    """ribbon-p 로고 배지를 코드로 렌더(2x 슈퍼샘플).
    bg_grad=(top,bot) 세로 그라데이션 / outline=(color,width) 테두리 / highlight=상단 광택."""
    SS = 2
    s = size * SS
    scale = s / 100.0
    rad = int(radius_ratio * s)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if bg_grad is not None:
        grad = vgradient(s, s, bg_grad[0], bg_grad[1]).convert("RGBA")
        img.paste(grad, (0, 0), rounded_mask((s, s), rad))
        d = ImageDraw.Draw(img)
    elif bg is not None:
        d.rounded_rectangle([0, 0, s, s], radius=rad, fill=bg)

    if highlight:
        hl = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(hl).ellipse([-s * 0.2, -s * 0.55, s * 1.0, s * 0.55],
                                   fill=(255, 255, 255, 70))
        hl = hl.filter(ImageFilter.GaussianBlur(s * 0.05))
        img.paste(hl, (0, 0), Image.composite(hl.split()[3], Image.new("L", (s, s), 0),
                                              rounded_mask((s, s), rad)))
        d = ImageDraw.Draw(img)

    r = stroke_w * scale / 2
    pts = []
    for seg in _RIBBON_SEGS:
        pts.extend(_cubic(*[(p[0] * scale, p[1] * scale) for p in seg]))
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=stroke)

    if outline is not None:
        ocol, ow = outline
        d.rounded_rectangle([ow * SS / 2, ow * SS / 2, s - ow * SS / 2, s - ow * SS / 2],
                            radius=rad, outline=ocol, width=int(ow * SS))

    img = img.resize((size, size), Image.LANCZOS)
    return img


def logo_badge(size, radius_ratio=0.22):
    """앱 아이콘(라운드)로 로고 배지 생성."""
    icon = Image.open(r"C:\dev\petmove\apps\portal\assets\icon.png").convert("RGB")
    icon = icon.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0), rounded_mask((size, size), int(size * radius_ratio)))
    return out
