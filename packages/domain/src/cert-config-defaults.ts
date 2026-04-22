/**
 * 목적지별 증명서(서류) 설정. client-safe 상수/타입.
 * 실제 load/save 는 @/lib/cert-config 에서 (서버 전용).
 */

import { EU_COUNTRIES } from './inspection-config-defaults'

export interface CertDefinition {
  key: string
  label: string
  type: 'single' | 'multi'
  /** 이 버튼을 표시할 동물 종. 생략 시 모든 종에서 표시. */
  species?: 'dog' | 'cat'
}

export interface CertRule {
  /** 그룹 표시명 (예: "유럽연합"). 단일 국가면 보통 생략. */
  label?: string
  /** 이 규칙이 적용되는 목적지 국가(1개 이상). */
  countries: string[]
  /** 디폴트에 더해 추가되는 증명서 키(1개 이상). */
  certs: string[]
}

export interface CertConfig {
  /** 모든 국가 공통 기본 증명서. */
  defaultCerts: string[]
  /** 국가별 추가 규칙. */
  rules: CertRule[]
}

/** 시스템이 지원하는 모든 증명서 유형. UI 선택 풀. */
export const ALL_CERTS: CertDefinition[] = [
  { key: 'form25', label: '별지25', type: 'single' },
  { key: 'form25AuNz', label: '별지25 EX', type: 'single' },
  { key: 'formAC', label: 'Form AC', type: 'single' },
  { key: 'formRE', label: 'Form RE', type: 'single' },
  { key: 'annexIII', label: 'EU (AnnexIII)', type: 'multi' },
  { key: 'ch', label: 'CH', type: 'single' },
  { key: 'uk', label: 'UK', type: 'multi' },
  { key: 'idDeclaration', label: 'ID Declaration', type: 'single' },
  { key: 'au', label: 'AU (개)', type: 'single', species: 'dog' },
  { key: 'au2', label: 'AU 2 (개)', type: 'single', species: 'dog' },
  { key: 'auCat', label: 'AU (고양이)', type: 'single', species: 'cat' },
  { key: 'auCat2', label: 'AU 2 (고양이)', type: 'single', species: 'cat' },
  { key: 'nz', label: 'NZ', type: 'single' },
  { key: 'ovd', label: 'OVD', type: 'single' },
  { key: 'formR11', label: 'R.11', type: 'single' },
  { key: 'vhc', label: 'VHC', type: 'single' },
  { key: 'sgp', label: 'SGP', type: 'single' },
  { key: 'aqs', label: 'AQS-279', type: 'single' },
]

/** 기본 설정. 기존 하드코딩 규칙(destination-config.ts)에서 이관. */
export const DEFAULT_CERT_CONFIG: CertConfig = {
  defaultCerts: ['form25', 'form25AuNz'],
  rules: [
    { countries: ['일본'], certs: ['formAC', 'formRE'] },
    { label: '유럽연합', countries: [...EU_COUNTRIES], certs: ['annexIII'] },
    { countries: ['스위스'], certs: ['annexIII', 'ch'] },
    { countries: ['영국'], certs: ['annexIII', 'uk'] },
    { countries: ['호주'], certs: ['idDeclaration', 'au', 'au2', 'auCat', 'auCat2'] },
    { countries: ['뉴질랜드'], certs: ['nz', 'ovd'] },
    { countries: ['태국'], certs: ['formR11'] },
    { countries: ['인도네시아'], certs: ['vhc'] },
    { countries: ['터키'], certs: ['vhc'] },
    { countries: ['싱가포르'], certs: ['sgp'] },
    { countries: ['하와이'], certs: ['aqs'] },
  ],
}

/**
 * 목적지(콤마 구분 가능) + config → 실제 표시할 증명서 목록.
 * 기본 증명서 + 매칭된 모든 규칙의 추가 증명서(중복 제거, 순서 유지).
 * species 지정 시 해당 종 전용 버튼만 포함.
 */
export function resolveCerts(
  destination: string | null | undefined,
  config: CertConfig,
  species?: string | null,
): CertDefinition[] {
  const keys: string[] = []
  for (const k of config.defaultCerts) if (!keys.includes(k)) keys.push(k)
  if (destination) {
    const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
    for (const d of dests) {
      for (const r of config.rules) {
        if (r.countries.includes(d)) {
          for (const k of r.certs) if (!keys.includes(k)) keys.push(k)
        }
      }
    }
  }
  const all = keys
    .map(k => ALL_CERTS.find(c => c.key === k))
    .filter((c): c is CertDefinition => !!c)
  if (!species) return all.filter(b => !b.species)
  return all.filter(b => !b.species || b.species === species)
}
