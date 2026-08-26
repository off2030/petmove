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
 * 내용의 축은 "화물은 왜 정해진 요금표가 없는가" — 부피(케이지 포함)와 노선이 비용을
 * 정하고 시기·경유가 거기에 얹히기 때문에 표로 만들 수가 없다. 그래서 견적이 필요하고,
 * 그 설명이 곧 업체 연락의 이유가 된다. (요금표를 억지로 만들면 부정확해서 신뢰만 깎인다.)
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

const boxStyle: React.CSSProperties = {
  background: C.surface,
  border: `.5px solid ${C.line}`,
  borderRadius: 16,
  padding: '14px 16px',
}

/** 운송 방식 3갈래 — 어떤 경우에 업체가 필요한지 가르는 기준. */
const WAYS: { label: string; body: string }[] = [
  {
    label: '기내 동반',
    body: '작은 반려동물을 보호자 좌석 발밑에 두고 갑니다. 항공사마다 무게·이동장 규격 기준이 있고, 요금도 정해져 있어요.',
  },
  {
    label: '위탁 수하물',
    body: '같은 비행기 화물칸에 보호자 수하물로 부칩니다. 이것도 항공사 요금표가 있어요.',
  },
  {
    label: '항공 화물',
    body: '보호자와 따로, 정식 화물로 보냅니다. 호주·뉴질랜드처럼 이 방법만 되는 나라도 있어요. 요금이 정해져 있지 않아 견적이 필요합니다.',
  },
]

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
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '6px 0 0', lineHeight: 1.5 }}>
          항공 화물로 보내야 한다면 운송업체를 통해 예약합니다. 비용이 어떻게 정해지는지와
          견적 받는 방법을 정리했어요.
        </p>

        {/* ── 세 갈래 ── */}
        <div style={{ ...monoCap, marginTop: 26, marginBottom: 10, padding: '0 4px' }}>
          가는 방법 세 가지
        </div>
        <div style={{ ...boxStyle, padding: '2px 16px' }}>
          {WAYS.map((w, i) => (
            <div
              key={w.label}
              style={{
                padding: '13px 0',
                borderBottom: i === WAYS.length - 1 ? 'none' : `.5px solid ${C.line}`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{w.label}</div>
              <div style={{ fontSize: 13, color: C.ink2, marginTop: 3, lineHeight: 1.55 }}>
                {w.body}
              </div>
            </div>
          ))}
        </div>

        {/* ── 화물에 요금표가 없는 이유 ── */}
        <div style={{ ...monoCap, marginTop: 26, marginBottom: 10, padding: '0 4px' }}>
          화물은 왜 정해진 요금이 없나
        </div>
        <div style={boxStyle}>
          <p style={{ margin: 0, fontSize: 13, color: C.ink2, lineHeight: 1.65 }}>
            화물 운임은 <strong style={{ color: C.ink }}>이동장을 포함한 부피</strong>와{' '}
            <strong style={{ color: C.ink }}>노선</strong>이 거의 다 정합니다. 같은 나라로 가도
            아이 몸집과 이동장 크기가 다르면 금액이 크게 달라져요. 여기에 시기(성수기)와 경유
            여부가 얹혀 조금씩 더 차이가 납니다.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: C.ink2, lineHeight: 1.65 }}>
            그래서 항공사 요금표처럼 미리 정리해 둘 수가 없습니다. 우리 아이 기준으로 견적을
            받아보셔야 정확한 금액을 알 수 있어요.
          </p>
        </div>

        {/* ── 견적 준비물 ── */}
        <div style={{ ...monoCap, marginTop: 26, marginBottom: 10, padding: '0 4px' }}>
          견적 받을 때 알려주실 것
        </div>
        <div style={{ ...boxStyle, padding: '4px 16px' }}>
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

        {/* ── 업체 ── */}
        <div style={{ ...monoCap, marginTop: 26, marginBottom: 10, padding: '0 4px' }}>
          운송을 대행하는 업체
        </div>
        <p style={{ fontSize: 13, color: C.ink2, margin: '0 4px 10px', lineHeight: 1.6 }}>
          펫무브와 계약 관계는 아니고, 공개된 대표 연락처를 안내해 드려요. 비용·조건은 업체에
          직접 확인해 주세요.
        </p>
        <TransportPartners source="app-guide" intro={false} />
      </div>
    </div>
  )
}
