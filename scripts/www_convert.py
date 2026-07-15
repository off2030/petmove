# -*- coding: utf-8 -*-
"""고스트 export JSON -> 새 본문 템플릿(article-sample.html) 변환 시제품.
MIGRATION-RULES.md 규칙을 실제 데이터에 적용. 한 개 이상 글을 골라 standalone HTML로 출력."""
import glob, json, re, sys, io
from datetime import datetime
from bs4 import BeautifulSoup, NavigableString, Comment
from www_lib import norm_link, norm_image

# 최신 export 를 자동 선택 — 파일명에 export 시각이 박혀 있어 사전순 = 시간순.
_exports = sorted(glob.glob(r"C:\Users\off20\Downloads\pesmubeu.ghost.*.json"))
assert _exports, "Ghost export JSON 이 Downloads 에 없습니다 (Ghost Admin → Export content)"
JSON = _exports[-1]
TPL  = r"C:\dev\petmove\docs\www-redesign\article-sample.html"
OUTDIR = r"C:\dev\petmove\docs\www-redesign"

d = json.load(open(JSON, encoding='utf-8'))
data = (d['db'][0] if isinstance(d['db'], list) else d['db'])['data']
posts = {p['slug']: p for p in data['posts']}
tags  = {t['id']: t for t in data.get('tags', [])}
ptags = data.get('posts_tags', [])
tag_by_post = {}
for pt in sorted(ptags, key=lambda x: x.get('sort_order', 0)):
    tag_by_post.setdefault(pt['post_id'], []).append(tags.get(pt['tag_id'], {}).get('name'))

# --- 템플릿 셸 분리 ---
tpl = open(TPL, encoding='utf-8').read()
HEAD = tpl[:tpl.index('<article class="article">')]
FOOT = tpl[tpl.index('    <hr class="cta-sep">'):]   # 구분선 + cta2 + /article + footer + script

# --- 글 끝 정리 패턴 (템플릿 확정 규칙) ---
TOOL_RE       = re.compile(r'(scheduler|self-check)', re.I)          # 도구 = 계산기·자가진단기
RELATED_RE    = re.compile(r'^관련\s*(블로그|포스트|포스팅|글)')        # '관련 블로그 포스트/포스팅/글' 마커
PROMO_LINK_RE = re.compile(r'(naver\.me|booking\.naver|pf\.kakao|tel:)', re.I)  # 예약/연락 링크
PROMO_TEXT_RE = re.compile(r'(예약하세요|준비하세요|연락주세요|문의하세요|맡겨|맡기세요|바로가기|지금\s*바로)')

def convert_body(html, soup_feature=None):
    soup = BeautifulSoup(html, 'html.parser')

    # 0. HTML 주석(kg-card-begin/end 등) 제거
    for cm in soup.find_all(string=lambda t: isinstance(t, Comment)):
        cm.extract()

    # 1. 연락 버튼 카드 제거
    for c in soup.select('.kg-button-card'):
        c.decompose()

    # 1.5 '관련 블로그 포스트' 블록 제거 (마커 + 그 뒤 형제 전부)
    for el in soup.find_all(['p', 'h2', 'h3', 'h4']):
        if RELATED_RE.match(el.get_text(strip=True)):
            for sib in el.find_next_siblings():
                sib.decompose()
            el.decompose()
            break

    # 1.6 도구 북마크(계산기·자가진단기) 추출 -> 글 끝 '유용한 자료' 리스트로
    tools = []
    for fig in soup.select('figure.kg-bookmark-card'):
        a = fig.find('a', href=True)
        if a and TOOL_RE.search(a['href']):
            title = fig.select_one('.kg-bookmark-title')
            desc  = fig.select_one('.kg-bookmark-description')
            href  = norm_link(a['href'])
            if not any(t['href'] == href for t in tools):
                tools.append({'href': href,
                              'title': title.get_text(strip=True) if title else '',
                              'desc':  desc.get_text(strip=True) if desc else ''})
            fig.decompose()
    # 도구를 소개하던 본문 문장(<p> 안 도구 링크)도 제거 — 유용한 자료로 일원화
    for p in soup.find_all('p'):
        if p.find('a', href=TOOL_RE):
            p.decompose()

    # 1.7 남은 홍보/예약 문구·구분선 꼬리 정리 (끝에서부터, 진짜 본문 만나면 중단)
    def _is_promo(el):
        if el.name == 'hr':
            return True
        if el.name == 'figure' and 'kg-bookmark-card' in (el.get('class') or []):
            return True   # 제목 없이 끝에 붙은 관련글 북마크 묶음
        if el.name == 'p':
            if not el.get_text(strip=True) and not el.find(['img', 'iframe', 'br']):
                return True   # 빈 문단은 꼬리에서 건너뛰기(진짜 본문 아님)
            if el.find('a', href=PROMO_LINK_RE):
                return True
            if PROMO_TEXT_RE.search(el.get_text(strip=True)):
                return True
        return False
    for el in reversed([c for c in soup.contents if getattr(c, 'name', None)]):
        if _is_promo(el):
            el.decompose()
        else:
            break

    # 2. 북마크 카드 -> a.bookmark
    for fig in soup.select('figure.kg-bookmark-card'):
        a = fig.find('a')
        href = norm_link(a.get('href')) if a else '#'
        title = fig.select_one('.kg-bookmark-title')
        pub   = fig.select_one('.kg-bookmark-publisher')
        thumb = fig.select_one('.kg-bookmark-thumbnail img')
        new = soup.new_tag('a', href=href); new['class'] = 'bookmark'
        txt = soup.new_tag('div'); txt['class'] = 'bk-text'
        t = soup.new_tag('div'); t['class'] = 'bk-title'; t.string = title.get_text(strip=True) if title else ''
        txt.append(t)
        if pub:
            h = soup.new_tag('div'); h['class'] = 'bk-host'; h.string = pub.get_text(strip=True)
            txt.append(h)
        new.append(txt)
        if thumb and thumb.get('src'):
            im = soup.new_tag('img', src=norm_image(thumb['src'])); im['class'] = 'bk-thumb'
            new.append(im)
        fig.replace_with(new)

    # 3. 콜아웃 -> .callout-note
    for c in soup.select('.kg-callout-card'):
        emoji = c.select_one('.kg-callout-emoji')
        text  = c.select_one('.kg-callout-text')
        new = soup.new_tag('div'); new['class'] = 'callout-note'
        if emoji and emoji.get_text(strip=True):
            e = soup.new_tag('span'); e['class'] = 'ce'; e.string = emoji.get_text(strip=True)
            new.append(e)
        if text:
            for x in list(text.contents):
                new.append(x)
        c.replace_with(new)

    # 4. 토글 -> details.more
    for c in soup.select('.kg-toggle-card'):
        head = c.select_one('.kg-toggle-heading-text')
        cont = c.select_one('.kg-toggle-content')
        det = soup.new_tag('details'); det['class'] = 'more'
        summ = soup.new_tag('summary')
        sp = soup.new_tag('span'); sp.string = head.get_text(strip=True) if head else '더 자세한 설명'
        summ.append(sp)
        ic = soup.new_tag('i'); ic['class'] = 'ti ti-chevron-down'; summ.append(ic)
        det.append(summ)
        body = soup.new_tag('div'); body['class'] = 'more-body'
        if cont:
            for x in list(cont.contents):
                body.append(x)
        det.append(body)
        c.replace_with(det)

    # 5. 이미지 카드 -> figure
    for fig in soup.select('figure.kg-image-card'):
        img = fig.find('img'); cap = fig.find('figcaption')
        new = soup.new_tag('figure')
        if img:
            ni = soup.new_tag('img', src=img.get('src', ''))
            if img.get('alt'): ni['alt'] = img['alt']
            new.append(ni)
        if cap:
            nc = soup.new_tag('figcaption')
            for x in list(cap.contents): nc.append(x)
            new.append(nc)
        fig.replace_with(new)

    # 6. 임베드 -> .embed
    for fig in soup.select('figure.kg-embed-card'):
        ifr = fig.find('iframe')
        new = soup.new_tag('div'); new['class'] = 'embed'
        if ifr:
            ifr['loading'] = 'lazy'
            new.append(ifr.extract())
        fig.replace_with(new)

    # 7. 파일 카드 -> a.dl
    for c in soup.select('.kg-file-card'):
        a = c.find('a'); href = norm_link(a.get('href')) if a else '#'
        name = c.select_one('.kg-file-card-filename') or c.select_one('.kg-file-card-title')
        new = soup.new_tag('a', href=href); new['class'] = 'dl'; new['download'] = ''
        ic = soup.new_tag('i'); ic['class'] = 'ti ti-file-download'; new.append(ic)
        new.append(NavigableString(name.get_text(strip=True) if name else '첨부파일'))
        c.replace_with(new)

    # 8. 상품 카드 -> 수동 처리 플래그
    for c in soup.select('.kg-product-card'):
        note = soup.new_tag('div'); note['class'] = 'callout-note'
        note.string = '[상품 카드 — 수동 처리 필요]'
        c.replace_with(note)

    # 9. 표 전부 -> .table-wrap (가로 스크롤 컨테이너). 열 수와 무관하게 내용이 길면
    #    모바일에서 문서 폭을 뚫는다(운송요금 3열 표 사례) — 항상 감싸고, 넓은 표(4열+)만
    #    CSS 쪽에서 min-width 를 준다(.table-wrap table:has(...) — article.css).
    for table in soup.find_all('table'):
        wrap = soup.new_tag('div'); wrap['class'] = 'table-wrap'
        table.replace_with(wrap); wrap.append(table)

    # 10. 남은 kg-card 래퍼 unwrap + kg-* 잔여 클래스 정리
    for div in soup.select('div.kg-card'):
        div.unwrap()
    for el in soup.find_all(class_=True):
        classes = el.get('class')
        if isinstance(classes, str):
            classes = classes.split()
        cls = [x for x in classes if not x.startswith('kg-')]
        if cls: el['class'] = cls
        else:   del el['class']

    # 11. 본문 h1 제거(제목은 art-head로 승격)
    for h in soup.find_all('h1'):
        h.decompose()

    # 12. 내부 링크·이미지 경로 정규화 (__GHOST_URL__ 제거 + 긴 이미지 파일명 단축)
    for a in soup.find_all('a', href=True):
        a['href'] = norm_link(a['href'])
    for tag in soup.find_all(['img', 'iframe', 'source'], src=True):
        tag['src'] = norm_image(tag['src'])

    # 13. 빈 문단 정리
    for p in soup.find_all('p'):
        if not p.get_text(strip=True) and not p.find(['img', 'iframe', 'br']):
            p.decompose()

    # 커버리지 체크: 남은 kg-* 있는지
    leftover = sorted(set(re.findall(r'kg-[a-z0-9-]+', str(soup))))
    return str(soup), leftover, tools

def fmt_date(s):
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00')).strftime('%Y.%m.%d')
    except Exception:
        return ''

def build(slug):
    p = posts[slug]
    body, leftover, tools = convert_body(p.get('html') or '')
    # art-head
    cats = [c for c in tag_by_post.get(p['id'], []) if c]
    cat = cats[0] if cats else '가이드'
    date = fmt_date(p.get('updated_at') or p.get('published_at'))
    mins = max(3, len(p.get('plaintext') or '') // 900)
    cover = ''
    if p.get('feature_image'):
        cover = f'<img class="art-cover" src="{norm_image(p["feature_image"])}" alt="{p["title"]}">\n'
    intro = ''
    if p.get('custom_excerpt'):
        intro = f'<div class="callout-note">{p["custom_excerpt"]}</div>\n'
    arthead = (
        f'    <div class="crumb"><a href="/guide/">가이드</a><span class="sep">›</span>'
        f'<a href="/guide/">{cat}</a></div>\n'
        f'    <div class="art-head">\n'
        f'      <span class="art-cat">{cat}</span>\n'
        f'      <h1>{p["title"]}</h1>\n'
        f'      <div class="art-meta">마지막 업데이트 {date} · 읽는 데 약 {mins}분</div>\n'
        f'    </div>\n'
    )
    # 도구(계산기·자가진단기) -> 글 끝 '유용한 자료' 리스트 (템플릿 확정 형태)
    info = ''
    if tools:
        rows = ''
        for t in tools:
            rows += (f'\n      <a href="{t["href"]}">'
                     f'<span class="it">{t["title"]} <i class="ti ti-arrow-right"></i></span>'
                     f'<span class="id">{t["desc"]}</span></a>')
        info = f'\n<h2>유용한 자료</h2>\n<div class="info-list">{rows}\n</div>\n'
    prose = f'    <div class="prose">\n{cover}{intro}{body}\n{info}    </div>\n'
    out = HEAD + '<article class="article">\n' + arthead + prose + FOOT
    # 제목 태그 교체
    out = re.sub(r'<title>.*?</title>', f'<title>{p["title"]} · 펫무브</title>', out, count=1)
    # 메타 설명·og — 글별로 교체(excerpt 우선, 없으면 본문 첫 150자)
    desc = (p.get('custom_excerpt') or '').strip()
    if not desc:
        desc = re.sub(r'\s+', ' ', (p.get('plaintext') or '')).strip()[:150]
        # 마지막 단어·매달린 번호(예: '7. ')를 정리하고 말줄임표
        desc = re.sub(r'\s+\S*$', '', desc)
        desc = re.sub(r'\s*\d+\.?$', '', desc) + '…'
    desc = desc.replace('"', '&quot;')
    full_title = f'{p["title"]} · 펫무브'.replace('"', '&quot;')
    out = re.sub(r'<meta name="description" content=".*?">', f'<meta name="description" content="{desc}">', out, count=1)
    out = re.sub(r'<meta property="og:type" content=".*?">', '<meta property="og:type" content="article">', out, count=1)
    out = re.sub(r'<meta property="og:title" content=".*?">', f'<meta property="og:title" content="{full_title}">', out, count=1)
    out = re.sub(r'<meta property="og:description" content=".*?">', f'<meta property="og:description" content="{desc}">', out, count=1)
    path = fr'{OUTDIR}\converted-{slug}.html'
    open(path, 'w', encoding='utf-8').write(out)
    return slug, leftover, path

if __name__ == '__main__':
    slugs = sys.argv[1:] or ['japan-pet-travel-guide', 'rabies-free-countries', 'dog-travel-to-thailand']
    for s in slugs:
        if s not in posts:
            print(f'  !! slug 없음: {s}'); continue
        slug, leftover, path = build(s)
        flag = ('  ⚠️ 남은 kg-*: ' + ', '.join(leftover)) if leftover else '  ✅ kg-* 잔여 없음'
        print(f'{slug}\n{flag}\n  -> {path}')
