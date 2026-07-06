# -*- coding: utf-8 -*-
"""전체 감사 — 공개글 78개를 전부 변환하고 문제를 전수 집계.
www_convert 재사용. 문제 있는 글만 리포트."""
import os, re
from bs4 import BeautifulSoup
import www_convert as C

OUT_IMG = r"C:\dev\petmove\docs\www-redesign\ghost-images"
D       = r"C:\dev\petmove\docs\www-redesign"

pub = [p for p in C.posts.values() if p.get('status') == 'published']

rows = []
buckets = {'ok': 0, 'interactive': 0, 'problem': 0}
for p in sorted(pub, key=lambda x: x['slug']):
    slug = p['slug']
    html = p.get('html') or ''
    interactive = '<script' in html
    slug2, leftover, path = C.build(slug)
    art = BeautifulSoup(open(path, encoding='utf-8').read(), 'html.parser').find('article')
    prose = art.select_one('.prose')
    txt = prose.get_text(' ', strip=True)

    issues = []
    if leftover:
        issues.append('kg잔여:' + ','.join(leftover))
    if '관련 블로그 포스트' in txt:
        issues.append('관련블로그잔여')
    # 끝부분 홍보 잔여만(인라인 정상 링크는 제외) — 마지막 3개 요소 안의 예약/연락 링크
    kids = [c for c in prose.contents if getattr(c, 'name', None)]
    tail = kids[-3:]
    tail_promo = sum(1 for el in tail for a in el.find_all('a', href=True)
                     if re.search(r'(naver\.me|booking\.naver|pf\.kakao|tel:)', a.get('href', '')))
    if tail_promo:
        issues.append(f'끝홍보잔여x{tail_promo}')
    if '[상품 카드' in txt:
        issues.append('상품카드')
    bm = len(prose.select('a.bookmark'))
    if bm:
        issues.append(f'본문북마크x{bm}')
    # 이미지 실존
    miss = 0
    for tag in prose.find_all('img', src=True):
        s = tag['src']
        if s.startswith('/content/images/'):
            if not os.path.exists(os.path.join(OUT_IMG, s.lstrip('/').replace('/', os.sep))):
                miss += 1
    if miss:
        issues.append(f'이미지없음x{miss}')

    if interactive:
        buckets['interactive'] += 1
        tag_ = 'INTERACTIVE'
    elif issues:
        buckets['problem'] += 1
        tag_ = 'PROBLEM'
    else:
        buckets['ok'] += 1
        tag_ = 'ok'
    if issues or interactive:
        rows.append((tag_, slug, '; '.join(issues) if issues else '(스크립트 포함 — 별도 재구현)'))

print(f'공개글 {len(pub)}개 감사')
print(f'  깨끗: {buckets["ok"]}   인터랙티브(별도): {buckets["interactive"]}   문제: {buckets["problem"]}')
print('\n=== 확인 필요한 글 ===')
for tag_, slug, msg in sorted(rows):
    print(f'  [{tag_:11}] {slug}')
    print(f'                {msg}')
