'use client'

/**
 * 메시지 thread 의 영속 캐시.
 *
 * - in-memory Map(`cacheRef`) 은 페이지 새로고침 시 사라짐 → 첫 진입은 항상
 *   "불러오는 중…" 으로 보임.
 * - IDB 에 conv 별 마지막 fetch 결과를 저장하면 새로고침 후에도 즉시 표시
 *   가능. background refresh 는 기존과 동일.
 * - signed URL 만료(CHAT_FILE_URL_TTL) 후 cached file_url 은 깨질 수 있으나
 *   refresh 가 곧 새 URL 로 덮어씀. 사용자 클릭 직전 깜빡 사이에만 발생.
 */

import type { MessageRow, Participant } from '@/lib/actions/chat'

const DB_NAME = 'petmove-messages'
const DB_VERSION = 1
const STORE = 'conv-snapshots'

export type ConvSnapshot = {
  messages: MessageRow[]
  participants: Participant[]
  reads: Array<{ user_id: string; last_read_at: string }>
  pinned_message: MessageRow | null
  cachedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedConv(convId: string): Promise<ConvSnapshot | null> {
  try {
    const v = await withStore<ConvSnapshot | undefined>('readonly', (s) => s.get(convId))
    return v ?? null
  } catch {
    return null
  }
}

export async function setCachedConv(convId: string, snap: Omit<ConvSnapshot, 'cachedAt'>): Promise<void> {
  try {
    await withStore('readwrite', (s) =>
      s.put({ ...snap, cachedAt: Date.now() }, convId),
    )
  } catch {
    // 저장 실패는 silent — 캐시 부재로 동작은 됨.
  }
}

export async function deleteCachedConv(convId: string): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(convId))
  } catch {
    // ignore
  }
}

/** 모든 캐시 dump — prefetch 가 어떤 conv 까지 채워뒀는지 확인용 (사용처 없음, 디버깅). */
export async function listCachedConvIds(): Promise<string[]> {
  try {
    const keys = await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    return keys.map((k) => String(k))
  } catch {
    return []
  }
}
