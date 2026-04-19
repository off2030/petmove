'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@supabase/supabase-js'
import { restoreCase, permanentDeleteCase } from '@/lib/actions/delete-case'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface TrashItem {
  id: string
  pet_name: string
  customer_name: string
  deleted_at: string
}

export function TrashModal({ onClose, onRestore }: { onClose: () => void; onRestore: () => void }) {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, startAction] = useTransition()
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('cases')
        .select('id, pet_name, customer_name, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      setItems((data ?? []) as TrashItem[])
      setLoading(false)
    }
    load()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleRestore(id: string) {
    startAction(async () => {
      const r = await restoreCase(id)
      if (r.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
        onRestore()
      }
    })
  }

  function handlePermanentDelete(id: string) {
    if (!confirm('영구 삭제하면 복구할 수 없습니다. 계속하시겠습니까?')) return
    startAction(async () => {
      const r = await permanentDeleteCase(id)
      if (r.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
      }
    })
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-md border-b">
          <h2 className="text-sm font-semibold">🗑️ 휴지통</h2>
          <button type="button" onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
        </div>

        {/* 검색 */}
        {items.length > 0 && (
          <div className="px-5 py-3 border-b">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색" autoFocus
              className="w-full h-9 rounded-md border border-border/50 bg-background px-sm text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30" />
          </div>
        )}

        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="px-5 py-2xl text-center text-sm text-muted-foreground">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-2xl text-center text-sm text-muted-foreground">휴지통이 비어 있습니다</div>
          ) : (
            <ul>
              {items.filter(item => {
                if (!query.trim()) return true
                const q = query.trim().toLowerCase()
                return item.customer_name.toLowerCase().includes(q) || item.pet_name.toLowerCase().includes(q)
              }).map(item => (
                <li key={item.id} className="flex items-center justify-between px-5 py-3 border-b border-border/30 last:border-0">
                  <div>
                    <span className="text-sm font-medium">{item.customer_name}</span>
                    <span className="text-sm text-muted-foreground ml-2">{item.pet_name}</span>
                    <span className="text-xs text-muted-foreground/60 ml-2">삭제 {formatDate(item.deleted_at)}</span>
                  </div>
                  <div className="flex items-center gap-sm">
                    <button type="button" onClick={() => handleRestore(item.id)} disabled={acting}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50">
                      복원
                    </button>
                    <button type="button" onClick={() => handlePermanentDelete(item.id)} disabled={acting}
                      className="text-xs text-muted-foreground/50 hover:text-red-500 transition-colors disabled:opacity-50">
                      영구삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
