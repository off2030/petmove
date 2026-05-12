import Link from 'next/link'
import { getMyCase } from '@/lib/actions/cases'
import { buildJourney } from '@/lib/journey/scenario'
import { TimelineCalm } from '@/components/journey/timeline-calm'

export const dynamic = 'force-dynamic'

/**
 * 케이스별 여정 — /cases/<id>/journey.
 *
 * layout 이 case 유효성 보장. 여기서는 단건만 다시 fetch (React cache dedupe).
 */
export default async function CaseJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getMyCase(id)

  if (!result.ok) return <ErrorState message={result.error} />
  if (!result.value) return <EmptyState />

  const data = buildJourney(result.value)
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
