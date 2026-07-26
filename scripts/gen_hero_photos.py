#!/usr/bin/env python
"""히어로 사진 등록 — 원본(Unsplash) → public/destinations/<key>-NN.webp + blur placeholder.

기존 사진들의 규격을 그대로 따른다(2026-07-26 확인값):
  · 폭 1600px 로 리사이즈(비율 유지), webp quality 80 → 파일당 대략 200~350KB
  · 파일명은 <key>-01.webp 부터, **원본 파일명 abc순**(timeline-calm.tsx 주석 규칙)
  · blur placeholder = 폭 16px webp 를 base64 data URI 로 (next/image placeholder="blur")

hero-blur-placeholders.ts 헤더가 가리키던 gen_blur_placeholders.py 가 리포에 없어서
(주석만 남아 있었다) 같은 역할을 이 스크립트로 복원한다 — 다음 목적지도 이걸 쓰면 된다.

Usage:
  python scripts/gen_hero_photos.py <src_dir> <key>
  예) python scripts/gen_hero_photos.py "C:/Users/off20/Desktop/스크린샷/목적지별 사진/괌" guam

출력: 변환한 파일 목록 + hero-blur-placeholders.ts 에 넣을 항목(정렬된 위치에 직접 삽입).
"""
import base64
import io
import sys
from pathlib import Path

from PIL import Image

# Windows 기본 콘솔(cp949)에서 한글·기호 출력이 죽지 않게 — 실행 결과를 못 보면 소용이 없다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WIDTH = 1600
QUALITY = 80
BLUR_WIDTH = 16
REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "apps" / "portal" / "public" / "destinations"
PLACEHOLDERS = REPO / "apps" / "portal" / "lib" / "hero-blur-placeholders.ts"


def convert(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=QUALITY, method=6)


def blur_uri(path: Path) -> str:
    im = Image.open(path).convert("RGB")
    im = im.resize((BLUR_WIDTH, max(1, round(im.height * BLUR_WIDTH / im.width))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=35, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def insert_placeholders(entries: dict[str, str]) -> int:
    """정렬 위치에 삽입(이미 있으면 갱신). 반환: 새로 넣은 개수."""
    text = PLACEHOLDERS.read_text(encoding="utf-8")
    lines = text.split("\n")
    added = 0
    for key, uri in entries.items():
        row = f'  "{key}": "{uri}",'
        existing = next((i for i, l in enumerate(lines) if l.startswith(f'  "{key}":')), None)
        if existing is not None:
            lines[existing] = row
            continue
        # 정렬 위치 — 사전순으로 처음 큰 항목 앞에.
        idx = next(
            (i for i, l in enumerate(lines) if l.startswith('  "/destinations/') and l.split('"')[1] > key),
            None,
        )
        if idx is None:  # 마지막 항목 뒤(닫는 중괄호 앞)
            idx = max(i for i, l in enumerate(lines) if l.startswith('  "/destinations/')) + 1
        lines.insert(idx, row)
        added += 1
    PLACEHOLDERS.write_text("\n".join(lines), encoding="utf-8")
    return added


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit("Usage: python scripts/gen_hero_photos.py <src_dir> <key>")
    src_dir, key = Path(sys.argv[1]), sys.argv[2]
    srcs = sorted(
        [p for p in src_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}],
        key=lambda p: p.name.lower(),
    )
    if not srcs:
        sys.exit(f"✗ 이미지가 없습니다: {src_dir}")

    entries: dict[str, str] = {}
    paths: list[str] = []
    for n, src in enumerate(srcs, start=1):
        dst = OUT_DIR / f"{key}-{n:02d}.webp"
        convert(src, dst)
        web = f"/destinations/{dst.name}"
        entries[web] = blur_uri(dst)
        paths.append(web)
        print(f"  {src.name}  →  {dst.name}  ({dst.stat().st_size // 1024}KB)")

    added = insert_placeholders(entries)
    print(f"\n✓ 사진 {len(srcs)}장 변환, blur placeholder {added}개 추가/{len(entries) - added}개 갱신")
    print("\ntimeline-calm.tsx 매니페스트에 넣을 목록:")
    for p in paths:
        print(f"    '{p}',")


if __name__ == "__main__":
    main()
