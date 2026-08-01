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

동기화(prune) 모드:
  python scripts/gen_hero_photos.py --prune          # 명단 밖 항목 제거 + 누락 리포트
  python scripts/gen_hero_photos.py --prune --fill   # + 누락 항목을 public 파일로부터 생성

  hero-blur-placeholders.ts 를 timeline-calm.tsx 의 DEST_PHOTO_CANDIDATES(실사용 후보
  명단)와 동기화한다 — 명단에 없는 항목은 제거(client 번들 크기). --fill 을 붙이면
  명단에 있는데 항목이 없는 사진의 blur 도 public/destinations 파일로부터 생성해
  추가한다(blur 없는 키는 앱이 placeholder="empty" 로 안전 폴백하므로 필수는 아님 —
  번들이 커지는 만큼 의도적으로 옵션). 사진 검수로 후보 명단이 바뀌면 --prune 한 번.
  (public 의 이미지 파일 자체는 검수 대기 자산일 수 있으므로 여기서 절대 삭제하지 않는다.)
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


TIMELINE = REPO / "apps" / "portal" / "components" / "journey" / "timeline-calm.tsx"


def candidate_paths() -> set[str]:
    """timeline-calm.tsx 의 DEST_PHOTO_CANDIDATES 블록에 나열된 사진 경로 전부."""
    import re

    text = TIMELINE.read_text(encoding="utf-8")
    start = text.index("const DEST_PHOTO_CANDIDATES")
    # 블록 끝 = 열림 `{` 이후 컬럼 0 의 닫는 `}` (파일 구조상 유일한 안전 경계).
    end = text.index("\n}", start)
    return set(re.findall(r"'(/destinations/[^']+)'", text[start:end]))


def prune(fill: bool = False) -> None:
    """placeholder 파일을 DEST_PHOTO_CANDIDATES 와 동기화 — 명단 밖 제거(+옵션: 누락 생성)."""
    used = candidate_paths()
    if not used:
        sys.exit("✗ DEST_PHOTO_CANDIDATES 를 찾지 못했습니다 — timeline-calm.tsx 구조 확인 필요")

    lines = PLACEHOLDERS.read_text(encoding="utf-8").split("\n")
    kept: list[str] = []
    removed = 0
    have: set[str] = set()
    for line in lines:
        if line.startswith('  "/destinations/'):
            key = line.split('"')[1]
            if key not in used:
                removed += 1
                continue
            have.add(key)
        kept.append(line)
    PLACEHOLDERS.write_text("\n".join(kept), encoding="utf-8")

    # 명단에 있는데 placeholder 가 없는 사진 — --fill 이면 public 파일로부터 생성해 채움.
    missing = sorted(used - have)
    entries: dict[str, str] = {}
    unresolved: list[str] = []
    if fill:
        for web in missing:
            src = REPO / "apps" / "portal" / "public" / web.lstrip("/")
            if src.exists():
                entries[web] = blur_uri(src)
            else:
                unresolved.append(web)
        if entries:
            insert_placeholders(entries)

    print(f"✓ 후보 명단 {len(used)}개 기준 — 유지 {len(have)}개, 제거 {removed}개, 신규 생성 {len(entries)}개")
    if not fill and missing:
        print(f"  ℹ blur 없는 후보 {len(missing)}개 (placeholder=\"empty\" 폴백, 필요하면 --fill)")
    for w in unresolved:
        print(f"  ⚠ 후보 명단에 있는데 public 에 파일이 없음: {w}")


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "--prune":
        prune(fill="--fill" in sys.argv[2:])
        return
    if len(sys.argv) < 3:
        sys.exit("Usage: python scripts/gen_hero_photos.py <src_dir> <key>  |  --prune [--fill]")
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
