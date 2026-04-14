'use server'

import { readFile, writeFile, unlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PDFDocument, PDFDict, PDFName, PDFRef, PDFArray, PDFString, PDFHexString } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import {
  lookupRabies,
  lookupComprehensive,
  lookupCiv,
  lookupKennelCough,
  lookupParasiteCombo,
  lookupExternalParasite,
  lookupInternalParasite,
} from '@/lib/vaccine-lookup'
import path from 'path'
import os from 'os'

const execFileAsync = promisify(execFile)

/**
 * 영문 주소를 두 줄로 분리한다.
 * line1 = 도로명/번지 (street), line2 = 동/시/도/국가.
 * 분리 기준: 첫 콤마 이후가 행정 구역이라고 간주.
 *  ex) "3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea"
 *      → ["3, Gwanak-ro 29-gil", "Gwanak-gu, Seoul, Republic of Korea"]
 *  ex) "123 Main St, Springfield, IL, USA"
 *      → ["123 Main St", "Springfield, IL, USA"]
 * 한국 도로명주소처럼 앞부분이 "번지, 도로명"으로 시작하는 경우엔 첫 두 토큰을 합쳐서 첫 줄로 둔다.
 */
function splitStreetAndCity(addr: string): [string, string] {
  if (!addr) return ['', '']
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return [parts.join(', '), '']
  // 첫 토큰이 순수 숫자면 "번지, 도로명" 형태 → 두 토큰을 합쳐 street로
  const firstIsNumber = /^\d+(-\d+)?$/.test(parts[0])
  const splitIdx = firstIsNumber && parts.length >= 3 ? 2 : 1
  return [parts.slice(0, splitIdx).join(', '), parts.slice(splitIdx).join(', ')]
}

// EU/UK/AU 증명서의 표준 WinAnsi 폰트는 한글·비라틴 문자를 인코딩하지 못한다.
// 영문 폼에 비-WinAnsi 문자가 섞여 들어오면 PDF 저장이 실패하므로 제거한다.
function toWinAnsiSafe(v: string): string {
  // WinAnsi 범위 밖 문자(기본적으로 U+00FF 초과)는 버린다.
  const stripped = v.replace(/[^\x00-\xFF]/g, '')
  // 연속 공백 정리
  return stripped.replace(/\s+/g, ' ').trim()
}

// ── 병원 / 수의사 공통 상수 ──
const CLINIC_NAME    = 'Lausanne Veterinary Medical Center'
const CLINIC_PHONE   = '+82-2-872-7588'
const CLINIC_ADDRESS = '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea'
const VET_LICENSE    = '9608'
const VET_NAME       = 'Jinwon Lee'
const VET_ADDRESS    = '3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea'

// PDF 템플릿 → DB 필드 매핑 (별지 제25호서식 신양식)
function mapCaseToPdfFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const textFields: Record<string, string> = {}
  const checkboxFields: string[] = []

  // ── 소유자 ──
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  textFields.text_1glv = `${firstName} ${lastName}`.trim()          // 이름(Name)
  const phone = (d.phone as string) || ''
  textFields.text_71wojh = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')  // 전화번호
  textFields.text_72hnbw = (d.address_en as string) || ''            // 주소

  // ── 연령 / 생년월일 ──
  const birthDate = (d.birth_date as string) || ''
  if (birthDate) {
    const birth = new Date(birthDate)
    const now = new Date()
    let years = now.getFullYear() - birth.getFullYear()
    let months = now.getMonth() - birth.getMonth()
    if (now.getDate() < birth.getDate()) months--
    if (months < 0) { years--; months += 12 }
    textFields.text_18yimo = String(years)                            // 년(Years)
    textFields.text_19ugzc = String(months)                           // 개월(Months)
    textFields.text_20xyny = birthDate.replace(/-/g, '/')             // 생년월일
  }

  // ── 동물 정보 ──
  textFields.text_73xblc = (d.color_en as string) || ''              // 모색(Color/Marks)
  textFields.text_76vxyj = (c.pet_name_en as string) || ''           // 이름(Name)
  textFields.text_75omqf = (d.breed_en as string) || ''              // 품종(Breed)

  // ── 무게 ──
  const weight = Number(d.weight) || 0
  textFields.text_23fqef = weight ? String(weight) : ''              // kg 값
  if (weight > 0 && weight <= 5) checkboxFields.push('checkbox_11rdzs')       // 5kg 이하
  else if (weight <= 10) checkboxFields.push('checkbox_12gvbl')                // 5~10kg
  else if (weight > 10) checkboxFields.push('checkbox_13mffg')                 // 10kg 이상

  // ── 마이크로칩 ──
  const chipRaw = (c.microchip as string) || ''
  textFields.text_24etkk = formatMicrochip(chipRaw)                  // 마이크로칩 번호
  if (chipRaw) checkboxFields.push('checkbox_14wddu')                // 있음(Y)
  else checkboxFields.push('checkbox_15njpa')                        // 없음(N)
  textFields.text_25uhns = ((d.microchip_implant_date as string) || '').replace(/-/g, '/')  // 이식일

  // ── 종(Species) ──
  if (d.species === 'dog') checkboxFields.push('checkbox_4ujzf')     // 개(Dog)
  else if (d.species === 'cat') checkboxFields.push('checkbox_5qdvw') // 고양이(Cat)
  else checkboxFields.push('checkbox_6ezru')                          // 기타(Other)

  // ── 성별(Sex) ──
  const sexMap: Record<string, string> = {
    female:        'checkbox_7andd',   // 암(Female)
    male:          'checkbox_8sccm',   // 수(Male)
    spayed_female: 'checkbox_9pny',    // 중성 암(Neutered Female)
    neutered_male: 'checkbox_10rmua',  // 중성 수(Neutered Male)
  }
  if (sexMap[d.sex as string]) checkboxFields.push(sexMap[d.sex as string])

  // ── 광견병 예방접종 (최대 3행, 오래된 순) ──
  // 열: product(x≈120) | manufacturer(x≈210) | serial(x≈302) | date(x≈392) | 1Y/2Y/3Y(x≈446/474/502)
  const RABIES_FIELDS = [
    { product: 'text_26hjhu', mfr: 'text_32zofi', serial: 'text_38qdpg', date: 'text_44xgdx', y1: 'checkbox_53evfq', y2: 'checkbox_61xmsq', y3: 'checkbox_60xljq' },
    { product: 'text_27uhsa', mfr: 'text_33ksgd', serial: 'text_39rvnx', date: 'text_45dikx', y1: 'checkbox_54mqll', y2: 'checkbox_58tfve', y3: 'checkbox_59mdyi' },
    { product: 'text_28bmgd', mfr: 'text_34ufcq', serial: 'text_40rtgx', date: 'text_46djkq', y1: 'checkbox_55ssri', y2: 'checkbox_56oldu', y3: 'checkbox_57ekhj' },
  ]
  const rawRabies = (d.rabies_dates as unknown[]) || []
  const rabiesDates = rawRabies.map(v =>
    typeof v === 'string' ? v
    : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>))
      ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean).sort()  // 오래된 순(오름차순)
  rabiesDates.slice(0, 3).forEach((date, i) => {
    const f = RABIES_FIELDS[i]
    textFields[f.date] = date.replace(/-/g, '/')
    const rab = lookupRabies(date)
    if (rab) {
      textFields[f.product] = rab.vaccine ?? ''
      textFields[f.mfr] = rab.manufacturer
      textFields[f.serial] = rab.batch ?? ''
      checkboxFields.push(f.y1)  // 광견병은 1년 면역
    }
  })

  // ── 기타 예방접종 / 기생충 처치 (최대 3행) ──
  // 열: type(x≈120) | product(x≈210) | manufacturer(x≈301) | serial(x≈392) | date(x≈480)
  const OTHER_FIELDS = [
    { type: 'text_29miub', product: 'text_35vprf', mfr: 'text_41uccy', serial: 'text_47ltvz', date: 'text_50kgza' },
    { type: 'text_30fsan', product: 'text_36rodf', mfr: 'text_42wlxj', serial: 'text_48qhcv', date: 'text_51zflp' },
    { type: 'text_31xhe',  product: 'text_37sqay', mfr: 'text_43bhsp', serial: 'text_49hnqf', date: 'text_52pdic' },
  ]
  const species = (d.species as string) === 'cat' ? 'cat' : 'dog'
  let otherRow = 0
  const fillOther = (type: string, date: string, product: string, manufacturer: string, serial: string) => {
    if (otherRow >= 3 || !date) return
    const f = OTHER_FIELDS[otherRow]
    textFields[f.type] = type
    textFields[f.date] = date.replace(/-/g, '/')
    if (product) textFields[f.product] = product
    if (manufacturer) textFields[f.mfr] = manufacturer
    if (serial) textFields[f.serial] = serial
    otherRow++
  }

  // 종합백신 (Comprehensive Vaccine)
  const compRaw = d.general_vaccine_dates ?? d.comprehensive_dates ?? (d.comprehensive ? [d.comprehensive] : [])
  const compDates = (Array.isArray(compRaw) ? compRaw : []).map(v =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean) as string[]
  if (compDates[0]) {
    const comp = lookupComprehensive(species, compDates[0])
    fillOther('Vaccination', compDates[0], comp?.vaccine ?? '', comp?.manufacturer ?? '', comp?.batch ?? '')
  }

  // CIV
  const civRaw = d.civ_dates ?? (d.civ ? [d.civ] : [])
  const civDates = (Array.isArray(civRaw) ? civRaw : []).map(v =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean) as string[]
  if (civDates[0]) {
    const civ = lookupCiv(civDates[0])
    fillOther('Vaccination', civDates[0], civ?.vaccine ?? '', civ?.manufacturer ?? '', civ?.batch ?? '')
  }

  // 켄넬코프 (강아지 전용)
  if (species === 'dog' && d.kennel_cough_date) {
    const kc = lookupKennelCough()
    fillOther('Vaccination', String(d.kennel_cough_date), kc?.vaccine ?? '', kc?.manufacturer ?? '', kc?.batch ?? '')
  }

  // 외부구충 (External Parasite)
  const extRaw = (d.external_parasite_dates as unknown[]) || []
  const extDates = extRaw.map(v =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean)
  if (extDates[0]) {
    const ext = lookupExternalParasite(species, extDates[0])
    fillOther('Parasiticide', extDates[0], ext?.product ?? '', ext?.manufacturer ?? '', ext?.batch ?? '')
  }

  // 내부구충 (Internal Parasite)
  const intRaw = (d.internal_parasite_dates as unknown[]) || []
  const intDates = intRaw.map(v =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'date' in (v as Record<string,unknown>)) ? String((v as Record<string,unknown>).date ?? '') : ''
  ).filter(Boolean)
  if (intDates[0]) {
    const int_ = lookupInternalParasite(species, intDates[0])
    fillOther('Parasiticide', intDates[0], int_?.product ?? '', int_?.manufacturer ?? '', int_?.batch ?? '')
  }

  // ── 발급기관 (병원 / 수의사) ──
  // 주의: 실제 PDF 레이아웃상 text_63xua = 면허번호 칸, text_65lyvh = 발급일 칸
  textFields.text_63xua  = VET_LICENSE    // 면허번호
  textFields.text_64nlgd = VET_NAME       // 수의사 이름
  textFields.text_65lyvh = ((d.vet_visit_date as string) || '').replace(/-/g, '/')  // 발급일
  textFields.text_66ovsr = CLINIC_NAME    // 동물병원명
  textFields.text_67ajdb = CLINIC_PHONE   // 전화번호
  // 주소: 3개 필드(text_68prxi/text_69gsnn/text_70fevy)에 각각 street / city+region+country / 빈 값
  const [clinicStreet, clinicCity] = splitStreetAndCity(CLINIC_ADDRESS)
  textFields.text_68prxi = clinicStreet
  textFields.text_69gsnn = clinicCity
  // text_70fevy는 비워둠 (사용자가 필요 시 수동 입력)

  return { textFields, checkboxFields }
}

export async function generateKoreaVetCert(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  // Load template
  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', '한국.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: '한국.pdf 템플릿을 찾을 수 없습니다' }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()

  const { textFields, checkboxFields } = mapCaseToPdfFields(c, d)

  // Fill text fields. 줄바꿈이 포함된 값은 multiline 플래그를 켜야 뷰어에서 \n이 반영된다.
  for (const [name, value] of Object.entries(textFields)) {
    if (!value) continue
    try {
      const field = form.getTextField(name)
      if (value.includes('\n')) field.enableMultiline()
      field.setText(value)
    } catch {
      // Field not found — skip
    }
  }

  // 체크박스: pdf-lib low-level API로 직접 채움 (Python 의존성 제거).
  // 'Yes'가 아닌 커스텀 on-state 키도 처리하기 위해 /AP/N 키를 동적으로 찾는다.
  fillCheckboxesNative(pdfDoc, checkboxFields)

  // [KOREA-ONLY] 한국.pdf는 필드에 한글이 들어가므로 pdf-lib가 Helvetica로 외관을 재생성하면
  // 빈칸으로 표시된다. updateFieldAppearances:false + NeedAppearances=true로 뷰어가 /V 값을
  // 템플릿 폰트로 렌더링하도록 맡긴다. 영문 전용 PDF(EU/UK/AU/Japan)는 기본 save를 사용.
  setNeedAppearances(pdfDoc)
  const pdfBytes = await pdfDoc.save({ updateFieldAppearances: false })

  const base64 = Buffer.from(pdfBytes).toString('base64')

  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  const filename = `별지 제25호 서식_${petName}.pdf`

  return { ok: true, pdf: base64, filename }
}

/**
 * AcroForm에 /NeedAppearances=true 를 세팅한다.
 * pdf-lib가 appearance를 재생성하지 않도록 updateFieldAppearances:false로 저장할 때,
 * 대신 PDF 뷰어가 /V 값 기반으로 필드 외관을 동적으로 렌더링하도록 지시한다.
 */
function setNeedAppearances(pdfDoc: PDFDocument): void {
  const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm'))
  if (!(acroForm instanceof PDFDict)) return
  acroForm.set(PDFName.of('NeedAppearances'), pdfDoc.context.obj(true))
}

/**
 * 텍스트 필드에 /V 값을 직접 세팅하고 /AP를 제거한다. 뷰어(Acrobat/Chrome)는 /NeedAppearances=true
 * 시 /DA를 이용해 새로 외관을 그린다. pdf-lib가 Helvetica로 stale한 /AP를 만들어 버리면
 * Acrobat에서 빈 화면으로 보이는 문제가 있어, /AP를 비우고 뷰어에게 렌더링을 맡긴다.
 */
function fillTextFieldsNative(pdfDoc: PDFDocument, textFields: Record<string, string>): void {
  const wanted = new Map(Object.entries(textFields).filter(([, v]) => v))
  if (wanted.size === 0) return

  const acroFormRaw = pdfDoc.catalog.lookup(PDFName.of('AcroForm'))
  if (!(acroFormRaw instanceof PDFDict)) return
  const fieldsRaw = acroFormRaw.lookup(PDFName.of('Fields'))
  if (!(fieldsRaw instanceof PDFArray)) return

  const visit = (fieldRef: unknown): void => {
    const field = fieldRef instanceof PDFRef
      ? pdfDoc.context.lookup(fieldRef)
      : fieldRef
    if (!(field instanceof PDFDict)) return

    const tNode = field.lookup(PDFName.of('T'))
    const name = tNode
      ? (tNode as { decodeText?: () => string }).decodeText?.() ?? String(tNode)
      : ''
    const cleanName = name.replace(/^\(|\)$/g, '')

    if (wanted.has(cleanName)) {
      const value = wanted.get(cleanName)!
      field.set(PDFName.of('V'), PDFHexString.fromText(value))
      // 각 위젯(자식 또는 필드 자체)의 /AP 제거 → 뷰어가 /DA + /V로 다시 그림
      const kidsNode = field.lookup(PDFName.of('Kids'))
      const widgetTargets = kidsNode instanceof PDFArray ? kidsNode.asArray() : [fieldRef]
      for (const w of widgetTargets) {
        const widget = w instanceof PDFRef ? pdfDoc.context.lookup(w) : w
        if (widget instanceof PDFDict) widget.delete(PDFName.of('AP'))
      }
    }

    // 자식 필드 재귀 처리 (이름 있는 /Kids)
    const kidsArr = field.lookup(PDFName.of('Kids'))
    if (kidsArr instanceof PDFArray) for (const kid of kidsArr.asArray()) visit(kid)
  }

  for (const ref of fieldsRaw.asArray()) visit(ref)
}

// (PDFString import는 향후 필요시 사용 — 현재는 PDFHexString 사용)
void PDFString

/**
 * pdf-lib 네이티브로 체크박스를 채운다. 표준 'Yes' on-state가 아닌 PDF (예: '/1', '/On')도
 * /AP/N 딕셔너리에서 '/Off'가 아닌 첫 키를 동적으로 찾아 사용한다.
 */
function fillCheckboxesNative(pdfDoc: PDFDocument, checkboxNames: string[]): void {
  if (checkboxNames.length === 0) return
  const wanted = new Set(checkboxNames)

  const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm'))
  if (!(acroForm instanceof PDFDict)) return
  const fields = acroForm.lookup(PDFName.of('Fields'))
  if (!(fields instanceof PDFArray)) return

  for (const fieldRef of fields.asArray()) {
    const field = fieldRef instanceof PDFRef
      ? pdfDoc.context.lookup(fieldRef)
      : fieldRef
    if (!(field instanceof PDFDict)) continue

    const tNode = field.lookup(PDFName.of('T'))
    const name = tNode ? (tNode as { decodeText?: () => string; toString?: () => string }).decodeText?.()
                       ?? String(tNode) : ''
    const cleanName = name.replace(/^\(|\)$/g, '')
    if (!wanted.has(cleanName)) continue

    const kidsNode = field.lookup(PDFName.of('Kids'))
    const kidArray = kidsNode instanceof PDFArray ? kidsNode.asArray() : [fieldRef]

    let onKey = 'Yes'
    for (const kidRef of kidArray) {
      const kid = kidRef instanceof PDFRef
        ? pdfDoc.context.lookup(kidRef)
        : kidRef
      if (!(kid instanceof PDFDict)) continue

      const ap = kid.lookup(PDFName.of('AP'))
      if (ap instanceof PDFDict) {
        const n = ap.lookup(PDFName.of('N'))
        if (n instanceof PDFDict) {
          for (const k of n.keys()) {
            const keyStr = k.toString().replace(/^\//, '')
            if (keyStr !== 'Off') { onKey = keyStr; break }
          }
        }
      }
      kid.set(PDFName.of('AS'), PDFName.of(onKey))
    }
    field.set(PDFName.of('V'), PDFName.of(onKey))
  }
}

// ── Australia ID Declaration ──

// Primary microchip digit fields (15 boxes, sorted by x position)
const MICROCHIP_DIGIT_FIELDS = [
  'text_22iegx', 'text_41dwso', 'text_43nwcf', 'text_44legb', 'text_45gmsu',
  'text_46drhi', 'text_47uukw', 'text_48svhv', 'text_49zlsr', 'text_51rrxz',
  'text_52foqc', 'text_53evhe', 'text_54ohnu', 'text_55unrk', 'text_56qffx',
]

// Secondary microchip digit fields (15 boxes)
const MICROCHIP2_DIGIT_FIELDS = [
  'text_57xji', 'text_58rfwo', 'text_59pc', 'text_60wiua', 'text_61cqzu',
  'text_62ybhe', 'text_63atvl', 'text_64uoih', 'text_65reid', 'text_66upid',
  'text_67tggs', 'text_68vgww', 'text_69uoih', 'text_70qnlz', 'text_71zrmh',
]

/** Convert YYYY-MM-DD to dd/mm/yy */
function toDdMmYy(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const yy = parts[0].slice(2)
  return `${parts[2]}/${parts[1]}/${yy}`
}

/** Convert YYYY-MM-DD to dd/mm/yyyy */
function toDdMmYyyy(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/** Convert sex DB value to English abbreviation */
function sexToEn(sex: string): string {
  const map: Record<string, string> = {
    male: 'M', female: 'F',
    neutered_male: 'M(N)', spayed_female: 'F(N)',
  }
  return map[sex] || sex
}

/** Convert YYYY-MM-DD to yyyy/mm/dd (Japanese format) */
function toYyyyMmDdSlash(dateStr: string): string {
  if (!dateStr) return ''
  return dateStr.replace(/-/g, '/')
}

/** Convert species DB value to English */
function speciesToEn(species: string): string {
  if (species === 'dog') return 'Dog'
  if (species === 'cat') return 'Cat'
  return species
}

/** Extract rabies date strings from rabies_dates array (handles string or {date} objects) */
function extractRabiesDates(d: Record<string, unknown>): string[] {
  const raw = (d.rabies_dates as unknown[]) || []
  return raw.map(v =>
    typeof v === 'string' ? v
    : (v && typeof v === 'object' && 'date' in (v as Record<string, unknown>))
      ? String((v as Record<string, unknown>).date ?? '')
      : ''
  ).filter(Boolean)
}

function mapCaseToIdFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const textFields: Record<string, string> = {}
  const checkboxFields: string[] = []

  // Animal name (Page 1 + Section B #5)
  const petNameEn = (c.pet_name_en as string) || ''
  textFields.text_1siug = petNameEn
  textFields.text_5upip = petNameEn

  // Date of birth (Page 1 + Section B #6) — dd/mm/yy
  const birthDate = (d.birth_date as string) || ''
  const birthDdMmYy = toDdMmYy(birthDate)
  textFields.text_2gtck = birthDdMmYy
  textFields.text_6truz = birthDdMmYy

  // Name of importer (Section B #4)
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  textFields.text_4wsfw = `${firstName} ${lastName}`.trim()

  // Description: breed, colour, weight (Page 1 + Section B #8)
  const breedEn = (d.breed_en as string) || ''
  const colorEn = (d.color_en as string) || ''
  const weightKg = (d.weight as number | string) ? `${d.weight}kg` : ''
  const description = [breedEn, colorEn, weightKg].filter(Boolean).join(', ')
  textFields.text_3gevi = description
  textFields.text_7gzzz = description

  // Sex checkboxes — Page 1 + Section B
  const sexMapPage1: Record<string, string> = {
    male: 'checkbox_12cuyn',
    neutered_male: 'checkbox_34toyq',
    female: 'checkbox_35kupz',
    spayed_female: 'checkbox_36xpuj',
  }
  const sexMapSectionB: Record<string, string> = {
    male: 'checkbox_37ltqi',
    neutered_male: 'checkbox_38gsco',
    female: 'checkbox_39pyxd',
    spayed_female: 'checkbox_40xvtw',
  }
  const sex = (d.sex as string) || ''
  if (sexMapPage1[sex]) checkboxFields.push(sexMapPage1[sex])
  if (sexMapSectionB[sex]) checkboxFields.push(sexMapSectionB[sex])

  // Microchip — 15 individual digit boxes (primary)
  const chip = ((c.microchip as string) || '').replace(/\s/g, '')
  for (let i = 0; i < MICROCHIP_DIGIT_FIELDS.length; i++) {
    textFields[MICROCHIP_DIGIT_FIELDS[i]] = chip[i] || ''
  }

  // Secondary microchip (if present)
  const chipExtra = (c.microchip_extra as string[]) || []
  if (chipExtra[0]) {
    const chip2 = chipExtra[0].replace(/\s/g, '')
    for (let i = 0; i < MICROCHIP2_DIGIT_FIELDS.length; i++) {
      textFields[MICROCHIP2_DIGIT_FIELDS[i]] = chip2[i] || ''
    }
  }

  // Site of microchip — pre-filled "Neck" but set explicitly
  textFields.text_33hgor = 'Neck'

  return { textFields, checkboxFields }
}

export async function generateAustraliaIdDecl(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  // Load template
  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', 'ID.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    try {
      templateBytes = await readFile('C:\\Users\\off20\\OneDrive\\Desktop\\Form\\ID.pdf')
    } catch {
      return { ok: false, error: 'ID.pdf 템플릿을 찾을 수 없습니다' }
    }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)

  const { textFields, checkboxFields } = mapCaseToIdFields(c, d)

  // 텍스트·체크박스를 모두 low-level API로 처리 — pdf-lib의 외관 재생성을 완전히 건너뛰어
  // Acrobat Reader가 템플릿 /DA 기반으로 /V를 렌더링하게 한다 (NeedAppearances=true 필수).
  fillTextFieldsNative(pdfDoc, textFields)
  fillCheckboxesNative(pdfDoc, checkboxFields)
  setNeedAppearances(pdfDoc)
  const pdfBytes = await pdfDoc.save({ updateFieldAppearances: false })

  const base64 = Buffer.from(pdfBytes).toString('base64')

  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  const filename = `Identification Declaration_${petName}.pdf`

  return { ok: true, pdf: base64, filename }
}

// ── EU Certificate ──

/** Split English address by commas, return [line1 (street+city), line2 (region+country)] */
function splitAddressEn(addrEn: string): [string, string] {
  if (!addrEn) return ['', '']
  const parts = addrEn.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 3) return [parts.join(', '), '']
  // Typical Korean: [street, gu, si, do, country] → split 3+rest
  const splitIdx = parts.length >= 5 ? 3 : 2
  const line1 = parts.slice(0, splitIdx).join(', ')
  const line2 = parts.slice(splitIdx).join(', ')
  return [line1, line2]
}

/** Add N years to YYYY-MM-DD date, return dd/mm/yyyy */
function addYearsAndFormat(dateStr: string, years: number): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return ''
  const d = new Date(Number(parts[0]) + years, Number(parts[1]) - 1, Number(parts[2]))
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy}`
}

/** Destinations requiring anti-parasite treatment (tapeworm/Echinococcus) */
const ANTI_PARASITE_COUNTRIES = ['영국', '핀란드', '아일랜드', '몰타', '노르웨이', '북아일랜드']
function needsAntiParasite(destination: string | null | undefined): boolean {
  if (!destination) return false
  const dests = destination.split(',').map(s => s.trim())
  return dests.some(d => ANTI_PARASITE_COUNTRIES.includes(d))
}

function mapCaseToEuFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const f: Record<string, string> = {}

  const chipFormatted = formatMicrochip((c.microchip as string) || '')

  // ── I.1 Consignor (owner, Korea) ──
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  f.text_1fomr = `${firstName} ${lastName}`.trim()
  const [addrLine1, addrLine2] = splitAddressEn((d.address_en as string) || '')
  f.text_4xkcj = addrLine1
  f.text_5gosd = addrLine2
  const phone = (d.phone as string) || ''
  f.text_6kwtx = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')

  // ── I.5 Consignee (destination contact) ──
  // 이름, 해외주소+우편번호, 해외 전화번호. 데이터 없으면 비움 (구조만 유지)
  f.text_7nccq = '' // Name — 추후
  f.text_8fqzz = (d.address_overseas as string) || '' // 해외 주소
  f.text_9tish = '' // Postal code — 추후
  f.text_10edla = '' // 해외 전화번호 — 추후

  // ── I.18 Description of commodity ──
  f.text_11wrua = speciesToEn((d.species as string) || '')

  // ── I.28 Row1 — Identification of commodities ──
  // 실제 PDF 컬럼 순서 (좌→우): Species | Sex | Colour | Breed | ID System | Transponder No | DOB
  f.text_13yqbv = speciesToEn((d.species as string) || '')        // Species
  f.text_12toqh = sexToEn((d.sex as string) || '')                // Sex
  f.text_14zhbg = (d.color_en as string) || ''                    // Colour
  f.text_15saus = (d.breed_en as string) || ''                    // Breed
  f.text_16iisx = chipFormatted ? 'Transponder' : ''               // ID System
  f.text_17wdwy = chipFormatted                                    // Transponder Number
  f.text_18muyo = toDdMmYyyy((d.birth_date as string) || '')      // Date of birth

  // ── Vaccination Row1 ──
  // 광견병 접종일로 제품 정보 자동 조회 (data/vaccine-products.json)
  const rabiesDates = extractRabiesDates(d)
  f.text_33rsbf = chipFormatted                                    // Transponder
  if (rabiesDates[0]) {
    const rab = lookupRabies(rabiesDates[0])
    f.text_38gvmq = toDdMmYyyy(rabiesDates[0])                    // Date of vaccination
    if (rab) {
      f.text_43mfoe = `${rab.vaccine ?? ''} (${rab.manufacturer})`.trim()  // Vaccine name + manufacturer
      f.text_48ittw = rab.batch ?? ''                             // Batch number
    }
    f.text_50yagc = toDdMmYyyy(rabiesDates[0])                    // Validity from
    f.text_58ivbr = addYearsAndFormat(rabiesDates[0], 1)          // Validity to (접종일+1년)
  }

  // ── Blood sampling (Titer) Row1 ──
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string }>) || []
  if (titerRecords[0]) {
    f.text_63grvq = toDdMmYyyy(titerRecords[0].date || '')
    f.text_68llwb = titerRecords[0].value || ''
  }

  // ── Anti-parasite treatment (영국/핀란드/아일랜드/몰타/노르웨이/북아일랜드만) ──
  if (needsAntiParasite(c.destination as string)) {
    f.text_73brgu = chipFormatted // Row1 Transponder
    // 구충 제품 자동 조회 (체중 + 종 기반)
    const weight = Number(d.weight) || 0
    const parasiteSp: 'dog' | 'cat' = (d.species as string) === 'cat' ? 'cat' : 'dog'
    const parasite = weight > 0 ? lookupParasiteCombo(parasiteSp, weight) : null
    if (parasite) {
      f.text_78mbys = parasite.product ?? ''      // Product name
      f.text_83ucjz = parasite.manufacturer       // Manufacturer
      // Date and time (text_88lvnb)은 실제 투약일 데이터가 있으면 추후
    }
  }

  // ── Signature (Official vet) ──
  f.text_38rwyf = VET_NAME
  f.text_39cucd = toDdMmYyyy((d.vet_visit_date as string) || '')

  // ── P6 Model of declaration ──
  // 고객명 (undersigned), 마이크로칩번호
  const customerName = (c.customer_name as string) || `${firstName} ${lastName}`.trim()
  f.text_2kyio = customerName
  f.text_1ehrq = chipFormatted

  return f
}

export async function generateEuCert(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', '유럽.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: 'EU 증명서 템플릿을 찾을 수 없습니다' }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()
  const fields = mapCaseToEuFields(c, d)

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue
    try { form.getTextField(name).setText(toWinAnsiSafe(value)) } catch {}
  }

  // 영문 전용 템플릿 — pdf-lib 기본 save로 appearance를 생성하면 모든 뷰어에서 올바르게 표시된다.
  const pdfBytes = await pdfDoc.save()
  const base64 = Buffer.from(pdfBytes).toString('base64')
  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  return { ok: true, pdf: base64, filename: `ANNEX III_${petName}.pdf` }
}

// ── UK Certificate ──

function mapCaseToUkFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const f: Record<string, string> = {}
  const chipFormatted = formatMicrochip((c.microchip as string) || '')

  // I.1 Consignor (보호자) — 주소 2줄 분리
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  f.text_71rzrp = `${firstName} ${lastName}`.trim()
  const [addr1, addr2] = splitAddressEn((d.address_en as string) || '')
  f.text_72dbsc = addr1
  f.text_73ccfv = addr2
  const phone = (d.phone as string) || ''
  f.text_74pdju = phone.replace(/^0(\d{2})(\d{4})(\d{4})$/, '+82-$1-$2-$3')

  // I.28 Row1 — EU 양식과 동일한 컬럼 재배치 적용
  // Species | Sex | Colour | Breed | ID System | Transponder No | DOB
  f.text_11bcid = speciesToEn((d.species as string) || '')        // Species
  f.text_12pslr = sexToEn((d.sex as string) || '')                // Sex
  f.text_13eoyt = (d.color_en as string) || ''                    // Colour
  f.text_14hsoy = (d.breed_en as string) || ''                    // Breed
  f.text_15rtix = chipFormatted ? 'Transponder' : ''               // ID System
  f.text_16bahe = chipFormatted                                    // Transponder Number
  f.text_18ztyb = toDdMmYyyy((d.birth_date as string) || '')      // DOB

  // Vaccination Row1 — 광견병 제품 자동 조회
  const rabiesDates = extractRabiesDates(d)
  f.text_34btpu = chipFormatted
  if (rabiesDates[0]) {
    f.text_35keld = toDdMmYyyy(rabiesDates[0])
    // UK 템플릿에 Vaccine name/Manufacturer/Batch 필드가 있다면 추후 매핑
    const rab = lookupRabies(rabiesDates[0])
    if (rab) {
      // UK cert 추가 필드는 템플릿 분석 후 매핑
    }
  }

  // Titer Row1
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string }>) || []
  if (titerRecords[0]) {
    f.text_40ecaj = toDdMmYyyy(titerRecords[0].date || '')
    f.text_41snjc = titerRecords[0].value || ''
  }

  // Echinococcus treatment — UK는 필수
  const weightUk = Number(d.weight) || 0
  const speciesUk: 'dog' | 'cat' = (d.species as string) === 'cat' ? 'cat' : 'dog'
  const parasite = weightUk > 0 ? lookupParasiteCombo(speciesUk, weightUk) : null
  if (parasite) {
    // UK 템플릿의 treatment 테이블 필드는 추후 매핑 (현재 필드명 미확인)
  }

  // ── Signature (Official vet) ──
  f.text_33xloh = VET_NAME
  f.text_75raua = toDdMmYyyy((d.vet_visit_date as string) || '')

  return f
}

export async function generateUkCert(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', '영국.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: 'UK 증명서 템플릿을 찾을 수 없습니다' }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()
  const fields = mapCaseToUkFields(c, d)

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue
    try { form.getTextField(name).setText(toWinAnsiSafe(value)) } catch {}
  }

  // 영문 전용 템플릿 — pdf-lib 기본 save로 appearance를 생성하면 모든 뷰어에서 올바르게 표시된다.
  const pdfBytes = await pdfDoc.save()
  const base64 = Buffer.from(pdfBytes).toString('base64')
  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  return { ok: true, pdf: base64, filename: `UK_${petName}.pdf` }
}

// ── Japan Form AC ──

/** Map titer lab code to official lab name + country for FormAC */
function titerLabToFormAC(lab: string | null): { name: string; country: string } {
  switch (lab) {
    case 'nvrqs_seoul':
    case 'nvrqs_main':
      return { name: 'Animal and Plant Quarantine Agency', country: 'Republic of Korea' }
    case 'ksu':
      return { name: 'Kansas State University Rabies Laboratory', country: 'USA' }
    case 'komipharm':
      return { name: 'Komipharm International Co., Ltd.', country: 'Republic of Korea' }
    case 'ksvdl':
      return { name: 'Kansas State Veterinary Diagnostic Laboratory', country: 'USA' }
    default:
      return { name: '', country: '' }
  }
}

/** Format microchip as 000 000 000 000 000 */
function formatMicrochip(chip: string | null): string {
  if (!chip) return ''
  const digits = chip.replace(/\s/g, '')
  if (digits.length === 15) {
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,9)} ${digits.slice(9,12)} ${digits.slice(12)}`
  }
  return digits
}

function mapCaseToJapanFields(c: Record<string, unknown>, d: Record<string, unknown>) {
  const textFields: Record<string, string> = {}
  const checkboxFields: string[] = []

  // Consignor (수출자 = 고객)
  const firstName = (d.customer_first_name_en as string) || ''
  const lastName = (d.customer_last_name_en as string) || ''
  textFields.text_3efqg = `${firstName} ${lastName}`.trim()
  textFields.text_4jyll = (d.address_en as string) || ''

  // Consignee (수입자 = 고객 해외주소)
  textFields.text_5izml = `${firstName} ${lastName}`.trim()
  textFields.text_6igov = (d.address_overseas as string) || ''

  // Animal identification
  textFields.text_7xwua = speciesToEn((d.species as string) || '')
  textFields.text_8bjsb = (d.breed_en as string) || ''
  textFields.text_9vbhv = (c.pet_name_en as string) || ''
  textFields.text_13tlnw = toYyyyMmDdSlash((d.birth_date as string) || '')
  textFields.text_14wgoq = (d.color_en as string) || ''

  // Sex
  const sex = (d.sex as string) || ''
  if (sex === 'male' || sex === 'neutered_male') checkboxFields.push('checkbox_36goul')
  if (sex === 'female' || sex === 'spayed_female') checkboxFields.push('checkbox_37xoym')

  // Pet use
  checkboxFields.push('checkbox_38rzav')

  // Microchip — 000 000 000 000 000 format
  textFields.text_15oqtq = formatMicrochip((c.microchip as string) || '')
  textFields.text_16bkvn = toYyyyMmDdSlash((d.microchip_implant_date as string) || '')

  // Rabies vaccination (newest first = reverse order of rabies_dates)
  const rabiesDates = extractRabiesDates(d)
  const sortedDates = [...rabiesDates].sort((a, b) => b.localeCompare(a)) // newest first
  const rabRows = [
    { date: 'text_17hwqx', period: 'text_22cuhd', product: 'text_25mprj' },
    { date: 'text_18cib',  period: 'text_23iajt', product: 'text_26wtjh' },
    { date: 'text_21nfys', period: 'text_24qrob', product: 'text_27couo' },
  ]
  for (let i = 0; i < rabRows.length; i++) {
    if (!sortedDates[i]) continue
    textFields[rabRows[i].date] = toYyyyMmDdSlash(sortedDates[i])
    textFields[rabRows[i].period] = '1'  // 1년
    const rab = lookupRabies(sortedDates[i])
    if (rab) {
      textFields[rabRows[i].product] = `${rab.vaccine ?? ''} / ${rab.manufacturer} / ${rab.batch ?? ''}`
    }
  }

  // Rabies serology (up to 2 rows) + lab name/country
  const titerRecords = (d.rabies_titer_records as Array<{ date?: string; value?: string; lab?: string }>) || []
  if (titerRecords[0]) {
    textFields.text_28mxll = toYyyyMmDdSlash(titerRecords[0].date || '')
    textFields.text_30xdu = titerRecords[0].value || ''
    const labInfo = titerLabToFormAC(titerRecords[0].lab || null)
    textFields.text_32zqtv = labInfo.name   // lab name row1
    textFields.text_33irrn = labInfo.country // lab country row1
  }
  if (titerRecords[1]) {
    textFields.text_29hexi = toYyyyMmDdSlash(titerRecords[1].date || '')
    textFields.text_31hozo = titerRecords[1].value || ''
    const labInfo = titerLabToFormAC(titerRecords[1].lab || null)
    textFields.text_40wtsb = labInfo.name   // lab name row2
    textFields.text_41ggfv = labInfo.country // lab country row2
  }

  // Clinical inspection: vet name
  textFields.text_36zit = VET_NAME

  // Endorsement: address + date of inspection (= 내원일)
  textFields.text_37sjps = VET_ADDRESS
  textFields.text_38aqfp = toYyyyMmDdSlash((d.vet_visit_date as string) || '')

  return { textFields, checkboxFields }
}

export async function generateJapanFormAC(caseId: string): Promise<
  { ok: true; pdf: string; filename: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: c, error } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (error || !c) return { ok: false, error: error?.message || 'Case not found' }

  const d = (c.data ?? {}) as Record<string, unknown>

  const templatePath = path.join(process.cwd(), 'data', 'pdf-templates', 'FormAC.pdf')
  let templateBytes: Buffer
  try {
    templateBytes = await readFile(templatePath)
  } catch {
    return { ok: false, error: 'FormAC 템플릿을 찾을 수 없습니다' }
  }

  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()
  const { textFields, checkboxFields } = mapCaseToJapanFields(c, d)

  // Fill text fields
  for (const [name, value] of Object.entries(textFields)) {
    if (!value) continue
    try { form.getTextField(name).setText(toWinAnsiSafe(value)) } catch {}
  }

  // 영문 전용 템플릿 — pdf-lib 기본 save로 appearance를 생성하면 모든 뷰어에서 올바르게 표시된다.
  const pdfBytes = await pdfDoc.save()

  // Checkboxes via pypdf
  const finalBytes = await fillCheckboxesWithPypdf(Buffer.from(pdfBytes), checkboxFields)

  const base64 = finalBytes.toString('base64')
  const petName = (c.pet_name_en || c.pet_name || 'pet').replace(/\s/g, '_')
  return { ok: true, pdf: base64, filename: `FormAC_${petName}.pdf` }
}

/** Use pypdf to set checkbox values — works with non-standard appearance keys */
async function fillCheckboxesWithPypdf(pdfBuffer: Buffer, checkboxNames: string[]): Promise<Buffer> {
  if (checkboxNames.length === 0) return pdfBuffer

  const tmpIn = path.join(os.tmpdir(), `pdf_cb_in_${Date.now()}.pdf`)
  const tmpOut = path.join(os.tmpdir(), `pdf_cb_out_${Date.now()}.pdf`)

  try {
    await writeFile(tmpIn, pdfBuffer)

    const script = `
import sys, json
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

names = json.loads(sys.argv[1])
src = sys.argv[2]
dst = sys.argv[3]

reader = PdfReader(src)
writer = PdfWriter()
writer.append(reader)

acro = writer._root_object.get('/AcroForm', {})
fields_list = acro.get('/Fields', [])

for field_ref in fields_list:
    field_obj = field_ref.get_object()
    name = str(field_obj.get('/T', ''))
    if name not in names:
        continue
    kids = field_obj.get('/Kids', [])
    for kid_ref in kids:
        kid = kid_ref.get_object()
        # Dynamically find the On-state key (not always '/Yes')
        ap = kid.get('/AP', {})
        n_dict = ap.get('/N', {})
        if hasattr(n_dict, 'get_object'):
            n_dict = n_dict.get_object()
        on_key = '/Yes'
        for k in (n_dict.keys() if n_dict else []):
            if k != '/Off':
                on_key = k
                break
        kid[NameObject('/AS')] = NameObject(on_key)
    field_obj[NameObject('/V')] = NameObject(on_key if kids else '/Yes')

with open(dst, 'wb') as f:
    writer.write(f)
`
    // Windows는 보통 `py`, 맥/리눅스는 `python3`/`python`. 없으면 체크박스 채우기를 건너뛰고
    // 원본 PDF를 그대로 반환 (텍스트 필드는 이미 채워져 있음).
    const candidates = ['py', 'python3', 'python']
    let lastErr: unknown = null
    for (const cmd of candidates) {
      try {
        await execFileAsync(cmd, [
          '-c', script,
          JSON.stringify(checkboxNames),
          tmpIn,
          tmpOut,
        ])
        return await readFile(tmpOut)
      } catch (e) {
        lastErr = e
        // ENOENT면 다음 후보로, 실행은 됐는데 스크립트가 실패한 경우는 바로 중단
        const code = (e as { code?: string }).code
        if (code !== 'ENOENT') break
      }
    }
    console.warn('[generate-pdf] Python(pypdf) 사용 불가 — 체크박스 채우기를 건너뜁니다:', lastErr)
    return pdfBuffer
  } finally {
    try { await unlink(tmpIn) } catch {}
    try { await unlink(tmpOut) } catch {}
  }
}
