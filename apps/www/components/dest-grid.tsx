'use client'

// 랜딩 · 앱 지원 여행지 — 접힘(미리보기 + 더보기) ↔ 펼침(아시아 14 + 유럽 30 + 아메리카 6 +
// 오세아니아 2 + 기타 6) 토글. 목록·개수의 진실은 site-data.ts (domain appSupported 와 동기화).
//
// 접힘 상태 칸 수: 데스크톱 6(6열 한 줄) / 모바일 9(3열 세 줄). EXTRA 3개국이 모바일에서만 보인다.
// '더보기'는 격자 밖 가운데 링크다 — 격자 안에 두면 모바일이 10칸이 되어 넷째 줄에 혼자 남는다.
// 펼쳤을 때의 '접기'와 같은 자리·같은 모양이라 토글이 제자리에서 바뀐다.
import { useState } from 'react'
import {
  APP_DEST_PREVIEW,
  APP_DEST_PREVIEW_EXTRA,
  APP_DEST_ASIA,
  APP_DEST_EU,
  APP_DEST_AMERICA,
  APP_DEST_OCEANIA,
  APP_DEST_OTHER,
} from '@/lib/site-data'

function Dest({ name, mobileOnly }: { name: string; mobileOnly?: boolean }) {
  return (
    <div className={mobileOnly ? 'dest dest-m' : 'dest'}>
      {name}
      <span className="dot" />
    </div>
  )
}

export function DestGrid() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div>
        <div className="grid">
          {APP_DEST_PREVIEW.map((d) => (
            <Dest key={d} name={d} />
          ))}
          {APP_DEST_PREVIEW_EXTRA.map((d) => (
            <Dest key={d} name={d} mobileOnly />
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <span
            className="dest-collapse"
            role="button"
            tabIndex={0}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOpen(true)
              }
            }}
          >
            <i className="ti ti-chevron-down" />
            더보기
          </span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="dest-region">아시아</div>
      <div className="grid" style={{ marginTop: 0 }}>
        {APP_DEST_ASIA.map((d) => (
          <Dest key={d} name={d} />
        ))}
      </div>
      <div className="dest-region">유럽 30개국</div>
      <div className="grid" style={{ marginTop: 0 }}>
        {APP_DEST_EU.map((d) => (
          <Dest key={d} name={d} />
        ))}
      </div>
      <div className="dest-region">아메리카</div>
      <div className="grid" style={{ marginTop: 0 }}>
        {APP_DEST_AMERICA.map((d) => (
          <Dest key={d} name={d} />
        ))}
      </div>
      <div className="dest-region">오세아니아</div>
      <div className="grid" style={{ marginTop: 0 }}>
        {APP_DEST_OCEANIA.map((d) => (
          <Dest key={d} name={d} />
        ))}
      </div>
      <div className="dest-region">그 외</div>
      <div className="grid" style={{ marginTop: 0 }}>
        {APP_DEST_OTHER.map((d) => (
          <Dest key={d} name={d} />
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <span
          className="dest-collapse"
          role="button"
          tabIndex={0}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        >
          <i className="ti ti-chevron-up" />
          접기
        </span>
      </div>
    </div>
  )
}
