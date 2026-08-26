'use client'

import { useRouter } from 'next/navigation'
import { C } from '@/lib/palette'
import { TransportPartners } from '@/components/journey/transport-partners'

/**
 * 운송업체 견적 안내 — 여정의 운송 예약 카드·가이드 글에서 링크로 진입하는 leaf 페이지.
 *
 * 존재 이유: 업체를 안내할 자리가 여러 곳(여정 카드·가이드·홈페이지)인데, 업체 정보를
 * 곳곳에 인라인으로 박아두면 업체가 바뀔 때마다 흩어진 곳을 다 고쳐야 한다. 목적지를
 * 하나로 두고 나머지는 전부 여기를 가리킨다.
 *
 * **검색 유입용 페이지가 아니다** — 링크로만 들어온다. 그래서 분량을 위한 분량을 두지
 * 않는다. 여기 오는 사람은 "화물로 보내야 한다"를 이미 읽고 눌러 온 사람이라, 운송 방식
 * 3갈래 설명 같은 건 아는 걸 되풀이하는 것이었다(2026-08-26 정리하며 삭제).
 * 남기는 것: 연락처 · 연락 전 준비물 · 왜 견적이 필요한지 한 문장.
 *
 * 화물 운임에 정해진 표가 없는 이유 = 이동장 포함 부피와 노선이 거의 다 정하고 시기·경유가
 * 얹히기 때문. 요금표를 억지로 만들면 부정확해서 신뢰만 깎이므로 넣지 않는다.
 */

const serif: React.CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
}

const monoCap: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.ink3,
  fontWeight: 500,
}

/** 견적 요청할 때 업체가 묻는 것들 — 미리 챙기면 한 번에 끝난다. */
const QUOTE_INPUTS: string[] = [
  '반려동물 종류·품종·몸무게',
  '이동장(케이지) 크기 — 가로·세로·높이',
  '출발 공항과 도착 도시',
  '희망 출국일 (또는 대략적인 시기)',
  '편도인지 왕복인지',
  '마이크로칩·광견병 백신 등 준비 상황',
]

export default function TransportQuoteScreen() {
  const router = useRouter()

  return (
    <div
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        paddingBottom: 40,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 20px' }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 0,
            padding: '6px 0',
            fontFamily: 'inherit',
            fontSize: 13,
            color: C.ink2,
            cursor: 'pointer',
          }}
        >
          ← 뒤로
        </button>

        <h1 style={{ ...serif, fontSize: 26, lineHeight: 1.15, margin: '8px 0 0', color: C.ink }}>
          운송업체 견적
        </h1>
        <p style={{ fontSize: 13, color: C.ink2, margin: '8px 0 0', lineHeight: 1.6 }}>
          항공 화물은 운송업체를 통해 예약해요. 운임은 이동장을 포함한 부피와 노선에 따라
          달라져서 정해진 표가 없어요. 우리 아이 기준으로 견적을 받아보셔야 해요.
        </p>

        {/* ── 업체 ── */}
        <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>
          운송을 대행하는 업체
        </div>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '0 4px 10px', lineHeight: 1.55 }}>
          펫무브와 계약 관계는 아니고, 공개된 대표 연락처예요.
        </p>
        <TransportPartners source="app-guide" intro={false} />

        {/* ── 연락 전 준비물 ── */}
        <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>
          연락하기 전에 챙길 것
        </div>
        <div
          style={{
            background: C.surface,
            border: `.5px solid ${C.line}`,
            borderRadius: 16,
            padding: '4px 16px',
          }}
        >
          {QUOTE_INPUTS.map((q, i) => (
            <div
              key={q}
              style={{
                display: 'flex',
                gap: 8,
                padding: '10px 0',
                borderBottom: i === QUOTE_INPUTS.length - 1 ? 'none' : `.5px solid ${C.line}`,
                fontSize: 13.5,
                color: C.ink,
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden style={{ color: C.ink3, flexShrink: 0 }}>·</span>
              <span>{q}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '10px 4px 0', lineHeight: 1.55 }}>
          대부분 펫무브에 이미 입력하신 내용이에요. 준비 화면에서 확인하고 그대로 알려주시면
          견적이 빨라집니다.
        </p>
      </div>
    </div>
  )
}
