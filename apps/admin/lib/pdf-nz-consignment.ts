import { documentOwnerNames, type CaseRow } from '@petmove/domain'

/** Call with the destination-flattened data used by the certificate itself. */
export function nzImporterName(row: CaseRow, data: Record<string, unknown>): string {
  const explicit = typeof data.nz_importer_name === 'string' ? data.nz_importer_name.trim() : ''
  // Preserve previously issued owner-as-importer certificates when no separate importer is entered.
  return explicit || documentOwnerNames(row, data, 'en')
}

/** An address is not evidence of the airport of entry. Missing airport stays blank. */
export function nzArrivalPort(value: unknown): string {
  if (typeof value !== 'string') return ''
  const airport = value.trim()
  if (/^(AKL|Auckland(?:\s+(?:International\s+)?Airport)?|오클랜드)(?:\s*\(AKL\))?$/i.test(airport)) {
    return 'Auckland Airport (AKL)'
  }
  if (/^(CHC|Christchurch(?:\s+(?:International\s+)?Airport)?|크라이스트처치)(?:\s*\(CHC\))?$/i.test(airport)) {
    return 'Christchurch Airport (CHC)'
  }
  return airport
}
