'use client'

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react'
import { useConfirm } from '@petmove/ui'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { C, EditPageShell, SectionCard, OrgAvatar } from './settings-shared'
import {
  listAvailableOrgs,
  setVetOrg,
  setTransportOrg,
  unsetVetOrg,
  unsetTransportOrg,
  type PartnerOrg,
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

export function PartnerEditView({ role }: { role: PartnerRole }) {
  const { cases, refreshCases } = useCases()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [orgs, setOrgs] = useState<PartnerOrg[] | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const config = ROLE_CONFIG[role]

  // 통일 정책 — 모든 본인 케이스가 같은 값을 갖는다는 전제. 첫 케이스를 대표로.
  const currentOrgId = useMemo<string | null>(() => {
    const first = cases[0]
    if (!first) return null
    // 담당 병원 = org_id (platform = 담당 미정 → null). 운송 = transport_org_id.
    if (role === 'vet') {
      return first.org_id && first.org_id !== PLATFORM_ORG_ID ? first.org_id : null
    }
    return first.transport_org_id
  }, [cases, role])

  // 카탈로그 fetch — 마운트 시 1회. 현재 연결 조직 이름·메타 표시에도 재사용.
  useEffect(() => {
    let cancelled = false
    listAvailableOrgs(role).then((r) => {
      if (cancelled) return
      if (r.ok) setOrgs(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [role])

  const currentOrg = useMemo<PartnerOrg | null>(() => {
    if (!currentOrgId || !orgs) return null
    return orgs.find((o) => o.id === currentOrgId) ?? null
  }, [currentOrgId, orgs])

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
