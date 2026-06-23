'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useConfirm } from '@petmove/ui'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { C, EditPageShell, SectionCard, OrgAvatar } from './settings-shared'
import {
  getPartnerOrgInfo,
  listAvailableOrgs,
  setVetOrg,
  setTransportOrg,
  unsetVetOrg,
  unsetTransportOrg,
  type PartnerOrg,
  type PartnerOrgInfo,
  type PartnerRole,
} from '@/lib/actions/partners'

/**
 * 담당 동물병원(/me/vet) / 운송업체(/me/agency) 공통 화면.
 *
 * role 별로 라벨·카탈로그 필터만 다르고 UI/로직 동일. 보호자 단위 통일 — 한 곳에서
 * 정하면 본인 모든 케이스에 일괄 적용. 첫 케이스의 org_id(담당 병원)/transport_org_id 로
 * 현재 연결 상태 표시(모든 케이스가 동일하게 유지된다는 통일 정책 전제).
 *
 * 흐름:
 *  - 미연결: '+ 동물병원/운송업체 연결' CTA → 바텀시트 → 선택 → setPartnerOrg
 *  - 연결됨: 현재 조직 표시 + [변경] / [연결 해제]
 *  - 'both' 조직은 양 카드 카탈로그에 노출, '병원·운송' 배지로 식별
 */

type RoleConfig = {
  title: string
  itemLabel: string
  connectLabel: string
  sheetTitle: string
  unsetMessage: string
}

const ROLE_CONFIG: Record<PartnerRole, RoleConfig> = {
  vet: {
    title: '담당 동물병원',
    itemLabel: '동물병원',
    connectLabel: '+ 동물병원 연결',
    sheetTitle: '동물병원 선택',
    unsetMessage: '담당 동물병원 연결을 해제하시겠습니까?',
  },
  transport: {
    title: '운송업체',
    itemLabel: '운송업체',
    connectLabel: '+ 운송업체 연결',
    sheetTitle: '운송업체 선택',
    unsetMessage: '운송업체 연결을 해제하시겠습니까?',
  },
}

// 펫무브 직영(platform) — 담당 병원 미정. org_id 가 이 값이면 미연결로 표시.
const PLATFORM_ORG_ID = '00000000-0000-0000-0000-000000000002'

export function PartnerEditView({
  role,
  initialOrgInfo = null,
}: {
  role: PartnerRole
  /** 서버(page)가 첫 렌더에 미리 읽어 넘긴 연락처 — client fetch 없이 즉시 표시. */
  initialOrgInfo?: PartnerOrgInfo | null
}) {
  const { cases, partners, refreshCases } = useCases()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [orgs, setOrgs] = useState<PartnerOrg[] | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const config = ROLE_CONFIG[role]

  // 통일 정책 — 모든 본인 케이스가 같은 값을 갖는다는 전제. 첫 케이스를 대표로.
  const currentOrgId = useMemo<string | null>(() => {
    const first = cases[0]
    if (!first) return null
    // 담당 병원 = org_id, 운송 = transport_org_id. 둘 다 platform = 담당 미정 → null.
    if (role === 'vet') {
      return first.org_id && first.org_id !== PLATFORM_ORG_ID ? first.org_id : null
    }
    return first.transport_org_id && first.transport_org_id !== PLATFORM_ORG_ID
      ? first.transport_org_id
      : null
  }, [cases, role])

  // 카탈로그(전체 병원 목록)는 '변경'·'연결' 바텀시트를 열 때만 필요 — 첫 진입에 안 불러온다.
  // (현재 연결 조직의 이름·아바타는 아래 partners 에서 즉시 표시하므로 카탈로그를 기다릴
  // 필요가 없다.) 시트를 처음 열 때 1회만 로드.
  useEffect(() => {
    if (!sheetOpen || orgs !== null) return
    let cancelled = false
    listAvailableOrgs(role).then((r) => {
      if (cancelled) return
      if (r.ok) setOrgs(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [sheetOpen, orgs, role])

  // 연결 조직의 이름·아바타는 CaseDataProvider 가 서버 초기 로드로 채운 partners 에서 바로
  // 읽는다 — 전체 카탈로그 fetch 를 기다리지 않아 페이지 진입 즉시 표시(빈 CTA 깜빡임 제거).
  const currentOrg = role === 'vet' ? partners.vet : partners.transport

  // 연결된 조직의 공개 연락 정보(주소·전화·네이버·카카오). 첫 값은 서버(page)가 넘긴
  // initialOrgInfo — 그래서 마운트 직후엔 다시 fetch 하지 않는다(상세 정보가 따로 늦게
  // 뜨던 단계 로딩 제거). 보호자가 이 화면에서 병원을 바꿔 currentOrgId 가 변할 때만 갱신.
  const [orgInfo, setOrgInfo] = useState<PartnerOrgInfo | null>(initialOrgInfo)
  const orgInfoSeeded = useRef(true)
  useEffect(() => {
    if (orgInfoSeeded.current) {
      orgInfoSeeded.current = false
      return // 서버가 넘긴 initialOrgInfo 가 현재 연결 조직을 이미 커버
    }
    if (!currentOrgId) {
      setOrgInfo(null)
      return
    }
    let cancelled = false
    getPartnerOrgInfo(role).then((r) => {
      if (cancelled) return
      if (r.ok) setOrgInfo(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [currentOrgId, role])

  async function handleSelect(orgId: string) {
    setSheetOpen(false)
    // 기존 담당이 있고 다른 조직으로 바꾸는 경우 — 이전 조직이 더 못 본다는 안내(확인).
    if (currentOrgId && currentOrgId !== orgId) {
      const ok = await confirm({
        message:
          role === 'vet'
            ? '현재 담당 동물병원이 더 이상 내 정보를 볼 수 없어요. 진행할까요?'
            : '현재 운송업체가 더 이상 내 정보를 볼 수 없어요. 진행할까요?',
        okLabel: '변경',
        variant: 'destructive',
      })
      if (!ok) return
    }
    startTransition(async () => {
      const action = role === 'vet' ? setVetOrg : setTransportOrg
      const result = await action(orgId)
      if (!result.ok) {
        alert(`오류: ${result.error}`)
        return
      }
      await refreshCases()
    })
  }

  async function handleUnset() {
    const ok = await confirm({
      message: config.unsetMessage,
      okLabel: '해제',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const action = role === 'vet' ? unsetVetOrg : unsetTransportOrg
      const result = await action()
      if (!result.ok) {
        alert(`오류: ${result.error}`)
        return
      }
      await refreshCases()
    })
  }

  return (
    <EditPageShell title={config.title} backHref="/me" backLabel="내 정보">
      {currentOrg ? (
        <>
          <SectionCard marginTop={8}>
            <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <OrgAvatar name={currentOrg.name} url={currentOrg.avatar_url} size={44} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: 16, fontWeight: 500, color: C.ink }}>
                    {currentOrg.name}
                  </span>
                  {currentOrg.org_type === 'both' && <BothBadge />}
                </div>
                {currentOrg.name_en && (
                  <div style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>
                    {currentOrg.name_en}
                  </div>
                )}
              </div>
            </div>
            {orgInfo && (orgInfo.address || orgInfo.phone || orgInfo.email) && (
              <div>
                {orgInfo.address && <InfoRow label="주소" value={orgInfo.address} />}
                {orgInfo.phone && <InfoRow label="전화" value={formatKoreanPhone(orgInfo.phone)} href={`tel:${orgInfo.phone}`} />}
                {orgInfo.email && <InfoRow label="이메일" value={orgInfo.email} href={`mailto:${orgInfo.email}`} />}
              </div>
            )}
            {orgInfo && (orgInfo.naverBookingUrl || orgInfo.kakaoChatUrl) && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  padding: '13px 0',
                  borderTop: `.5px solid ${C.line}`,
                }}
              >
                <span style={{ fontSize: 12, color: C.ink3, flexShrink: 0 }}>예약·문의</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 18 }}>
                  {orgInfo.naverBookingUrl && (
                    <ChannelLink kind="naver" href={orgInfo.naverBookingUrl} />
                  )}
                  {orgInfo.kakaoChatUrl && (
                    <ChannelLink kind="kakao" href={orgInfo.kakaoChatUrl} />
                  )}
                </span>
              </div>
            )}
          </SectionCard>

          <SectionCard>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={pending}
              style={{ ...actionButton, opacity: pending ? 0.5 : 1 }}
            >
              <span style={{ fontSize: 13, color: C.ink2 }}>변경</span>
              <span style={{ fontSize: 15, color: C.ink3 }}>›</span>
            </button>
            <button
              type="button"
              onClick={handleUnset}
              disabled={pending}
              style={{
                ...actionButton,
                borderTop: `.5px solid ${C.line}`,
                opacity: pending ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 13, color: C.warn }}>연결 해제</span>
              <span />
            </button>
          </SectionCard>
        </>
      ) : (
        <SectionCard marginTop={8}>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            disabled={pending}
            style={{
              ...actionButton,
              opacity: pending ? 0.5 : 1,
              padding: '18px 0',
              justifyContent: 'center',
              color: C.ink2,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {config.connectLabel}
          </button>
        </SectionCard>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={config.sheetTitle}
      >
        {orgs === null ? (
          <div style={{ padding: '24px 0', fontSize: 13, color: C.ink3, textAlign: 'center' }}>
            불러오는 중…
          </div>
        ) : orgs.length === 0 ? (
          <div style={{ padding: '24px 0', fontSize: 13, color: C.ink3, textAlign: 'center' }}>
            등록된 {config.itemLabel}가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
            {orgs.map((org) => {
              const selected = org.id === currentOrgId
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelect(org.id)}
                  disabled={pending}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 0',
                    borderBottom: `.5px solid ${C.line}`,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    opacity: pending ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                      minWidth: 0,
                    }}
                  >
                    <OrgAvatar name={org.name} url={org.avatar_url} size={32} />
                    <span
                      style={{
                        fontSize: 15,
                        color: C.ink,
                        fontWeight: selected ? 500 : 400,
                      }}
                    >
                      {org.name}
                    </span>
                    {org.org_type === 'both' && <BothBadge />}
                  </span>
                  {selected && <span style={{ fontSize: 13, color: C.ink3 }}>선택됨</span>}
                </button>
              )
            })}
          </div>
        )}
      </BottomSheet>
    </EditPageShell>
  )
}

/**
 * 연결된 조직의 연락 정보 한 줄 — 좌측 라벨 + 우측 값. 카드 상단 이름 블록과 .5px 디바이더로
 * 구분. href 가 있으면 값이 tel:/mailto: 링크(전화·이메일). 주소는 일반 텍스트.
 */
function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const valueStyle: CSSProperties = {
    fontSize: 13,
    color: href ? C.accent : C.ink,
    textAlign: 'right',
    wordBreak: 'break-word',
    textDecoration: 'none',
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        padding: '13px 0',
        borderTop: `.5px solid ${C.line}`,
      }}
    >
      <span style={{ fontSize: 12, color: C.ink3, flexShrink: 0 }}>{label}</span>
      {href ? (
        <a href={href} style={valueStyle}>
          {value}
        </a>
      ) : (
        <span style={valueStyle}>{value}</span>
      )}
    </div>
  )
}

/** 사용자가 스킴 없이 입력한 URL(예: "pf.kakao.com/...")도 안전하게 열리도록 https 보정. */
function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * 한국 전화번호 표시용 하이픈 포맷 — admin org-info-form 의 formatPhoneForSave 와 동일 규칙.
 * DB 에 하이픈 없이 저장된 값("028727588")도 화면에선 정규 형식("02-872-7588")으로.
 *  - 02 지역: 10자리 02-XXXX-XXXX / 9자리 02-XXX-XXXX
 *  - 그 외: 11자리 XXX-XXXX-XXXX / 10자리 XXX-XXX-XXXX
 *  - 매칭 실패(이미 +82·해외 등) 시 원본 보존.
 */
function formatKoreanPhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || /^\+/.test(trimmed)) return trimmed
  const d = trimmed.replace(/\D/g, '')
  if (d.startsWith('02')) {
    if (d.length === 10) return `02-${d.slice(2, 6)}-${d.slice(6)}`
    if (d.length === 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`
  }
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return trimmed
}

/**
 * 담당 병원의 외부 채널 연결 — 텍스트 링크 톤(옵션 3).
 * 색 박스 없이 정보 카드 안에 작은 브랜드 아이콘 + 라벨 + '›' 한 줄로. 가장 절제된 형태.
 * 새 탭으로 병원이 등록한 링크를 연다. URL 이 있는 채널만 렌더(호출부 가드).
 */
function ChannelLink({ kind, href }: { kind: 'naver' | 'kakao'; href: string }) {
  const brand =
    kind === 'naver'
      ? // 펫무브 '일정 완료' sage 그린을 본문 잉크와 살짝 섞어 한 톤 진하게.
        // (순수 --pm-sage 는 링크 글씨로 쓰기엔 옅어 가독성↓) 카카오와 명암을 맞춤.
        // sage·ink 둘 다 라이트/다크 자동 → 섞은 값도 자동.
        { fg: 'color-mix(in srgb, var(--pm-sage) 70%, var(--pm-ink))', label: '네이버예약' }
      : // 카카오 브랜드 브라운(#3C1E1E·붉은기) 대신 회갈색으로. ink-2 를 ink-3 쪽으로
        // 살짝 밝혀 네이버 sage 와 같은 중간 톤에서 만남. 라이트/다크 자동.
        { fg: 'color-mix(in srgb, var(--pm-ink-2) 70%, var(--pm-ink-3))', label: '카카오톡' }
  return (
    <a
      href={withScheme(href)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        textDecoration: 'none',
        color: brand.fg,
        fontSize: 13.5,
        fontWeight: 600,
        letterSpacing: '-0.01em',
      }}
    >
      {kind === 'naver' ? (
        <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1 }}>N</span>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3.5C6.8 3.5 2.5 6.9 2.5 11c0 2.6 1.8 4.9 4.5 6.3-.2.7-.7 2.5-.8 2.9-.1.4.2.55.45.42.3-.16 2.6-1.78 3.55-2.42.55.08 1.12.12 1.7.12 5.2 0 9.5-3.4 9.5-7.6S17.2 3.5 12 3.5z" />
        </svg>
      )}
      {brand.label}
      <span style={{ color: C.ink3, fontWeight: 400 }}>›</span>
    </a>
  )
}

function BothBadge() {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 7px',
        borderRadius: 999,
        background: C.soft,
        color: C.ink2,
        whiteSpace: 'nowrap',
      }}
    >
      병원·운송
    </span>
  )
}

const actionButton: CSSProperties = {
  width: '100%',
  padding: '13px 0',
  background: 'transparent',
  border: 'none',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'inherit',
}
