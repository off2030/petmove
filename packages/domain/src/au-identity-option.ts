/**
 * 호주 마이크로칩 인증(Identity verification) 경로 — 추가정보 'ID' 선택값.
 *
 * 호주 건강증명서 Declaration 1번은 세 문장 중 하나만 남기고 나머지를 지운다
 * ("Strike through as required"). 어느 문장이 남느냐가 곧 증명서 양식이다:
 *   · 'id'       — ID 인증을 받음(출국 180일 전 이상). 날짜 = 인증일.      → AU   / AU_Cat
 *   · 'exported' — 호주에서 수출돼 온 동물이라 인증 불필요. 날짜 = 호주 출국일. → AU_2 / AU_Cat_2
 *   · 'none'     — 인증 없이 출국(계류 연장 감수). 날짜 없음.                → AU_3 / AU_Cat_3
 *
 * 날짜는 경로와 상관없이 같은 `id_date` 칸에 둔다 — AU_2 가 원래 id_date 를 '호주 출국일'
 * 줄에 찍어 왔고, 운영자 입력칸을 하나로 유지하기 위해서다. 그래서 id_date 를 '인증일'로
 * 해석하는 검증(au.microchip-before-identity-check 등)은 'id' 경로에서만 돌아야 한다.
 *
 * 값이 없으면(옵션 도입 전 케이스) 'id' 로 본다 — 예전 AU 버튼의 기본 동작과 같다.
 */

import { readScopedWithLegacyFallback } from './destination-scoped-fields'

export const AU_ID_OPTION_KEY = 'id_option'

export type AuIdOption = 'id' | 'exported' | 'none'

const AU_ID_OPTIONS: readonly AuIdOption[] = ['id', 'exported', 'none']

/** 저장된 경로. 미선택·알 수 없는 값이면 'id'. */
export function readAuIdOption(
  data: Record<string, unknown> | null | undefined,
  destination: string | null | undefined,
): AuIdOption {
  const v = readScopedWithLegacyFallback(data, destination, AU_ID_OPTION_KEY)
  return typeof v === 'string' && (AU_ID_OPTIONS as readonly string[]).includes(v)
    ? (v as AuIdOption)
    : 'id'
}

/** 'AU' | 'AU_Cat' 버튼 → 경로에 맞는 실제 양식 키. 호주 양식이 아니면 그대로 돌려준다. */
export function resolveAuCertFormKey(formKey: string, option: AuIdOption): string {
  if (formKey !== 'AU' && formKey !== 'AU_Cat') return formKey
  if (option === 'exported') return `${formKey}_2`
  if (option === 'none') return `${formKey}_3`
  return formKey
}
