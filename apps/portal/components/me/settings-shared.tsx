'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { isSurfacePage } from '@/components/portal-shell/surface-page'
import { C } from '@/lib/palette'
import { PAGE_TOP, pageTitle, subTitle } from '@/lib/tokens'

/**
 * 설정 sub-page 공유 컴포넌트: 팔레트 / 헤더+뒤로 / 섹션 카드 / 하단 sticky 저장 바.
 * 원본 톤: components/cases/info-view.tsx 및 me/profile-view.tsx (Stone 팔레트).
 */

// 색 팔레트는 @/lib/palette 가 단일 출처. 여기선 re-export 만 (이 파일에서 C 를
// import 하던 기존 코드 호환). 색을 바꾸려면 globals.css 의 --pm-* 토큰만 고치면 됨.
export { C }

/** 제목·이름용 디스플레이 서체 — 앱 전체 단일 출처 (2026-07-12 타이포 정렬로 통합).
 *  journey/docs 계열 로컬 정의와 동일값(tabular-nums 포함 — 날짜·숫자 폭 고정). */
export const serif: CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  fontVariantNumeric: 'tabular-nums',
}

/** 숫자·식별자용 — 날짜, 카운트, 전화번호. */
export const num: CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 400,
}

/** 그룹 라벨(필드 묶음: 입력·첨부·알림·보호자 등) — 12/600/**ink2**.
 *  ink3 는 12px 대비 2.65:1 로 접근성 미달이라 ink2(~6:1)로 올림(2026-07-13, tokens.groupLabel 과 동일).
 *  화면 구획 제목은 이게 아니라 sectionTitle(16/600). */
export const monoCap: CSSProperties = {
  fontSize: 12,
  color: C.ink2,
  fontWeight: 600,
}

/**
 * 조직(담당 동물병원·운송업체) 아바타. 펫무브워크 조직정보에서 설정한 로고를 표시.
 * 보호자·반려동물(원형)과 구분하려 둥근 사각형(로고 톤). url 없으면 이름 이니셜 fallback.
 */
export function OrgAvatar({
  name,
  url,
  size = 40,
}: {
  name: string
  url?: string | null
  size?: number
}) {
  const radius = Math.round(size * 0.28)
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: 'cover',
          flexShrink: 0,
          background: C.soft,
          border: `.5px solid ${C.line}`,
        }}
      />
    )
  }
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: C.soft,
        color: C.ink2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.4),
        flexShrink: 0,
        ...serif,
      }}
    >
      {initial}
    </div>
  )
}

/** 좌측 화살표 + 라벨로 부모 페이지로 복귀. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        ...monoCap,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: C.ink2,
        textDecoration: 'none',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </Link>
  )
}

/**
 * sub-page 외곽 셸. 뒤로 + 타이틀 + 본문 + 하단 sticky bar 슬롯.
 * sticky bar 가 없으면 paddingBottom 작게.
 */
export function EditPageShell({
  backHref = '/me',
  backLabel = '내 정보',
  title,
  children,
  bottomBar,
  surface: surfaceProp,
}: {
  /** null 이면 뒤로가기 링크 미표시 — 탭 루트로 쓰는 페이지(설정=더보기 탭)용. */
  backHref?: string | null
  backLabel?: string
  title: string
  children: ReactNode
  bottomBar?: ReactNode
  /** 회색 캔버스 대신 흰 배경. 미지정 시 경로로 자동 판정(isSurfacePage — 설정·내 정보 하위). */
  surface?: boolean
}) {
  const hasBar = !!bottomBar
  const pathname = usePathname()
  const surface = surfaceProp ?? isSurfacePage(pathname)
  // (구) surface 일 때 <main> 을 직접 흰색으로 칠하던 핵은 제거 — TabHost 상주 구조에선
  // 화면이 언마운트되지 않아 원복 cleanup 이 안 돌고, 설정을 한 번 연 뒤 모든 회색 탭
  // 하단에 흰 띠가 남는 버그가 됐다(2026-07-13). 흰 배경은 이제 TabHost 의 pane/children
  // 컨테이너가 isSurfacePage 로 스스로 칠한다.
  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: surface ? C.surface : C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: PAGE_TOP,
        // hasBar: StickySaveBar(저장 버튼 + 하단 nav 공간 + safe-area)가 ~147px 까지 차지 —
        // 콘텐츠가 그 뒤로 가려지지 않게 safe-area 포함 넉넉히 확보(영문 주소 마지막 줄이 저장
        // 버튼에 가려지던 버그 수정).
        paddingBottom: hasBar ? 'calc(env(safe-area-inset-bottom, 0px) + 150px)' : 80,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {backHref && <BackLink href={backHref} label={backLabel} />}
        {/* 뒤로가기 있음 = 하위/상세 페이지 → subTitle(20). 없음 = 탭 루트(설정=더보기)
            → pageTitle(24). 하위 제목이 24로 너무 컸던 것 20 으로 내림(2026-07-13). */}
        <h1 style={backHref ? { ...subTitle, margin: '12px 0 0' } : pageTitle}>{title}</h1>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
      {hasBar && bottomBar}
    </div>
  )
}

/** mono-cap 라벨 + 라운드 surface 카드. label 없으면 카드만.
 *  plain=true 면 카드 껍데기(배경·테두리·라운드) 없이 행만 — 흰 배경 화면용.
 *  미지정 시 경로로 자동 판정(isSurfacePage 와 동일 규칙). */
export function SectionCard({
  label,
  children,
  marginTop = 24,
  plain: plainProp,
}: {
  label?: string
  children: ReactNode
  marginTop?: number
  plain?: boolean
}) {
  const pathname = usePathname()
  const plain = plainProp ?? isSurfacePage(pathname)
  return (
    <>
      {label && (
        <div
          style={{
            ...monoCap,
            marginTop,
            marginBottom: plain ? 2 : 10,
            padding: plain ? 0 : '0 4px',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={
          plain
            ? { marginTop: label ? 0 : marginTop }
            : {
                marginTop: label ? 0 : marginTop,
                background: C.surface,
                border: `.5px solid ${C.line}`,
                borderRadius: 18,
                padding: '2px 16px',
              }
        }
      >
        {children}
      </div>
    </>
  )
}

/**
 * 하단 sticky 저장 바 — bottom-nav 위에 떠 있음.
 * InfoView 패턴과 동일.
 */
export function StickySaveBar({
  dirty,
  status,
  error,
  onSave,
}: {
  dirty: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  error: string | null
  onSave: () => void
}) {
  const justSaved = status === 'saved' && !dirty
  const canSave = dirty && status !== 'saving'
  const stickyPathname = usePathname()
  const barRgbVar = isSurfacePage(stickyPathname) ? '--pm-surface-rgb' : '--pm-bg-rgb'

  // 모바일 키보드가 올라와도 저장 버튼은 항상 눌리게 한다.
  //
  // (구) 키보드가 뜨면 focusin, 내려가면 focusout 으로 감지해 바를 통째로 unmount 했는데,
  // 안드로이드에서 '시스템 뒤로가기'로 키보드를 내리면 input 이 blur 되지 않아 focusout 이
  // 안 뜬다 → keyboardOpen 이 true 로 박제 → 저장 버튼이 영영 사라진다(2026-07-13 심사
  // 데모 계정에서 발견). unmount 대신 visualViewport 로 키보드 높이를 재서 바를 그 위로 띄운다.
  // - 안드로이드(resizes-content): 키보드가 뜨면 layout viewport(innerHeight)도 함께 줄어
  //   inset≈0 → bottom:0 그대로 키보드 바로 위에 앉는다.
  // - iOS(WKWebView): innerHeight 는 그대로고 visualViewport.height 만 줄어 inset=키보드
  //   높이 → 그만큼 위로 띄운다. 어느 쪽이든 바는 사라지지 않는다.
  const [kbInset, setKbInset] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbInset(inset > 1 ? inset : 0) // 1px 미만 흔들림은 키보드 없음으로 간주
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  const keyboardUp = kbInset > 0

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: kbInset,
        paddingTop: 12,
        paddingLeft: 20,
        paddingRight: 20,
        // 키보드가 올라오면 하단 탭바가 숨으므로 탭바 자리(53px)는 뺀다.
        paddingBottom: keyboardUp ? 12 : 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + 53px)',
        // 흰 배경 화면에선 그라데이션도 흰색 기반 — 회색 띠 방지 (경로 자동 판정).
        background: `linear-gradient(180deg, rgb(var(${barRgbVar}) / 0) 0%, rgb(var(${barRgbVar}) / .92) 30%, rgb(var(${barRgbVar}) / .92) 100%)`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 39,
        pointerEvents: 'none',
      }}
    >
      {status === 'error' && (
        <div
          role="alert"
          style={{
            pointerEvents: 'auto',
            marginBottom: 8,
            padding: '9px 12px',
            borderRadius: 10,
            background: C.surface,
            border: `.5px solid color-mix(in srgb, ${C.danger} 33%, transparent)`,
            color: C.danger,
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          {error ?? '저장 실패'}
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        aria-live="polite"
        style={{
          pointerEvents: 'auto',
          width: '100%',
          padding: '14px 0',
          borderRadius: 14,
          border: 0,
          background: justSaved ? C.sage : canSave ? C.accent : C.line,
          color: justSaved || canSave ? '#fff' : C.ink3,
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          cursor: canSave ? 'pointer' : 'not-allowed',
          transition: 'background .15s, color .15s',
        }}
      >
        {status === 'saving' ? '저장 중…' : justSaved ? '✓ 저장됨' : '저장'}
      </button>
    </div>
  )
}
