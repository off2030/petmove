# -*- coding: utf-8 -*-
"""펫무브 앱스토어 스크린샷(가공 이미지) 생성 — iPhone 6.9" (1290x2796)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

SRC = r"C:\Users\off20\Desktop\스크린샷"
OUT = os.path.join(SRC, "appstore")
os.makedirs(OUT, exist_ok=True)

W, H = 1290, 2796
BG_TOP = (246, 239, 231)     # 따뜻한 스톤 (밝음)
BG_BOT = (236, 225, 212)     # 살짝 깊은 스톤
INK = (46, 42, 36)           # 헤드라인
AMBER = (232, 165, 90)       # 포인트색(로고색)

FONT_BD = r"C:\Windows\Fonts\malgunbd.ttf"
FONT_RG = r"C:\Windows\Fonts\malgun.ttf"

# (소스파일, 헤드라인 2줄) — 상/하 시스템바는 자동 감지 크롭
SHOTS = [
    ("Screenshot_20260626_212527.jpg", ["다음 할 일을", "바로 알려드려요"]),
    ("Screenshot_20260626_212628.jpg", ["필요한 서류,", "빠짐없이 체크해요"]),
    ("Screenshot_20260626_212656.jpg", ["혼자 어렵다면", "전문가에게 맡기세요"]),
    ("Screenshot_20260626_212751.jpg", ["각 단계, 무엇을", "언제 할지까지"]),
    ("Screenshot_20260626_213105.jpg", ["우리 아이 정보를", "한 곳에 모아서"]),
]

TOP_STATUSBAR = 90  # 상태바(시계/배터리) 고정 크롭


def detect_bottom_navbar(img):
    """하단의 어두운 안드로이드 시스템 바 높이를 감지."""
    gray = img.convert("L")
    w, h = gray.size
    px = gray.load()
    crop = 0
    for y in range(h - 1, -1, -1):
        # 가로 11곳 샘플 평균 밝기
        vals = [px[int(w * i / 10) if i < 10 else w - 1, y] for i in range(11)]
        mean = sum(vals) / len(vals)
        if mean < 95:          # 어두운 바
            crop = h - y
        else:
            break
    return crop


def vgradient(w, h, top, bot):
    base = Image.new("RGB", (w, h), top)
    draw = ImageDraw.Draw(base)
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=c)
    return base


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return m


def center_text(draw, cx, y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw / 2, y), text, font=font, fill=fill)
    return bbox[3] - bbox[1]


for idx, (fname, lines) in enumerate(SHOTS, start=1):
    canvas = vgradient(W, H, BG_TOP, BG_BOT)
    draw = ImageDraw.Draw(canvas)
    cx = W // 2

    # --- 헤드라인 ---
    f_head = ImageFont.truetype(FONT_BD, 86)
    y = 168
    # amber 포인트 바
    draw.rounded_rectangle([cx - 46, y - 34, cx + 46, y - 22], radius=6, fill=AMBER)
    for line in lines:
        h_line = center_text(draw, cx, y, line, f_head, INK)
        y += 118

    # --- 스크린샷 → 아이폰 목업 ---
    shot = Image.open(os.path.join(SRC, fname)).convert("RGB")
    sw, sh = shot.size
    crop_b = detect_bottom_navbar(shot)
    content = shot.crop((0, TOP_STATUSBAR, sw, sh - crop_b))

    # 상/하단에 앱 배경색 여백 추가(상태바·홈 인디케이터 자리)
    bg_top = content.getpixel((content.width // 2, 3))
    bg_bot = content.getpixel((content.width // 2, content.height - 3))
    STRIP_T = 132
    STRIP_B = 122
    screen_src = Image.new("RGB", (content.width, content.height + STRIP_T + STRIP_B), bg_top)
    sdraw = ImageDraw.Draw(screen_src)
    sdraw.rectangle([0, content.height + STRIP_T, content.width,
                     content.height + STRIP_T + STRIP_B], fill=bg_bot)
    screen_src.paste(content, (0, STRIP_T))

    # 폰 화면 크기로 스케일
    screen_w = 970
    scale = screen_w / screen_src.width
    screen_h = int(screen_src.height * scale)
    screen = screen_src.resize((screen_w, screen_h), Image.LANCZOS)

    BEZEL = 26
    R_OUT = 118
    R_IN = 92
    frame_w = screen_w + BEZEL * 2
    frame_h = screen_h + BEZEL * 2

    phone = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(phone)
    pd.rounded_rectangle([0, 0, frame_w, frame_h], radius=R_OUT, fill=(33, 30, 26, 255))
    # 화면 삽입(라운드 마스크)
    phone.paste(screen, (BEZEL, BEZEL), rounded_mask((screen_w, screen_h), R_IN))
    # 다이내믹 아일랜드
    isl_w, isl_h = 248, 64
    ix = (frame_w - isl_w) // 2
    iy = BEZEL + 26
    pd.rounded_rectangle([ix, iy, ix + isl_w, iy + isl_h], radius=isl_h // 2,
                         fill=(20, 18, 16, 255))
    # 홈 인디케이터
    hi_w, hi_h = 300, 15
    hx = (frame_w - hi_w) // 2
    hy = frame_h - BEZEL - 40
    pd.rounded_rectangle([hx, hy, hx + hi_w, hy + hi_h], radius=hi_h // 2,
                         fill=(70, 62, 52, 235))

    px = (W - frame_w) // 2
    py = 500

    # 그림자
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([px, py + 22, px + frame_w, py + frame_h + 22],
                         radius=R_OUT, fill=(60, 50, 40, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    canvas.paste(Image.new("RGB", (W, H), (40, 33, 26)), (0, 0), shadow.split()[3])

    canvas.paste(phone, (px, py), phone)

    out_path = os.path.join(OUT, f"{idx:02d}_appstore_6.9.png")
    canvas.save(out_path, "PNG")
    print("saved", out_path, canvas.size)

print("DONE ->", OUT)
