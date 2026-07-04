# -*- coding: utf-8 -*-
"""www.petmove.co.kr 반응형 랜딩 프로토타입 생성.
시안 2(Warm Bold) + 목표 '둘 다'(앱 다운로드 + 직영 올케어).
폰/태블릿/PC 반응형. 실제 사진 base64 인라인 → 단일 HTML.
"""
import base64, io, os
from PIL import Image, ImageDraw

IMG_DIR = r"G:\내 드라이브\PETMOVE\기타\이미지"
OUT = r"C:\dev\petmove\docs\www-redesign\prototype-mobile.html"

def _enc(im, quality=76):
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def b64(name, width, quality=76):
    im = Image.open(os.path.join(IMG_DIR, name)).convert("RGB")
    w, h = im.size
    return _enc(im.resize((width, int(h*width/w)), Image.LANCZOS), quality)

def b64_crop(name, out_w, out_h, focus_y=0.5, focus_x=0.5, quality=78):
    """지정한 가로세로 비율로 초점(focus) 기준 크롭 후 리사이즈."""
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(os.path.join(IMG_DIR, name)).convert("RGB")
    w, h = im.size
    ar = out_w / out_h
    if w / h > ar:            # 원본이 더 넓음 → 폭을 자름
        cw = int(h * ar); ch = h
    else:                      # 원본이 더 높음 → 높이를 자름
        cw = w; ch = int(w / ar)
    l = int((w - cw) * focus_x); t = int((h - ch) * focus_y)
    im = im.crop((l, t, l + cw, t + ch)).resize((out_w, out_h), Image.LANCZOS)
    return _enc(im, quality)

HERO_SRC = "hero-cardog-2x.png"                       # 밝은 차 창밖(AI·2배 업스케일 5056px). ✦워터마크 크롭 제외
hero_p    = b64_crop(HERO_SRC, 1440, 1900, focus_x=0.66, focus_y=0.28)  # 폰 세로(강아지 우측·고해상도)
hero_card = b64_crop(HERO_SRC, 1200, 1300, focus_x=0.66, focus_y=0.34)  # PC 카드(중앙)
hero_l    = b64_crop(HERO_SRC, 2000, 1050, focus_x=0.56, focus_y=0.40)  # 760-959 가로

band = b64("patrick-hendry-jd0hS7Vhn_A-unsplash.jpg", 3000)  # 협곡 뒷모습(감성). PC 풀블리드용 고해상도

# ── 실제 앱 화면(Play 스토어 스샷에서 반듯한 폰만 잘라냄) ──
SHOT_DIR = r"C:\Users\off20\Desktop\스크린샷\play"
PHONE_BOX = (240, 610, 1164, 2628)      # 생성기 공통 폰 위치(고정)
SURF = (251, 247, 241)                   # --surface (방법2 배경)
STONE = (245, 239, 232)                  # --bg (방법3 배경)

def b64_phone(name, bg, out_w=440, q=82):
    """스토어 스샷에서 폰 영역만 크롭 + 라운드 코너를 섹션 배경색으로 합성."""
    im = Image.open(os.path.join(SHOT_DIR, name)).convert("RGB").crop(PHONE_BOX)
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w, h], radius=int(w * 0.115), fill=255)
    canvas = Image.new("RGB", (w, h), bg)
    canvas.paste(im, (0, 0), mask)
    canvas = canvas.resize((out_w, int(h * out_w / w)), Image.LANCZOS)
    return _enc(canvas, q)

p_hero    = b64_phone("play_shot_3.png", STONE)  # 방법3 대표 화면(홈 55%)

LOGO = ('<svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">'
        '<rect width="100" height="100" rx="22.5" fill="#D99A58"/>'
        '<path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" '
        'fill="none" stroke="#fff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

# ── CSS로 그린 폰 목업 내부(실제 스샷 대체 전 임시) ──
PH1 = '<div class="notch"></div><div class="b am"></div><div class="b sm"></div><div class="b"></div><div class="cm"></div>'
PH2 = '<div class="notch"></div><div class="b sm"></div><div class="cm"></div><div class="b" style="margin-top:7px"></div><div class="b xs"></div>'
PH3 = '<div class="notch"></div><div class="b"></div><div class="b am"></div><div class="b sm"></div><div class="cm"></div>'
PHT = '<div class="notch"></div><div class="b am"></div><div class="b sm"></div><div class="b"></div><div class="cm"></div><div class="b sm" style="margin-top:9px"></div><div class="b xs"></div>'

# ── 앱 소개 섹션 (한 줄 1카드: 아이콘+제목 / 설명, 마지막 점선 '이 외에도' 카드) ──
APP_SECTIONS = f"""
  <section>
    <div class="container">
      <div class="kicker">펫무브 앱 소개</div>
      <div class="h2">복잡한 준비, 앱으로 관리해요</div>
      <div class="alist">
        <div class="acard"><div class="acard-h"><span class="ai"><i class="ti ti-route"></i></span><span class="at">단계별 가이드</span></div><p class="ad">언제 무엇을 해야 할지 알려드려요</p></div>
        <div class="acard"><div class="acard-h"><span class="ai"><i class="ti ti-shield-check"></i></span><span class="at">실수 예방</span></div><p class="ad">입력 정보가 규정에 맞지 않을 경우 알려드려요</p></div>
        <div class="acard"><div class="acard-h"><span class="ai"><i class="ti ti-bell"></i></span><span class="at">일정 알림</span></div><p class="ad">예정일·만료일·마감일 등에 알림을 드려요</p></div>
        <div class="acard"><div class="acard-h"><span class="ai"><i class="ti ti-clipboard-check"></i></span><span class="at">서류 체크리스트</span></div><p class="ad">준비할 서류를 한눈에 보고 관리할 수 있어요</p></div>
        <div class="acard"><div class="acard-h"><span class="ai"><i class="ti ti-folder"></i></span><span class="at">보관함</span></div><p class="ad">백신 라벨·수첩·각종 서류 사본을 보관할 수 있어요</p></div>
        <div class="acard more"><i class="ti ti-dots"></i>이 외에도 다양한 기능이 있어요</div>
      </div>
      <div class="appcta-wrap"><a class="appcta"><i class="ti ti-download"></i>무료 앱 받기</a></div>
    </div>
  </section>
"""

# ── 서비스 소개 섹션(3번째): 두 핵심(수의사 직접 · 앱 연동) + 맡길 수 있는 것 + 상담 CTA ──
SERVICE_SECTION = """
  <section style="background:var(--surface);border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)">
    <div class="container">
      <div class="kicker">펫무브 서비스 소개</div>
      <div class="h2">전문가에게 안심하고 맡기세요</div>
      <div class="score-list">
        <div class="score">
          <div class="score-h"><i class="ti ti-heart-plus si"></i><span class="st">로잔동물의료센터</span></div>
          <p class="sd">믿을 수 있는 동물병원·수의사가 준비해드려요</p>
        </div>
        <div class="score">
          <div class="score-h"><i class="ti ti-device-mobile si"></i><span class="st">펫무브 앱 연동</span></div>
          <p class="sd">앱으로 진행 상황·정보를 쉽게 확인할 수 있어요</p>
        </div>
      </div>
      <div class="svc-contact">
        <a class="ct" href="https://pf.kakao.com/_zDDxhj/chat" target="_blank" rel="noopener">
          <i class="ti ti-message-circle"></i><span>카카오 상담</span></a>
        <a class="ct" href="tel:02-872-7588">
          <i class="ti ti-phone"></i><span>전화 상담</span></a>
        <a class="ct" href="https://naver.me/GUwSYQ9h" target="_blank" rel="noopener">
          <i class="ti ti-calendar-check"></i><span>네이버 예약</span></a>
      </div>
    </div>
  </section>
"""

html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>펫무브 · 반려동물 해외 이동</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css">
<style>
  :root{{
    --bg:#F5EFE8; --surface:#FBF7F1; --ink:#2A2620; --ink2:#6B6457; --ink3:#847B6C;
    --accent:#D99A58; --accent-ink:#9A5A2E; --sage:#8FA68C; --border:#E3D9C6; --dark:#2A2620;
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--bg);font-family:'Pretendard',-apple-system,system-ui,sans-serif;
    color:var(--ink);-webkit-font-smoothing:antialiased}}
  a{{text-decoration:none;color:inherit}}
  .container{{max-width:1080px;margin:0 auto;padding:0 22px;width:100%}}
  .wm{{font-size:18px;letter-spacing:.015em;font-weight:700}}

  header{{position:sticky;top:0;z-index:20;background:rgba(245,239,232,.92);backdrop-filter:blur(8px);
    border-bottom:0.5px solid var(--border)}}
  header .container{{display:flex;align-items:center;justify-content:space-between;padding-top:13px;padding-bottom:13px}}
  .nav-links{{display:none;align-items:center;gap:26px;font-size:14px;color:var(--ink2)}}
  .nav-right{{display:flex;align-items:center;gap:14px}}
  .nav-app{{background:var(--accent);color:var(--ink);font-weight:600;border-radius:11px;padding:8px 15px;font-size:13px}}
  .burger{{font-size:22px;color:var(--ink2)}}

  .hero{{position:relative;min-height:600px;display:flex;flex-direction:column;justify-content:flex-end;
    background:url('{hero_p}') center 30% / cover no-repeat}}
  .hero .scrim{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:40px 0 34px;
    background:linear-gradient(to top, rgba(30,26,20,.82), rgba(30,26,20,.34) 55%, rgba(30,26,20,0))}}
  .hero-content{{max-width:540px}}
  .hero-photo{{display:none}}
  .eyebrow{{display:inline-block;font-size:12px;font-weight:600;color:var(--ink);background:#F5DFB8;
    border-radius:999px;padding:5px 13px;margin-bottom:16px}}
  .hero h1{{font-size:34px;line-height:1.18;letter-spacing:-.02em;color:#fff;margin:0;font-weight:700}}
  .hero p{{font-size:15px;color:#F0E7DA;margin:15px 0 22px;line-height:1.62}}
  .cta{{display:flex;flex-direction:column;gap:11px}}
  .btn-primary{{background:var(--accent);color:var(--ink);font-weight:600;border-radius:14px;padding:15px 22px;
    font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px}}
  .btn-ghost{{border:1.5px solid rgba(245,239,232,.85);color:#F5EFE8;font-weight:500;border-radius:14px;
    padding:14px 22px;font-size:14.5px;display:flex;align-items:center;justify-content:center;gap:8px}}

  section{{padding:38px 0}}
  .kicker{{font-size:12.5px;font-weight:600;color:var(--accent-ink);letter-spacing:.03em;text-align:center;margin-bottom:8px}}
  .h2{{font-size:24px;line-height:1.32;letter-spacing:-.01em;text-align:center;margin:0 0 6px;font-weight:700}}
  .sub{{font-size:14px;color:var(--ink2);text-align:center;line-height:1.66;margin:0 auto;max-width:440px}}

  .trust{{display:grid;grid-template-columns:repeat(3,1fr);background:var(--surface);
    border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)}}
  .trust > div{{text-align:center;padding:22px 6px}}
  .trust .n{{font-size:24px;font-weight:700;letter-spacing:-.01em;line-height:1.1}}
  .trust .n span{{color:var(--accent-ink)}}
  .trust .l{{font-size:12px;color:var(--ink2);margin-top:5px}}
  .trust > div + div{{border-left:0.5px solid rgba(42,38,32,.08)}}

  .steps{{display:grid;grid-template-columns:1fr;gap:14px;margin-top:26px}}
  .step{{display:flex;gap:15px;align-items:flex-start;background:var(--surface);border:0.5px solid var(--border);
    border-radius:16px;padding:18px 18px}}
  .step .ic{{width:44px;height:44px;border-radius:12px;background:#EFE0C9;color:var(--accent-ink);
    display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0}}
  .step .t{{font-size:15px;font-weight:600}}
  .step .d{{font-size:13px;color:var(--ink2);margin-top:4px;line-height:1.55}}
  .step .num{{margin-left:auto;font-size:12px;color:var(--ink3);font-weight:600}}

  .paths{{display:grid;grid-template-columns:1fr;gap:14px;margin-top:26px}}
  .path{{border-radius:18px;padding:24px 22px;border:0.5px solid var(--border)}}
  .path.app{{background:var(--dark);color:#F5EFE8}}
  .path.care{{background:var(--surface)}}
  .path .tag{{font-size:12px;font-weight:600;border-radius:999px;padding:4px 12px;display:inline-block;margin-bottom:13px}}
  .path.app .tag{{background:var(--accent);color:var(--ink)}}
  .path.care .tag{{background:#EAD9BF;color:var(--accent-ink)}}
  .path h3{{font-size:19px;margin:0 0 6px;font-weight:700}}
  .path .pd{{font-size:13.5px;line-height:1.6;margin:0 0 15px}}
  .path.app .pd{{color:#CFC6B6}} .path.care .pd{{color:var(--ink2)}}
  .path .pt{{font-size:11.5px;font-weight:600;letter-spacing:.03em;margin:15px 0 11px}}
  .path.app .pt{{color:#A79E8E}} .path.care .pt{{color:var(--ink3)}}
  .path ul{{list-style:none;padding:0;margin:0 0 17px;display:flex;flex-direction:column;gap:9px}}
  .path li{{font-size:13px;display:flex;align-items:center;gap:8px}}
  .path.app li{{color:#E7DECE}} .path.care li{{color:var(--ink)}}
  .path .go{{font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:6px}}
  .path.app .go{{color:var(--accent)}} .path.care .go{{color:var(--accent-ink)}}

  .grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px}}
  .dest{{background:var(--surface);border:0.5px solid var(--border);border-radius:14px;padding:15px 8px;
    text-align:center;position:relative;font-size:13.5px}}
  .dest.soon{{border-style:dashed;color:var(--ink3)}}
  .dest .dot{{position:absolute;top:9px;right:9px;width:6px;height:6px;border-radius:50%;background:var(--sage)}}
  .note{{display:flex;align-items:center;gap:7px;justify-content:center;margin-top:16px;font-size:12px;color:var(--ink2)}}
  .note .dot{{width:6px;height:6px;border-radius:50%;background:var(--sage);display:inline-block}}
  .soon-block{{text-align:center;margin-top:24px}}
  .soon-label{{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:400;color:var(--ink3);margin-bottom:13px}}
  .soon-chips{{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;max-width:440px;margin:0 auto}}
  .soon-chips span{{font-size:12.5px;color:var(--ink3);background:var(--surface);border:0.5px dashed var(--border);border-radius:999px;padding:6px 13px}}

  .band{{position:relative;min-height:360px;display:flex;align-items:flex-end;
    background:url('{band}') center 72% / cover no-repeat}}
  .band .scrim{{width:100%;padding:30px 0;background:linear-gradient(to top, rgba(30,26,20,.74), rgba(30,26,20,.10))}}
  .band h2{{font-size:23px;color:#fff;margin:0;font-weight:700;line-height:1.3;max-width:520px}}
  .band p{{font-size:13.5px;color:#EDE4D3;margin:9px 0 0;line-height:1.6}}

  .final{{background:var(--dark);padding:44px 0;text-align:center}}
  .final h2{{font-size:24px;color:#F5EFE8;margin:0 0 22px;font-weight:700}}
  .final p{{font-size:13.5px;color:#B0A896;margin:0 0 22px}}
  .store-row{{display:flex;gap:11px;justify-content:center;flex-wrap:wrap}}
  .store{{background:#F5EFE8;color:var(--ink);border-radius:13px;padding:13px 18px;display:flex;align-items:center;
    gap:8px;font-size:13.5px;font-weight:500}}
  footer{{background:#211E19;color:#8B8578;padding:28px 0;font-size:12px;line-height:1.85}}
  footer a{{color:#B0A896}}
  .flag{{background:#FFF6E5;border:0.5px solid #F0DBA8;color:#7A5A1E;font-size:11.5px;border-radius:8px;
    padding:10px 13px;margin:14px auto 0;max-width:1036px;line-height:1.5}}

  /* ── 앱 소개 비교 섹션(임시) ── */
  .vlabel-wrap{{text-align:center}}
  .vlabel{{display:inline-flex;align-items:center;gap:6px;background:var(--dark);color:#F5EFE8;font-size:12px;font-weight:600;border-radius:999px;padding:6px 14px;margin:0 0 16px}}
  .more-line{{text-align:center;font-size:12.5px;color:var(--ink3);margin-top:18px}}
  .more-line b{{color:var(--accent-ink);font-weight:600}}
  .appcta-wrap{{text-align:center}}
  .appcta{{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:var(--ink);font-weight:600;border-radius:14px;padding:15px;font-size:15px;width:100%;max-width:460px;margin:24px auto 0}}
  .ph{{background:var(--surface);border:1.5px solid rgba(42,38,32,.16);border-radius:16px;padding:9px 8px}}
  .ph .notch{{width:22px;height:4px;background:rgba(42,38,32,.18);border-radius:3px;margin:1px auto 9px}}
  .ph .b{{height:7px;border-radius:4px;background:#EADCC9;margin-bottom:6px}}
  .ph .b.am{{background:var(--accent);width:58%}}
  .ph .b.sm{{width:80%}}
  .ph .b.xs{{width:46%}}
  .ph .cm{{background:#F4E7D2;border:0.5px solid rgba(217,154,88,.4);border-radius:8px;height:38px;margin-top:8px}}
  .frows{{margin-top:22px}}
  .frow{{display:flex;gap:15px;align-items:center;padding:15px 0;border-top:0.5px solid var(--border)}}
  .frow:first-child{{border-top:none}}
  .frow .fthumb{{flex:0 0 66px;height:118px}}
  .fnum{{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#EFE0C9;color:var(--accent-ink);font-size:11px;font-weight:700;margin-bottom:7px}}
  .frow .ft{{font-size:15px;font-weight:600;margin:0 0 3px}}
  .frow .fd{{font-size:12.5px;color:var(--ink2);margin:0;line-height:1.5}}
  .fgrid{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}}
  .fcell{{background:var(--surface);border:0.5px solid var(--border);border-radius:13px;padding:14px 13px}}
  .fcell .fi{{width:34px;height:34px;border-radius:10px;background:#EFE0C9;color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:9px}}
  .fcell .ft{{font-size:13.5px;font-weight:600;margin:0 0 2px}}
  .fcell .fd{{font-size:11.5px;color:var(--ink2);margin:0;line-height:1.4}}
  .fscroll{{display:flex;gap:13px;overflow-x:auto;margin-top:22px;padding-bottom:6px;scroll-snap-type:x mandatory}}
  .fscroll::-webkit-scrollbar{{height:0}}
  .fslide{{flex:0 0 132px;scroll-snap-align:center}}
  .fslide .ph{{height:210px;margin-bottom:9px}}
  .fslide .fcap{{font-size:12.5px;color:var(--ink);text-align:center;font-weight:500}}
  .fdots{{display:flex;gap:5px;justify-content:center;margin-top:14px}}
  .fdots i{{width:6px;height:6px;border-radius:50%;background:rgba(42,38,32,.16)}}
  .fdots i.on{{background:var(--accent);width:17px;border-radius:3px}}
  .swipe-hint{{text-align:center;font-size:11.5px;color:var(--ink3);margin-top:9px}}
  .realshot{{width:100%;display:block}}
  .fslide .realshot{{margin-bottom:9px}}
  .hero-shot{{width:160px;margin:0 auto 18px;display:block}}
  .alist{{max-width:460px;margin:24px auto 0;display:flex;flex-direction:column;gap:10px}}
  .acard{{background:var(--surface);border:0.5px solid var(--border);border-radius:14px;padding:15px 16px}}
  .acard-h{{display:flex;align-items:center;gap:11px}}
  .acard .ai{{color:var(--accent-ink);display:inline-flex;align-items:center;font-size:21px;flex-shrink:0}}
  .acard .at{{font-size:15.5px;font-weight:600}}
  .acard .ad{{font-size:13px;color:var(--ink2);margin:9px 0 0;line-height:1.5}}
  .acard.more{{border-style:dashed;background:transparent;text-align:center;color:var(--ink3);font-size:13px;padding:15px;display:flex;align-items:center;justify-content:center;gap:7px}}
  .acard.more i{{color:var(--accent-ink);font-size:16px}}
  .slead{{font-size:13px;color:var(--ink2);text-align:center;max-width:400px;margin:0 auto 22px;line-height:1.6}}
  .score-list{{max-width:460px;margin:24px auto 0;display:flex;flex-direction:column;gap:12px}}
  .score{{background:#FBF1E3;border:0.5px solid rgba(217,154,88,.4);border-radius:14px;padding:16px 17px}}
  .score-h{{display:flex;align-items:center;gap:11px;margin-bottom:8px}}
  .score .si{{color:var(--accent-ink);font-size:22px;flex-shrink:0}}
  .score .st{{font-size:15px;font-weight:600}}
  .score .sd{{font-size:13px;color:var(--ink2);margin:0;line-height:1.55}}
  .svc-cap{{max-width:460px;margin:20px auto 10px;font-size:11.5px;font-weight:600;letter-spacing:.03em;color:var(--ink3)}}
  .svc-items{{max-width:460px;margin:0 auto;display:flex;flex-direction:column;gap:9px}}
  .svc-item{{font-size:13.5px;color:var(--ink);display:flex;align-items:center;gap:8px}}
  .svc-item i{{color:var(--accent-ink);font-size:15px}}
  .svc-contact{{max-width:460px;margin:24px auto 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}}
  .svc-contact .ct{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--surface);border:0.5px solid rgba(217,154,88,.35);border-radius:12px;padding:15px 6px;text-decoration:none;color:var(--ink)}}
  .svc-contact .ct i{{color:var(--accent-ink);font-size:21px}}
  .svc-contact .ct span{{font-size:12.5px;font-weight:600}}
  .rlist{{max-width:460px;margin:24px auto 0;display:flex;flex-direction:column;gap:12px}}
  .rcard{{background:var(--surface);border:0.5px solid var(--border);border-radius:14px;padding:17px 18px}}
  .rhead{{display:flex;align-items:center;gap:11px;margin-bottom:11px}}
  .ravatar{{width:38px;height:38px;border-radius:50%;background:#EFE0C9;color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0}}
  .rname{{font-size:14px;font-weight:600;color:var(--ink)}}
  .rmeta{{font-size:12px;color:var(--ink3)}}
  .rtext{{font-size:13.5px;color:var(--ink2);line-height:1.72;margin:0}}
  .hybrid .hero-ph{{width:130px;height:224px;margin:0 auto 18px}}
  .hlist{{display:grid;grid-template-columns:1fr 1fr;gap:9px}}
  .hrow{{display:flex;align-items:center;gap:9px;background:var(--surface);border:0.5px solid var(--border);border-radius:11px;padding:11px 12px}}
  .hrow i{{color:var(--accent-ink);font-size:17px;flex:0 0 auto}}
  .hrow span{{font-size:12.5px;font-weight:500}}

  /* ── 태블릿 이상 ── */
  @media(min-width:760px){{
    .nav-links{{display:flex}}
    .burger{{display:none}}
    .hero{{min-height:640px;background-image:url('{hero_l}');background-position:center 46%}}
    .hero .scrim{{padding:56px 0 46px}}
    .hero h1{{font-size:48px}}
    .hero p{{font-size:17px;max-width:460px}}
    .mbr{{display:none}}
    .cta{{flex-direction:row}}
    .btn-primary,.btn-ghost{{flex:0 0 auto}}
    section{{padding:60px 0}}
    .h2{{font-size:30px}}
    .kicker{{font-size:13px}}
    .sub{{font-size:15px;max-width:520px}}
    .steps{{grid-template-columns:repeat(3,1fr);gap:16px}}
    .step{{flex-direction:column;padding:24px 22px;min-height:150px}}
    .step .num{{margin:0;position:absolute}}
    .step{{position:relative}}
    .paths{{grid-template-columns:1fr 1fr;gap:18px}}
    .fgrid,.hlist{{grid-template-columns:repeat(3,1fr)}}
    .frows{{max-width:620px;margin-left:auto;margin-right:auto}}
    .path{{padding:30px 28px}}
    .grid{{grid-template-columns:repeat(6,1fr)}}
    .trust .n{{font-size:30px}} .trust .l{{font-size:13px}}
    .band{{min-height:480px}}
    .band h2{{font-size:30px}}
    .final h2{{font-size:30px}}
  }}
  /* ── 데스크톱 ── */
  @media(min-width:1100px){{
    .hero h1{{font-size:52px}}
    section{{padding:76px 0}}
    .h2{{font-size:34px}}
    .band{{min-height:600px}}
  }}
  /* ── PC 히어로 = 스플릿(글+사진 카드), 모바일은 풀블리드 유지 ── */
  @media(min-width:960px){{
    .hero{{background:var(--surface);background-image:none;min-height:0;justify-content:stretch}}
    .hero .scrim{{position:static;inset:auto;background:none;padding:72px 0;justify-content:center}}
    .hero .container{{display:grid;grid-template-columns:1.05fr .95fr;gap:46px;align-items:center}}
    .hero-content{{max-width:none}}
    .hero h1{{color:var(--ink)}}
    .hero p{{color:var(--ink2);max-width:none}}
    .btn-ghost{{border-color:rgba(42,38,32,.28);color:var(--ink)}}
    .hero-photo{{display:block;height:470px;border-radius:22px;box-shadow:0 18px 40px rgba(31,27,46,.14);
      background:url('{hero_card}') center 32% / cover no-repeat}}
  }}
</style>
</head>
<body>
  <header>
    <div class="container">
      <span style="display:flex;align-items:center;gap:8px">{LOGO}<span class="wm">펫무브</span></span>
      <span class="nav-links"><a>서비스</a><a>가이드</a><a>블로그</a></span>
      <span class="nav-right">
        <a class="nav-app">앱 다운로드</a>
        <i class="ti ti-menu-2 burger"></i>
      </span>
    </div>
  </header>

  <section class="hero">
    <div class="scrim">
      <div class="container">
        <div class="hero-content">
          <span class="eyebrow">반려동물 해외여행 · 검역 준비</span>
          <h1>우리 아이 해외여행,<br>펫무브가 챙길게요</h1>
          <p>앱으로 쉽게 준비하고, <br class="mbr">복잡한 절차는 전문가에게 맡기세요</p>
          <div class="cta">
            <a class="btn-primary"><i class="ti ti-download" style="font-size:17px"></i>무료 앱으로 시작하기</a>
            <a class="btn-ghost"><i class="ti ti-message-circle" style="font-size:17px"></i>전문가에게 맡기기</a>
          </div>
        </div>
        <div class="hero-photo"></div>
      </div>
    </div>
  </section>

  <div class="trust">
    <div><div class="n">5,300<span>+</span></div><div class="l">누적 출국</div></div>
    <div><div class="n">50<span>+</span></div><div class="l">지원 국가</div></div>
    <div><div class="n"><span id="yrs" style="color:inherit">20</span>년<span>+</span></div><div class="l">경험</div></div>
  </div>

{APP_SECTIONS}
{SERVICE_SECTION}

  <section>
    <div class="container">
      <div class="kicker">앱 지원 국가</div>
      <div class="h2">27개국, 앞으로 더 추가돼요</div>
      <div class="grid">
        <div class="dest">일본<span class="dot"></span></div>
        <div class="dest">태국<span class="dot"></span></div>
        <div class="dest">필리핀<span class="dot"></span></div>
        <div class="dest">프랑스<span class="dot"></span></div>
        <div class="dest">독일<span class="dot"></span></div>
        <div class="dest soon">+ 더보기</div>
      </div>
      <div class="soon-block">
        <div class="soon-label"><i class="ti ti-calendar-plus"></i>2026년 추가 예정</div>
        <div class="soon-chips">
          <span>하와이</span><span>싱가포르</span><span>중국</span><span>대만</span><span>미국</span><span>캐나다</span><span>영국</span><span>인도네시아</span><span>말레이시아</span><span>호주</span><span>뉴질랜드</span>
        </div>
      </div>
    </div>
  </section>

  <section style="border-top:0.5px solid var(--border)">
    <div class="container">
      <div class="kicker">고객 후기</div>
      <div class="h2">이미 함께한 가족들</div>
      <div class="rlist">
        <div class="rcard">
          <div class="rhead"><span class="ravatar">모</span><div><div class="rname">최○지님</div><div class="rmeta">모짜·렐라 · 일본</div></div></div>
          <p class="rtext">안녕하세요. 모짜와 렐라 보호자입니다. 이사하고 이것저것 준비할 게 많아서 인사가 늦었네요. 원장님 덕분에 애들 무사히 일본에 도착했습니다. 여러 가지로 신경 써주셔서 정말 정말 감사합니다!</p>
        </div>
        <div class="rcard">
          <div class="rhead"><span class="ravatar">보</span><div><div class="rname">김○수님</div><div class="rmeta">보리 · 태국</div></div></div>
          <p class="rtext">원장님 안녕하세요! 방콕으로 이주하면서 보리 입국 서류 때문에 막막했는데, 원장님 덕분에 무사히 잘 도착했습니다. 수입허가서 발급이랑 접종 스케줄 짜는 건 저 혼자선 도저히 엄두가 안났었는데, 덕분에 마음이 든든했습니다. 진심으로 감사드려요!</p>
        </div>
        <div class="rcard">
          <div class="rhead"><span class="ravatar">루</span><div><div class="rname">최○진님</div><div class="rmeta">루나 · 필리핀</div></div></div>
          <p class="rtext">원장님 안녕하세요~ 루나 데리고 세부에 입국해서 짐 정리하다가 이제야 인사 드려요. 루나가 워낙 예민한 고양이라 병원 갈 때부터 걱정이 많았는데, 검진 조심스럽게 잘 해주시고 안심시켜 주셔서 너무 감사했어요. 광견병이랑 예방접종 증명서를 깐깐하게 본다고 들었는데, 챙겨주신 서류 그대로 검역소에 내니까 질문 하나 없이 패스였어요! 감사해요!</p>
        </div>
      </div>
    </div>
  </section>

  <div class="band">
    <div class="scrim">
      <div class="container">
        <h2>가족이니까, 언제나 함께</h2>
        <p>펫무브가 챙길게요</p>
      </div>
    </div>
  </div>

  <div class="final">
    <div class="container">
      <h2>무료 앱으로 시작하세요</h2>
      <div class="store-row">
        <a class="store"><i class="ti ti-brand-apple" style="font-size:18px"></i>App Store</a>
        <a class="store"><i class="ti ti-brand-google-play" style="font-size:16px"></i>Google Play</a>
      </div>
    </div>
  </div>

  <footer>
    <div class="container">
      <div style="color:#C7C0B2;font-weight:500;margin-bottom:6px">펫무브 · PETMOVE</div>
      로잔동물의료센터 · 사업자등록번호 124-18-42859<br>
      서울시 관악구 관악로29길 3 · 02-872-7588<br>
      <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/support">고객지원</a>
    </div>
  </footer>

  <div class="flag">⚠️ 신뢰 스트립: 5,300+(DB 외삽 추정) · 50+ 목적지 국가(EU 24개국 포함) · 20+년(2006~, 자동 증가). 게시 전 5,300+ 근거만 최종 확인.</div>
  <script>(function(){{var y=new Date().getFullYear()-2006;var e=document.getElementById('yrs');if(e)e.textContent=y;}})();</script>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", OUT, len(html), "chars")
