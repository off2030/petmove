'use client'

import { useEffect, useState, useTransition } from 'react'
import { getCompanyInfo, updateCompanyInfo, resetCompanyInfo } from '@/lib/actions/company-info'
import type { VetInfo, VetInfoKey } from '@/lib/vet-info'

type Group = '병원 정보' | '수의사 정보'

interface FieldDef {
  key: VetInfoKey
  label: string
  group: Group
  type?: 'text' | 'textarea'
}

const FIELDS: FieldDef[] = [
  // 병원 정보
  { key: 'clinic_ko', label: '병원명', group: '병원 정보' },
  { key: 'clinic_en', label: '병원명 (영문)', group: '병원 정보' },
  { key: 'address_ko', label: '주소', group: '병원 정보', type: 'textarea' },
  { key: 'address_en', label: '주소 (영문)', group: '병원 정보', type: 'textarea' },
  { key: 'phone', label: '전화번호', group: '병원 정보' },
  { key: 'email', label: '이메일', group: '병원 정보' },

  // 수의사 정보
  { key: 'name_ko', label: '수의사', group: '수의사 정보' },
  { key: 'name_en', label: '수의사 (영문)', group: '수의사 정보' },
  { key: 'license_no', label: '면허번호', group: '수의사 정보' },
]

const GROUPS: Group[] = ['병원 정보', '수의사 정보']

export function CompanySection() {
  const [info, setInfo] = useState<VetInfo | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<VetInfoKey, string>>>({})
  const [savingKey, setSavingKey] = useState<VetInfoKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    getCompanyInfo().then((v) => {
      if (alive) setInfo(v)
    })
    return () => { alive = false }
  }, [])

  function valueOf(key: VetInfoKey): string {
    if (drafts[key] !== undefined) return drafts[key] ?? ''
    return info?.[key] ?? ''
  }

  function handleChange(key: VetInfoKey, v: string) {
    setDrafts((d) => ({ ...d, [key]: v }))
  }

  function handleSave(key: VetInfoKey) {
    if (!info) return
    const next = drafts[key]
    if (next === undefined || next === info[key]) {
      // 변경 없으면 draft 제거.
      setDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
      return
    }
    setSavingKey(key)
    setError(null)
    startTransition(async () => {
      const r = await updateCompanyInfo({ [key]: next } as Partial<VetInfo>)
      setSavingKey(null)
      if (r.ok) {
        setInfo(r.info)
        setDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
      } else {
        setError(r.error)
      }
    })
  }

  async function handleReset() {
    if (!confirm('회사 정보를 모두 기본값으로 되돌릴까요?')) return
    const r = await resetCompanyInfo()
    setInfo(r.info)
    setDrafts({})
  }

  if (!info) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm max-w-2xl">
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm max-w-2xl">
      {GROUPS.map((group) => (
        <section key={group} className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {group}
          </h3>
          <div className="space-y-3">
            {FIELDS.filter((f) => f.group === group).map((f) => {
              const dirty = drafts[f.key] !== undefined && drafts[f.key] !== info[f.key]
              const saving = savingKey === f.key
              return (
                <div key={f.key} className="grid grid-cols-1 md:grid-cols-[160px_1fr] items-start gap-2 md:gap-md">
                  <label className="text-base text-primary md:pt-2">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={valueOf(f.key)}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      onBlur={() => handleSave(f.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setDrafts((d) => { const { [f.key]: _, ...rest } = d; return rest })
                        }
                      }}
                      rows={2}
                      className={`w-full px-md py-2 border rounded-md bg-background text-base resize-y focus:outline-none focus:ring-1 focus:ring-ring ${
                        dirty ? 'border-primary' : 'border-border'
                      } ${saving ? 'opacity-60' : ''}`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={valueOf(f.key)}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      onBlur={() => handleSave(f.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') {
                          setDrafts((d) => { const { [f.key]: _, ...rest } = d; return rest })
                        }
                      }}
                      className={`w-full px-md py-2 border rounded-md bg-background text-base focus:outline-none focus:ring-1 focus:ring-ring ${
                        dirty ? 'border-primary' : 'border-border'
                      } ${saving ? 'opacity-60' : ''}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      <div className="pt-3 border-t border-border/60 flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-muted-foreground hover:text-red-500 transition-colors"
        >
          기본값으로 되돌리기
        </button>
      </div>
    </div>
  )
}
