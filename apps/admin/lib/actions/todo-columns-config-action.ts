'use server'

import { revalidatePath } from 'next/cache'
import { saveTodoColumnsConfig, type TodoColumnsConfig } from '@/lib/todo-columns-config'

export async function saveTodoColumnsConfigAction(
  config: TodoColumnsConfig,
): Promise<{ ok: true; config: TodoColumnsConfig } | { ok: false; error: string }> {
  try {
    const saved = await saveTodoColumnsConfig(config)
    revalidatePath('/settings')
    revalidatePath('/inspections')
    revalidatePath('/import-reports')
    revalidatePath('/export-docs')
    return { ok: true, config: saved }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
