# -*- coding: utf-8 -*-
"""www.petmove.co.kr 하위 페이지 프로토타입 — 가이드 허브 + 문의.
랜딩(make_www_prototype.py)과 같은 브랜드(구름·하늘: 화이트+스카이블루) 토큰·헤더·푸터 재사용.
⚠️ article.html·article-sample.html 출력은 구버전 — article-sample.html 은 손으로 더 발전됨(표 스크롤·cta-sep 등).
   재생성 시 두 article 파일은 git restore 로 되돌릴 것 (진짜 템플릿 truth = docs/www-redesign/article-sample.html).
이미지 base64 불필요(텍스트·칩·카드 위주) → 가벼운 단독 생성기.
나라·글 링크는 현재 라이브 고스트(www.petmove.co.kr/docs·/blog)로 연결해 눌러볼 수 있게.
"""
import os

OUT_DIR = r"C:\dev\petmove\docs\www-redesign"
LIVE = "https://www.petmove.co.kr"

# 타일 플로팅 섀도 = 앱 LogoMark(pm-logo-float)와 동일 문법. overflow:visible 없으면 그림자 잘림.
LOGO = ('<svg viewBox="0 0 200 200" width="26" height="26" aria-hidden="true" style="overflow:visible"><defs><clipPath id="pmlg-sq"><rect width="200" height="200" rx="46"/></clipPath><linearGradient id="pmlg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63C9FF"/><stop offset="1" stop-color="#0BAEFF"/></linearGradient><filter id="pmlg-float" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#0868A8" flood-opacity="0.35"/></filter></defs><g filter="url(#pmlg-float)"><g clip-path="url(#pmlg-sq)"><rect width="200" height="200" fill="url(#pmlg-sky)"/><path d="M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106" fill="none" stroke="#FFC93C" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><rect x="0" y="160" width="200" height="40" fill="#fff"/><circle cx="46" cy="168" r="52" fill="#fff"/><circle cx="72" cy="120" r="48" fill="#fff"/><circle cx="112" cy="148" r="34" fill="#fff"/><circle cx="146" cy="138" r="38" fill="#fff"/><circle cx="178" cy="154" r="24" fill="#fff"/><path d="M116 132 L116 118" fill="none" stroke="#FFC93C" stroke-width="18" stroke-linecap="round" opacity="0.34"/></g></g></svg>')

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

# ── 추천 가이드(featured) — 인기·시의성·도구. (제목, 부제, docs|blog, 슬러그) ──
FEATURED = [
    ("일본 입국 준비 총정리", "가장 많이 가는 여행지", "docs", "japan-pet-travel-guide"),
    ("[2026] 유럽 입국 광견병 검사 변경", "최신 규정 업데이트", "blog", "eu-pet-rabies-test"),
    ("일본 입국 일정 계산기", "언제 뭘 할지 자동 계산", "blog", "japan-pet-entry-scheduler"),
]

# ── 그 외 준비 — 검역·항공·기타 한 덩어리(플랫). (제목, docs|blog, 슬러그) ──
OTHER = [
    ("수출검역 신청", "docs", "pet-export-inspection"),
    ("검역소 안내", "docs", "pet-quarantine-station"),
    ("검역 예약", "docs", "pet-quarantine-reservation"),
    ("기내 반입 준비", "docs", "dog-flight-preparation"),
    ("기내 반입 규정", "docs", "airline-pet-cabin-policy"),
    ("기내 반입 요금", "docs", "airline-pet-cabin-fees"),
    ("기내 진정제", "blog", "dog-flight-medication"),
    ("마이크로칩 안전성", "blog", "pet-microchip-safety"),
    ("광견병 항체검사", "blog", "rabies-titer-test-japan-korea"),
    ("광견병 청정국 목록", "blog", "rabies-free-countries"),
    ("해외여행 기본 안내", "blog", "dog-international-travel"),
]

CSS = """
  :root{
    --bg:#F4F6F8; --surface:#FFFFFF; --ink:#212124; --ink2:#5C5C60; --ink3:#97979C;
    --accent:#0BAEFF; --accent-ink:#0778BF; --sage:#14B8A6; --border:#E1E5E9; --dark:#212124;
  }
  *{box-sizing:border-box}
  [hidden]{display:none!important}
  html{scroll-behavior:smooth;scrollbar-gutter:stable;background:var(--bg)}
  body{margin:0;background:var(--bg);font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",system-ui,"Segoe UI",Roboto,sans-serif;
    color:var(--ink);-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
  a{text-decoration:none;color:inherit}
  .container{max-width:1080px;margin:0 auto;padding:0 22px;width:100%}
  .wm{font-size:18px;letter-spacing:-.01em;font-weight:800}

  header{position:sticky;top:0;z-index:20;background:#fff;
    border-bottom:0.5px solid var(--border)}
  header .container{display:flex;align-items:center;justify-content:space-between;padding-top:13px;padding-bottom:13px}
  .nav-links{display:none;align-items:center;gap:26px;font-size:14px;color:var(--ink2)}
  .nav-links a.on{color:var(--ink);font-weight:600}
  .nav-right{display:flex;align-items:center;gap:14px}
  .nav-app{background:var(--accent);color:#fff;font-weight:600;border-radius:11px;padding:8px 15px;font-size:13px}
  .burger{font-size:22px;color:var(--ink2);cursor:pointer}
  .drawer-ov{position:fixed;inset:0;background:rgba(21,23,26,.42);opacity:0;visibility:hidden;transition:opacity .22s;z-index:30}
  .drawer-ov.open{opacity:1;visibility:visible}
  .drawer{position:fixed;top:0;right:0;height:100%;width:min(78vw,300px);background:var(--bg);z-index:31;box-shadow:-8px 0 30px rgba(21,23,26,.18);transform:translateX(100%);transition:transform .24s ease;display:flex;flex-direction:column;padding:14px 20px 24px}
  .drawer.open{transform:translateX(0)}
  .drawer-close{align-self:flex-end;background:transparent;border:0;color:var(--ink2);font-size:24px;cursor:pointer;padding:6px;line-height:1}
  .drawer-nav{display:flex;flex-direction:column;margin-top:6px}
  .drawer-nav a{padding:15px 2px;font-size:16px;font-weight:500;color:var(--ink);border-bottom:0.5px solid var(--border)}
  .drawer-app{margin-top:20px;background:var(--accent);color:#fff;font-weight:600;border-radius:12px;padding:13px;text-align:center;font-size:14px}

  .phead{padding:38px 0 6px;text-align:center}
  .kicker{font-size:12.5px;font-weight:600;color:var(--ink2);letter-spacing:.06em;margin-bottom:9px}
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

  /* 추천 가이드(featured) */
  .feat{display:grid;grid-template-columns:1fr;gap:10px}
  .fcard{display:block;background:#E4F4FF;border:0.5px solid rgba(11,174,255,.35);border-radius:16px;padding:16px 17px}
  .fcard .ft{font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.42}
  .fcard .fd{font-size:12px;color:var(--accent-ink);margin-top:6px}

  /* 나라 그리드 */
  .region{font-size:12.5px;font-weight:600;color:var(--accent-ink);margin:20px 0 11px}
  .cgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
  .chip{background:var(--surface);border:0.5px solid var(--border);border-radius:12px;padding:13px 8px;
    text-align:center;font-size:13px;color:var(--ink)}

  /* 그 외 준비 */
  .other-group{margin-top:18px}
  .other-group:first-child{margin-top:2px}
  .other-label{font-size:12.5px;font-weight:600;color:var(--accent-ink);margin-bottom:11px}
  .other-links{display:flex;flex-wrap:wrap;gap:8px}
  .no-hit{text-align:center;font-size:13.5px;color:var(--ink3);padding:16px 0 4px}
  .other-links a{font-size:13px;color:var(--ink);background:var(--surface);border:0.5px solid var(--border);
    border-radius:999px;padding:8px 14px}

  /* 문의 채널 */
  .csec{max-width:520px;margin:0 auto}
  .cblock{background:var(--surface);border:0.5px solid var(--border);border-radius:16px;padding:18px;margin-top:14px}
  .cblock .cl{font-size:12px;font-weight:600;color:var(--ink3);margin-bottom:12px}
  .chan{display:flex;align-items:center;gap:11px;padding:11px 0;border-top:0.5px solid var(--border)}
  .chan:first-of-type{border-top:0}
  .chan i{color:var(--ink);font-size:20px;width:24px;text-align:center}
  .chan .nlogo{font-weight:800;font-size:15px;color:var(--ink);width:24px;text-align:center}
  .chan .cv{font-size:14px;font-weight:600;color:var(--ink)}
  .chan .cs{font-size:12px;color:var(--ink3);margin-top:1px}
  .copen{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink3);margin-top:6px;padding-top:13px;border-top:0.5px solid var(--border)}
  .copen i{font-size:14px}
  .cnote{font-size:12px;color:var(--ink3);text-align:center;line-height:1.7;margin-top:20px}

  /* 글 본문 템플릿 — 읽기 페이지는 웜 화이트 배경(크림보다 밝게, 장문 가독성) */
  body.reading{background:#FFFFFF}
  .art-cover{width:100%;border-radius:14px;margin:2px 0 4px;display:block}
  .prose .more-label{font-size:12px;font-weight:700;color:var(--accent-ink);letter-spacing:.02em;margin:26px 0 2px}
  .prose details.more{border:0.5px solid var(--border);border-radius:12px;background:var(--surface);margin:20px 0}
  .prose details.more>summary{list-style:none;cursor:pointer;padding:13px 16px;font-size:13.5px;font-weight:600;color:var(--accent-ink);display:flex;align-items:center;justify-content:space-between;gap:10px}
  .prose details.more>summary::-webkit-details-marker{display:none}
  .prose details.more>summary i{transition:transform .2s;font-size:18px;flex:0 0 auto}
  .prose details.more[open]>summary i{transform:rotate(180deg)}
  .prose details.more[open]>summary{border-bottom:0.5px solid var(--border)}
  .prose .more-body{padding:4px 16px 14px}
  .prose .more-body h3{margin-top:18px}
  .prose .more-body h3:first-child{margin-top:12px}
  .prose .more-body p:last-child,.prose .more-body blockquote:last-child{margin-bottom:0}
  .prose h3{scroll-margin-top:70px}
  .article{max-width:720px;margin:0 auto;padding:0 22px}
  .crumb{font-size:12.5px;color:var(--ink3);padding:22px 0 0}
  .crumb a{color:var(--ink3)}
  .crumb .sep{margin:0 6px}
  .art-head{padding:14px 0 20px;border-bottom:0.5px solid var(--border);margin-bottom:26px}
  .art-cat{display:inline-block;font-size:12px;font-weight:600;color:var(--accent-ink);background:#E4F4FF;
    border-radius:999px;padding:4px 11px;margin-bottom:14px}
  .art-head h1{font-size:26px;line-height:1.32;letter-spacing:-.02em;margin:0;font-weight:700}
  .art-meta{font-size:12.5px;color:var(--ink3);margin-top:13px}
  .prose{font-size:15.5px;line-height:1.8;color:var(--ink)}
  .prose h2{font-size:19px;font-weight:700;margin:34px 0 12px;letter-spacing:-.01em}
  .prose h3{font-size:16px;font-weight:600;margin:24px 0 8px}
  .prose p{margin:0 0 16px}
  .prose ul,.prose ol{margin:0 0 16px;padding-left:20px}
  .prose li{margin:6px 0}
  .prose a{color:var(--accent-ink);text-decoration:underline;text-underline-offset:2px}
  .prose strong{font-weight:600}
  .prose blockquote{margin:18px 0;padding:12px 16px;border-left:3px solid var(--accent);background:var(--surface);
    border-radius:0 8px 8px 0;color:var(--ink2);font-size:14.5px;line-height:1.7}
  .prose table{width:100%;border-collapse:collapse;margin:0 0 18px;font-size:13.5px}
  .prose th,.prose td{border:0.5px solid var(--border);padding:9px 12px;text-align:left;vertical-align:top}
  .prose th{background:var(--surface);font-weight:600;white-space:nowrap}
  .callout{background:#E4F4FF;border:0.5px solid rgba(11,174,255,.35);border-radius:14px;padding:16px 18px;margin:24px 0}
  .callout .ch{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14.5px;margin-bottom:6px}
  .callout .ch i{color:var(--accent-ink);font-size:19px}
  .callout .cp{font-size:13.5px;color:var(--ink2);margin:0;line-height:1.65}
  .callout .cbtn{display:inline-block;margin-top:11px;font-size:13px;font-weight:600;color:var(--accent-ink)}
  .prose .callout-note{background:#E4F4FF;border:0.5px solid rgba(11,174,255,.35);border-radius:12px;padding:15px 17px;margin:18px 0;font-size:14.5px;line-height:1.7;color:var(--ink)}
  .prose .callout-note .ce{margin-right:7px}
  .art-cta{background:#17171A;border-radius:18px;padding:26px 22px;text-align:center;margin:36px 0 8px}
  .art-cta h3{color:#fff;font-size:18px;margin:0 0 7px;font-weight:700}
  .art-cta p{color:#B9BDC4;font-size:13px;margin:0 0 16px;line-height:1.6}
  .art-cta a{display:inline-block;background:var(--accent);color:#fff;font-weight:600;border-radius:12px;padding:12px 22px;font-size:14px}
  /* A · 랜딩 서비스 섹션 그대로 (밝은 앰버 패널 + 아웃라인 버튼 + 회색 링크) */
  .svc-block{background:#E4F4FF;border:0.5px solid rgba(11,174,255,.35);border-radius:16px;padding:22px 20px;text-align:center;margin:34px 0 8px}
  .svc-block .svc-title{font-size:16px;font-weight:700;color:var(--ink)}
  .svc-block .svc-desc{font-size:13px;color:var(--ink2);margin-top:6px}
  .svc-cta{display:flex;align-items:center;justify-content:center;gap:8px;background:transparent;border:1.5px solid var(--accent);color:var(--accent-ink);font-weight:600;border-radius:14px;padding:14px;font-size:15px;width:100%;max-width:460px;margin:16px auto 0;text-decoration:none}
  .svc-sub{display:flex;align-items:center;justify-content:center;gap:16px;margin:12px 0 0;font-size:13px}
  .svc-sub a{display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:var(--ink2);font-weight:600}
  .svc-sub .lmk{font-weight:800}
  .svc-sub .sep{color:var(--ink3)}
  .svc-app{margin:14px 0 0;font-size:12.5px;color:var(--ink3)}
  .svc-app a{color:var(--accent-ink);font-weight:600;text-decoration:none}
  /* B · 두 갈래 카드 (앱=앰버 채움 / 서비스=앰버 아웃라인 — 랜딩 버튼 규칙) */
  .two-path{display:grid;grid-template-columns:1fr;gap:12px;margin:34px 0 8px}
  .pcard{border:0.5px solid var(--border);border-radius:16px;padding:20px 18px;text-align:center;background:var(--surface)}
  .pcard.accent{background:#E4F4FF;border-color:rgba(11,174,255,.35)}
  .pcard>i{font-size:25px;color:var(--accent-ink)}
  .pcard .pt{font-size:15px;font-weight:700;margin:9px 0 3px}
  .pcard .pd{font-size:12.5px;color:var(--ink2);margin:0 0 14px;line-height:1.5}
  .pcard .pbtn{display:block;width:100%;text-align:center;background:var(--accent);color:#fff;font-weight:600;border-radius:12px;padding:12px;font-size:14px;text-decoration:none}
  .pcard .pbtn.outline{background:transparent;border:1.5px solid var(--accent);color:var(--accent-ink);padding:calc(12px - 1.5px)}
  .pcard .psub{display:block;margin-top:11px;font-size:12px;color:var(--ink3)}
  @media(min-width:620px){.two-path{grid-template-columns:1fr 1fr}}
  .related{border-top:0.5px solid var(--border);padding-top:18px;margin-top:30px}
  .related .rl-h{font-size:13px;font-weight:700;margin-bottom:8px}
  .related a{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:0.5px solid var(--border);font-size:14px;color:var(--ink)}
  .related a:last-child{border-bottom:0}
  .related a i{color:var(--ink3);font-size:16px}
  a.bookmark{display:flex;border:0.5px solid var(--border);border-radius:12px;overflow:hidden;margin:16px 0;background:var(--surface);text-decoration:none;color:inherit}
  a.bookmark .bk-text{flex:1 1 auto;padding:14px 16px;min-width:0}
  a.bookmark .bk-title{font-size:14px;font-weight:600;color:var(--ink);line-height:1.4}
  a.bookmark .bk-host{font-size:12px;color:var(--ink3);margin-top:10px}
  a.bookmark .bk-thumb{width:104px;flex:0 0 104px;object-fit:cover;background:var(--border)}
  .prose .embed{position:relative;padding-top:56.25%;margin:18px 0;border-radius:12px;overflow:hidden;background:#000}
  .prose .embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  @media(min-width:760px){.prose a.bookmark .bk-thumb{width:180px;flex-basis:180px}}

  footer{background:#fff;color:#5C5C60;border-top:0.5px solid var(--border);padding:26px 0 30px;font-size:12px;line-height:1.85;margin-top:auto}
  footer a{color:#454549}
  footer .fsns{display:inline-flex;align-items:center;gap:5px;margin:9px 0 4px;font-weight:600}
  footer .fsns .nlogo{font-weight:800;font-size:13px;line-height:1}

  @media(min-width:760px){
    .nav-links{display:flex}
    .burger{display:none}
    .drawer,.drawer-ov{display:none}
    .phead h1{font-size:38px}
    .feat{grid-template-columns:repeat(3,1fr)}
    .cgrid{grid-template-columns:repeat(4,1fr)}
  }
"""

DESC_DEFAULT = "반려동물 해외 이동 준비 — 펫무브"

def head(title, desc=DESC_DEFAULT, og_type="website", body_class=""):
    body_open = f'<body class="{body_class}">' if body_class else "<body>"
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="펫무브">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:locale" content="ko_KR">
<!-- og:image 는 배포 이미지 자산 확정 후 추가(/og.png) — Next 이식 때 -->
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22%3E%3Cdefs%3E%3CclipPath id=%22s%22%3E%3Crect width=%22200%22 height=%22200%22 rx=%2246%22/%3E%3C/clipPath%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%220%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%2363C9FF%22/%3E%3Cstop offset=%221%22 stop-color=%22%230BAEFF%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg clip-path=%22url(%23s)%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22url(%23g)%22/%3E%3Cpath d=%22M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106%22 fill=%22none%22 stroke=%22%23FFC93C%22 stroke-width=%2218%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3Crect x=%220%22 y=%22160%22 width=%22200%22 height=%2240%22 fill=%22%23fff%22/%3E%3Ccircle cx=%2246%22 cy=%22168%22 r=%2252%22 fill=%22%23fff%22/%3E%3Ccircle cx=%2272%22 cy=%22120%22 r=%2248%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22112%22 cy=%22148%22 r=%2234%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22146%22 cy=%22138%22 r=%2238%22 fill=%22%23fff%22/%3E%3Ccircle cx=%22178%22 cy=%22154%22 r=%2224%22 fill=%22%23fff%22/%3E%3Cpath d=%22M116 132 L116 118%22 fill=%22none%22 stroke=%22%23FFC93C%22 stroke-width=%2218%22 stroke-linecap=%22round%22 opacity=%220.34%22/%3E%3C/g%3E%3C/svg%3E">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.24.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>{CSS}</style>
</head>
{body_open}"""

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
        <a class="nav-app" href="prototype-mobile.html#download">앱 다운로드</a>
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
    <a class="drawer-app" href="prototype-mobile.html#download">앱 다운로드</a>
  </aside>"""

FOOTER = f"""  <footer>
    <div class="container">
      <div style="color:#212124;font-weight:600;margin-bottom:6px">펫무브 · PETMOVE</div>
      로잔동물의료센터 · 사업자등록번호 124-18-42859<br>
      서울시 관악구 관악로29길 3 · <a href="tel:02-872-7588">02-872-7588</a><br>
      <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" class="fsns"><span class="nlogo">N</span>네이버 블로그</a><br>
      <a href="https://app.petmove.co.kr/terms">이용약관</a> · <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a> · <a href="https://app.petmove.co.kr/support">고객지원</a><br>
      <span style="color:#97979C">© 2026 펫무브</span>
    </div>
  </footer>
  <script>(function(){{var b=document.getElementById('burger'),d=document.getElementById('drawer'),o=document.getElementById('drawerOv'),c=document.getElementById('drawerClose');if(!b||!d||!o)return;function open(){{d.classList.add('open');o.classList.add('open');}}function close(){{d.classList.remove('open');o.classList.remove('open');}}b.addEventListener('click',open);b.addEventListener('keydown',function(e){{if(e.key==='Enter'||e.key===' '){{e.preventDefault();open();}}}});o.addEventListener('click',close);if(c)c.addEventListener('click',close);d.addEventListener('click',function(e){{if(e.target.tagName==='A')close();}});}})();</script>
<script>
(function(){{
  var IOS='https://apps.apple.com/kr/app/id6784567864';
  var AND='https://play.google.com/store/apps/details?id=com.petmove.portal';
  var ua = navigator.userAgent;
  var url = /iPhone|iPad|iPod/i.test(ua) ? IOS : (/Android/i.test(ua) ? AND : null);
  if (!url) return; // 데스크톱은 정적 href(#download)의 스토어 배지 섹션으로
  document.querySelectorAll('.nav-app,.drawer-app,.appcta').forEach(function(a){{
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
  }});
}})();
</script>
</body>
</html>"""


def build_guide():
    feat = "".join(
        f'<a class="fcard" href="{LIVE}/{kind}/{slug}/" target="_blank" rel="noopener">'
        f'<div class="ft">{title}</div><div class="fd">{sub}</div></a>'
        for title, sub, kind, slug in FEATURED
    )
    regions_html = ""
    for reg in REGIONS:
        chips = "".join(
            f'<a class="chip" href="{LIVE}/docs/{slug}-pet-travel-guide/" target="_blank" rel="noopener">{ko}</a>'
            for ko, slug, r in COUNTRIES if r == reg
        )
        regions_html += f'<div class="region">{reg}</div><div class="cgrid">{chips}</div>'
    other_html = "".join(
        f'<a href="{LIVE}/{kind}/{slug}/" target="_blank" rel="noopener">{name}</a>'
        for name, kind, slug in OTHER
    )
    return f"""{head('가이드 · 펫무브', '나라별 반려동물 출국 가이드 — 일본·태국·필리핀 등 34개국의 검역 준비 방법을 확인하세요.')}
{header('guide')}
  <div class="phead">
    <div class="container">
      <h1>가이드</h1>
      <p class="lead">여행지별 검역 준비 방법을 확인하세요</p>
      <div class="search"><i class="ti ti-search"></i><input id="q" type="text" placeholder="여행지 검색 (예: 일본)"></div>
    </div>
  </div>

  <section>
    <div class="container">
      <h2 class="sec-h">추천 가이드</h2>
      <div class="feat">{feat}</div>
    </div>
  </section>

  <section style="background:var(--surface);border-top:0.5px solid var(--border);border-bottom:0.5px solid var(--border)">
    <div class="container">
      <h2 class="sec-h">여행지별 가이드</h2>
      <div id="regions">{regions_html}</div>
      <div class="no-hit" id="noHit" hidden>검색 결과가 없어요</div>
    </div>
  </section>

  <section>
    <div class="container">
      <h2 class="sec-h">주제별 가이드</h2>
      <div class="other-links">{other_html}</div>
    </div>
  </section>

{FOOTER}
  <script>
  (function(){{
    var q=document.getElementById('q');if(!q)return;
    q.addEventListener('input',function(){{
      var v=q.value.trim().toLowerCase(),hit=false;
      document.querySelectorAll('#regions .region').forEach(function(rg){{
        var grid=rg.nextElementSibling,any=false;
        grid.querySelectorAll('.chip').forEach(function(c){{
          var m=!v||c.textContent.toLowerCase().indexOf(v)>=0;c.style.display=m?'':'none';if(m)any=true;
        }});
        rg.style.display=any?'':'none';grid.style.display=any?'':'none';if(any)hit=true;
      }});
      var n=document.getElementById('noHit');if(n)n.hidden=hit;
    }});
  }})();
  </script>"""


def build_contact():
    return f"""{head('문의 · 펫무브', '펫무브 상담·문의 — 카카오톡 상담·전화·네이버 예약으로 편하게 연락주세요.')}
{header('contact')}
  <div class="phead">
    <div class="container">
      <h1>문의</h1>
      <p class="lead">궁금한 점이 있으면 편한 채널로 연락주세요</p>
    </div>
  </div>

  <section>
    <div class="container"><div class="csec">
      <div class="cblock">
        <h2 class="cl">상담 · 문의</h2>
        <a class="chan" href="https://pf.kakao.com/_zDDxhj/chat" target="_blank" rel="noopener">
          <i class="ti ti-message-circle"></i><span><span class="cv">카카오톡 상담</span><div class="cs">펫무브 공식 채널</div></span></a>
        <a class="chan" href="tel:02-872-7588">
          <i class="ti ti-phone"></i><span><span class="cv">전화 02-872-7588</span><div class="cs">로잔동물의료센터</div></span></a>
        <a class="chan" href="https://naver.me/GUwSYQ9h" target="_blank" rel="noopener">
          <span class="nlogo">N</span><span><span class="cv">네이버 예약</span><div class="cs">로잔동물의료센터</div></span></a>
        <div class="copen"><i class="ti ti-clock"></i>응대 시간 평일 10:00–18:00 · 주말·공휴일 휴진</div>
      </div>
      <div class="cblock">
        <h2 class="cl">앱 이용 문의</h2>
        <a class="chan" href="https://app.petmove.co.kr/support" target="_blank" rel="noopener">
          <i class="ti ti-device-mobile"></i><span><span class="cv">앱 고객지원</span><div class="cs">로그인 · 오류 등 앱 사용 관련</div></span></a>
      </div>
      <div class="cblock">
        <h2 class="cl">제휴 · 업무 문의</h2>
        <a class="chan" href="mailto:petmove@naver.com">
          <i class="ti ti-mail"></i><span><span class="cv">petmove@naver.com</span></span></a>
      </div>
    </div></div>
  </section>

{FOOTER}"""


def build_article():
    """글 본문 공통 템플릿 — 샘플(일본 가이드)로 채워 실제 글 모습 시연.
    69개 글이 이 틀(크럼브·제목·prose·표·콜아웃·CTA·관련글)을 공유한다."""
    return f"""{head('일본 반려동물 입국 가이드 · 펫무브', 'reading')}
{header('guide')}
  <article class="article">
    <div class="crumb"><a href="guide.html">가이드</a><span class="sep">›</span><a href="guide.html">여행지별</a><span class="sep">›</span>일본</div>
    <div class="art-head">
      <span class="art-cat">여행지 가이드 · 일본</span>
      <h1>일본 반려동물 입국 가이드</h1>
      <div class="art-meta">마지막 업데이트 2026.07.04 · 읽는 데 약 5분</div>
    </div>

    <div class="prose">
      <p>강아지·고양이와 함께 일본에 입국하려면 <strong>출발 최소 7개월 전</strong>부터 준비를 시작해야 해요. 마이크로칩 → 광견병 예방접종 → 항체검사 → 사전 신고 순서가 정해져 있어서, 하나라도 순서가 어긋나면 출국이 미뤄질 수 있어요. 이 글에서 전체 흐름과 단계별 준비물을 정리했어요.</p>

      <h2>한눈에 보기</h2>
      <table>
        <tr><th>준비 기간</th><td>출발 최소 7개월 전 시작</td></tr>
        <tr><th>필수 준비물</th><td>마이크로칩 · 광견병 예방접종 2회 · 광견병 항체검사 · 검역증명서</td></tr>
        <tr><th>사전 신고</th><td>도착 40일 전까지 일본 동물검역소에 신고</td></tr>
        <tr><th>도착 검역</th><td>공항 동물검역소에서 서류 확인 (통상 당일 통과)</td></tr>
      </table>

      <h2>1. 마이크로칩 (ISO 규격)</h2>
      <p>가장 먼저 <strong>ISO 11784/11785 규격</strong>의 마이크로칩을 이식해야 해요. 이후의 모든 접종·검사가 이 칩 번호를 기준으로 기록되기 때문에, <strong>반드시 광견병 접종보다 먼저</strong> 이식해야 합니다. 칩을 나중에 넣으면 이전 기록이 인정되지 않아 처음부터 다시 해야 해요.</p>

      <h2>2. 광견병 예방접종 (2회)</h2>
      <p>마이크로칩 이식 <strong>후에</strong> 광견병 백신을 접종해요. 일본 입국은 유효한 접종이 <strong>2회 이상</strong> 필요합니다.</p>
      <ul>
        <li>1차: 생후 91일 이후 접종</li>
        <li>2차: 1차 접종의 유효기간 내에, 30일 이상 간격을 두고 접종</li>
      </ul>

      <h2>3. 광견병 항체검사</h2>
      <p>2차 접종 후 지정 기관에서 항체가 검사를 받아요. 결과가 <strong>0.5 IU/㎖ 이상</strong>이어야 합니다.</p>
      <blockquote>⚠️ 가장 놓치기 쉬운 부분 — 항체검사 <strong>채혈일로부터 180일(약 6개월)</strong>이 지나야 일본 입국이 가능해요. 이 대기 기간 때문에 전체 준비가 최소 7개월 걸리는 거예요.</blockquote>

      <div class="callout">
        <div class="ch"><i class="ti ti-device-mobile"></i>펫무브 앱으로 자동 관리</div>
        <p class="cp">칩 이식일·접종일·항체검사 채혈일만 입력하면, 앱이 <strong>180일 대기 만료일</strong>과 다음에 할 일을 자동으로 알려줘요. 날짜 계산으로 헷갈릴 일이 없어요.</p>
        <a class="cbtn" href="prototype-mobile.html">무료 앱으로 준비하기 ›</a>
      </div>

      <h2>4. 도착 40일 전 사전 신고</h2>
      <p>일본 도착 예정일 <strong>40일 전까지</strong> 도착 공항의 동물검역소에 수입 신고서를 제출해요. 신고가 접수되면 검역소에서 확인 통지를 보내줍니다.</p>

      <h2>5. 출국 검역 (검역증명서)</h2>
      <p>출국 직전 국내 검역본부에서 수출 검역을 받고 <strong>검역증명서</strong>를 발급받아요. 이 서류를 도착지 검역소에 제출하면 됩니다.</p>

      <h2>자주 묻는 질문</h2>
      <h3>고양이도 준비 과정이 같나요?</h3>
      <p>네, 개와 고양이 모두 동일한 절차(칩·광견병 2회·항체검사·검역)를 따라요.</p>
      <h3>비용은 얼마나 드나요?</h3>
      <p>백신·검사·검역 항목에 따라 달라져요. 정확한 견적은 <a href="contact.html">문의</a>로 안내해 드려요.</p>
    </div>

    <div class="art-cta">
      <h3>복잡한 준비, 펫무브가 도와드려요</h3>
      <p>앱으로 직접 준비하거나, 전 과정을 전문가에게 맡길 수 있어요.</p>
      <a href="prototype-mobile.html">무료 앱으로 시작하기</a>
    </div>

    <div class="related">
      <div class="rl-h">관련 가이드</div>
      <a href="guide.html">일본 검역소 안내 <i class="ti ti-chevron-right"></i></a>
      <a href="guide.html">기내 반입 준비 <i class="ti ti-chevron-right"></i></a>
      <a href="guide.html">광견병 항체검사 <i class="ti ti-chevron-right"></i></a>
    </div>
  </article>

{FOOTER}"""


def build_article_sample():
    """실제 라이브 일본 가이드 전문(verbatim)을 템플릿에 부어넣은 미리보기."""
    NAVER = "https://booking.naver.com/booking/13/bizes/1539273?ref=petmove.co.kr"
    KKO = "http://pf.kakao.com/_zDDxhj/chat?ref=petmove.co.kr"
    SCHED = "https://www.petmove.co.kr/blog/japan-pet-entry-scheduler/"
    SELF = "https://www.petmove.co.kr/blog/japan-pet-entry-self-check/"
    QOFFICE = "https://www.petmove.co.kr/blog/japan-pet-quarantine-office/"
    QSTATION = "https://www.petmove.co.kr/docs/pet-quarantine-station/"
    EXPORT = "https://www.petmove.co.kr/docs/pet-export-inspection/"
    NACCS = "https://webaps-nss.nac.naccs.jp/apsapp/UCCU01/CCU01W01E_Init01?ref=petmove.co.kr"
    NAVER_LAB = "https://naver.me/xpPWdXTT?ref=petmove.co.kr"
    YT = "https://www.youtube.com/embed/A3bnLxIZuW8"
    def bk(href, title, thumb):
        return (f'<a class="bookmark" href="{href}" target="_blank" rel="noopener">'
                f'<div class="bk-text"><div class="bk-title">{title}</div>'
                f'<div class="bk-host">petmove.co.kr</div></div>'
                f'<img class="bk-thumb" src="{thumb}" alt="" loading="lazy"></a>')
    TH = "https://storage.ghost.io/c/61/a2/61a2ac22-42e3-487b-9a3b-d0ed58d1ec8a/content/images"
    return f'''{head('[2026] 강아지·고양이 일본 입국 준비 총정리 · 펫무브', 'reading')}
{header('guide')}
  <article class="article">
    <div class="crumb"><a href="guide.html">가이드</a><span class="sep">›</span><a href="guide.html">여행지별</a><span class="sep">›</span>일본</div>
    <div class="art-head">
      <span class="art-cat">여행지 가이드 · 일본</span>
      <h1>[2026] 강아지·고양이 일본 입국 준비 총정리 | 동물검역 절차·서류·기간</h1>
      <div class="art-meta">마지막 업데이트 2026.03.18 · 읽는 데 약 15분</div>
    </div>
    <div class="prose">
      <img class="art-cover" src="https://storage.ghost.io/c/61/a2/61a2ac22-42e3-487b-9a3b-d0ed58d1ec8a/content/images/size/w1600/2026/01/japan-pet-travel-cover.webp" alt="[2026] 강아지·고양이 일본 입국 준비 총정리 | 동물검역 절차·서류·기간">
      <div class="callout-note">수의사가 직접 정리한 2026년 최신 가이드입니다. 100% 믿을 수 있는 강아지·고양이 일본 입국 준비 방법을 알려드립니다.</div>

      <h2>핵심절차 요약</h2>
      <h3>일본 입국 준비 11단계</h3>
      <ol>
        <li>마이크로칩 이식</li>
        <li>광견병 예방접종 1차</li>
        <li>광견병 예방접종 2차 - 1차 접종 30일 이후</li>
        <li>광견병 항체검사</li>
        <li>대기기간 180일</li>
        <li>항공권 구매</li>
        <li>일본 입국 사전신고 - 입국 최소 40일 전</li>
        <li>일본 수출동물검역 신청 — 귀국 최소 10일 전</li>
        <li>출국 전 임상검사 및 서류 준비 — 출발일 기준 10일 이내</li>
        <li>수출동물검역</li>
        <li>일본 도착 및 공항검역</li>
      </ol>

      <h2>마이크로칩 이식</h2>
      <ul>
        <li>모든 준비 중 가장 먼저 실시</li>
        <li>내장형 마이크로칩을 사용</li>
        <li>ISO 11784/11785 표준 마이크로칩 사용(15자리 번호)</li>
        <li>동물등록(강아지 필수, 고양이 선택)</li>
        <li>⚠️ 이후 매 준비 단계마다 마이크로칩 스캔 필요</li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>왜 마이크로칩을 가장 먼저 해야 하나요?</h3>
      <p>마이크로칩은 반려동물의 신분증과 같습니다. 마이크로칩이 있어야 동일한 동물에게 필요한 접종, 검사를 했다는 것을 증명할 수 있습니다.</p>
      <h3>외장형 마이크로칩이 있는데 꼭 내장형을 해야하나요?</h3>
      <p>네, 반드시 내장형 마이크로칩을 사용해야 합니다. 외장형(목걸이/태그형 등) 마이크로칩은 분실·교체·위변조 가능성이 있어 인정되지 않습니다.</p>
      <h3>동물등록을 꼭 해야 하나요?</h3>
      <p>고양이는 하지 않아도 되지만 강아지는 필수입니다. 동물등록은 일본 입국에 필요한 절차는 아니지만 한국에서 검역을 받기 위해서는 필요합니다. 단, 소유주가 외국인이거나 외국 거주자인 경우에는 동물등록을 하지 않아도 됩니다.</p>
      <h3>마이크로칩으로 생길 수 있는 문제에는 어떤 것이 있을까요?</h3>
      <p>반려동물 일본 여행 시 마이크로칩과 관련해 생길 수 있는 문제는 다양한데 크게 보면 마이크로칩 스캔이 되지 않는 경우, 마이크로칩 번호가 다른 경우, 마이크로칩이 두개인 경우로 나누어 볼 수 있습니다.</p>
      <p>마이크로칩 스캔이 되지 않는 경우는 마이크로칩이 이식 부위에서 많이 이동하거나 피부가 두껍고 몸속 깊이 있는 경우, 스캐너의 성능이 떨어지는 경우, 이식된 칩이 빠진 경우, 마이크로칩 불량 등의 원인이 있을 수 있습니다.</p>
      <p>마이크로칩 번호가 다른 경우는 보통 사람의 실수입니다. 마이크로칩 번호를 기재시 15자리 중 한두 자리를 틀리거나, 여러 동물을 동시에 이식한 경우 서로 번호가 바뀌거나 하는 경우가 있을 수 있습니다.</p>
      <p>마이크로칩이 두개인 경우는 이미 마이크로칩이 있는 것을 모르고 새로운 칩을 이식하는 경우 발생합니다. 어릴때부터 키운 강아지가 아니어서 모르고 있던 경우나, 오래전 이식을 하고 잊어버리는 경우 발생합니다.</p>
      <h3>마이크로칩 문제를 예방하는 방법</h3>
      <p>마이크로 문제는 반복된 스캔으로 예방할 수 있습니다. 강아지 일본 여행, 검역 준비의 "매 단계마다 마이크로칩을 스캔해서 반복 확인"하면 모든 문제를 사전에 확인하고 해결할 수 있습니다.</p>
      </div></details>

      <h2>광견병 예방접종 1차</h2>
      <ul>
        <li>생후 91일 이후 실시</li>
        <li>마이크로칩 삽입 후 접종(같은 날 가능)</li>
        <li>불활화(사독) 백신 또는 재조합(변형) 백신 사용</li>
      </ul>

      <h2>광견병 예방접종 2차</h2>
      <ul>
        <li>1차 접종 후 30일 이상 지나서 실시</li>
        <li>1차 접종 면역 유효기간 이내에 실시</li>
        <li>⚠️ 일본 입국 때 면역유효기간이 남아 있어야 하며, 면역유효기간이 끝나기 전 재접종하면 연장 가능</li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>광견병 예방접종은 언제 해야 하나요?</h3>
      <p>반려동물 일본 입국을 위해서는 광견병 예방접종을 2번 해야 합니다. 마이크로칩 이식 후 30일 이상의 간격으로 접종을 합니다. 두번째 접종은 첫번째 접종의 면역 유효기간 안에 실시해야 합니다. 강아지 나이가 91일령 이상이어야 한다는 점도 주의해주세요</p>
      <h3>최적의 접종 타이밍</h3>
      <p>기억하기 쉽고, 병원 내원을 최소화할 수 있으며, 가장 빠르게 일본 입국 준비를 마칠 수 있는 타임라인을 알려드립니다.</p>
      <ol>
        <li>마이크로칩 이식 + 광견병 예방접종 1차(동시 실시)</li>
        <li>30일 대기</li>
        <li>광견병 예방접종 2차 + 광견병항체검사(동시 실시)</li>
      </ol>
      <h3>어떤 광견병 백신을 사용해야 하나요?</h3>
      <p>일본 입국에 유효한 광견병 백신은 불활화(사독) 혹은 재조합(변형) 백신입니다. 현재 한국에서 사용되는 백신은 대부분 위 유형이며 일본 입국에 사용 가능합니다.</p>
      <h3>광견병 백신의 면역유효기간은 몇년인가요?</h3>
      <p>한국과 일본에서 사용되는 백신은 대부분 면역유효기간이 1년입니다. 미국 등 일부 국가에서는 면역유효기간 3년짜리 백신을 사용하기도 합니다.</p>
      <h3>오래전 광견병 예방접종을 한 적이 있어요. 그래도 2회가 필요한가요?</h3>
      <p>이전에 광견병 예방접종을 했어도 면역유효기간이 지났다면 2회 접종을 해야 합니다. 면역유효기간이 지나지 않은 경우에도 증명서 발행에 필요한 백신 상세 정보가 없다면 2회 접종을 해야합니다.</p>
      <h3>광견병 예방접종을 한 해에 두번 맞아도 괜찮나요?</h3>
      <p>건강한 반려동물은 광견병 예방접종을 한 해에 2번 맞아도 아무런 문제가 없습니다. 반려동물이 지병이 있거나 백신에 과민반응이 있는 경우 주의가 필요합니다.</p>
      <h3>광견병 예방접종으로 생길 수 있는 문제는 어떤 것이 있나요?</h3>
      <p>광견병 예방접종과 관련해서 생기는 문제에는 다음과 같은 것들이 있습니다.</p>
      <ul>
        <li>마이크로칩 이식 전에 접종</li>
        <li>91일령 미만의 어린 강아지에게 접종</li>
        <li>1차와 2차 접종 사이 간격이 30일 미만</li>
        <li>1차 접종 면역유효기간이 끝나고 2차 접종</li>
        <li>일본 여행시 2차 접종 면역유효기간이 끝나는 경우</li>
        <li>2차 접종을 광견병항체검사 후 실시</li>
        <li>원본 접종 증명서가 없는 경우</li>
        <li>접종 증명서에 백신 상세 정보가 없는 경우</li>
        <li>접종 증명서 정보가 잘못된 경우</li>
      </ul>
      <h3>광견병 예방접종 관련 문제를 예방하는 방법</h3>
      <p>광견병 예방접종과 관련한 문제는 규정을 잘 이해하지 못하거나 서류 작성 경험이 부족해서 발생합니다. 이런 문제는 경험이 풍부한 전문 동물병원에서 준비하면 쉽게 예방할 수 있습니다.</p>
      </div></details>

      <h2>광견병항체검사</h2>
      <ul>
        <li>2차 접종 후 실시(같은 날 가능)</li>
        <li>2차 접종 면역유효기간 이내에 실시</li>
        <li>일본 농림수산대신 지정 검사기관(한국은 농림축산검역본부)</li>
        <li>임상 수의사만 검사 신청 가능하며 개인 신청은 불가</li>
        <li>0.5IU/ml 이상일 경우 통과</li>
        <li>유효기간 2년(⚠️ 백신 면역유효기간이 지나면 자동 종료)</li>
        <li>검사 의뢰 <a href="{NAVER_LAB}" target="_blank" rel="noopener">펫무브 X 로잔동물의료센터</a></li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>광견병항체검사가 뭔가요?</h3>
      <p>광견병항체검사는 반려동물이 광견병에 대한 충분한 항체를 가지고 있는지 평가합니다. 항체가 충분한 반려동물 광견병에 감염이 되지 않습니다. 광견병 예방접종 후 충분한 시간이 지나면 대부분의 반려동물 항체가 생겨서 검사에 합격할 수 있습니다. 간혹 면역력이 떨어지는 경우 검사에서 불합격이 나올 수 있습니다.</p>
      <h3>광견병항체검사는 언제 하나요?</h3>
      <p>광견병항체검사는 마이크로칩 이식과 광견병 예방접종 2회 마친 후 실시합니다. 2차 접종 면역 유효기간 이내에 검사를 해야 하고, 2차 접종과 같은 날 검사도 가능합니다. 검사 후 180일이 지나야 일본에 갈 수 있기 때문에, 일본 여행 180일 전에는 검사를 마쳐야 합니다.</p>
      <h3>광견병항체검사는 어디서 받나요?</h3>
      <p>광견병항체검사는 일본 농림수산대신이 지정한 검사기관에서 받아야 합니다. 일반인은 신청할 수 없으며, 동물병원에 검사를 의뢰할 수 있습니다. 동물병원 수의사는 해당 동물의 마이크로칩 확인, 채혈, 시료 준비, 발송, 신청을 대행합니다. 이 검사는 안하는 동물병원도 많으므로 미리 검사 가능한 동물병원 확인이 필요합니다.</p>
      <h3>검사는 얼마나 걸리나요?</h3>
      <p>광견병항체검사는 2~3주 소요될 수 있습니다. 더 빠르기도 하고 늦어지기도 합니다. 그러나 이 검사 소요 기간은 일본 입국 가능일과는 상관이 없습니다. 일본 입국 가능일은 채혈일을 기준으로 판단합니다.</p>
      <h3>합격 기준은 어떻게 되나요?</h3>
      <p>광견병항체검사의 합격 기준은 0.5IU/ml 입니다. 이 수치보다 높으면 일본에 입국이 가능합니다. 불합격인 경우 합격이 될 때까지 접종과 검사를 반복할 수 있습니다.</p>
      <h3>검사 유효기간은 얼마나 되나요?</h3>
      <p>광견병항체검사의 유효기간은 채혈일 기준 2년입니다. 단, 광견병 예방접종의 면역 유효기간이 남아있어야 합니다. 광견병 예방접종 면역유효기간이 지나면 검사 유효기간도 자동 종료됩니다.</p>
      <h3>광견병항체검사 때문에 생길 수 있는 문제는 어떤게 있나요?</h3>
      <p>광견병항체검사 때문에 흔히 생기는 문제는 다음과 같습니다.</p>
      <ul>
        <li>검사전 1회만 접종한 경우</li>
        <li>출국까지 180일이 남지 않은 경우</li>
        <li>검사결과에서 불합격되는 경우</li>
        <li>마이크로칩 번호 등 정보가 틀린 경우</li>
        <li>검사결과지를 분실하는 경우</li>
        <li>접종 면역유효기간을 넘긴 경우</li>
      </ul>
      <p>🎥 텍스트가 어렵다면? 요약된 영상으로 확인하세요!</p>
      <div class="embed"><iframe src="{YT}" title="강아지·고양이 일본 입국 준비 영상" loading="lazy" allowfullscreen></iframe></div>
      </div></details>

      <h2>대기기간(180일)</h2>
      <ul>
        <li>광견병 항체검사 채혈일로부터 180일 경과 후 일본 입국 가능</li>
        <li>채혈일을 0일로 계산</li>
        <li>일본 도착일은 '광견병 백신의 면역유효기간'과 '광견병항체검사 유효기간' 이내여야 함</li>
      </ul>

      <h2>항공권 구매</h2>
      <ul>
        <li>출발일 기준 최소 2~3개월 전 발권 권장</li>
        <li>일본 입국 사전 신고를 위해 항공권 정보 필요</li>
        <li>항공권 구매 후 반려동물 운송 예약 필요</li>
      </ul>

      <h2>일본 입국 사전신고</h2>
      <ul>
        <li>일본 입국 최소 40일 전까지 신고</li>
        <li>일본 입국 공항 또는 항구 동물검역소에 신고</li>
        <li>일본어 표기는 事前届出, 영어로는 advance notification</li>
        <li>일본 동물검역소 웹사이트(NACCS) 또는 이메일로 신고</li>
        <li>일본 동물검역소에서 추가 정보나 증명서류, 사진 등을 요구할 수 있습니다.</li>
        <li>각 지역 동물검역소마다 요구사항에 차이가 있을 수 있습니다.</li>
        <li>커뮤니케이션은 일본어와 영어로만 가능</li>
        <li>완료되면 허가증(Approval) 발급</li>
        <li>신고 대행 <a href="{KKO}" target="_blank" rel="noopener">펫무브 카카오톡</a></li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>사전 신고가 뭔가요?</h3>
      <p>일본 입국 사전 신고(Advance Notification)는 어느 날짜에, 어느 공항(항구)으로, 어떤 반려동물을 데려가는지 "일본 동물검역소에 미리 알리고 준비에 문제가 없는지 사전 검토를 받는 절차"입니다. 반려동물이 일본에 입국하기 위해서는 필수 절차입니다.</p>
      <h3>일본 수입 검역 신청은 뭔가요?</h3>
      <p>수입검역신청은 일본 입국 검역을 신청하는 절차로 사전 신고와는 의미가 다르지만, 실제로는 두 절차가 동시에 이루어지기 때문에 따로 구분이 필요하지는 않습니다. 일본 입국 사전신고는 수입검역신청을 포함한다고 할 수 있습니다.</p>
      <h3>사전 신고는 언제 해야 하나요?</h3>
      <p>사전 신고는 입국하기 최소 40일 전까지 해야 합니다. 처음 해보는 경우 어렵기 때문에 생각보다 시간이 많이 걸릴 수 있습니다. 40일 전까지 안전하게 신고하기 위해서는 최소 2달 전에 준비를 시작하는 것이 좋습니다. 신고를 위해 정확한 항공편 정보가 필요하므로 항공권 구매도 미리 하셔야 하는 점 참고하세요.</p>
      <h3>사전 신고는 어디에 하나요?</h3>
      <p>사전 신고는 도착 공항 또는 항구의 동물검역소에 합니다. 나리타, 하네다 등 일본의 국제공항은 여러 터미널로 나누어져 있는 경우가 많은데, 이때 신청은 반드시 도착 터미널 동물검역소로 해야 합니다.</p>
      <p>예를 들어, 도착 공항과 터미널이 나리타 공항 1터미널이라면, 나리타 공항 1터미널 동물검역소에 신고합니다.</p>
      <h3>사전 신고는 어떻게 하나요?</h3>
      <p>사전 신고는 크게 두가지 방식으로 할 수 있습니다.</p>
      <ul>
        <li><a href="{NACCS}" target="_blank" rel="noopener">NACCS(웹사이트 온라인 신고)</a></li>
        <li>이메일 신고</li>
      </ul>
      <p>NACCS를 통한 접수가 편리한 점이 많지만, 웹사이트의 유저 인터페이스(UI)와 사용자 경험(UX)이 좋지 않아서 처음 해보는 경우 어려울 수 있습니다.</p>
      <p>이메일 신고를 할 경우 각 동물검역소의 이메일 주소는 <a href="{QOFFICE}" target="_blank" rel="noopener">일본 동물검역소 연락처</a> 글을 참고해주세요.</p>
      <h3>신고 후에는 어떻게 되나요?</h3>
      <p>사전 신고를 하면 일본 동물검역소에서는 신고 내용을 검토합니다. 이때 일본 동물검역소와 여러 번 이메일을 주고 받게 될 수 있습니다. 증명서류, 제출정보 수정, 추가 정보 요청 등을 받을 수 있습니다. 준비 절차에 문제가 있는 경우 일본 입국을 할 수 없다는 답변을 받을 수도 있습니다.</p>
      <p>모든 검토가 끝나면 허가증(Aprroval)이 발급됩니다. 이 허가증이 있어야 반려동물 일본 입국이 가능합니다. 사전 신고 후 허가증을 받을 때까지 일반적으로 수 주가 걸리게 됩니다.</p>
      </div></details>

      <h2>일본 수출동물검역신청</h2>
      <ul>
        <li>짧은 여행 등 한국 귀국 일정이 있는 경우 필수</li>
        <li>사전 신고 후 ~ 귀국일 기준 최소 10일 전</li>
        <li>일본 동물검역소에 신청(귀국을 위해 방문하는 공항, 항구 아니어도 가능)</li>
        <li>일본 동물검역소 웹사이트(NACCS) 또는 이메일 접수</li>
        <li>⚠️ 신청 후 방문 날짜, 시간 예약 필수</li>
        <li>신고 대행 <a href="{KKO}" target="_blank" rel="noopener">펫무브 카카오톡</a></li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>일본 수출동물검역 신청이란?</h3>
      <p>반려동물을 일본으로 데리고 갔다가 다시 한국으로 데리고 귀국하는 경우, 일본 동물검역소에서 검역을 받아야 합니다. 이것을 수출동물검역이라고 합니다. 일본 수출동물검역을 받기 위해서는 신청과 예약이 필요합니다.</p>
      <h3>일본 수출동물검역은 언제 하나요?</h3>
      <p>일본 수출동물검역 신청은 최소 10일 전까지 해야 합니다. 여행인 경우는 일반적으로 사전 신고와 함께 하는 경우가 많습니다. 원하는 날짜와 시간에 검역을 받기 위해 일정이 확실하다면 일찍 신청과 예약을 해두는 편이 좋습니다.</p>
      <h3>일본 수출동물검역은 어디에 신청하나요?</h3>
      <p>일본 수출동물검역은 일본 수출 동물검역소 어디든 가능합니다. 실제 출국하는 공항의 동물검역소가 아니어도 됩니다. 그러나 일반적으로 출국 하는 공항의 동물검역소 방문이 가장 편하기 때문에, 출국 공항 동물검역소로 신청하게 됩니다.</p>
      <h3>일본 수출동물검역 신청은 어떻게 하나요?</h3>
      <p>일본 수출동물검역 신청은 두가지 방식으로 할 수 있습니다.</p>
      <ul>
        <li><a href="{NACCS}" target="_blank" rel="noopener">NACCS(웹사이트 온라인 신고)</a></li>
        <li>이메일 신청</li>
      </ul>
      <p>NACCS를 통한 접수가 편리하지만, 웹사이트의 유저 인터페이스(UI)와 사용자 경험(UX)이 좋지 않아서 처음 해보는 경우 어려울 수 있습니다.</p>
      <p>이메일 신고를 할 경우 각 동물검역소의 이메일 주소는 <a href="{QOFFICE}" target="_blank" rel="noopener">일본 동물검역소 연락처</a> 글을 참고해주세요.</p>
      <h3>신청하면 그 다음은 어떻게 되나요?</h3>
      <p>일본 동물검역소에 수출동물검역 신청을 하면, 사전 신고 때와는 달리 허가증이나 다른 서류가 발급되지는 않습니다. 대신 이메일이 발송됩니다.</p>
      <p>일본 동물검역소에서 보내준 이메일 지시에 따라서 정보를 주고 받으며 예약을 진행할 수 있습니다.</p>
      </div></details>

      <h2>출국 전 임상검사 및 서류 준비</h2>
      <ul>
        <li>출국 전 10일 이내</li>
        <li>동물병원에서 실시</li>
        <li>마이크로칩 스캔 및 임상 검사(전염병 징후 체크)</li>
        <li>⚠️ 출국 전 임상검사를 한 동물병원에서 일본 입국을 위한 최종 증명서류를 준비</li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>출국 전 임상검사란?</h3>
      <p>출국 전 임상검사는 반려동물을 일본으로 데리고 가는 준비의 마지막 단계입니다. 일본 입국 직전 "마이크로칩 스캔이 잘 되는지 확인하고", "반려동물의 건강상태를 체크해서 전염병에 대한 증상이 없음을 증명"하는 절차입니다. 이 절차는 일본 입국에 필요한 최종 증명서류 준비를 포함합니다.</p>
      <h3>출국 전 임상검사는 언제 받나요?</h3>
      <p>출국 전 임상검사는 출발일 기준 10일 이내에 받습니다. 출발일을 포함해서 10일로 계산되므로 출발일 9일전부터 받을 수 있습니다. 출국 전 임상검사는 너무 일찍 하면 기간이 지나서 무효가 될 수 있고, 너무 늦게 하면 출국 직전 변수가 생겼을 때 대응이 어렵습니다. 여유 있게 7~9일 전 정도에 하는 것이 안전합니다.</p>
      <h3>출국 전 임상검사는 어디서 하나요?</h3>
      <p>출국 전 임상검사는 동물병원에서 받습니다. 수의사가 확인 후 증명서를 발급해드립니다.</p>
      <h3>아무 동물병원에서나 받을 수 있나요?</h3>
      <p>반려동물 일본 입국 서류를 준비해본 경험이 있고, 준비를 잘 할 수 있는 동물병원에서 출국 전 임상검사를 받아야 합니다. 모든 준비가 잘 되었어도 이 마지막 서류 준비가 잘못되면 반려동물이 일본에 갈 수 없게 됩니다. 참고로, 반려동물 일본 입국 준비는 가능하면 마이크로칩 이식부터 모든 절차를 한 동물병원에서 진행하는 것이 유리합니다.</p>
      <p>⚠️ 강아지, 고양이 일본 입국 준비의 각 절차를 서로 다른 동물병원에서 하는 경우 다음과 같은 어려움이 생길 수 있습니다.</p>
      <ul>
        <li>각 동물병원에서 각각 증명 서류를 받아야 하는 불편함</li>
        <li>증명서 발행 비용 증가</li>
        <li>증명서 정보 수정이 필요할 때, 각 병원마다 따로 요청해야 하는 어려움</li>
        <li>증명서가 많아지면 표기된 정보 오류 발생 가능성 증가</li>
        <li>증명서 간 정보의 불일치 가능성 증가</li>
        <li>문제 발생시 동물병원끼리 책임 전가</li>
      </ul>
      <p>한 동물병원에서 모든 준비를 하면, 모든 정보를 일목요연하게 한장의 증명서로 만들 수 있습니다. 이렇게 하면 오류 발생 가능성이 적고 문제점을 찾아내거나 수정하는 일도 쉽습니다. 문제 발생시 책임 소재도 명확합니다.</p>
      </div></details>

      <h2>수출동물검역</h2>
      <ul>
        <li>출국 전 10일 이내</li>
        <li>각 지역 동물검역소에서 실시</li>
        <li>검역 통과 시 <strong>수출검역증명서</strong> 발급</li>
        <li>⚠️ 출발 당일 공항에서도 검역 가능하지만, 안전을 위해 사전 검역 권장</li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>수출동물검역은 어떤 절차인가요?</h3>
      <p>한국 농림축산검역본부에서 실시하는 검역으로, 반려동물이 해외로 출국하기에 적합한 건강 상태인지 확인하고 "수출검역증명서"를 발급하는 절차입니다. 이 증명서가 있어야 항공사 탑승과 하와이 입국이 가능합니다.</p>
      <h3>어디에서 검역을 받나요?</h3>
      <p>인천공항, 김포공항 등 출발 공항의 동물검역소 또는 가까운 지역 동물검역소에서 받을 수 있습니다. 정확한 위치와 연락처는 <a href="{QSTATION}" target="_blank" rel="noopener">동물검역소 위치 안내</a>에서 확인하세요.</p>
      <h3>수출검역 시 주의사항은?</h3>
      <p>반드시 반려동물을 데리고 가야 하며 보호자 신분증과 준비한 증명서류 원본이 필요합니다. 서류상 정보와 실제 반려동물 정보가 일치하지 않으면 검역이 거부될 수 있습니다. 자세한 절차는 <a href="{EXPORT}" target="_blank" rel="noopener">수출동물검역 안내</a>를 참고하세요.</p>
      </div></details>

      <h2>일본 도착 및 공항 검역</h2>
      <ul>
        <li>모든 반려동물은 도착 후 공항 내 <strong>동물검역소(AQS)</strong>에서 검사</li>
        <li>요건 충족 시 <strong>12시간 이내 인도</strong>—당일 데려갈 수 있음</li>
        <li>요건 미충족 시 <strong>최대 180일 계류</strong>(약 6개월)</li>
        <li>반려동물 입국 가능 공항: <strong>나리타(NRT), 간사이(KIX), 하네다(HND), 추부(NGO), 삿포로(CTS)</strong> 등 검역소가 있는 공항으로 제한</li>
        <li>⚠️ 도착 후 별도 안내 절차는 없습니다. 소유주가 직접 동물검역소를 찾아가야 하는 점에 주의 바랍니다.</li>
      </ul>
      <details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">
      <h3>12시간 이내 인도란 무엇인가요?</h3>
      <p>모든 입국 요건을 충족한 경우, 공항 동물검역소에서 서류 확인과 임상검사를 거친 후 "당일 바로 반려동물을 인수"할 수 있는 절차입니다. 이를 위해서는 마이크로칩 삽입, 광견병 예방접종 2회 이상, 항체가 검사 결과 0.5 IU/ml 이상, 채혈일로부터 180일 대기 완료, 사전 신고 수리, 수출국 검역증명서 등 모든 서류가 갖춰져야 합니다.</p>
      <h3>180일 계류는 어떤 경우에 적용되나요?</h3>
      <p>FAVN 항체가 검사를 하지 않았거나, 채혈일로부터 180일 대기 기간이 충족되지 않은 경우, 또는 서류가 미비한 경우 "최대 180일(약 6개월) 계류"가 적용됩니다. 계류 기간 중 반려동물은 공항 검역 시설에 머물게 되며, 모든 비용(사료, 관리, 치료 등)은 "보호자가 전액 부담"합니다. 180일 계류는 반려동물에게 큰 스트레스가 되므로, "사전 준비를 철저히 하여 반드시 피하는 것이 중요"합니다.</p>
      <h3>일본에서 귀국할 때는 어떻게 하나요?</h3>
      <p>일본에서 한국으로 귀국할 때에도 "일본 동물검역소에서 수출 검역"을 받아야 합니다. 과거에는 당일 공항에서 간단히 처리되었으나, 현재는 수요 증가로 "예약제"로 운영되고 있으므로 반드시 사전에 신청 및 예약해야 합니다. 한국 도착 후에는 한국 농림축산검역본부에서 "수출국 검역증명서 원본"과 "광견병 항체가 검사 결과지"를 제출하고 검역을 받습니다. 일본은 광견병 비발생국이므로 한국 입국 시 항체가 검사는 면제됩니다.</p>
      </div></details>

      <p>준비 일정 계산이 어려우시다면 펫무브 <a href="{SCHED}" target="_blank" rel="noopener">일본 입국 일정 계산기</a>로 날짜를 자동 계산해보세요. 맞게 준비 중인지 불안하다면 <a href="{SELF}" target="_blank" rel="noopener">자가진단(Self-Check)</a>으로 확인할 수 있어요.</p>
    </div>

    <div class="svc-block">
      <div class="svc-title">복잡한 일본 준비, 펫무브가 도와드릴게요</div>
      <div class="svc-desc">로잔동물의료센터 수의사가 직접 준비해드려요</div>
      <a class="svc-cta" href="{KKO}" target="_blank" rel="noopener"><i class="ti ti-message-circle"></i>서비스 의뢰하기</a>
      <div class="svc-sub"><a href="{NAVER}" target="_blank" rel="noopener"><span class="lmk">N</span> 네이버예약</a><span class="sep">·</span><a href="tel:02-872-7588"><span class="lmk">TEL</span> 02-872-7588</a></div>
      <div class="svc-app">앱으로 직접 준비하고 싶다면 <a href="prototype-mobile.html">무료 앱 받기 →</a></div>
    </div>

  </article>

{FOOTER}'''



with open(os.path.join(OUT_DIR, "guide.html"), "w", encoding="utf-8") as f:
    f.write(build_guide())
with open(os.path.join(OUT_DIR, "contact.html"), "w", encoding="utf-8") as f:
    f.write(build_contact())
with open(os.path.join(OUT_DIR, "article.html"), "w", encoding="utf-8") as f:
    f.write(build_article())
# ⚠️ article-sample.html 은 더 이상 여기서 쓰지 않는다 — 2026-07-06 세션부터 손으로
# 다듬은 본문 공통 템플릿(아코디언 B·유용한 자료·cta-sep 등)이 진실이고, www_convert.py 가
# 그 파일을 셸로 읽는다. 이 생성기의 build_article_sample() 은 구버전이라 덮으면
# 변환기 마커(<hr class="cta-sep">)가 사라져 78글 변환이 깨진다(2026-07-12 실제 사고).
print("wrote guide.html + contact.html + article.html (article-sample.html은 손편집 truth, 미출력)")
