'use client'

// 랜딩 · 앱 지원 여행지 — 접힘(5+더보기) ↔ 펼침(아시아 10 + 유럽 30 + 아메리카 3 + 기타 2 = 45개국) 토글.
import { useState } from 'react'
import {
  APP_DEST_PREVIEW,
  APP_DEST_ASIA,
  APP_DEST_EU,
  APP_DEST_AMERICA,
  APP_DEST_OTHER,
} from '@/lib/site-data'

function Dest({ name }: { name: string }) {
  return (
    <div className="dest">
      {name}
      <span className="dot" />
    </div>
  )
}

export function DestGrid() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="grid">
        {APP_DEST_PREVIEW.map((d) => (
          <Dest key={d} name={d} />
        ))}
        <div
          className="dest soon"
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
          + 더보기
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
