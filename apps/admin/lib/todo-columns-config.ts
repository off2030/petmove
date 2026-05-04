/**
 * Server-only load/save for todo columns config.
 * 클라이언트에서 import 하면 next/headers 트랜시티브 의존으로 빌드 에러.
 * 타입/메타/디폴트는 todo-columns-config-types.ts (client-safe).
 */
import 'server-only'
import {
  DEFAULT_TODO_COLUMNS_CONFIG,
  normalizeTodoColumnsConfig,
  type TodoColumnsConfig,
} from './todo-columns-config-types'

export type { TodoColumnsConfig }
export { DEFAULT_TODO_COLUMNS_CONFIG }

const APP_SETTINGS_KEY = 'todo_columns_config'

export async function loadTodoColumnsConfig(): Promise<TodoColumnsConfig> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const { getActiveOrgId } = await import('@/lib/supabase/active-org')
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle()
    if (data?.value) return normalizeTodoColumnsConfig(data.value)
    return DEFAULT_TODO_COLUMNS_CONFIG
  } catch {
    return DEFAULT_TODO_COLUMNS_CONFIG
  }
}

export async function saveTodoColumnsConfig(
  config: TodoColumnsConfig,
): Promise<TodoColumnsConfig> {
  const normalized = normalizeTodoColumnsConfig(config)
  const { createClient } = await import('@/lib/supabase/server')
  const { getActiveOrgId } = await import('@/lib/supabase/active-org')
  const supabase = await createClient()
  const orgId = await getActiveOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({
      org_id: orgId,
      key: APP_SETTINGS_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    })
  if (error) throw new Error(error.message)
  return normalized
}
