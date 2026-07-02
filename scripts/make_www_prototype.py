# -*- coding: utf-8 -*-
"""www.petmove.co.kr 반응형 랜딩 프로토타입 생성.
시안 2(Warm Bold) + 목표 '둘 다'(앱 다운로드 + 직영 올케어).
폰/태블릿/PC 반응형. 실제 사진 base64 인라인 → 단일 HTML.
"""
import base64, io, os
from PIL import Image

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

LOGO = ('<svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">'
        '<rect width="100" height="100" rx="22.5" fill="#D99A58"/>'
        '<path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" '
        'fill="none" stroke="#fff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

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

  .band{{position:relative;min-height:360px;display:flex;align-items:flex-end;
    background:url('{band}') center 72% / cover no-repeat}}
  .band .scrim{{width:100%;padding:30px 0;background:linear-gradient(to top, rgba(30,26,20,.74), rgba(30,26,20,.10))}}
  .band h2{{font-size:23px;color:#fff;margin:0;font-weight:700;line-height:1.3;max-width:520px}}
  .band p{{font-size:13.5px;color:#EDE4D3;margin:9px 0 0;line-height:1.6}}

  .final{{background:var(--dark);padding:44px 0;text-align:center}}
  .final h2{{font-size:24px;color:#F5EFE8;margin:0 0 10px;font-weight:700}}
  .final p{{font-size:13.5px;color:#B0A896;margin:0 0 22px}}
  .store-row{{display:flex;gap:11px;justify-content:center;flex-wrap:wrap}}
  .store{{background:#F5EFE8;color:var(--ink);border-radius:13px;padding:13px 18px;display:flex;align-items:center;
    gap:8px;font-size:13.5px;font-weight:500}}
  footer{{background:#211E19;color:#8B8578;padding:28px 0;font-size:12px;line-height:1.85}}
  footer a{{color:#B0A896}}
  .flag{{background:#FFF6E5;border:0.5px solid #F0DBA8;color:#7A5A1E;font-size:11.5px;border-radius:8px;
    padding:10px 13px;margin:14px auto 0;max-width:1036px;line-height:1.5}}

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
    <div><div class="n">40<span>+</span></div><div class="l">목적지 가이드</div></div>
    <div><div class="n"><span><i class="ti ti-stethoscope"></i></span></div><div class="l">수의사 파트너 검역</div></div>
    <div><div class="n"><span><i class="ti ti-shield-check"></i></span></div><div class="l">출국까지 동행</div></div>
  </div>

  <section>
    <div class="container">
      <div class="kicker">앱으로 준비하면</div>
      <div class="h2">3단계면 충분해요</div>
      <div class="steps">
        <div class="step"><div class="ic"><i class="ti ti-map-pin"></i></div><div><div class="t">목적지 선택</div><div class="d">가는 나라만 고르면 준비가 시작돼요</div></div><span class="num">01</span></div>
        <div class="step"><div class="ic"><i class="ti ti-calendar"></i></div><div><div class="t">자동 일정</div><div class="d">검역·접종 날짜를 역산해 알려드려요</div></div><span class="num">02</span></div>
        <div class="step"><div class="ic"><i class="ti ti-plane"></i></div><div><div class="t">출국</div><div class="d">필요 서류까지 완비된 채로</div></div><span class="num">03</span></div>
      </div>
    </div>
  </section>

  <section style="background:var(--surface);border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)">
    <div class="container">
      <div class="kicker">두 가지 방법</div>
      <div class="h2">직접, 또는 맡기고</div>
      <div class="sub">준비에 익숙하면 앱으로 직접. 처음이거나 복잡한 나라면 전문가 올케어로.</div>
      <div class="paths">
        <div class="path app">
          <span class="tag">펫무브 앱 · 무료</span>
          <h3>앱으로 직접 준비</h3>
          <p class="pd">일정·서류·알림을 한 화면에서 스스로 관리해요.</p>
          <ul>
            <li><i class="ti ti-check" style="color:var(--accent)"></i>목적지별 맞춤 일정 자동 계산</li>
            <li><i class="ti ti-check" style="color:var(--accent)"></i>할 일 리마인더 알림</li>
            <li><i class="ti ti-check" style="color:var(--accent)"></i>서류 보관·체크</li>
          </ul>
          <span class="go">앱 받기<i class="ti ti-arrow-right"></i></span>
        </div>
        <div class="path care">
          <span class="tag">로잔동물의료센터 직영</span>
          <h3>전문가 올케어</h3>
          <p class="pd">검역·서류·운송까지 전담팀이 대신 준비해 드려요.</p>
          <ul>
            <li><i class="ti ti-check" style="color:var(--sage)"></i>수의사 검역·건강증명 발급</li>
            <li><i class="ti ti-check" style="color:var(--sage)"></i>서류·수속 대행</li>
            <li><i class="ti ti-check" style="color:var(--sage)"></i>모든 목적지 상담 가능</li>
          </ul>
          <span class="go">상담 신청<i class="ti ti-arrow-right"></i></span>
        </div>
      </div>
    </div>
  </section>

  <section>
    <div class="container">
      <div class="kicker">어디로 떠나시나요</div>
      <div class="h2">앱에서 바로 준비</div>
      <div class="grid">
        <div class="dest">일본<span class="dot"></span></div>
        <div class="dest">태국<span class="dot"></span></div>
        <div class="dest">EU<span class="dot"></span></div>
        <div class="dest">필리핀<span class="dot"></span></div>
        <div class="dest">싱가포르<span class="dot"></span></div>
        <div class="dest soon">+ 더보기</div>
      </div>
      <div class="note"><span class="dot"></span>앱 준비 가능 국가 · 그 외 국가는 직영 올케어로 대행</div>
    </div>
  </section>

  <div class="band">
    <div class="scrim">
      <div class="container">
        <h2>낯선 나라로 떠나는 길,<br>펫무브가 곁을 지킬게요</h2>
        <p>준비의 처음부터 도착 그 후까지.</p>
      </div>
    </div>
  </div>

  <div class="final">
    <div class="container">
      <h2>오늘부터 준비하세요</h2>
      <p>앱은 무료 · 목적지만 고르면 첫 일정이 잡혀요</p>
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
      <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/support">고객지원</a><br>
      가이드 · 블로그 · 서비스
    </div>
  </footer>

  <div class="flag">⚠️ 확인 필요: 신뢰 스트립 숫자는 실제 근거값으로 교체(현재 "40+ 목적지 가이드"만 사이트맵 근거). 3,200+·100% 같은 수치는 정직 노선에 맞게 근거 확보 후 반영.</div>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", OUT, len(html), "chars")
