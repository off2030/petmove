'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { useConfirm } from '@petmove/ui'
import { signOut, updateMyProfile } from '@/lib/actions/profile'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { C, EditPageShell, SectionCard } from '@/components/me/settings-shared'
import { ThemeSwitcher } from './theme-switcher'
import { collectReminders } from '@/lib/journey/reminders'
import {
  disableReminders,
  enableReminders,
  remindersEnabled,
  sendTestReminder,
  syncReminders,
} from '@/lib/native/local-reminders'

const DELETION_GRACE_DAYS = 7
const MS_PER_DAY = 24 * 3600 * 1000

/**
 * 앱 설정 (/settings) — 상단바 ⚙ 진입.
 * 등록 데이터(보호자·반려동물·여행 등)는 /me(내 정보), 여기는 앱 환경/계정/법적 항목.
 *   알림 · 화면(테마) · 약관·정책 · 지원 · 앱 정보 · 로그아웃 · 계정 삭제.
 * 톤: settings-shared 의 EditPageShell + SectionCard 재사용 (내 정보 탭과 동일).
 *
 * 옛 `/me/account` 페이지(이메일·알림·로그아웃 3 row) 는 폐기 — 이메일은 보호자 카드에
 * 이미 있고, 알림·로그아웃은 여기 톱레벨로 끌어올렸다. 계정 삭제 자리는 마련(준비 중).
 */

const ROW_PAD = '13px 0'
const SUPPORT_EMAIL = 'petmove@naver.com'

/** label 좌 + 우측 슬롯(값/쉐브론). 마지막이 아니면 하단 hairline. */
function Row({
  label,
  right,
  last,
}: {
  label: string
  right: ReactNode
  last?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: ROW_PAD,
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, color: C.ink2 }}>{label}</span>
      {right}
    </div>
  )
}

const chevron = <span style={{ fontSize: 15, color: C.ink3 }}>›</span>

/** 내부 라우트 이동 행. */
function LinkRow({ href, label, last }: { href: string; label: string; last?: boolean }) {
  return (
    <Link
      href={href}
      prefetch
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Row label={label} right={chevron} last={last} />
    </Link>
  )
}

/** 외부 링크(mailto 등) 행 — 라벨 좌, 주소(또는 값) + 쉐브론 우. 주소를 그대로 노출해 사용자가
 *  어디로 이동하는지 인지할 수 있게 한다. */
function ExtRow({
  href,
  label,
  value,
  last,
}: {
  href: string
  label: string
  value?: string
  last?: boolean
}) {
  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {value && (
        <span
          style={{
            fontSize: 13,
            color: C.ink3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }}
        >
          {value}
        </span>
      )}
      {chevron}
    </span>
  )
  return (
    <a href={href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <Row label={label} right={right} last={last} />
    </a>
  )
}

/** iOS 톤 on/off 스위치. on=accent 트랙, off=옅은 잉크 트랙. */
function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      style={{
        flexShrink: 0,
        width: 46,
        height: 28,
        borderRadius: 999,
        border: 0,
        padding: 3,
        cursor: disabled ? 'default' : 'pointer',
        background: on ? 'var(--pm-accent)' : 'rgb(var(--pm-ink-rgb) / .18)',
        opacity: disabled ? 0.55 : 1,
        transition: 'background .18s, opacity .18s',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: C.surface,
          boxShadow: '0 1px 3px rgba(0,0,0,.25)',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform .18s',
        }}
      />
    </button>
  )
}

/** 라벨 + 보조 설명(좌) + 스위치(우). 마지막이 아니면 하단 hairline. */
function ToggleRow({
  label,
  desc,
  on,
  disabled,
  onToggle,
  last,
}: {
  label: string
  desc?: string
  on: boolean
  disabled?: boolean
  onToggle: () => void
  last?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 14,
        padding: ROW_PAD,
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.ink2 }}>{label}</div>
        {desc && (
          <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 3, lineHeight: 1.45 }}>{desc}</div>
        )}
      </div>
      <Switch on={on} onClick={onToggle} disabled={disabled} />
    </div>
  )
}

export function SettingsView() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA
  const { profile, updateProfile, cases } = useCases()
  const confirm = useConfirm()
  const scheduledAt = profile?.deletion_scheduled_at ?? null

  // 일정 알림(로컬 알림) 토글 — 켜짐 여부는 기기 localStorage 플래그. 네이티브 앱 전용.
  const [remindersOn, setRemindersOn] = useState(false)
  const [remindersBusy, setRemindersBusy] = useState(false)
  const [remindersNote, setRemindersNote] = useState<string | null>(null)
  const [testNote, setTestNote] = useState<string | null>(null)
  useEffect(() => {
    // localStorage 는 SSR 에 없어 마운트 후 1회 읽어 동기화 — 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemindersOn(remindersEnabled())
  }, [])
  async function toggleReminders() {
    if (remindersBusy) return
    setRemindersBusy(true)
    setRemindersNote(null)
    if (remindersOn) {
      await disableReminders()
      setRemindersOn(false)
    } else {
      const res = await enableReminders()
      if (res.ok) {
        setRemindersOn(true)
        await syncReminders(collectReminders(cases, new Date()))
      } else if (res.reason === 'web') {
        setRemindersNote('알림은 설치형 앱(안드로이드·iOS)에서만 켤 수 있어요.')
      } else if (res.reason === 'denied') {
        setRemindersNote('기기 설정에서 알림 권한을 허용해야 켤 수 있어요.')
      } else {
        setRemindersNote('알림을 켜지 못했어요. 잠시 후 다시 시도해주세요.')
      }
    }
    setRemindersBusy(false)
  }
  async function testReminder() {
    setTestNote(null)
    const res = await sendTestReminder()
    if (res.ok) setTestNote('테스트 알림을 보냈어요 🔔')
    else if (res.reason === 'web') setTestNote('테스트는 설치형 앱에서만 돼요.')
    else if (res.reason === 'denied') setTestNote('기기 설정에서 알림 권한을 허용해야 테스트할 수 있어요.')
    else setTestNote('테스트 알림을 보내지 못했어요. 잠시 후 다시 시도해주세요.')
  }

  // 고급 토글 — customer_profiles 에 저장(계정 전체). 저장 중인 키만 disable.
  // 표시는 '긍정 기능 + 기본 ON' — DB 필드는 부정 플래그(free_input_mode/hide_step_descriptions,
  // 기본 false)라 토글 ON(기능 켜짐) = 필드 false 로 매핑한다(마이그레이션 불필요).
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const autoValidate = !(profile?.free_input_mode === true) // ON = 자동 검증 켜짐
  const showDesc = !(profile?.hide_step_descriptions === true) // ON = 설명문 표시
  async function setFeature(field: 'free_input_mode' | 'hide_step_descriptions', turnOn: boolean) {
    if (savingKey) return
    // 자동 검증 기능을 '끌' 때만 부드러운 안내 1회.
    if (field === 'free_input_mode' && !turnOn) {
      const ok = await confirm({
        message:
          '자동 검증 기능을 끄면 입력 제한과 경고 표시가 사라지고 정보를 자유롭게 입력할 수 있어요.\n안전한 준비를 위해서는 켜두시는 게 좋아요.',
        okLabel: '끌게요',
        cancelLabel: '그대로 둘게요',
      })
      if (!ok) return
    }
    setSavingKey(field)
    const dbValue = !turnOn // 부정 플래그 — 기능 ON = 필드 false
    const res = await updateMyProfile(
      field === 'free_input_mode' ? { free_input_mode: dbValue } : { hide_step_descriptions: dbValue },
    )
    if (res.ok) updateProfile(res.value)
    setSavingKey(null)
  }
  const daysLeft = scheduledAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(scheduledAt).getTime() + DELETION_GRACE_DAYS * MS_PER_DAY - Date.now()) /
            MS_PER_DAY,
        ),
      )
    : null

  return (
    <EditPageShell title="설정" backHref="/me" backLabel="내 정보">
      <SectionCard label="알림" marginTop={8}>
        <ToggleRow
          label="일정 알림"
          desc="다양한 일정 알림을 통해 실수 없이 준비하세요. 설치형 앱에서만 작동해요."
          on={remindersOn}
          disabled={remindersBusy}
          onToggle={toggleReminders}
          last={!remindersOn}
        />
        {remindersNote && (
          <div
            style={{ fontSize: 11.5, color: C.ink3, padding: '0 0 12px', lineHeight: 1.45 }}
          >
            {remindersNote}
          </div>
        )}
        {remindersOn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0 4px' }}>
            <button
              type="button"
              onClick={testReminder}
              style={{
                alignSelf: 'flex-start',
                background: 'transparent',
                border: `.5px solid ${C.line}`,
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 12.5,
                color: C.ink2,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              알림 테스트
            </button>
            <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.45 }}>
              알림 작동을 확인하세요. 화면을 잠그고 약 10초 기다리면 알림이 도착해요.
            </div>
            {testNote && (
              <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.45 }}>{testNote}</div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard label="화면">
        <div style={{ padding: '14px 0' }}>
          <ThemeSwitcher />
        </div>
      </SectionCard>

      <SectionCard label="고급">
        <ToggleRow
          label="일정 설명문 표시"
          desc="전체 일정 카드에 간략한 설명문을 표시해요."
          on={showDesc}
          disabled={savingKey === 'hide_step_descriptions'}
          onToggle={() => setFeature('hide_step_descriptions', !showDesc)}
        />
        <ToggleRow
          label="자동 검증 기능"
          desc="설정된 규칙에 따라 입력을 제한하고 경고를 표시해요. 중요한 실수를 예방할 수 있어요."
          on={autoValidate}
          disabled={savingKey === 'free_input_mode'}
          onToggle={() => setFeature('free_input_mode', !autoValidate)}
          last
        />
      </SectionCard>

      <SectionCard label="약관·정책">
        <LinkRow href="/terms" label="이용약관" />
        <LinkRow href="/privacy" label="개인정보 처리방침" last />
      </SectionCard>

      <SectionCard label="지원">
        <ExtRow href={`mailto:${SUPPORT_EMAIL}`} label="이메일" value={SUPPORT_EMAIL} last />
      </SectionCard>

      <SectionCard label="앱 정보">
        <Row
          label="버전"
          right={
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 15, color: C.ink2 }}>{version ? `v${version}` : '—'}</span>
              {gitSha && (
                <span style={{ fontSize: 11, color: C.ink3, fontVariantNumeric: 'tabular-nums' }}>
                  {gitSha}
                </span>
              )}
            </span>
          }
          last
        />
      </SectionCard>

      {/* 계정 — 로그아웃 + 계정 삭제. 단독 카드 두 개로 분리하던 것을 한 카드로 묶어
          마지막 라벨('앱 정보')이 시각적으로 흡수해 보이는 문제 해결. 계정 삭제 우측엔
          유예 중이면 'D-N 일 후 삭제 예정' 부제 노출. */}
      <SectionCard label="계정">
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: ROW_PAD,
              background: 'transparent',
              border: 'none',
              borderBottom: `.5px solid ${C.line}`,
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 13, color: C.ink2 }}>로그아웃</span>
            {chevron}
          </button>
        </form>
        <Link
          href="/settings/account-delete"
          prefetch
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <Row
            label="계정 삭제"
            right={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {daysLeft !== null && (
                  <span style={{ fontSize: 13, color: C.warn }}>
                    {daysLeft > 0 ? `${daysLeft}일 후 삭제 예정` : '오늘 삭제 예정'}
                  </span>
                )}
                {chevron}
              </span>
            }
            last
          />
        </Link>
      </SectionCard>
    </EditPageShell>
  )
}
