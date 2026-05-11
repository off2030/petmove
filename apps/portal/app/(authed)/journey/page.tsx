import Link from 'next/link'
import { listMyCases } from '@/lib/actions/cases'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'

export const dynamic = 'force-dynamic'

/**
 * 여정 (/journey) — 보호자 4탭 중 첫 화면.
 *
 * MVP 정책:
 *   - 보호자 본인에게 링크된 케이스 중 가장 최근(updated_at) 1건 표시.
 *   - 케이스 0건: 신청서 안내. case_customer_links 백필 직후라면 곧 매칭될 수 있다는 안내.
 *   - 다묘다견·동시 출국은 Phase 11.4 가족 계정 시점.
 */
export default async function JourneyPage() {
  const result = await listMyCases()

  if (!result.ok) {
    return <ErrorState message={result.error} />
  }
  const cases = result.value
  if (cases.length === 0) {
    return <EmptyState />
  }

  const data = buildJourney(cases[0])
  return <TimelineCalm data={data} />
}

function EmptyState() {
  return (
    <div
      className="pm-fade-up"
      style={{
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 14,
      }}
    >
      <h1
        style={{
          fontFamily: "'Fraunces', 'Pretendard Variable', serif",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: '32px 0 0',
        }}
      >
        아직 진행 중인 여정이 없습니다
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: '#6B6457', maxWidth: 320 }}>
        반려동물 출국을 준비 중이신가요? 신청서를 작성하시면 담당 수의사가 검토 후 여정을
        준비해 드립니다. 이미 펫무브워크에서 진행 중이라면 같은 이메일로 가입 시 자동
        연결됩니다.
      </p>
      <Link
        href="/apply"
        style={{
          marginTop: 12,
          padding: '11px 22px',
          borderRadius: 999,
          background: '#B89968',
          color: '#FBF7F1',
          fontSize: 13.5,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          textDecoration: 'none',
        }}
      >
        신청서 작성
      </Link>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: '#A04525' }}>여정을 불러오지 못했습니다.</p>
      <p style={{ fontSize: 12, color: '#9A9286', marginTop: 8 }}>{message}</p>
    </div>
  )
}
