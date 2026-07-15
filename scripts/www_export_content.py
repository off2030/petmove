# -*- coding: utf-8 -*-
"""고스트 export → apps/www/content/{docs,blog}/<slug>.json (Next.js 글 데이터).

www_convert.py 의 변환 규칙(convert_body)을 그대로 재사용하고, standalone HTML 대신
Next 라우트가 렌더할 필드(JSON)를 출력한다:
  { slug, kind, title, description, category, updated, minutes, feature_image, html }
html = 커버 이미지 + 인트로 콜아웃 + 변환 본문 + '유용한 자료'(도구 링크) — prose 내부 전체.

대상 = 라이브 sitemap 의 docs 40 + blog 29 (URL 보존 대상 69). 실행:
  python scripts/www_export_content.py
인터랙티브 2글(scheduler·self-check)은 도구가 Ghost 안에서 돌던 것이라 본문 위에
'도구 이전 중' 안내 콜아웃을 삽입한다(재구현은 백로그 — HANDOFF 참조).
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from www_convert import convert_body, fmt_date, posts, tag_by_post  # noqa: E402
from www_lib import norm_image  # noqa: E402

OUT_ROOT = r"C:\dev\petmove\apps\www\content"

# 도구(인터랙티브) 글 — Ghost 테마 JS 로 돌던 페이지. innerHTML 로는 스크립트가 실행되지
# 않으므로 본문만 이관하고 안내를 붙인다.
INTERACTIVE = {"japan-pet-entry-scheduler", "japan-pet-entry-self-check"}
INTERACTIVE_NOTE = (
    '<div class="callout-note"><span class="ce">🛠️</span>'
    "이 페이지의 자동 계산 도구는 새 사이트로 이전 중이에요. "
    '같은 기능(일정 자동 계산·알림)은 <a href="/#download">펫무브 앱</a>에서 사용할 수 있어요.</div>'
)


def live_slugs():
    """라이브 sitemap 스냅샷(69 URL)에서 (kind, slug) 목록."""
    snap = os.path.join(
        os.environ.get("TEMP", ""),
        "claude",
        "C--dev-petmove",
        "0841997b-f106-43ee-a9e5-b7503fba7e1a",
        "scratchpad",
        "live-urls.txt",
    )
    out = []
    for line in io.open(snap, encoding="utf-8"):
        m = re.match(r"https://www\.petmove\.co\.kr/(docs|blog)/([a-z0-9-]+)/\s*$", line)
        if m:
            out.append((m.group(1), m.group(2)))
    return sorted(set(out))


def emit(kind, slug):
    p = posts[slug]
    body, leftover, tools = convert_body(p.get("html") or "")

    # 카테고리 = 첫 공개 태그. '#docs' 같은 내부 태그(#-접두)는 노출용이 아니라 제외.
    cats = [c for c in tag_by_post.get(p["id"], []) if c and not c.startswith("#")]
    cat = cats[0] if cats else "가이드"
    date = fmt_date(p.get("updated_at") or p.get("published_at"))
    mins = max(3, len(p.get("plaintext") or "") // 900)

    cover = ""
    if p.get("feature_image"):
        cover = f'<img class="art-cover" src="{norm_image(p["feature_image"])}" alt="{p["title"]}">\n'
    # 인트로 콜아웃 = 의미 있는 excerpt 일 때만. 제목과 같거나 10자 미만(괌 사례: excerpt="괌")은
    # 정보가 없어 콜아웃을 만들지 않는다.
    excerpt = (p.get("custom_excerpt") or "").strip()
    meaningful_excerpt = excerpt and excerpt != p["title"].strip() and len(excerpt) >= 10
    intro = f'<div class="callout-note">{excerpt}</div>\n' if meaningful_excerpt else ""
    notice = INTERACTIVE_NOTE + "\n" if slug in INTERACTIVE else ""

    info = ""
    if tools:
        rows = ""
        for t in tools:
            rows += (
                f'\n      <a href="{t["href"]}">'
                f'<span class="it">{t["title"]} <i class="ti ti-arrow-right"></i></span>'
                f'<span class="id">{t["desc"]}</span></a>'
            )
        info = f'\n<h2>유용한 자료</h2>\n<div class="info-list">{rows}\n</div>\n'

    # 메타 설명도 같은 기준 — 무의미한 excerpt 면 본문 첫 150자로 대체.
    desc = excerpt if meaningful_excerpt else ""
    if not desc:
        desc = re.sub(r"\s+", " ", (p.get("plaintext") or "")).strip()[:150]
        desc = re.sub(r"\s+\S*$", "", desc)
        desc = re.sub(r"\s*\d+\.?$", "", desc) + "…"
    # BOM·zero-width 등 비가시 문자 제거 (괌 글 plaintext 가 U+FEFF 로 시작하던 사례)
    desc = re.sub("[​‌‍⁠﻿]", "", desc).strip()

    data = {
        "slug": slug,
        "kind": kind,
        "title": p["title"],
        "description": desc,
        "category": cat,
        "updated": date,
        "minutes": mins,
        "feature_image": norm_image(p["feature_image"]) if p.get("feature_image") else None,
        "html": cover + intro + notice + body + info,
    }
    out_dir = os.path.join(OUT_ROOT, kind)
    os.makedirs(out_dir, exist_ok=True)
    with io.open(os.path.join(out_dir, f"{slug}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return leftover


if __name__ == "__main__":
    targets = live_slugs()
    assert len(targets) == 69, f"live sitemap 스냅샷이 69개가 아님: {len(targets)}"
    missing, warned = [], []
    for kind, slug in targets:
        if slug not in posts:
            missing.append(f"{kind}/{slug}")
            continue
        leftover = emit(kind, slug)
        if leftover:
            warned.append(f"{kind}/{slug}: {', '.join(leftover)}")
    print(f"emitted {len(targets) - len(missing)}/{len(targets)} → {OUT_ROOT}")
    if missing:
        print("!! export 에 없는 slug:", ", ".join(missing))
    if warned:
        print("⚠️ kg-* 잔여:")
        for w in warned:
            print("  ", w)
