# -*- coding: utf-8 -*-
"""www.petmove.co.kr 모바일 우선 프로토타입 생성.
시안 2(Warm Bold) + 목표 '둘 다'(앱 다운로드 + 직영 올케어) 반영.
실제 사진을 base64 인라인 → 단일 HTML 파일. 브라우저로 열어 확인.
"""
import base64, io, os
from PIL import Image

IMG_DIR = r"G:\내 드라이브\PETMOVE\기타\이미지"
OUT = r"C:\dev\petmove\docs\www-redesign\prototype-mobile.html"

def b64(name, width, quality=74):
    im = Image.open(os.path.join(IMG_DIR, name)).convert("RGB")
    w, h = im.size
    im = im.resize((width, int(h*width/w)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

hero = b64("oscar-sutton-yihlaRCCvd4-unsplash.jpg", 720)
band = b64("patrick-hendry-jd0hS7Vhn_A-unsplash.jpg", 720)

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
  body{{margin:0;background:#DED6C8;font-family:'Pretendard',-apple-system,system-ui,sans-serif;color:var(--ink);
    -webkit-font-smoothing:antialiased}}
  .app{{max-width:460px;margin:0 auto;background:var(--bg);min-height:100vh;overflow:hidden;
    box-shadow:0 0 60px rgba(31,27,46,.14)}}
  .wm{{font-size:14px;letter-spacing:.34em;font-weight:300}}
  a{{text-decoration:none;color:inherit}}

  header{{position:sticky;top:0;z-index:20;background:rgba(245,239,232,.92);backdrop-filter:blur(8px);
    display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:0.5px solid var(--border)}}
  .nav-app{{background:var(--accent);color:var(--ink);font-weight:600;border-radius:11px;padding:7px 14px;font-size:12.5px}}

  .hero{{position:relative;min-height:600px;display:flex;flex-direction:column;justify-content:flex-end;
    background:url('{hero}') center 34% / cover no-repeat}}
  .hero .scrim{{position:relative;padding:26px 22px 30px;
    background:linear-gradient(to top, rgba(30,26,20,.80), rgba(30,26,20,.34) 55%, rgba(30,26,20,0))}}
  .eyebrow{{display:inline-block;font-size:12px;font-weight:600;color:var(--ink);background:#F5DFB8;
    border-radius:999px;padding:5px 13px;margin-bottom:15px}}
  .hero h1{{font-size:34px;line-height:1.18;letter-spacing:-.02em;color:#fff;margin:0;font-weight:700}}
  .hero p{{font-size:14.5px;color:#F0E7DA;margin:14px 0 22px;line-height:1.62;max-width:360px}}
  .cta-col{{display:flex;flex-direction:column;gap:10px}}
  .btn-primary{{background:var(--accent);color:var(--ink);font-weight:600;border-radius:14px;padding:15px;
    font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px}}
  .btn-ghost{{border:1.5px solid rgba(245,239,232,.85);color:#F5EFE8;font-weight:500;border-radius:14px;
    padding:14px;font-size:14.5px;display:flex;align-items:center;justify-content:center;gap:8px}}

  section{{padding:34px 22px}}
  .kicker{{font-size:12px;font-weight:600;color:var(--accent-ink);letter-spacing:.03em;text-align:center;margin-bottom:8px}}
  .h2{{font-size:23px;line-height:1.32;letter-spacing:-.01em;text-align:center;margin:0 0 6px;font-weight:700}}
  .sub{{font-size:13.5px;color:var(--ink2);text-align:center;line-height:1.66;margin:0 auto;max-width:340px}}

  .trust{{display:grid;grid-template-columns:repeat(3,1fr);background:var(--surface);border-top:0.5px solid var(--border);
    border-bottom:0.5px solid var(--border)}}
  .trust > div{{text-align:center;padding:20px 6px}}
  .trust .n{{font-size:22px;font-weight:700;letter-spacing:-.01em}}
  .trust .n span{{color:var(--accent-ink)}}
  .trust .l{{font-size:11.5px;color:var(--ink2);margin-top:3px}}
  .trust > div + div{{border-left:0.5px solid rgba(42,38,32,.08)}}

  .steps{{display:flex;flex-direction:column;gap:14px;margin-top:24px}}
  .step{{display:flex;gap:15px;align-items:flex-start;background:var(--surface);border:0.5px solid var(--border);
    border-radius:16px;padding:16px 17px}}
  .step .ic{{width:42px;height:42px;border-radius:12px;background:#EFE0C9;color:var(--accent-ink);
    display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}}
  .step .t{{font-size:14.5px;font-weight:600}}
  .step .d{{font-size:12.5px;color:var(--ink2);margin-top:3px;line-height:1.55}}
  .step .num{{margin-left:auto;font-size:12px;color:var(--ink3);font-weight:600}}

  .paths{{display:flex;flex-direction:column;gap:14px;margin-top:24px}}
  .path{{border-radius:18px;padding:22px 20px;border:0.5px solid var(--border)}}
  .path.app{{background:var(--dark);color:#F5EFE8}}
  .path.care{{background:var(--surface)}}
  .path .tag{{font-size:11.5px;font-weight:600;border-radius:999px;padding:4px 11px;display:inline-block;margin-bottom:12px}}
  .path.app .tag{{background:var(--accent);color:var(--ink)}}
  .path.care .tag{{background:#EAD9BF;color:var(--accent-ink)}}
  .path h3{{font-size:18px;margin:0 0 6px;font-weight:700}}
  .path .pd{{font-size:13px;line-height:1.6;margin:0 0 14px}}
  .path.app .pd{{color:#CFC6B6}} .path.care .pd{{color:var(--ink2)}}
  .path ul{{list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:8px}}
  .path li{{font-size:12.5px;display:flex;align-items:center;gap:8px}}
  .path.app li{{color:#E7DECE}} .path.care li{{color:var(--ink)}}
  .path .go{{font-weight:600;font-size:13.5px;display:inline-flex;align-items:center;gap:6px}}
  .path.app .go{{color:var(--accent)}} .path.care .go{{color:var(--accent-ink)}}

  .grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:22px}}
  .dest{{background:var(--surface);border:0.5px solid var(--border);border-radius:14px;padding:14px 8px;
    text-align:center;position:relative;font-size:13px}}
  .dest.soon{{border-style:dashed;color:var(--ink3)}}
  .dest .dot{{position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;background:var(--sage)}}
  .note{{display:flex;align-items:center;gap:7px;justify-content:center;margin-top:15px;font-size:11.5px;color:var(--ink2)}}
  .note .dot{{width:6px;height:6px;border-radius:50%;background:var(--sage);display:inline-block}}

  .band{{position:relative;min-height:300px;display:flex;align-items:flex-end;
    background:url('{band}') center / cover no-repeat;margin:0}}
  .band .scrim{{width:100%;padding:26px 22px;background:linear-gradient(to top, rgba(30,26,20,.72), rgba(30,26,20,.10))}}
  .band h2{{font-size:22px;color:#fff;margin:0;font-weight:700;line-height:1.3}}
  .band p{{font-size:13px;color:#EDE4D3;margin:8px 0 0;line-height:1.6}}

  .final{{background:var(--dark);padding:36px 22px;text-align:center}}
  .final h2{{font-size:23px;color:#F5EFE8;margin:0 0 10px;font-weight:700}}
  .final p{{font-size:13px;color:#B0A896;margin:0 0 22px}}
  .store-row{{display:flex;gap:10px;justify-content:center}}
  .store{{background:#F5EFE8;color:var(--ink);border-radius:13px;padding:12px 16px;display:flex;align-items:center;
    gap:8px;font-size:13px;font-weight:500}}
  footer{{background:#211E19;color:#8B8578;padding:24px 22px;font-size:11.5px;line-height:1.8}}
  footer a{{color:#B0A896}}
  .flag{{background:#FFF6E5;border:0.5px solid #F0DBA8;color:#7A5A1E;font-size:11px;border-radius:8px;
    padding:8px 11px;margin:10px 22px 0;line-height:1.5}}
</style>
</head>
<body>
<div class="app">
  <header>
    <span style="display:flex;align-items:center;gap:9px">{LOGO}<span class="wm">PETMOVE</span></span>
    <span style="display:flex;align-items:center;gap:13px">
      <a class="nav-app">앱 다운로드</a>
      <i class="ti ti-menu-2" style="font-size:22px;color:var(--ink2)"></i>
    </span>
  </header>

  <div class="hero">
    <div class="scrim">
      <span class="eyebrow">반려동물 해외 이동 · 준비부터 출국까지</span>
      <h1>가족과 함께,<br>어디든 안전하게</h1>
      <p>검역·접종·서류 준비, 앱으로 직접 챙기거나 전문가에게 맡기세요.</p>
      <div class="cta-col">
        <a class="btn-primary"><i class="ti ti-download" style="font-size:17px"></i>펫무브 앱 무료로 시작</a>
        <a class="btn-ghost"><i class="ti ti-headset" style="font-size:17px"></i>전문가 올케어 상담</a>
      </div>
    </div>
  </div>

  <div class="trust">
    <div><div class="n">40<span>+</span></div><div class="l">목적지 가이드</div></div>
    <div><div class="n"><span><i class="ti ti-stethoscope" style="font-size:20px"></i></span></div><div class="l">수의사 파트너 검역</div></div>
    <div><div class="n"><span><i class="ti ti-shield-check" style="font-size:20px"></i></span></div><div class="l">출국까지 동행</div></div>
  </div>

  <section>
    <div class="kicker">앱으로 준비하면</div>
    <div class="h2">3단계면 충분해요</div>
    <div class="steps">
      <div class="step"><div class="ic"><i class="ti ti-map-pin"></i></div><div><div class="t">목적지 선택</div><div class="d">가는 나라만 고르면 준비가 시작돼요</div></div><span class="num">01</span></div>
      <div class="step"><div class="ic"><i class="ti ti-calendar"></i></div><div><div class="t">자동 일정</div><div class="d">검역·접종 날짜를 역산해 알려드려요</div></div><span class="num">02</span></div>
      <div class="step"><div class="ic"><i class="ti ti-plane"></i></div><div><div class="t">출국</div><div class="d">필요 서류까지 완비된 채로</div></div><span class="num">03</span></div>
    </div>
  </section>

  <section style="background:var(--surface);border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)">
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
  </section>

  <section>
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
  </section>

  <div class="band">
    <div class="scrim">
      <h2>낯선 나라로 떠나는 길,<br>펫무브가 곁을 지킬게요</h2>
      <p>준비의 처음부터 도착 그 후까지.</p>
    </div>
  </div>

  <div class="final">
    <h2>오늘부터 준비하세요</h2>
    <p>앱은 무료 · 목적지만 고르면 첫 일정이 잡혀요</p>
    <div class="store-row">
      <a class="store"><i class="ti ti-brand-apple" style="font-size:18px"></i>App Store</a>
      <a class="store"><i class="ti ti-brand-google-play" style="font-size:16px"></i>Google Play</a>
    </div>
  </div>

  <footer>
    <div style="color:#C7C0B2;font-weight:500;margin-bottom:6px">펫무브 · PETMOVE</div>
    로잔동물의료센터 · 사업자등록번호 124-18-42859<br>
    <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/support">고객지원</a><br>
    가이드 · 블로그 · 서비스
  </footer>

  <div class="flag">⚠️ 확인 필요: 신뢰 스트립 숫자는 실제 근거값으로 교체(현재 "40+ 목적지 가이드"만 사이트맵 근거). 3,200+·100% 같은 수치는 정직 노선에 맞게 근거 확보 후 반영.</div>
</div>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", OUT, len(html), "chars")
