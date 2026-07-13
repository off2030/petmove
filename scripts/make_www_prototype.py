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

# 히어로 = 실사 스톡(사용자 확정 2026-07-12). 구 AI 이미지(hero-cardog-2x)는 이 사진을
# 본뜬 것이었음 — 원본 실사로 회귀. ⚠️shutterstock — 실제 게시 전 정식 라이선스 구매 필요.
HERO_SRC = "shutterstock_437791615.jpg"               # 흰 강아지 차 창밖(5000×3337, 쿨톤)
hero_p    = b64_crop(HERO_SRC, 1440, 1900, focus_x=0.72, focus_y=0.22)  # 폰 세로(강아지 우측·고해상도)
hero_card = b64_crop(HERO_SRC, 1200, 1300, focus_x=0.72, focus_y=0.35)  # PC 카드(중앙)
hero_l    = b64_crop(HERO_SRC, 2000, 1050, focus_x=0.60, focus_y=0.35)  # 760-959 가로

band = b64("patrick-hendry-jd0hS7Vhn_A-unsplash.jpg", 3000)  # 협곡 뒷모습(감성). PC 풀블리드용 고해상도

# ── 실제 앱 화면(Play 스토어 스샷에서 반듯한 폰만 잘라냄) ──
SHOT_DIR = r"C:\Users\off20\Desktop\스크린샷\play"
PHONE_BOX = (240, 610, 1164, 2628)      # 생성기 공통 폰 위치(고정)
SURF = (255, 255, 255)                   # --surface (방법2 배경)
STONE = (244, 246, 248)                  # --bg (방법3 배경)

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

# p_hero 미사용 — 랜딩에서 앱 스샷 제거됨. 스샷 폴더 없는 PC에서도 생성되도록 비활성.
# p_hero    = b64_phone("play_shot_3.png", STONE)  # 방법3 대표 화면(홈 55%)

LOGO = ('<svg viewBox="0 0 200 200" width="26" height="26" aria-hidden="true"><defs><clipPath id="pmlg-sq"><rect width="200" height="200" rx="46"/></clipPath><linearGradient id="pmlg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63C9FF"/><stop offset="1" stop-color="#0BAEFF"/></linearGradient></defs><g clip-path="url(#pmlg-sq)"><rect width="200" height="200" fill="url(#pmlg-sky)"/><path d="M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106" fill="none" stroke="#FFC93C" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><rect x="0" y="160" width="200" height="40" fill="#fff"/><circle cx="46" cy="168" r="52" fill="#fff"/><circle cx="72" cy="120" r="48" fill="#fff"/><circle cx="112" cy="148" r="34" fill="#fff"/><circle cx="146" cy="138" r="38" fill="#fff"/><circle cx="178" cy="154" r="24" fill="#fff"/><path d="M116 132 L116 118" fill="none" stroke="#FFC93C" stroke-width="18" stroke-linecap="round" opacity="0.34"/></g></svg>')

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
      <h2 class="h2">복잡한 준비, 앱으로 관리해요</h2>
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
  <section id="service" style="background:var(--surface);border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)">
    <div class="container">
      <div class="kicker">펫무브 서비스 소개</div>
      <h2 class="h2">전문가에게 안심하고 맡기세요</h2>
      <div class="score-list">
        <div class="score">
          <div class="score-h"><i class="ti ti-heart-plus si"></i><span class="st">로잔동물의료센터</span></div>
          <p class="sd">수의사가 직접 준비해 믿고 맡길 수 있어요</p>
        </div>
        <div class="score">
          <div class="score-h"><i class="ti ti-device-mobile si"></i><span class="st">펫무브 앱 연동</span></div>
          <p class="sd">앱으로 진행 상황을 쉽게 확인할 수 있어요</p>
        </div>
        <div class="score">
          <div class="score-h"><i class="ti ti-adjustments-horizontal si"></i><span class="st">전체 대행 · 부분 의뢰</span></div>
          <p class="sd">전 과정을 맡기거나, 필요한 단계만 도움받을 수 있어요</p>
        </div>
      </div>
      <div class="svc-cta-wrap">
        <a class="svc-cta" href="https://pf.kakao.com/_zDDxhj/chat" target="_blank" rel="noopener"><i class="ti ti-message-circle"></i>서비스 의뢰하기</a>
        <div class="svc-sub">
          <a class="nv" href="https://naver.me/GUwSYQ9h" target="_blank" rel="noopener"><span class="nlogo">N</span>네이버예약</a>
          <span class="sep">·</span>
          <a href="tel:02-872-7588"><span class="tlogo">TEL</span>02-872-7588</a>
        </div>
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
<meta name="description" content="우리 아이 해외여행, 펫무브가 챙길게요. 앱으로 쉽게 준비하고, 복잡한 검역 절차는 전문가에게 맡기세요.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="펫무브">
<meta property="og:title" content="펫무브 · 반려동물 해외 이동">
<meta property="og:description" content="우리 아이 해외여행, 펫무브가 챙길게요. 앱으로 쉽게 준비하고, 복잡한 검역 절차는 전문가에게 맡기세요.">
<meta property="og:locale" content="ko_KR">
<!-- og:image 는 배포 이미지 자산 확정 후 추가(/og.png) — Next 이식 때 -->
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22%3E%3Cdefs%3E%3CclipPath id=%22s%22%3E%3Crect width=%22200%22 height=%22200%22 rx=%2246%22/%3E%3C/clipPath%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%2363C9FF%22/%3E%3Cstop offset=%221%22 stop-color=%22%230BAEFF%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg clip-path=%22url(%23s)%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22url(%23g)%22/%3E%3Cpath d=%22M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106%22 fill=%22none%22 stroke=%22%23FFC93C%22 stroke-width=%2218%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3Crect x=%220%22 y=%22160%22 width=%22200%22 height=%2240%22 fill=%22%23fff%22/%3E%3Ccircle cx=%2246%22 cy=%22168%22 r=%2252%22 fill=%22%23fff%22/%3E%3Ccircle cx=%2272%22 cy=%22120%22 r=%2248%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22112%22 cy=%22148%22 r=%2234%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22146%22 cy=%22138%22 r=%2238%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22178%22 cy=%22154%22 r=%2224%22 fill=%22%23fff%22/%3E%3Cpath d=%22M116 132 L116 118%22 fill=%22none%22 stroke=%22%23FFC93C%22 stroke-width=%2218%22 stroke-linecap=%22round%22 opacity=%220.34%22/%3E%3C/g%3E%3C/svg%3E">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css">
<style>
  :root{{
    --bg:#F4F6F8; --surface:#FFFFFF; --ink:#212124; --ink2:#5C5C60; --ink3:#97979C;
    --accent:#0BAEFF; --accent-ink:#0778BF; --sage:#14B8A6; --border:#E1E5E9; --dark:#212124;
  }}
  *{{box-sizing:border-box}}
  [hidden]{{display:none!important}}
  html{{scroll-behavior:smooth;scrollbar-gutter:stable;background:var(--bg)}}
  #service{{scroll-margin-top:64px}}
  body{{margin:0;background:var(--bg);font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",system-ui,"Segoe UI",Roboto,sans-serif;
    color:var(--ink);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}}
  a{{text-decoration:none;color:inherit}}
  .container{{max-width:1080px;margin:0 auto;padding:0 22px;width:100%}}
  .wm{{font-size:18px;letter-spacing:.015em;font-weight:700}}

  header{{position:sticky;top:0;z-index:20;background:#fff;
    border-bottom:0.5px solid var(--border)}}
  header .container{{display:flex;align-items:center;justify-content:space-between;padding-top:13px;padding-bottom:13px}}
  .nav-links{{display:none;align-items:center;gap:26px;font-size:14px;color:var(--ink2)}}
  .nav-right{{display:flex;align-items:center;gap:14px}}
  .nav-app{{background:var(--accent);color:#fff;font-weight:600;border-radius:11px;padding:8px 15px;font-size:13px}}
  .burger{{font-size:22px;color:var(--ink2);cursor:pointer}}
  .drawer-ov{{position:fixed;inset:0;background:rgba(21,23,26,.42);opacity:0;visibility:hidden;transition:opacity .22s;z-index:30}}
  .drawer-ov.open{{opacity:1;visibility:visible}}
  .drawer{{position:fixed;top:0;right:0;height:100%;width:min(78vw,300px);background:var(--bg);z-index:31;box-shadow:-8px 0 30px rgba(21,23,26,.18);transform:translateX(100%);transition:transform .24s ease;display:flex;flex-direction:column;padding:14px 20px 24px}}
  .drawer.open{{transform:translateX(0)}}
  .drawer-close{{align-self:flex-end;background:transparent;border:0;color:var(--ink2);font-size:24px;cursor:pointer;padding:6px;line-height:1}}
  .drawer-nav{{display:flex;flex-direction:column;margin-top:6px}}
  .drawer-nav a{{padding:15px 2px;font-size:16px;font-weight:500;color:var(--ink);border-bottom:0.5px solid var(--border)}}
  .drawer-app{{margin-top:20px;background:var(--accent);color:#fff;font-weight:600;border-radius:12px;padding:13px;text-align:center;font-size:14px}}

  .hero{{position:relative;min-height:600px;display:flex;flex-direction:column;justify-content:flex-end;
    background:url('{hero_p}') center 30% / cover no-repeat}}
  .hero .scrim{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:40px 0 34px;
    background:linear-gradient(to top, rgba(23,23,26,.82), rgba(23,23,26,.34) 55%, rgba(23,23,26,0))}}
  .hero-content{{max-width:540px}}
  .hero-photo{{display:none}}
  .eyebrow{{display:inline-block;font-size:12px;font-weight:600;color:var(--ink);background:#E4F4FF;
    border-radius:999px;padding:5px 13px;margin-bottom:16px}}
  .hero h1{{font-size:34px;line-height:1.18;letter-spacing:-.02em;color:#fff;margin:0;font-weight:700}}
  .hero p{{font-size:15px;color:#EAF1F6;margin:15px 0 22px;line-height:1.62}}
  .cta{{display:flex;flex-direction:column;gap:11px}}
  .btn-primary{{background:var(--accent);color:#fff;font-weight:600;border-radius:14px;padding:15px 22px;
    font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px}}
  .btn-ghost{{border:1.5px solid rgba(255,255,255,.85);color:#FFFFFF;font-weight:500;border-radius:14px;
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
  .trust > div + div{{border-left:0.5px solid rgba(33,33,36,.08)}}

  .steps{{display:grid;grid-template-columns:1fr;gap:14px;margin-top:26px}}
  .step{{display:flex;gap:15px;align-items:flex-start;background:var(--surface);border:0.5px solid var(--border);
    border-radius:16px;padding:18px 18px}}
  .step .ic{{width:44px;height:44px;border-radius:12px;background:#E4F4FF;color:var(--accent-ink);
    display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0}}
  .step .t{{font-size:15px;font-weight:600}}
  .step .d{{font-size:13px;color:var(--ink2);margin-top:4px;line-height:1.55}}
  .step .num{{margin-left:auto;font-size:12px;color:var(--ink3);font-weight:600}}

  .paths{{display:grid;grid-template-columns:1fr;gap:14px;margin-top:26px}}
  .path{{border-radius:18px;padding:24px 22px;border:0.5px solid var(--border)}}
  .path.app{{background:var(--dark);color:#FFFFFF}}
  .path.care{{background:var(--surface)}}
  .path .tag{{font-size:12px;font-weight:600;border-radius:999px;padding:4px 12px;display:inline-block;margin-bottom:13px}}
  .path.app .tag{{background:var(--accent);color:#fff}}
  .path.care .tag{{background:#D6EEFF;color:var(--accent-ink)}}
  .path h3{{font-size:19px;margin:0 0 6px;font-weight:700}}
  .path .pd{{font-size:13.5px;line-height:1.6;margin:0 0 15px}}
  .path.app .pd{{color:#B9BDC4}} .path.care .pd{{color:var(--ink2)}}
  .path .pt{{font-size:11.5px;font-weight:600;letter-spacing:.03em;margin:15px 0 11px}}
  .path.app .pt{{color:#8E9298}} .path.care .pt{{color:var(--ink3)}}
  .path ul{{list-style:none;padding:0;margin:0 0 17px;display:flex;flex-direction:column;gap:9px}}
  .path li{{font-size:13px;display:flex;align-items:center;gap:8px}}
  .path.app li{{color:#E4E7EB}} .path.care li{{color:var(--ink)}}
  .path .go{{font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:6px}}
  .path.app .go{{color:var(--accent)}} .path.care .go{{color:var(--accent-ink)}}

  .grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px}}
  .dest.soon[role=button]{{cursor:pointer}}
  .dest-region{{font-size:12.5px;font-weight:600;color:var(--accent-ink);letter-spacing:.02em;text-align:center;margin:24px 0 12px}}
  #destFull .grid{{margin-top:0}}
  .dest-collapse{{display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;font-weight:600;color:var(--ink3);margin-top:20px}}
  .dest-collapse i{{font-size:15px}}
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
  .band .scrim{{width:100%;padding:30px 0;background:linear-gradient(to top, rgba(23,23,26,.74), rgba(23,23,26,.10))}}
  .band h2{{font-size:23px;color:#fff;margin:0;font-weight:700;line-height:1.3;max-width:520px}}
  .band p{{font-size:13.5px;color:#E4E9ED;margin:9px 0 0;line-height:1.6}}

  /* 최종 CTA = 로고 문법(하늘 그라데이션 + 구름) — 2026-07-12 사용자 확정.
     흰 큰 제목 대비 확보를 위해 그라데이션을 로고보다 반 톤 진하게 + 얕은 텍스트 섀도. */
  .final{{background:linear-gradient(180deg,#4EC3FF,#0BA2F2);padding:52px 0 0;text-align:center}}
  .final h2{{font-size:24px;color:#fff;margin:0 0 22px;font-weight:700;text-shadow:0 1px 3px rgba(2,62,102,.20)}}
  .final p{{font-size:13.5px;color:#EAF6FF;margin:0 0 22px}}
  .final .clouds{{display:block;width:min(460px,86%);height:auto;margin:30px auto 0}}
  .store-row{{display:flex;gap:11px;justify-content:center;flex-wrap:wrap}}
  .store{{background:#FFFFFF;color:var(--ink);border-radius:13px;padding:13px 18px;display:flex;align-items:center;
    gap:8px;font-size:13.5px;font-weight:500}}
  footer{{background:#fff;color:#5C5C60;padding:26px 0 30px;font-size:12px;line-height:1.85;margin-top:auto}}
  footer a{{color:#454549}}
  footer .fsns{{display:inline-flex;align-items:center;gap:5px;margin:9px 0 4px;font-weight:600}}
  footer .fsns .nlogo{{font-weight:800;font-size:13px;line-height:1}}

  /* ── 앱 소개 비교 섹션(임시) ── */
  .vlabel-wrap{{text-align:center}}
  .vlabel{{display:inline-flex;align-items:center;gap:6px;background:var(--dark);color:#FFFFFF;font-size:12px;font-weight:600;border-radius:999px;padding:6px 14px;margin:0 0 16px}}
  .more-line{{text-align:center;font-size:12.5px;color:var(--ink3);margin-top:18px}}
  .more-line b{{color:var(--accent-ink);font-weight:600}}
  .appcta-wrap{{text-align:center}}
  .appcta{{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:#fff;font-weight:600;border-radius:14px;padding:15px;font-size:15px;width:100%;max-width:460px;margin:24px auto 0}}
  .ph{{background:var(--surface);border:1.5px solid rgba(33,33,36,.16);border-radius:16px;padding:9px 8px}}
  .ph .notch{{width:22px;height:4px;background:rgba(33,33,36,.18);border-radius:3px;margin:1px auto 9px}}
  .ph .b{{height:7px;border-radius:4px;background:#E3E9EF;margin-bottom:6px}}
  .ph .b.am{{background:var(--accent);width:58%}}
  .ph .b.sm{{width:80%}}
  .ph .b.xs{{width:46%}}
  .ph .cm{{background:#EAF5FD;border:0.5px solid rgba(11,174,255,.35);border-radius:8px;height:38px;margin-top:8px}}
  .frows{{margin-top:22px}}
  .frow{{display:flex;gap:15px;align-items:center;padding:15px 0;border-top:0.5px solid var(--border)}}
  .frow:first-child{{border-top:none}}
  .frow .fthumb{{flex:0 0 66px;height:118px}}
  .fnum{{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#E4F4FF;color:var(--accent-ink);font-size:11px;font-weight:700;margin-bottom:7px}}
  .frow .ft{{font-size:15px;font-weight:600;margin:0 0 3px}}
  .frow .fd{{font-size:12.5px;color:var(--ink2);margin:0;line-height:1.5}}
  .fgrid{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}}
  .fcell{{background:var(--surface);border:0.5px solid var(--border);border-radius:13px;padding:14px 13px}}
  .fcell .fi{{width:34px;height:34px;border-radius:10px;background:#E4F4FF;color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:9px}}
  .fcell .ft{{font-size:13.5px;font-weight:600;margin:0 0 2px}}
  .fcell .fd{{font-size:11.5px;color:var(--ink2);margin:0;line-height:1.4}}
  .fscroll{{display:flex;gap:13px;overflow-x:auto;margin-top:22px;padding-bottom:6px;scroll-snap-type:x mandatory}}
  .fscroll::-webkit-scrollbar{{height:0}}
  .fslide{{flex:0 0 132px;scroll-snap-align:center}}
  .fslide .ph{{height:210px;margin-bottom:9px}}
  .fslide .fcap{{font-size:12.5px;color:var(--ink);text-align:center;font-weight:500}}
  .fdots{{display:flex;gap:5px;justify-content:center;margin-top:14px}}
  .fdots i{{width:6px;height:6px;border-radius:50%;background:rgba(33,33,36,.16)}}
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
  .score{{background:#E4F4FF;border:0.5px solid rgba(11,174,255,.35);border-radius:14px;padding:16px 17px}}
  .score-h{{display:flex;align-items:center;gap:11px;margin-bottom:8px}}
  .score .si{{color:var(--accent-ink);font-size:22px;flex-shrink:0}}
  .score .st{{font-size:15px;font-weight:600}}
  .score .sd{{font-size:13px;color:var(--ink2);margin:0;line-height:1.55}}
  .svc-cap{{max-width:460px;margin:20px auto 10px;font-size:11.5px;font-weight:600;letter-spacing:.03em;color:var(--ink3)}}
  .svc-items{{max-width:460px;margin:0 auto;display:flex;flex-direction:column;gap:9px}}
  .svc-item{{font-size:13.5px;color:var(--ink);display:flex;align-items:center;gap:8px}}
  .svc-item i{{color:var(--accent-ink);font-size:15px}}
  .svc-cta-wrap{{text-align:center}}
  .svc-cta{{display:flex;align-items:center;justify-content:center;gap:8px;background:transparent;border:1.5px solid var(--accent);color:var(--accent-ink);font-weight:600;border-radius:14px;padding:14px;font-size:15px;width:100%;max-width:460px;margin:24px auto 0}}
  .svc-sub{{display:flex;align-items:center;justify-content:center;gap:16px;margin:13px auto 0;font-size:13px}}
  .svc-sub a{{display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:var(--ink2);font-weight:600;letter-spacing:-0.01em}}
  .svc-sub a i{{font-size:14px}}
  .svc-sub .nv{{color:var(--ink2)}}
  .svc-sub .nlogo{{font-weight:800;font-size:14px;line-height:1}}
  .svc-sub .tlogo{{font-weight:800;font-size:12px;line-height:1;letter-spacing:-0.02em}}
  .svc-sub .sep{{color:var(--ink3)}}
  .rlist{{max-width:460px;margin:24px auto 0;display:flex;flex-direction:column;gap:12px}}
  .rcard{{background:var(--surface);border:0.5px solid var(--border);border-radius:14px;padding:17px 18px}}
  .rhead{{display:flex;align-items:center;gap:11px;margin-bottom:11px}}
  .ravatar{{width:38px;height:38px;border-radius:50%;background:#E4F4FF;color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0}}
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
    .drawer,.drawer-ov{{display:none}}
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
    .rlist{{max-width:none;flex-direction:row;gap:14px;align-items:stretch}}
    .rcard{{flex:1 1 0}}
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
    .btn-ghost{{border-color:rgba(33,33,36,.28);color:var(--ink)}}
    .hero-photo{{display:block;height:470px;border-radius:22px;box-shadow:0 18px 40px rgba(31,27,46,.14);
      background:url('{hero_card}') center 32% / cover no-repeat}}
  }}
</style>
</head>
<body>
  <header>
    <div class="container">
      <span style="display:flex;align-items:center;gap:8px">{LOGO}<span class="wm">펫무브</span></span>
      <span class="nav-links"><a href="#service">서비스</a><a href="guide.html">가이드</a><a href="contact.html">문의</a></span>
      <span class="nav-right">
        <a class="nav-app">앱 다운로드</a>
        <i class="ti ti-menu-2 burger" id="burger" role="button" tabindex="0" aria-label="메뉴"></i>
      </span>
    </div>
  </header>
  <div class="drawer-ov" id="drawerOv"></div>
  <aside class="drawer" id="drawer">
    <button class="drawer-close" id="drawerClose" aria-label="닫기"><i class="ti ti-x"></i></button>
    <nav class="drawer-nav">
      <a href="prototype-mobile.html">홈</a>
      <a href="#service">서비스</a>
      <a href="guide.html">가이드</a>
      <a href="contact.html">문의</a>
    </nav>
    <a class="drawer-app">앱 다운로드</a>
  </aside>

  <section class="hero">
    <div class="scrim">
      <div class="container">
        <div class="hero-content">
          <span class="eyebrow">반려동물 해외여행 · 검역 준비</span>
          <h1>우리 아이 해외여행,<br>펫무브가 챙길게요</h1>
          <p>앱으로 쉽게 준비하고, <br class="mbr">복잡한 절차는 전문가에게 맡기세요</p>
          <div class="cta">
            <a class="btn-primary"><i class="ti ti-download" style="font-size:17px"></i>무료 앱으로 시작하기</a>
            <a class="btn-ghost" href="#service"><i class="ti ti-message-circle" style="font-size:17px"></i>전문가에게 맡기기</a>
          </div>
        </div>
        <div class="hero-photo"></div>
      </div>
    </div>
  </section>

  <div class="trust">
    <div><div class="n">5,300<span>+</span></div><div class="l">누적 출국</div></div>
    <div><div class="n">50<span>+</span></div><div class="l">지원 여행지</div></div>
    <div><div class="n"><span id="yrs" style="color:inherit">20</span>년<span>+</span></div><div class="l">경험</div></div>
  </div>

{APP_SECTIONS}
{SERVICE_SECTION}

  <section>
    <div class="container">
      <div class="kicker">앱 지원 여행지</div>
      <h2 class="h2">27곳, 앞으로 더 추가돼요</h2>
      <div class="grid" id="destGrid">
        <div class="dest">일본<span class="dot"></span></div>
        <div class="dest">태국<span class="dot"></span></div>
        <div class="dest">필리핀<span class="dot"></span></div>
        <div class="dest">프랑스<span class="dot"></span></div>
        <div class="dest">독일<span class="dot"></span></div>
        <div class="dest soon" id="destMore" role="button" tabindex="0">+ 더보기</div>
      </div>
      <div id="destFull" hidden>
        <div class="dest-region">아시아</div>
        <div class="grid">
          <div class="dest">일본<span class="dot"></span></div>
          <div class="dest">태국<span class="dot"></span></div>
          <div class="dest">필리핀<span class="dot"></span></div>
        </div>
        <div class="dest-region">유럽 · EU 24개국</div>
        <div class="grid">
          <div class="dest">프랑스<span class="dot"></span></div>
          <div class="dest">독일<span class="dot"></span></div>
          <div class="dest">이탈리아<span class="dot"></span></div>
          <div class="dest">스페인<span class="dot"></span></div>
          <div class="dest">네덜란드<span class="dot"></span></div>
          <div class="dest">벨기에<span class="dot"></span></div>
          <div class="dest">오스트리아<span class="dot"></span></div>
          <div class="dest">스웨덴<span class="dot"></span></div>
          <div class="dest">덴마크<span class="dot"></span></div>
          <div class="dest">폴란드<span class="dot"></span></div>
          <div class="dest">체코<span class="dot"></span></div>
          <div class="dest">포르투갈<span class="dot"></span></div>
          <div class="dest">그리스<span class="dot"></span></div>
          <div class="dest">헝가리<span class="dot"></span></div>
          <div class="dest">루마니아<span class="dot"></span></div>
          <div class="dest">불가리아<span class="dot"></span></div>
          <div class="dest">크로아티아<span class="dot"></span></div>
          <div class="dest">슬로바키아<span class="dot"></span></div>
          <div class="dest">슬로베니아<span class="dot"></span></div>
          <div class="dest">리투아니아<span class="dot"></span></div>
          <div class="dest">라트비아<span class="dot"></span></div>
          <div class="dest">에스토니아<span class="dot"></span></div>
          <div class="dest">룩셈부르크<span class="dot"></span></div>
          <div class="dest">키프로스<span class="dot"></span></div>
        </div>
        <div style="text-align:center"><span class="dest-collapse" id="destLess" role="button" tabindex="0"><i class="ti ti-chevron-up"></i>접기</span></div>
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
      <h2 class="h2">펫무브와 함께한 이야기</h2>
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
    <svg class="clouds" viewBox="-6 92 208 68" aria-hidden="true"><g transform="translate(0,26)"><circle cx="46" cy="168" r="52" fill="#fff"/><circle cx="72" cy="120" r="48" fill="#fff"/><circle cx="112" cy="148" r="34" fill="#fff"/><circle cx="146" cy="138" r="38" fill="#fff"/><circle cx="178" cy="154" r="24" fill="#fff"/></g></svg>
  </div>

  <footer>
    <div class="container">
      <div style="color:#212124;font-weight:600;margin-bottom:6px">펫무브 · PETMOVE</div>
      로잔동물의료센터 · 사업자등록번호 124-18-42859<br>
      서울시 관악구 관악로29길 3 · 02-872-7588<br>
      <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" class="fsns"><span class="nlogo">N</span>네이버 블로그</a><br>
      <a href="https://app.petmove.co.kr/terms">이용약관</a> · <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a> · <a href="https://app.petmove.co.kr/support">고객지원</a>
    </div>
  </footer>

  <script>(function(){{var y=new Date().getFullYear()-2006;var e=document.getElementById('yrs');if(e)e.textContent=y;}})();</script>
  <script>(function(){{var b=document.getElementById('burger'),d=document.getElementById('drawer'),o=document.getElementById('drawerOv'),c=document.getElementById('drawerClose');if(!b||!d||!o)return;function open(){{d.classList.add('open');o.classList.add('open');}}function close(){{d.classList.remove('open');o.classList.remove('open');}}b.addEventListener('click',open);b.addEventListener('keydown',function(e){{if(e.key==='Enter'||e.key===' '){{e.preventDefault();open();}}}});o.addEventListener('click',close);if(c)c.addEventListener('click',close);d.addEventListener('click',function(e){{if(e.target.tagName==='A')close();}});}})();</script>
  <script>(function(){{var m=document.getElementById('destMore'),l=document.getElementById('destLess');var g=document.getElementById('destGrid'),f=document.getElementById('destFull');function set(open){{if(g)g.hidden=open;if(f)f.hidden=!open;}}function bind(el,fn){{if(!el)return;el.addEventListener('click',fn);el.addEventListener('keydown',function(ev){{if(ev.key==='Enter'||ev.key===' '){{ev.preventDefault();fn();}}}});}}bind(m,function(){{set(true);}});bind(l,function(){{set(false);}});}})();</script>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", OUT, len(html), "chars")
