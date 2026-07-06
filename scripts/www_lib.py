# -*- coding: utf-8 -*-
"""www 이식 공용 헬퍼 — 다운로더(www_download_images)와 변환기(www_convert)가
경로 정규화·파일명 단축을 동일하게 적용하도록 한 곳에서 관리."""
import re, hashlib

def relativize(u):
    """절대 도메인·__GHOST_URL__ 플레이스홀더 제거 -> 상대경로."""
    return re.sub(r'(https?://(www\.)?petmove\.co\.kr|__GHOST_URL__)', '', u or '')

def short_image_path(path, maxlen=60):
    """이미지 경로의 파일명이 너무 길면(윈도우 260자 제한·URL 안정성) 결정적 짧은 이름으로.
    같은 파일명은 size/thumbnail 등 어느 디렉터리에 있든 동일한 짧은 이름 -> 다운로드·변환 일치.
    /content/images 경로에만 적용(글 슬러그 링크는 건드리지 않음)."""
    if '/content/images/' not in path:
        return path
    m = re.match(r'(.*/)([^/]+)$', path)
    if not m:
        return path
    dirp, name = m.groups()
    if len(name) <= maxlen:
        return path
    if '.' in name:
        stem, _, ext = name.rpartition('.')
        return f'{dirp}img-{hashlib.md5(stem.encode("utf-8")).hexdigest()[:10]}.{ext}'
    return f'{dirp}img-{hashlib.md5(name.encode("utf-8")).hexdigest()[:10]}'

def norm_link(u):
    """글 본문 링크(<a href>)용 — 상대경로화만."""
    return relativize(u)

def norm_image(u):
    """이미지(src)용 — 상대경로화 + 긴 파일명 단축."""
    return short_image_path(relativize(u))
