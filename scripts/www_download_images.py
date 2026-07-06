# -*- coding: utf-8 -*-
"""고스트 사진 재호스팅 백업 — export JSON이 참조하는 모든 /content/images 파일을
본인 사이트(www.petmove.co.kr)에서 내려받아 로컬에 구조 그대로 저장.
고스트 해지 전 안전 백업 + 나중에 (www) 앱 public 폴더로 이동."""
import json, re, os, sys, time
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from www_lib import relativize, short_image_path

JSON = r"C:\Users\off20\Downloads\pesmubeu.ghost.2026-07-06-13-32-13.json"
BASE = "https://www.petmove.co.kr"
OUT  = r"C:\dev\petmove\docs\www-redesign\ghost-images"   # 여기 아래에 content/images/... 구조로 저장
UA   = "Mozilla/5.0 (petmove-image-backup)"

def collect():
    d = json.load(open(JSON, encoding='utf-8'))
    posts = [p for p in d['db'][0]['data']['posts'] if p.get('status') == 'published']
    paths = set()
    for p in posts:
        if p.get('feature_image'):
            paths.add(relativize(p['feature_image']))
        for m in re.findall(r'(?:src|href)="([^"]*/content/images/[^"]+)"', p.get('html') or ''):
            paths.add(relativize(m))
    # /content/images 로 시작하는 것만
    return sorted(u for u in paths if u.startswith('/content/images/'))

def longpath(p):
    """윈도우 260자 제한 우회 확장 접두어."""
    return (chr(92) * 2 + '?' + chr(92) + p) if os.name == 'nt' else p

def download(path):
    url = BASE + path                          # 원본 경로에서 받아
    save = short_image_path(path)              # 짧은 경로로 저장(변환기와 동일 규칙)
    dest = os.path.join(OUT, save.lstrip('/').replace('/', os.sep))
    if os.path.exists(longpath(dest)) and os.path.getsize(longpath(dest)) > 0:
        return ('skip', path, os.path.getsize(longpath(dest)))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            with open(longpath(dest), 'wb') as f:
                f.write(data)
            return ('ok', path, len(data))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ('404', path, 0)
            time.sleep(1 + attempt)
        except Exception:
            time.sleep(1 + attempt)
    return ('fail', path, 0)

if __name__ == '__main__':
    paths = collect()
    print(f'대상 이미지: {len(paths)}개  → 저장 위치: {OUT}')
    results = {'ok': [], 'skip': [], '404': [], 'fail': []}
    total_bytes = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(download, p): p for p in paths}
        done = 0
        for fut in as_completed(futs):
            status, path, size = fut.result()
            results[status].append(path)
            total_bytes += size
            done += 1
            if done % 20 == 0:
                print(f'  {done}/{len(paths)} ...')
    print('\n=== 결과 ===')
    print(f'  성공(신규): {len(results["ok"])}')
    print(f'  이미 있음(건너뜀): {len(results["skip"])}')
    print(f'  없음(404): {len(results["404"])}')
    print(f'  실패: {len(results["fail"])}')
    print(f'  총 용량: {total_bytes/1024/1024:.1f} MB')
    for k in ('404', 'fail'):
        if results[k]:
            print(f'\n  [{k}] 목록:')
            for p in results[k][:40]:
                print('    ', p)
