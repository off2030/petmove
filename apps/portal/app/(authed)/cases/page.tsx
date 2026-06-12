import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buildCaseJourneyContext } from '@petmove/domain'
import { listMyCases } from '@/lib/actions/cases'
import { hasJourney } from '@/lib/cases/journey-filter'

export const dynamic = 'force-dynamic'

/**
 * 내 케이스 목록 (/cases).
 *
 * - 0건: 신청서 안내 (Empty)
 * - 1건: 그 케이스의 /journey 로 즉시 redirect (다중 케이스 UI 불필요)
 * - 2건+: 카드 목록. 다묘다견 보호자 시나리오.
 */
export default async function CasesPage() {
  const result = await listMyCases()
  if (!result.ok) return <ErrorState message={result.error} />
  const cases = result.value
  // 여정(목적지) 있는 동물만 — 목적지 0개 동물은 '반려동물'(내 정보)엔 남지만 여정 목록엔 안 뜬다.
  const journeyCases = cases.filter(hasJourney)

  if (cases.length === 0) return <EmptyState />
  if (journeyCases.length === 0) return <NoJourneyState />
  if (journeyCases.length === 1) redirect(`/cases/${journeyCases[0].id}/journey`)

  return (
    <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1
        style={{
          fontFamily: 'var(--pm-font-display)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: '12px 0 16px',
        }}
      >
        내 여정
      </h1>
      {journeyCases.map((c) => {
        const petName = c.pet_name ?? '이름 미정'
        const tokens = (c.destination ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
        const tripTypeRaw = (c.data as Record<string, unknown> | null)?.trip_type
        const tripTypeByDest =
          tripTypeRaw && typeof tripTypeRaw === 'object' && !Array.isArray(tripTypeRaw)
            ? (tripTypeRaw as Record<string, 'round' | 'one_way'>)
            : {}
        const fallbackTripType = buildCaseJourneyContext(c).tripType
        return (
          <Link
            key={c.id}
            href={`/cases/${c.id}/journey`}
            style={{
              display: 'block',
              padding: '18px 18px',
              borderRadius: 14,
              background: 'var(--pm-surface)',
              textDecoration: 'none',
              color: 'var(--pm-ink)',
              border: '1px solid rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{petName}</div>
            {tokens.length > 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--pm-ink-2)',
                  marginTop: 4,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                {tokens.map((t, i) => {
                  const arrow = (tripTypeByDest[t] ?? fallbackTripType) === 'round' ? '⇄' : '→'
                  return (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {i > 0 && (
                        <span style={{ margin: '0 8px', color: 'var(--pm-ink-3)' }}>·</span>
                      )}
                      한국 {arrow} {t}
                    </span>
                  )
                })}
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="pm-fade-up"
      style={{
        // main 본문 영역(100dvh − 상단 safe+48 − 하단 88)을 채워 세로 중앙 정렬.
        minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 48px - 88px)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 18,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--pm-font-display)',
          fontSize: 21,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.4,
          margin: 0,
          color: 'var(--pm-ink)',
        }}
      >
        펫무브에 오신 것을 환영합니다
      </h1>
      <Link
        href="/apply"
        style={{
          padding: '11px 22px',
          borderRadius: 999,
          background: 'var(--pm-accent)',
          color: 'var(--pm-surface)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          textDecoration: 'none',
        }}
      >
        시작하기
      </Link>
    </div>
  )
}

/**
 * 동물(반려동물)은 있는데 여정(목적지)이 하나도 없을 때 — '내 여정' 탭의 빈 상태.
 * 동물이 0마리인 EmptyState(환영)와 구분. 목적지 추가 진입로는 내 정보 → 반려동물.
 */
function NoJourneyState() {
  return (
    <div
      className="pm-fade-up"
      style={{
        minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 48px - 88px)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 14,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--pm-font-display)',
          fontSize: 21,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.4,
          margin: 0,
          color: 'var(--pm-ink)',
        }}
      >
        아직 준비 중인 여정이 없어요
      </h1>
      <p style={{ fontSize: 14, color: 'var(--pm-ink-3)', margin: 0, lineHeight: 1.5 }}>
        목적지를 추가해보세요
      </p>
      <Link
        href="/me"
        style={{
          marginTop: 4,
          padding: '11px 22px',
          borderRadius: 999,
          background: 'var(--pm-accent)',
          color: 'var(--pm-surface)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          textDecoration: 'none',
        }}
      >
        반려동물 보기
      </Link>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 15, color: '#A04525' }}>여정을 불러오지 못했습니다.</p>
      <p style={{ fontSize: 12, color: 'var(--pm-ink-3)', marginTop: 8 }}>{message}</p>
    </div>
  )
}
