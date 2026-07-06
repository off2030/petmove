# -*- coding: utf-8 -*-
"""고스트 export JSON -> 새 본문 템플릿(article-sample.html) 변환 시제품.
MIGRATION-RULES.md 규칙을 실제 데이터에 적용. 한 개 이상 글을 골라 standalone HTML로 출력."""
import json, re, sys, io
from datetime import datetime
from bs4 import BeautifulSoup, NavigableString

JSON = r"C:\Users\off20\Downloads\pesmubeu.ghost.2026-07-06-13-32-13.json"
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
FOOT = tpl[tpl.index('    <div class="cta2">'):]   # cta2 + /article + footer + script

def relativize(href):
    # __GHOST_URL__ = 고스트 export가 내부 링크를 저장하는 플레이스홀더
    return re.sub(r'(https?://(www\.)?petmove\.co\.kr|__GHOST_URL__)', '', href or '')

def convert_body(html, soup_feature=None):
    soup = BeautifulSoup(html, 'html.parser')

    # 1. 연락 버튼 카드 제거
    for c in soup.select('.kg-button-card'):
        c.decompose()

    # 2. 북마크 카드 -> a.bookmark
    for fig in soup.select('figure.kg-bookmark-card'):
        a = fig.find('a')
        href = relativize(a.get('href')) if a else '#'
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
            im = soup.new_tag('img', src=relativize(thumb['src'])); im['class'] = 'bk-thumb'
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
        a = c.find('a'); href = relativize(a.get('href')) if a else '#'
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

    # 9. 넓은 표(4열+) -> .table-wrap
    for table in soup.find_all('table'):
        cols = max((len(tr.find_all(['td', 'th'])) for tr in table.find_all('tr')), default=0)
        if cols >= 4:
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

    # 12. 내부 링크·이미지 경로 정규화 (__GHOST_URL__ 제거)
    for a in soup.find_all('a', href=True):
        a['href'] = relativize(a['href'])
    for tag in soup.find_all(['img', 'iframe', 'source'], src=True):
        tag['src'] = relativize(tag['src'])

    # 13. 빈 문단 정리
    for p in soup.find_all('p'):
        if not p.get_text(strip=True) and not p.find(['img', 'iframe', 'br']):
            p.decompose()

    # 커버리지 체크: 남은 kg-* 있는지
    leftover = sorted(set(re.findall(r'kg-[a-z0-9-]+', str(soup))))
    return str(soup), leftover

def fmt_date(s):
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00')).strftime('%Y.%m.%d')
    except Exception:
        return ''

def build(slug):
    p = posts[slug]
    body, leftover = convert_body(p.get('html') or '')
    # art-head
    cats = [c for c in tag_by_post.get(p['id'], []) if c]
    cat = cats[0] if cats else '가이드'
    date = fmt_date(p.get('updated_at') or p.get('published_at'))
    mins = max(3, len(p.get('plaintext') or '') // 900)
    cover = ''
    if p.get('feature_image'):
        cover = f'<img class="art-cover" src="{relativize(p["feature_image"])}" alt="{p["title"]}">\n'
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
    prose = f'    <div class="prose">\n{cover}{intro}{body}\n    </div>\n'
    out = HEAD + '<article class="article">\n' + arthead + prose + FOOT
    # 제목 태그 교체
    out = re.sub(r'<title>.*?</title>', f'<title>{p["title"]} · 펫무브</title>', out, count=1)
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
