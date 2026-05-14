import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listMyCases } from '@/lib/actions/cases'

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

  if (cases.length === 0) return <EmptyState />
  if (cases.length === 1) redirect(`/cases/${cases[0].id}/journey`)

  return (
    <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1
        style={{
          fontFamily: 'var(--pm-font-display)',
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: '12px 0 16px',
        }}
      >
        내 케이스
      </h1>
      {cases.map((c) => {
        const petName = c.pet_name ?? '이름 미정'
        const dest = c.destination ?? ''
        return (
          <Link
            key={c.id}
            href={`/cases/${c.id}/journey`}
            style={{
              display: 'block',
              padding: '18px 18px',
              borderRadius: 14,
              background: '#FBF7F1',
              textDecoration: 'none',
              color: '#2A2620',
              border: '1px solid rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{petName}</div>
            {dest && (
              <div style={{ fontSize: 13, color: '#6B6457', marginTop: 4 }}>
                한국 → {dest}
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
          fontFamily: 'var(--pm-font-display)',
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
      <p style={{ fontSize: 14, color: '#A04525' }}>케이스를 불러오지 못했습니다.</p>
      <p style={{ fontSize: 12, color: '#9A9286', marginTop: 8 }}>{message}</p>
    </div>
  )
}
