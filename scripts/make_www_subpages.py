# -*- coding: utf-8 -*-
"""www.petmove.co.kr 하위 페이지 프로토타입 — 가이드 허브 + 문의.
랜딩(make_www_prototype.py)과 같은 웜 스톤/앰버 토큰·헤더·푸터 재사용.
이미지 base64 불필요(텍스트·칩·카드 위주) → 가벼운 단독 생성기.
나라·글 링크는 현재 라이브 고스트(www.petmove.co.kr/docs·/blog)로 연결해 눌러볼 수 있게.
"""
import os

OUT_DIR = r"C:\dev\petmove\docs\www-redesign"
LIVE = "https://www.petmove.co.kr"

LOGO = ('<svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">'
        '<rect width="100" height="100" rx="22.5" fill="#D99A58"/>'
        '<path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" '
        'fill="none" stroke="#fff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

# ── 나라별 가이드 34개국 (한글, docs 슬러그, 지역) ──
COUNTRIES = [
    # 아시아
    ("일본", "japan", "아시아"), ("중국", "china", "아시아"), ("대만", "taiwan", "아시아"),
    ("홍콩", "hongkong", "아시아"), ("태국", "thailand", "아시아"), ("필리핀", "philippines", "아시아"),
    ("싱가포르", "singapore", "아시아"), ("말레이시아", "malaysia", "아시아"), ("인도네시아", "indonesia", "아시아"),
    ("베트남", "vietnam", "아시아"), ("캄보디아", "cambodia", "아시아"), ("몽골", "mongolia", "아시아"),
    ("인도", "india", "아시아"), ("카자흐스탄", "kazakhstan", "아시아"), ("우즈베키스탄", "uzbekistan", "아시아"),
    ("괌", "guam", "아시아"),
    # 유럽·중동
    ("유럽(EU)", "eu", "유럽·중동"), ("영국", "uk", "유럽·중동"), ("스위스", "switzerland", "유럽·중동"),
    ("아일랜드", "ireland", "유럽·중동"), ("우크라이나", "ukraine", "유럽·중동"), ("러시아", "russia", "유럽·중동"),
    ("이스라엘", "israel", "유럽·중동"), ("아랍에미리트", "uae", "유럽·중동"), ("튀르키예", "turkey", "유럽·중동"),
    # 미주
    ("미국", "usa", "미주"), ("하와이", "hawaii", "미주"), ("캐나다", "canada", "미주"),
    ("멕시코", "mexico", "미주"), ("브라질", "brazil", "미주"), ("아르헨티나", "argentina", "미주"),
    # 오세아니아·기타
    ("호주", "australia", "오세아니아·기타"), ("뉴질랜드", "newzealand", "오세아니아·기타"), ("모로코", "morocco", "오세아니아·기타"),
]
REGIONS = ["아시아", "유럽·중동", "미주", "오세아니아·기타"]

# ── 주제(절차) 카테고리 ──
TOPICS = [
    ("ti-clipboard-check", "검역", "출국 전 검역 신청·검역소·예약 절차", [
        ("수출검역 신청", "pet-export-inspection"),
        ("검역소 안내", "pet-quarantine-station"),
        ("검역 예약 방법", "pet-quarantine-reservation"),
    ]),
    ("ti-plane-tilt", "항공", "기내 반입 준비·규정·요금", [
        ("기내 반입 준비", "dog-flight-preparation"),
        ("기내 반입 규정", "airline-pet-cabin-policy"),
        ("기내 반입 요금", "airline-pet-cabin-fees"),
    ]),
    ("ti-vaccine", "기타 준비", "마이크로칩·광견병 항체검사 등", [
        ("마이크로칩 안전성", "pet-microchip-safety", "blog"),
        ("광견병 항체검사(일-한)", "rabies-titer-test-japan-korea", "blog"),
        ("광견병 청정국 목록", "rabies-free-countries", "blog"),
    ]),
]

# ── 최근 업데이트(블로그) ──
RECENT = [
    ("2026.04.23", "[2026] 반려동물 유럽 입국, 광견병항체검사 기관 변경 안내", "eu-pet-rabies-test"),
    ("2026.03.19", "[2026] 고양이 호주 입국 준비 총정리 | 절차·서류·기간", "australia-cat-travel-guide"),
    ("2026.01.27", "강아지·고양이 일본 입국 일정 계산기", "japan-pet-entry-scheduler"),
    ("2026.01.04", "강아지·고양이 일본 입국 준비 자가진단(Self-Check)", "japan-pet-entry-self-check"),
]

CSS = """
  :root{
    --bg:#F5EFE8; --surface:#FBF7F1; --ink:#2A2620; --ink2:#6B6457; --ink3:#847B6C;
    --accent:#D99A58; --accent-ink:#9A5A2E; --sage:#8FA68C; --border:#E3D9C6; --dark:#211E19;
  }
  *{box-sizing:border-box}
  [hidden]{display:none!important}
  html{scroll-behavior:smooth;scrollbar-gutter:stable;background:var(--bg)}
  body{margin:0;background:var(--bg);font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",system-ui,"Segoe UI",Roboto,sans-serif;
    color:var(--ink);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
  a{text-decoration:none;color:inherit}
  .container{max-width:1080px;margin:0 auto;padding:0 22px;width:100%}
  .wm{font-size:18px;letter-spacing:.015em;font-weight:700}

  header{position:sticky;top:0;z-index:20;background:rgba(245,239,232,.92);backdrop-filter:blur(8px);
    border-bottom:0.5px solid var(--border)}
  header .container{display:flex;align-items:center;justify-content:space-between;padding-top:13px;padding-bottom:13px}
  .nav-links{display:none;align-items:center;gap:26px;font-size:14px;color:var(--ink2)}
  .nav-links a.on{color:var(--ink);font-weight:600}
  .nav-right{display:flex;align-items:center;gap:14px}
  .nav-app{background:var(--accent);color:var(--ink);font-weight:600;border-radius:11px;padding:8px 15px;font-size:13px}
  .burger{font-size:22px;color:var(--ink2);cursor:pointer}
  .drawer-ov{position:fixed;inset:0;background:rgba(20,17,13,.42);opacity:0;visibility:hidden;transition:opacity .22s;z-index:30}
  .drawer-ov.open{opacity:1;visibility:visible}
  .drawer{position:fixed;top:0;right:0;height:100%;width:min(78vw,300px);background:var(--bg);z-index:31;box-shadow:-8px 0 30px rgba(20,17,13,.18);transform:translateX(100%);transition:transform .24s ease;display:flex;flex-direction:column;padding:14px 20px 24px}
  .drawer.open{transform:translateX(0)}
  .drawer-close{align-self:flex-end;background:transparent;border:0;color:var(--ink2);font-size:24px;cursor:pointer;padding:6px;line-height:1}
  .drawer-nav{display:flex;flex-direction:column;margin-top:6px}
  .drawer-nav a{padding:15px 2px;font-size:16px;font-weight:500;color:var(--ink);border-bottom:0.5px solid var(--border)}
  .drawer-app{margin-top:20px;background:var(--accent);color:var(--ink);font-weight:600;border-radius:12px;padding:13px;text-align:center;font-size:14px}

  .phead{padding:38px 0 6px;text-align:center}
  .kicker{font-size:12.5px;font-weight:600;color:var(--accent-ink);letter-spacing:.03em;margin-bottom:9px}
  .phead h1{font-size:30px;letter-spacing:-.02em;margin:0;font-weight:700}
  .phead .lead{font-size:14px;color:var(--ink2);margin:12px auto 0;max-width:460px;line-height:1.66}

  section{padding:26px 0}
  .sec-h{font-size:13px;font-weight:700;color:var(--ink);margin:0 0 14px;letter-spacing:.01em}

  /* 검색 */
  .search{max-width:520px;margin:22px auto 0;position:relative}
  .search i{position:absolute;left:15px;top:50%;transform:translateY(-50%);color:var(--ink3);font-size:18px}
  .search input{width:100%;border:0.5px solid var(--border);background:var(--surface);border-radius:13px;
    padding:14px 16px 14px 44px;font-size:14px;font-family:inherit;color:var(--ink)}
  .search input:focus{outline:none;border-color:var(--accent)}

  /* 최근 업데이트 카드 */
  .recent{display:grid;grid-template-columns:1fr;gap:10px}
  .rcard{display:flex;gap:12px;align-items:flex-start;background:var(--surface);border:0.5px solid var(--border);
    border-radius:14px;padding:15px 16px}
  .rcard .rd{font-size:11.5px;color:var(--accent-ink);font-weight:600;flex:0 0 auto;padding-top:2px}
  .rcard .rt{font-size:13.5px;color:var(--ink);line-height:1.5;font-weight:500}

  /* 나라 그리드 */
  .region{font-size:12.5px;font-weight:600;color:var(--accent-ink);margin:20px 0 11px}
  .cgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
  .chip{background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:13px 8px;
    text-align:center;font-size:13px;color:var(--ink)}

  /* 주제 카드 */
  .topics{display:grid;grid-template-columns:1fr;gap:12px;margin-top:6px}
  .topic{background:var(--surface);border:0.5px solid var(--border);border-radius:16px;padding:17px 18px}
  .topic-h{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .topic-h i{color:var(--accent-ink);font-size:21px}
  .topic-h .tt{font-size:15px;font-weight:600}
  .topic .td{font-size:12.5px;color:var(--ink2);margin:0 0 12px;line-height:1.5}
  .topic-links{display:flex;flex-wrap:wrap;gap:7px}
  .topic-links a{font-size:12.5px;color:var(--accent-ink);background:#FBF1E3;border:0.5px solid rgba(217,154,88,.35);
    border-radius:999px;padding:6px 12px}

  /* 문의 채널 */
  .csec{max-width:520px;margin:0 auto}
  .cblock{background:var(--surface);border:0.5px solid var(--border);border-radius:16px;padding:18px;margin-top:14px}
  .cblock .cl{font-size:12px;font-weight:600;color:var(--ink3);margin-bottom:12px}
  .chan{display:flex;align-items:center;gap:11px;padding:11px 0;border-top:0.5px solid var(--border)}
  .chan:first-of-type{border-top:0}
  .chan i{color:var(--accent-ink);font-size:20px;width:24px;text-align:center}
  .chan .nlogo{font-weight:800;font-size:15px;color:var(--accent-ink);width:24px;text-align:center}
  .chan .cv{font-size:14px;font-weight:600;color:var(--ink)}
  .chan .cs{font-size:12px;color:var(--ink3);margin-top:1px}
  .cnote{font-size:12px;color:var(--ink3);text-align:center;line-height:1.7;margin-top:20px}

  footer{background:#211E19;color:#8B8578;padding:28px 0;font-size:12px;line-height:1.85;margin-top:auto}
  footer a{color:#B0A896}
  footer .fsns{display:inline-flex;align-items:center;gap:5px;margin:9px 0 4px;font-weight:600}
  footer .fsns .nlogo{font-weight:800;font-size:13px;line-height:1}

  @media(min-width:760px){
    .nav-links{display:flex}
    .burger{display:none}
    .drawer,.drawer-ov{display:none}
    .phead h1{font-size:38px}
    .recent{grid-template-columns:repeat(2,1fr)}
    .cgrid{grid-template-columns:repeat(4,1fr)}
    .topics{grid-template-columns:repeat(3,1fr)}
  }
"""

def head(title):
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css">
<style>{CSS}</style>
</head>
<body>"""

def header(active):
    def cls(name): return ' class="on"' if name == active else ''
    return f"""  <header>
    <div class="container">
      <a href="prototype-mobile.html" style="display:flex;align-items:center;gap:8px">{LOGO}<span class="wm">펫무브</span></a>
      <span class="nav-links">
        <a href="prototype-mobile.html#service"{cls('service')}>서비스</a>
        <a href="guide.html"{cls('guide')}>가이드</a>
        <a href="contact.html"{cls('contact')}>문의</a>
      </span>
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
      <a href="prototype-mobile.html#service">서비스</a>
      <a href="guide.html">가이드</a>
      <a href="contact.html">문의</a>
    </nav>
    <a class="drawer-app">앱 다운로드</a>
  </aside>"""

FOOTER = f"""  <footer>
    <div class="container">
      <div style="color:#C7C0B2;font-weight:500;margin-bottom:6px">펫무브 · PETMOVE</div>
      로잔동물의료센터 · 사업자등록번호 124-18-42859<br>
      서울시 관악구 관악로29길 3 · 02-872-7588<br>
      <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" class="fsns"><span class="nlogo">N</span>네이버 블로그</a><br>
      <a href="https://app.petmove.co.kr/terms">이용약관</a> · <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a> · <a href="https://app.petmove.co.kr/support">고객지원</a>
    </div>
  </footer>
  <script>(function(){{var b=document.getElementById('burger'),d=document.getElementById('drawer'),o=document.getElementById('drawerOv'),c=document.getElementById('drawerClose');if(!b||!d||!o)return;function open(){{d.classList.add('open');o.classList.add('open');}}function close(){{d.classList.remove('open');o.classList.remove('open');}}b.addEventListener('click',open);b.addEventListener('keydown',function(e){{if(e.key==='Enter'||e.key===' '){{e.preventDefault();open();}}}});o.addEventListener('click',close);if(c)c.addEventListener('click',close);d.addEventListener('click',function(e){{if(e.target.tagName==='A')close();}});}})();</script>
</body>
</html>"""


def build_guide():
    recent = "".join(
        f'<a class="rcard" href="{LIVE}/blog/{slug}/" target="_blank" rel="noopener">'
        f'<span class="rd">{d}</span><span class="rt">{t}</span></a>'
        for d, t, slug in RECENT
    )
    regions_html = ""
    for reg in REGIONS:
        chips = "".join(
            f'<a class="chip" href="{LIVE}/docs/{slug}-pet-travel-guide/" target="_blank" rel="noopener">{ko}</a>'
            for ko, slug, r in COUNTRIES if r == reg
        )
        regions_html += f'<div class="region">{reg}</div><div class="cgrid">{chips}</div>'
    topics_html = ""
    for icon, name, desc, links in TOPICS:
        ls = "".join(
            f'<a href="{LIVE}/{(l[2] if len(l) > 2 else "docs")}/{l[1]}/" target="_blank" rel="noopener">{l[0]}</a>'
            for l in links
        )
        topics_html += (
            f'<div class="topic"><div class="topic-h"><i class="ti {icon}"></i>'
            f'<span class="tt">{name}</span></div><p class="td">{desc}</p>'
            f'<div class="topic-links">{ls}</div></div>'
        )
    return f"""{head('가이드 · 펫무브')}
{header('guide')}
  <div class="phead">
    <div class="container">
      <h1>가이드</h1>
      <p class="lead">나라별 준비부터 최신 소식까지 한눈에</p>
      <div class="search"><i class="ti ti-search"></i><input id="q" type="text" placeholder="나라 이름으로 찾기 (예: 일본)"></div>
    </div>
  </div>

  <section>
    <div class="container">
      <div class="sec-h">최근 업데이트</div>
      <div class="recent">{recent}</div>
    </div>
  </section>

  <section style="background:var(--surface);border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)">
    <div class="container">
      <div class="sec-h">나라별로 찾기</div>
      <div id="regions">{regions_html}</div>
    </div>
  </section>

  <section>
    <div class="container">
      <div class="sec-h">주제별로 찾기</div>
      <div class="topics">{topics_html}</div>
    </div>
  </section>

{FOOTER}
  <script>
  (function(){{
    var q=document.getElementById('q');if(!q)return;
    q.addEventListener('input',function(){{
      var v=q.value.trim().toLowerCase();
      document.querySelectorAll('#regions .chip').forEach(function(c){{
        c.style.display = !v || c.textContent.toLowerCase().indexOf(v)>=0 ? '' : 'none';
      }});
      document.querySelectorAll('#regions .region, #regions .cgrid').forEach(function(){{}});
    }});
  }})();
  </script>"""


def build_contact():
    return f"""{head('문의 · 펫무브')}
{header('contact')}
  <div class="phead">
    <div class="container">
      <h1>문의</h1>
      <p class="lead">편하게 연락 주세요</p>
    </div>
  </div>

  <section>
    <div class="container"><div class="csec">
      <div class="cblock">
        <div class="cl">상담 · 문의 (보호자)</div>
        <a class="chan" href="https://pf.kakao.com/_zDDxhj/chat" target="_blank" rel="noopener">
          <i class="ti ti-message-circle"></i><span><span class="cv">카카오톡 상담</span><div class="cs">가장 빠르게 답변받는 방법이에요</div></span></a>
        <a class="chan" href="tel:02-872-7588">
          <i class="ti ti-phone"></i><span><span class="cv">전화 02-872-7588</span><div class="cs">평일 상담 가능</div></span></a>
        <a class="chan" href="https://naver.me/GUwSYQ9h" target="_blank" rel="noopener">
          <span class="nlogo">N</span><span><span class="cv">네이버 예약</span><div class="cs">방문 상담 예약</div></span></a>
      </div>
      <div class="cblock">
        <div class="cl">제휴 · 업무 문의 (병원 · 운송사 · 에이전시)</div>
        <a class="chan" href="mailto:petmove@naver.com">
          <i class="ti ti-mail"></i><span><span class="cv">petmove@naver.com</span><div class="cs">제휴·업무 관련 문의</div></span></a>
      </div>
    </div></div>
  </section>

{FOOTER}"""


with open(os.path.join(OUT_DIR, "guide.html"), "w", encoding="utf-8") as f:
    f.write(build_guide())
with open(os.path.join(OUT_DIR, "contact.html"), "w", encoding="utf-8") as f:
    f.write(build_contact())
print("wrote guide.html + contact.html")
