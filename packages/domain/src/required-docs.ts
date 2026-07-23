import type { CaseRow } from './types'
import { todayKst } from './dates'
import { DESTINATION_OVERRIDES, getDestinationOverride, getTripType } from './destination-config'
import { JOURNEY_STEP_CATALOG } from './journey-steps/catalog'
import { buildCaseJourneyContext } from './journey-steps/applicability'
import { resolveStepForDestination } from './journey-steps/destination-overrides'
import { resolveCompletedDate, resolveDone } from './journey-steps/done-resolver'

/**
 * 국가별 '필수 서류' 큐레이션. 서류함의 자동 체크리스트(step.allowAttachments 전부)
 * 와 증명서 자동 작성(resolveCerts) 을 합쳐 한 섹션으로 줄인 목적지별 화이트리스트.
 *
 * spec 이 있는 국가는 portal 의 서류 페이지에서 이 목록만 노출. spec 이 없는 국가는
 * 기존 3섹션(체크리스트 + 자동 작성 + 보관) 폴백.
 *
 * verified 판정:
 *   - kind='step' → step.done 시그널 (자동, 검사·신고 같은 본 흐름에 종속).
 *   - kind='manual' → case.data.required_doc_flags[id] (보호자 수기 완료 표시).
 */

export interface RequiredDocItem {
  id: string
  name: string
  source: string
  verified: boolean
  /** 수기 완료 토글이 필요한 항목 (kind='manual'). 상세 페이지에서 발급완료 버튼 노출. */
  manual: boolean
  /** '해당없음' 토글을 허용하는 서류 (예: 일본 첫 입국 시 수출 검역증). */
  naAllowed: boolean
  /** 보호자가 '해당없음' 으로 표시함 (case.data.required_doc_na[id]). 체크리스트 카운트에서 제외. */
  na: boolean
  /**
   * 발급 step 이 보호자의 현재 진행 step 보다 뒤에 있어 아직 능동 준비가 불가능한 상태 —
   * 보호자 능동 '준비중' 과 구분되는 수동 '대기' 톤. 예: 사전 신고 진행 중일 때 vet-visit 에서
   * 발급될 별지25/FormAC/RE 는 발급 예정. UI 에서 opacity·라벨로 시각 분리.
   * spec 의 issuanceStepId(없으면 kind='step' 의 stepRef 폴백) 보다 앞에 있는 main lane
   * (nonBlocking·advisoryOnly 제외) step 중 미완료가 하나라도 있고 verified=false, na=false 일 때 true.
   */
  awaiting: boolean
  /** 상세 페이지 본문. 서류 설명·받는 방법. */
  description: string
  /**
   * 서류함 섹션 그룹. 'quarantine' = 검역 단계에서 받는 검역증(한국 수출/수입·도착국 수입·
   * 현지 수출) → 서류탭에서 '검역증' 섹션으로 분리 노출. 미지정 = 일반 '서류 체크리스트'.
   */
  group?: 'quarantine'
  /** preview 소스 step.id — 해당 step 에 업로드된 파일이 '디지털원본/사본' 으로 노출. */
  previewStepId?: string
  /**
   * 첨부 업로드·미리보기 대상 stepId. step 연동 서류는 previewStepId(공유 step),
   * 그 외(별지25 등)는 doc.id 자체. 이 키로 case.data.documents 를 태깅·필터.
   */
  attachStepId: string
  /**
   * 빈 서식 다운로드 — 보호자가 받아 동물병원에 제출하는 지정 양식(예: 별지25). 상세 페이지에
   * '서식 받기' 섹션으로 노출. portal /public 정적 파일 경로.
   */
  templates?: DocTemplate[]
}

/** 다운로드 가능한 빈 서식 파일 한 건. */
export interface DocTemplate {
  /** 버튼 라벨 (예: 'PDF', '한글(HWP)'). */
  label: string
  /** portal /public 기준 경로 (예: '/forms/form25.pdf'). */
  href: string
  /** 저장 시 파일명 (download 속성). */
  filename: string
}

interface RequiredDocSpec {
  id: string
  name: string
  source: string
  kind: 'step' | 'manual'
  /** kind='step' 시 verified 판정에 쓸 step.id. manual 은 무시. */
  stepRef?: string
  /** 케이스에 따라 불필요할 수 있는 서류 — 상세에서 '해당없음' 토글 노출(예: 첫 입국 시 수출 검역증). */
  naAllowed?: boolean
  /**
   * 왕복 케이스에만 필요한 서류 (예: 태국 — 광견병 항체 검사 결과지는 한국 귀국용).
   * 편도 케이스의 resolveRequiredDocs 결과에서 제외 — vet-visit 완료 게이트에도 안 들어간다.
   */
  roundTripOnly?: boolean
  /**
   * 이 서류가 실제로 발급되는 step. kind='step' 이면 stepRef 와 같은 게 보통이라 생략 가능
   * (자동 폴백). kind='manual' 인데 특정 step 의 결과로 발급되는 서류(예: 별지25·FormAC/RE 는
   * vet-visit 검진 결과)는 여기에 명시. resolveRequiredDocs 가 발급 step 보다 앞 main lane
   * 미완료가 있을 때 awaiting=true 로 dim 처리한다.
   */
  issuanceStepId?: string
  description: string
  /** 'quarantine' 이면 서류탭 '검역증' 섹션으로 분리 노출 (RequiredDocItem.group 으로 전달). */
  group?: 'quarantine'
  /** preview 영역에 노출할 step 의 업로드. 없으면 preview 영역 placeholder. */
  previewStepId?: string
  /** 다운로드 가능한 빈 서식(지정 양식). 상세 페이지 '서식 받기' 섹션. */
  templates?: DocTemplate[]
}

/**
 * 접종 및 건강증명서(별지 제25호) — 농림축산검역본부 공식 양식. 한국에서 출국하는 모든
 * 목적지 공통(완전히 동일한 서류)이라 단일 상수로 공유한다. id='form25' 는 목적지별 SPECS
 * 안에서 유일하므로 여러 나라가 같은 객체를 참조해도 안전.
 */
const KR_FORM25_VACCINATION_HEALTH_CERT: RequiredDocSpec = {
  id: 'form25',
  name: '접종 및 건강증명서(별지 제 25호 서식)',
  source: '동물병원',
  kind: 'manual',
  issuanceStepId: 'vet-visit',
  description:
    '농림축산검역본부 지정 양식의 접종 및 건강증명서예요.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 발급해요.\n\n원본 2부를 준비해서, 한국 수출 검역 때 1부를 제출해요.\n\n접종과 출국 전 임상검사를 한 동물병원이 다른 경우, 각 동물병원에서 따로 증명서를 받아야 해요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
  templates: [
    { label: 'PDF', href: '/forms/form25.pdf', filename: '별지 제 25호 서식.pdf' },
    { label: '한글(HWP)', href: '/forms/form25.hwp', filename: '별지 제 25호 서식.hwp' },
  ],
}

/**
 * 한국 수출 동물검역증 — **모든 목적지 공통**. 어느 나라로 가든 한국에서 수출 검역을 받고
 * 이 증명서를 발급받는다(사용자 지정 2026-07-20: "한국 수출·수입 동물검역증은 모든 국가 기본").
 *
 * 큐레이션 spec 이 있는 나라(일본·태국 등)는 "OO 수입 검역 때 원본을 제시해야 해요" 같은
 * 나라별 한 줄을 더 붙이려고 각자 정의를 갖는다. 여기 기본형은 그 줄만 일반화한 것.
 */
const KR_EXPORT_QUARANTINE_CERT: RequiredDocSpec = {
  id: 'kr-export-quarantine-cert',
  name: '한국 수출 동물검역증',
  source: '농림축산검역본부',
  kind: 'step',
  stepRef: 'certificate-issue',
  group: 'quarantine',
  description:
    '한국 수출 검역 후 발급돼요.\n\n도착 국가에서 원본을 제시해야 할 수 있으니 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
  previewStepId: 'certificate-issue',
}

/** 한국 수입 동물검역증 — 모든 목적지 공통. 귀국 후 받는 것이라 왕복 전용. */
const KR_IMPORT_QUARANTINE_CERT: RequiredDocSpec = {
  id: 'kr-import-quarantine-cert',
  name: '한국 수입 동물검역증',
  source: '농림축산검역본부',
  kind: 'step',
  stepRef: 'kr-import-quarantine',
  group: 'quarantine',
  roundTripOnly: true,
  description:
    '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
  previewStepId: 'kr-import-quarantine',
}

/**
 * 큐레이션 spec 이 없는 목적지의 기본 필수 서류.
 *
 * 별지 제25호 + **한국 수출·수입 동물검역증**. 예전엔 별지25 하나뿐이라, 큐레이션이 없는
 * 24개국(호주·미국·캐나다 등)에서 한국 검역증이 서류 목록에 아예 안 떴다(2026-07-20 발견).
 * 한국 출국·귀국 절차는 목적지와 무관하게 모든 케이스가 거치므로 기본에 포함한다.
 * (도착국 현지 검역증은 나라마다 유무가 갈리므로 여기 넣지 않는다 — 큐레이션 spec 담당.)
 */
const DEFAULT_SPECS: RequiredDocSpec[] = [
  KR_FORM25_VACCINATION_HEALTH_CERT,
  KR_EXPORT_QUARANTINE_CERT,
  KR_IMPORT_QUARANTINE_CERT,
]

/**
 * 베트남 골격 복제 4국(캄보디아·몽골·우즈베키스탄·캐나다)의 서류 한 벌 — 2026-07-20.
 *
 * 베트남과 같은 구성이다: 귀국용 항체 결과지 + 별지25호 + 한국 수출/수입 검역증 +
 * 도착국 수입 검역 서류. 수입허가증이 없고(사전 허가 절차 없음), 건강증명서도 한국 APQA
 * 수출검역증이 그 역할을 하므로 따로 두지 않는다.
 *
 * 베트남과 다른 점:
 *  - 도착 검역 서류는 **'검역 서류'** 로 둔다 — 베트남은 발급 서식(Mẫu 15a)이 정부 원문으로
 *    확정돼 '수입 동물검역증'이지만, 4국은 발급물이 확인되지 않았다(중국·대만·필리핀과 같은
 *    처리). 나라별 개별 검토에서 확정되면 정식 이름으로 올릴 것.
 *
 * `noLocalTiterLab` — 그 나라에 광견병 항체검사 기관이 없어 출국 전 한국에서 받아야 하는
 *   경우. 캄보디아·몽골·캐나다가 해당한다(펫무브 www 가이드가 세 나라 모두 같은 문장으로
 *   명시). 복제할 때 베트남 고유 사정으로 오해해 4국 모두에서 뺐다가, 여정 카드에 이어
 *   서류 설명에도 되살렸다(2026-07-20). 이 줄이 없으면 왕복 여행자가 현지에서 받으면 된다고
 *   생각하고 출국해 **귀국할 방법이 없어진다.** 우즈베키스탄은 가이드에 해당 문장이 없어 뺀다.
 *
 * `importQuarantineDoc` — 도착 검역 서류의 발급 기관·설명을 나라별로 갈아끼운다. 캐나다는
 *   '동물검역소에서 검역 후 서류를 받는' 모델이 아니라 **CBSA 국경 심사** 모델이라 기본
 *   문구가 사실과 다르다(destination-overrides 캐나다 departure 주석 참고).
 *
 * ⚠️ 왕복 귀국 전 **현지 수출 검역증이 없다** — 해당 카드 자체를 아직 만들지 않았다
 *   (나라별 조사 후 별도 작업). 베트남의 vn-export-quarantine-cert 에 해당.
 */
function vietnamFamilyDocSpecs(
  label: string,
  cc: string,
  opts: {
    noLocalTiterLab?: boolean
    /**
     * 항체 결과지가 **입국용**인 나라(모로코·우크라이나) — 왕복 전용을 풀고 문구를 바꾼다.
     * 기본값(false)은 베트남 골격의 '한국 귀국용'이라 roundTripOnly 다. 입국 요건인데
     * 왕복 전용으로 두면 편도 고객의 서류탭에서 필수 서류가 통째로 빠진다.
     */
    titerEntryDoc?: boolean
    importQuarantineDoc?: { source?: string; description?: string }
    /**
     * 도착 검역이 **심사만** 하고 보호자에게 발급물이 없는 나라 — 도착 서류 항목을 뺀다
     * (아르헨티나: 가이드가 '심사'만 언급, 발급 검역증 미확인 2026-07-23). 도착 검역 카드
     * (departure step)는 그대로 두고 첨부만 열어둔다 — 여기서 빼는 건 서류 체크리스트 항목뿐.
     */
    omitImportQuarantineDoc?: boolean
    exportQuarantineDoc?: { name: string; source: string; description: string }
  } = {},
): RequiredDocSpec[] {
  const titerLabLine = opts.noLocalTiterLab
    ? `\n\n${label}에는 검사 기관이 없으니 출국 전에 미리 받으세요.`
    : ''
  return [
    {
      id: `${cc}-rabies-titer-result`,
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      ...(opts.titerEntryDoc ? {} : { roundTripOnly: true as const }),
      description: opts.titerEntryDoc
        ? `검사를 의뢰한 동물병원에서 발급받아요.\n\n${label} 입국에 반드시 원본이 필요해요. 왕복이면 한국 귀국 때도 필요해요.${titerLabLine}\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.`
        : `검사를 의뢰한 동물병원에서 발급받아요.\n\n${label} 입국에는 필요 없지만 한국 귀국 때 반드시 원본이 필요해요. 유효기간은 2년이에요.${titerLabLine}\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.`,
      previewStepId: 'rabies-titer',
    },
    KR_FORM25_VACCINATION_HEALTH_CERT,
    KR_EXPORT_QUARANTINE_CERT,
    // 도착 검역 서류 — 발급물이 있는 나라만. 심사만 하고 발급물이 없는 나라(아르헨티나)는 뺀다.
    ...(opts.omitImportQuarantineDoc
      ? []
      : [
          {
            id: `${cc}-import-quarantine-cert`,
            name: `${label} 수입 검역 서류`,
            source: opts.importQuarantineDoc?.source ?? `${label} 동물검역소`,
            kind: 'step' as const,
            stepRef: 'departure',
            group: 'quarantine' as const,
            description:
              opts.importQuarantineDoc?.description ??
              `${label} 수입 검역 때 받는 서류예요.\n\n${label}에서 출국할 때 필요할 수 있으므로 잘 보관해두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.`,
            previewStepId: 'departure',
          },
        ]),
    // 현지 수출 검역 서류 — 왕복 전용. 한국 APQA 가 '수출국 정부기관 증명 검역증명서'를
    // 요구하므로(EU 만 예외) 카드가 있는 나라엔 반드시 서류도 따라온다. 카드가 아직 없는
    // 나라(캄보디아)는 이 항목이 빠진다 — catalog 의 수출 검역 step 주석 참고.
    ...(opts.exportQuarantineDoc
      ? [
          {
            id: `${cc}-export-quarantine-cert`,
            name: opts.exportQuarantineDoc.name,
            source: opts.exportQuarantineDoc.source,
            kind: 'step' as const,
            stepRef: `${cc}-export-quarantine`,
            group: 'quarantine' as const,
            roundTripOnly: true,
            description: opts.exportQuarantineDoc.description,
            previewStepId: `${cc}-export-quarantine`,
          },
        ]
      : []),
    KR_IMPORT_QUARANTINE_CERT,
  ]
}

const SPECS: Record<string, RequiredDocSpec[]> = {
  '일본': [
    {
      id: 'rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n동물검역을 받을 때 반드시 원본이 필요해요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.\n\n광견병 백신 면역 유효기간 유지 시 최대 2년까지 사용할 수 있어요.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'advance-notification-approval',
      name: '허가서(Approval)',
      source: '일본 동물검역소',
      kind: 'step',
      stepRef: 'advance-notification',
      description:
        '사전 신고 후 일본 동물검역소에서 발급 받을 수 있어요.\n\n발급까지 수 주 이상 걸릴 수 있으며, 1회만 사용할 수 있어요.\n\n동물검역을 받을 때 반드시 소지해야 해요.\n\nPDF 파일로 발급되며, 앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
      previewStepId: 'advance-notification',
    },
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'form-ac-or-re',
      name: '일본 건강증명서(Form AC)',
      source: '동물병원',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      description:
        '일본 입국용 건강증명서예요.\n출국일 기준 10일 이내에 동물병원에서 발급받아요. 이 서류는 발급하지 않는 동물병원이 많으므로 미리 확인하세요.\n\n재입국인 경우 Form AC 대신 Form RE와 일본 수출 동물검역증(Export Quarantine Certificate)을 준비해야 할 수 있어요. 일본 동물검역소 혹은 담당 동물병원에 확인하세요.\n한국 수출 검역 때 검역관 확인·서명을 받아야 해요.\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      templates: [
        { label: 'Form AC (PDF)', href: '/forms/form-ac.pdf', filename: 'FormAC.pdf' },
        { label: 'Form AC (Excel)', href: '/forms/form-ac.xlsx', filename: 'FormAC.xlsx' },
        { label: 'Form RE (PDF)', href: '/forms/form-re.pdf', filename: 'FormRE.pdf' },
        { label: 'Form RE (Excel)', href: '/forms/form-re.xlsm', filename: 'FormRE.xlsm' },
      ],
    },
    {
      id: 'kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n일본 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'jp-import-quarantine-cert',
      name: '일본 수입 동물검역증',
      source: '일본 동물검역소',
      kind: 'step',
      stepRef: 'departure',
      group: 'quarantine',
      description:
        '일본 수입 검역 후 발급받아요.\n\n정확한 서류 이름은 Import Quarantine Certificate 입니다.\n\n일본에서 출국할 때 필요할 수 있으므로 잘 보관해두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'departure',
    },
    {
      id: 'jp-export-quarantine-cert',
      name: '일본 수출 동물검역증',
      source: '일본 동물검역소',
      kind: 'step',
      stepRef: 'jp-export-quarantine-visit',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '일본 수출 검역 후 발급받아요.\n\n정확한 서류 이름은 Export Quarantine Certificate 입니다.\n\n향후 일본 재입국 시 필요할 수 있으니 잘 보관해두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'jp-export-quarantine-visit',
    },
    {
      id: 'kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  '태국': [
    {
      id: 'th-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      roundTripOnly: true,
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n한국 귀국 때 반드시 원본이 필요해요. 유효기간은 2년이에요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'th-import-permit-doc',
      name: '수입 허가 통지서(R.6)',
      source: '태국 동물검역소(AQS)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '수입 허가 신청이 승인되면 발급돼요.\n\n발급일로부터 60일간 유효해요.\n\nPDF 파일로 발급되며, 앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
      previewStepId: 'import-permit',
    },
    // 접종 및 건강증명서(별지 제25호) — 일본과 완전히 동일한 한국 공식 양식.
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'th-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n태국 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'th-import-quarantine-cert',
      name: '수입 허가서(R.7)',
      source: '태국 동물검역소(AQS)',
      kind: 'step',
      stepRef: 'departure',
      group: 'quarantine',
      description:
        '태국 수입 검역 후 발급받아요.\n\n정확한 서류 이름은 Import License(R.7) 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'departure',
    },
    {
      id: 'th-export-quarantine-cert',
      name: '수출 허가서(R.9)·건강증명서',
      source: '태국 동물검역소(AQS)',
      kind: 'step',
      stepRef: 'th-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '태국 수출 검역 후 발급돼요.\n\n정확한 서류 이름은 Export License(R.9), Official Animal Health Certificate 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'th-export-quarantine',
    },
    {
      id: 'th-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  // ── 말레이시아 — ⚠️ 태국 한 벌 복제(2026-07-22). 서식명(R.6/R.7/R.9)·수치는 아직 태국 것.
  //   나라별 규정 확정 후 수정 예정. 발급처는 '말레이시아 동물검역소'로만 적었다(기관명 미확정).
  '말레이시아': [
    {
      id: 'my-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      roundTripOnly: true,
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n한국 귀국 때 반드시 원본이 필요해요. 유효기간은 2년이에요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      // ⚠️ 태국 서식 잔재 정정(2026-07-23). 구: '수입 허가 통지서(R.6)' / 발급처 '동물검역소' /
      //   '60일 유효' — 전부 태국(DLD) 것이다. 말레이시아는 MAQIS 가 ePermit 으로 발급하고
      //   R.6·60일 유효 근거가 없다. 카드(수입 허가증·MAQIS)와 같은 표기로 맞췄다.
      //   ⛔ R.6·60일·'동물검역소'를 되살리지 말 것. MAQIS 유효기간은 미확인이라 안 쓴다.
      id: 'my-import-permit-doc',
      name: '수입 허가증',
      source: '검역기관(MAQIS)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '수입 허가 신청이 승인되면 발급돼요.\n\nPDF 파일로 발급되며, 앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
      previewStepId: 'import-permit',
    },
    // 접종 및 건강증명서(별지 제25호) — 일본·태국과 완전히 동일한 한국 공식 양식.
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'my-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n말레이시아 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      // ⚠️ 태국 서식 잔재 + 정체 오인 정정(2026-07-23, MAQIS 조사). 구: '수입 허가서(R.7)' /
      //   '정확한 이름은 Import License(R.7)' — 두 가지가 틀렸다:
      //   ⛔ 'Import License(수입 허가)'는 **출국 전에 미리 받는 허가**(위 my-import-permit-doc,
      //      MAQIS)다. 도착 서류 자리(stepRef: departure = 말레이시아 도착 검역)에 잘못 놓였다.
      //   ⛔ R.7 서식 번호는 근거 없음(R.9 와 같은 태국식 잔재).
      //   → 도착 후 7일 격리를 마치면 받는 건 **검역 증명서**다(MAQIS 요금표 "Quarantine
      //      Certificate, 마리당 RM2"). 발급처는 공항 MAQIS.
      id: 'my-import-quarantine-cert',
      name: '말레이시아 수입 검역 증명서',
      source: '검역기관(MAQIS)',
      kind: 'step',
      stepRef: 'departure',
      group: 'quarantine',
      description:
        '말레이시아 도착 후 수입 검역을 마치면 받는 서류예요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'departure',
    },
    {
      // ⚠️ 태국 서식 잔재 정정(2026-07-23, DVS 원문). 구: 'R.9' 서식 번호·발급처 '동물검역소'
      //   는 근거 없다. 말레이시아 수출은 **MAQIS 수출 허가 + 주 DVS VHC** 두 서류이고, DVS
      //   원문에 R.9 라는 번호가 없다. ⛔ R.9·'동물검역소'를 되살리지 말 것.
      id: 'my-export-quarantine-cert',
      name: '수출 허가·건강증명서(VHC)',
      source: '검역기관(MAQIS)·주 DVS 지청',
      kind: 'step',
      stepRef: 'my-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '말레이시아 수출 검역 후 발급돼요.\n\n수출 허가는 MAQIS, 수의 건강증명서(VHC)는 주 DVS 지청에서 발급해요.\n\n한국 입국 때 원본이 필요하니 잘 보관하세요. 앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'my-export-quarantine',
    },
    {
      id: 'my-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  // ── 인도네시아 — ✅ 2026-07-23 Barantin(인도네시아 검역본부) 원문 조사로 서식명 전면 교체.
  //   태국 복제 잔재(R.6/R.7/R.9)는 모두 근거가 없어 인도네시아 공식 KH 서식으로 바꿨다:
  //     · 수입 검역(도착) 반출 = KH-14 Sertifikat Pelepasan Karantina
  //     · 수출 검역(출국) 발급 = KH-11 Sertifikat Kesehatan Hewan Karantina
  //   ⛔ R.6·R.7·R.9 를 되살리지 말 것(태국 DLD 서식). 발급처 = 인도네시아 검역본부(Barantin).
  '인도네시아': [
    {
      // ⚠️ 태국 복제 잔재 정정(2026-07-23). 인도네시아 항체검사는 **입국 요건**
      //   (titer.need='entry', 카드도 "인도네시아 입국에 필요해요")인데 서류 설명은 태국식
      //   '한국 귀국용'이라 카드와 어긋났다. roundTripOnly 도 제거 — 편도 입국에도 필요하다.
      id: 'id-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n인도네시아 입국에 반드시 원본이 필요해요. 왕복이면 한국 귀국 때도 필요해요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      // ✅ 2026-07-23 사용자 상세 조사 반영. 인도네시아 반입 허가 = 농업부 축산수의총국(Ditjen PKH)
      //   발급 **반입 추천서(Rekomendasi Pemasukan)**다. 발급처는 검역청(Barantin)이 아니라 농업부다
      //   (검역청은 도착검역 KH-14 담당 — 별개). ⛔ '수입 허가증'·발급처 Barantin 은 부정확했다.
      //   ⚠️ 유효기간은 서류의 berlaku sejak/sampai 로만 정해진다 — 일률 90/60/30일 단정 금지.
      id: 'id-import-permit-doc',
      name: '반입 추천서(Rekomendasi Pemasukan)',
      source: '인도네시아 농업부 축산수의총국(Ditjen PKH)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '수입 허가 신청이 승인되면 발급되는 전자 서류예요.\n\n유효기간·지정 입국지점·검역 조건이 서류에 기재되니 반드시 확인하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'import-permit',
    },
    // 접종 및 건강증명서(별지 제25호) — 일본·태국과 완전히 동일한 한국 공식 양식.
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'id-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n인도네시아 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      // ⚠️ 태국 서식 잔재 + 정체 오인 정정(2026-07-23, Barantin 조사). 구: '수입 허가서(R.7)' /
      //   'Import License(R.7)' — 두 가지가 틀렸다:
      //   ⛔ 'Import License(수입 허가)'는 출국 전에 미리 받는 허가(위 id-import-permit-doc)다.
      //      도착 검역 자리(stepRef: departure)에 잘못 놓였다 — 말레이시아와 똑같은 복제 오류.
      //   ⛔ R.7 서식 번호는 근거 없음. 도착 검역을 마치면 받는 건 **반출 증명서(KH-14,
      //      Sertifikat Pelepasan Karantina)**다.
      id: 'id-import-quarantine-cert',
      name: '수입 검역 증명서(KH-14)',
      source: '인도네시아 검역본부(Barantin)',
      kind: 'step',
      stepRef: 'departure',
      group: 'quarantine',
      description:
        '인도네시아 수입 검역을 마치면 발급받아요.\n\n정확한 서류 이름은 Sertifikat Pelepasan Karantina(KH-14) 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'departure',
    },
    {
      // ✅ 2026-07-23 검역청(Barantin) 공식 안내 기준. 인도네시아 수출의 **최종 정부 수출검역
      //   증명서 = 검역청 발급 동물 건강증명서(Animal Health Certificate)**다. 지역 수의당국의
      //   수의증명서(Veterinary Certificate)는 이 최종 증명서를 받기 위한 선행 서류(카드에서 안내).
      //   ⛔ 태국 서식 'R.9'·'Export License' 를 되살리지 말 것.
      id: 'id-export-quarantine-cert',
      name: '동물 건강증명서(Animal Health Certificate)',
      source: '인도네시아 검역청(Barantin)',
      kind: 'step',
      stepRef: 'id-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '인도네시아 수출 검역 후 검역청(Barantin)이 발급하는 정부 수출검역증명서예요.\n\n한국 입국 때 반드시 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'id-export-quarantine',
    },
    {
      id: 'id-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  '필리핀': [
    // 태국과 동일 구조 — 항체검사(왕복, 55) → 수입허가 SPSIC(100) → 별지25(공통,
    // vet-visit 110). 순서는 일정 타임라인(step order)과 일치. 접종·건강증명서는 모든
    // 출국 케이스 공통인 별지 제25호 하나로 통합(영문 백신·건강 증명서 분리 제거).
    {
      id: 'ph-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      roundTripOnly: true,
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n한국 귀국 때 반드시 원본이 필요해요. 유효기간은 2년이에요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'ph-spsic-doc',
      name: '수입 허가증(SPSIC)',
      source: '필리핀 동물산업국(BAI)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '수입 허가 신청이 승인되면 발급돼요.\n\n발급일로부터 60일간 유효해요.\n\nPDF 파일로 발급되며, 앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
      previewStepId: 'import-permit',
    },
    // 접종 및 건강증명서(별지 제25호) — 일본·태국과 완전히 동일한 한국 공식 양식.
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'ph-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n필리핀 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'ph-export-quarantine-cert',
      name: '수출 허가증·국제 수의건강증명서',
      source: '필리핀 동물산업국(BAI)',
      kind: 'step',
      stepRef: 'ph-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '필리핀 수출 검역 후 발급돼요.\n\n정확한 서류 이름은 Export Permit, International Veterinary Health Certificate 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'ph-export-quarantine',
    },
    {
      id: 'ph-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  // 중국 — 공통(별지25·항체결과·한국 수출/수입 검역증) + 중국 고유 동물위생증명서(귀국용).
  // 중국은 항체검사가 입국 요건(비지정국)이라 roundTripOnly 아님. 입국 시 중국이 발급하는
  // 별도 증서는 없음(해관 확인만) — 그래서 '중국 수입 검역증' 항목은 두지 않는다.
  '중국': [
    {
      id: 'cn-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      description:
        '검사를 의뢰한 동물병원에서 발급받아요. 중국 해관(GACC) 지정 검사기관 결과가 필요해요.\n\n중국 입국 때 격리를 피하려면 반드시 원본이 필요해요. 결과는 채혈일로부터 1년간 유효해요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    // 접종 및 건강증명서(별지 제25호) — 일본·태국·필리핀과 동일한 한국 공식 양식.
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'cn-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n중국 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'cn-export-cert-doc',
      // '동물위생증명서'는 그 자체로 구분되는 이름이라 국가명을 붙이지 않는다 —
      // 한국 수출·수입 '동물검역증'과 헷갈릴 여지가 없다(2026-07-20 사용자 지정).
      // 국가명은 일반명 검역증에만 붙인다(일본·베트남 수출/수입 동물검역증).
      // 원어명(动物卫生证书)은 이름에서 빼고 설명문으로 옮겼다 — 일본이 정식 영문명을
      // 설명문에 두는 것과 같은 처리.
      name: '동물위생증명서',
      source: '중국 해관',
      kind: 'step',
      stepRef: 'cn-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '중국 해관에서 발급하는 출국용 동물위생증명서예요.\n\n정확한 서류 이름은 动物卫生证书 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'cn-export-quarantine',
    },
    {
      id: 'cn-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  // 베트남 — 별지25호 + 항체결과(귀국용) + 한국 수출/수입 검역증 + 베트남 수입 검역증.
  // 수입허가증이 없다(Thông tư 01/2026 제14조 — 2마리 이하 동반 면제). 베트남 건강증명서는
  // 한국 APQA 정부수의관이 발급하는 수출검역증이 그 역할을 하므로 별도 서류를 두지 않는다.
  //
  // 베트남 수입 검역증 — 도착 검역 후 발급된다. **정부 원문으로 확정**(2026-07-20).
  //   Thông tư 01/2026/TT-BNNMT 제14조 제1항 c호 — 동반 2마리 이하 경로에 그대로 적는다:
  //     "Trong thời hạn 01 ngày làm việc kể từ ngày thực hiện kiểm dịch, Cơ quan kiểm dịch động
  //      vật cửa khẩu **cấp Giấy chứng nhận kiểm dịch động vật nhập khẩu theo mẫu 15a**"
  //     (검역일로부터 1영업일 이내 국경 검역기관이 Mẫu 15a 로 수입 동물검역증명서를 발급)
  //   d호: 검체검사가 필요하면 5영업일 이내 발급.
  //   ※ 15b 는 **축산물**용이다(같은 조·부록 V). 서식 번호를 15b 로 적은 자료가 있어 주의.
  //   처음엔 행정절차 1.003113 만 근거였고 '동반 경로도 같은 서식인지'가 미확인이었는데,
  //   신 규칙 원문이 그 경로를 직접 규정해 해소됐다.
  //
  // 이름에 나라를 붙인다 — **'동물검역증' 이라는 일반명일 때만**(사용자 지정 2026-07-20).
  //   서류 목록에는 한국 수출·수입 동물검역증이 늘 함께 있어서(전 목적지 기본), 일반명이면
  //   나라를 안 붙였을 때 어느 나라 것인지 구분이 안 된다. 일본(일본 수입/수출 동물검역증)이
  //   같은 형태다.
  //   반면 **그 자체로 구분되는 이름은 안 붙인다** — 중국 동물위생증명서 → '동물위생증명서',
  //   태국 수입 허가서(R.7)·필리핀 수입 허가증(SPSIC)·대만 수입 허가증(Import Permit).
  //   목적지 탭이 이미 그 나라이고 한국 것과 헷갈릴 여지가 없다.
  '베트남': [
    {
      id: 'vn-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      roundTripOnly: true,
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n베트남 입국에는 필요 없지만 한국 귀국 때 반드시 원본이 필요해요. 유효기간은 2년이에요.\n\n베트남에는 검사 기관이 없으니 출국 전에 미리 받으세요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },

    // 접종 및 건강증명서(별지 제25호) — 한국 공식 양식(전 목적지 공통).
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'vn-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n베트남 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'vn-import-quarantine-cert',
      name: '베트남 수입 동물검역증',
      source: '베트남 동물검역소',
      kind: 'step',
      stepRef: 'departure',
      group: 'quarantine',
      description:
        '베트남 수입 검역 후 발급받아요.\n\n정확한 서류 이름은 Giấy chứng nhận kiểm dịch động vật nhập khẩu (Mẫu 15a) 입니다.\n\n베트남에서 출국할 때 필요할 수 있으므로 잘 보관해두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'departure',
    },
    {
      id: 'vn-export-quarantine-cert',
      name: '베트남 수출 동물검역증',
      source: '베트남 수의지국(Chi cục Thú y)',
      kind: 'step',
      stepRef: 'vn-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '베트남 수출 검역 후 발급받아요.\n\n정확한 서류 이름은 Giấy chứng nhận kiểm dịch động vật xuất khẩu (Mẫu 13a) 입니다.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'vn-export-quarantine',
    },
    {
      id: 'vn-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  // 대만 (APHIA) — 수입허가증 + 항체 결과지 + 별지 25호 + 한국 수출검역증 (+왕복 한국 수입검역증).
  //
  // ⚠️ **대만 수입 검역증은 두지 않는다** (2026-07-20 확인. 다시 "빠졌다"고 올리지 말 것)
  //   중국과 같은 이유 — 도착 검역 후 대만이 발급하는 증서가 확인되지 않는다.
  //   APHIA 공식 「犬貓輸入檢疫規定問答集」(2024-02, 17쪽) 전문 검색 결과:
  //     「輸入檢疫同意文件」(= import quarantine permit, 출발 전 발급) 10회
  //     「輸入檢疫證明書」 0회 / 放行·出所·解除隔離·領回·檢疫合格 전부 0회
  //   도착 절차 원문도 제출 서류와 수수료만 말한다: 「抵達輸入到達港站時，請檢附輸出國動物
  //   檢疫證明書正本、輸入檢疫同意文件影本 … 向動植物檢疫櫃檯申請檢疫」. 영문 공식 페이지
  //   두 곳(검역 안내·수입 FAQ)도 도착 후 발급 서류를 명시하지 않는다.
  //   → 대만이 발급하는 문서로 이름이 확인되는 건 輸入檢疫同意文件(=tw-import-permit) 뿐이고
  //     그건 이미 목록에 있다. 한때 www 가이드의 "수입 검역 증명서가 발급되며" 한 줄을 근거로
  //     추가했다가(ab4f62d6) 공식 문답집과 어긋나 되돌렸다 — 그 문장은 우리가 쓴 것이라
  //     당국 자료가 아니다.
  //   ※ 대만 **수출** 검역증은 실재한다(문답집에 我國開立之輸出動物檢疫證明書로 여러 번 등장).
  //     다만 의무가 아니라 목록에 안 넣는다 — catalog.ts tw-export-quarantine 주석 참고.
  // 순서·표기는 태국·필리핀(수입허가국)과 동일한 기준: 항체 결과지 → 수입허가증 → 별지25호
  // → 검역증. source 는 **발급 기관**만 적는다('APHIA 온라인 신청' 같은 신청 방법 X).
  // 이름에 나라를 붙이지 않는다 — 목적지 탭이 이미 대만이고, 태국(R.6)·필리핀(SPSIC)도 안 붙인다.
  // 베트남 골격 복제 4국 — 구성은 vietnamFamilyDocSpecs 주석 참고.
  '캄보디아': vietnamFamilyDocSpecs('캄보디아', 'kh', {
    noLocalTiterLab: true,
    exportQuarantineDoc: {
      // 정식 명칭·양식 번호 확인 실패 — NTR 에 수출용 양식이 게시돼 있지 않고 크메르어
      // 명칭도 확인되지 않았다. 포털이 쓰는 영문 표현(Veterinary Certificate)까지만 쓴다.
      name: '캄보디아 수출 검역 서류',
      // 기관명 GDAHP 로 통일(카드와 일치) — 2016 Sub-Decree 224 로 부서(DAHP)→총국 승격.
      // 상위 부처(농림수산부)는 빼고 기관명만 — 다른 나라 표기 층위와 맞추고(필리핀 동물산업국·
      // 대만 검역청…), 서류탭에서 한 줄에 들어간다(사용자 지정 2026-07-21).
      source: '캄보디아 동물보건생산국(GDAHP)',
      description:
        '캄보디아 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '몽골': vietnamFamilyDocSpecs('몽골', 'mn', {
    noLocalTiterLab: true,
    exportQuarantineDoc: {
      // 서식 번호는 미확인이지만 서류 종류는 확인됐다 — 수의증명서 지침이 동물 국제이동에
      // International Veterinary Certificate 를 쓰도록 규정한다(catalog mn-export-quarantine 주석).
      name: '몽골 국제수의증명서',
      // 기관 확정 — GAVS(수의총국). 카드 주석 참고(vet.gov.mn 실측, 2026-07-21).
      source: '몽골 수의총국(GAVS)',
      description:
        // 발급 시점은 다루지 않는다 — 국경검역법 25.4조(선적 전 24시간)와 수의증명서 지침
        // (최대 30일 유효)이 충돌하고 반려동물용 시행지침이 없다(카드 주석 참고).
        // 발급처(GAVS)·현지 동물병원 헤지는 **카드에 이미 있어** 서류탭에서 뺐다(사용자 지정
        // 2026-07-21). 언어·부수(몽골어·영어 2부)도 뺀다 — 부가정보다. 다시 넣지 말 것.
        '몽골 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  // 우즈베키스탄만 noLocalTiterLab 이 없다 — www 가이드에 '검사 기관이 없다'는 문장이 없다.
  '우즈베키스탄': vietnamFamilyDocSpecs('우즈베키스탄', 'uz', {
    exportQuarantineDoc: {
      // ⚠️ 구 이름 '국제수의증명서'와 'форма №5 계열'은 **폐지된 1302-сон(2018 폐지) 문언**
      //   이었다(catalog uz-export-quarantine 주석 참고). 현행 148-сон §48 의 서식은 부칙 9
      //   «тирик ҳайвон»(생체동물 수출 수의증명서)이고 법령 용어는 'ветеринария сертификати'
      //   = 수의증명서다. 서식 번호는 이름에 넣지 않는다. 되돌리지 말 것.
      name: '우즈베키스탄 수출 수의증명서',
      source: '우즈베키스탄 국경 수의검문소',
      description:
        // 일수(7영업일)는 쓰지 않는다 — §42 의 7영업일은 법정 처리 상한이지 반려동물 실제
        // 소요가 아니다(카드 주석 참고, 2026-07-21 철회). '국경 도착 후 4시간'도 폐지 법령
        // 문언이라 뺐다.
        '우즈베키스탄 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  // 아르헨티나 — 베트남 골격 복제(noLocalTiterLab 미확인이라 끔) + 귀국 수출 검역 서류 추가
  //   (2026-07-23, SENASA 조사). 수출 검역이 발급하는 건 **국제수의증명서(CVI)**다 — 검역청·수의당국
  //   (SENASA) 발급 정부 수출증명서. 지역 등록 수의사 건강증명서는 CVI 를 받기 위한 선행 서류(카드 안내).
  '아르헨티나': vietnamFamilyDocSpecs('아르헨티나', 'ar', {
    // 도착 검역은 심사만(가이드) — 발급 검역증 미확인이라 도착 서류 항목 제거(2026-07-23 사용자 A).
    //   도착 검역 카드는 유지(첨부 열림). 귀국 SENASA CVI 는 exportQuarantineDoc 로 유지.
    omitImportQuarantineDoc: true,
    exportQuarantineDoc: {
      name: '국제수의증명서(CVI)',
      source: '아르헨티나 검역·수의당국(SENASA)',
      description:
        '아르헨티나 수출 검역 후 SENASA가 발급하는 정부 수출검역증명서예요.\n\n유효기간이 문서에 기재되니 반드시 확인하세요. 한국 입국 때 원본이 필요하니 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '캐나다': vietnamFamilyDocSpecs('캐나다', 'ca', {
    // noLocalTiterLab 을 **켜지 않는다** — '캐나다에는 검사 기관이 없으니…' 문장을 카드·
    // 서류탭 양쪽에서 빼기로 했다(사용자 지정 2026-07-21). 캄보디아·몽골은 그대로 유지.
    // 캐나다는 동물검역소 검역이 아니라 CBSA 국경 심사라 '검역 후 받는 서류' 문형이 안 맞는다.
    // 발급물 자체가 확인되지 않았다(CFIA·CBSA 어느 쪽도 증서 발급을 언급하지 않음) — 없다고
    // 단정할 근거도 없어서, 받았다면 보관하라는 형태로만 남긴다.
    importQuarantineDoc: {
      source: '캐나다 국경관리기관(CBSA)',
      description:
        '캐나다 입국 심사 때 서류를 받으면 보관해두세요.\n\n캐나다는 별도 검역증을 발급하지 않을 수 있어요. 검사 수수료 영수증은 받아두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    exportQuarantineDoc: {
      // 한-캐 협상 완료된 전용 서식이라 4국 중 유일하게 정식 이름을 쓸 수 있다.
      // 서식 전체 이름은 'Veterinary Health Certificate for Dogs and Cats to Korea' 지만
      // 뒤 한정어는 뺐다(사용자 지정 2026-07-21) — 목적지 탭이 이미 캐나다이고 한국행 여정이라
      // 중복이고, 서류탭에서 두 줄로 넘어간다. 원문 전체 이름은 catalog 주석에 보존.
      name: '캐나다 수출 증명서(Veterinary Health Certificate)',
      source: '현지 동물병원 · 캐나다 검역기관(CFIA) 배서',
      description:
        '캐나다 출국 전 검역기관(CFIA) 배서를 받아 준비해요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  // 베트남 골격 복제 2차 5국 — 2026-07-20. 구성은 vietnamFamilyDocSpecs 주석 참고.
  // 모로코·우크라이나만 항체 결과지가 **입국용**이라 roundTripOnly 가 아니어야 하지만,
  // factory 가 왕복 전용으로 고정하고 있어 titerEntryDoc 로 갈아끼운다.
  '모로코': vietnamFamilyDocSpecs('모로코', 'ma', {
    titerEntryDoc: true,
    importQuarantineDoc: {
      source: '모로코 검역기관(ONSSA)',
      description:
        // 수수료 '마리당 10디르함'을 뺐다 — 공식 요금표에 근거가 없다(도착 카드 주석 참고).
        '모로코 국경 검역소에서 검역을 받은 뒤 받는 서류예요.\n\n세관 통관에 필요해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    exportQuarantineDoc: {
      // 한국 전용 서식이 실재해 정식 명칭을 쓸 수 있다.
      name: '모로코 수출 증명서(E.CARNI.CoréeSud)',
      source: '모로코 검역기관(ONSSA) 관용 수의사',
      description:
        '모로코 수출 검역 후 발급받아요. 한국행 전용 서식이에요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '우크라이나': vietnamFamilyDocSpecs('우크라이나', 'ua', {
    titerEntryDoc: true,
    exportQuarantineDoc: {
      name: '우크라이나 국제수의증명서',
      source: '우크라이나 검역기관(DPSS) 국경검사부서',
      description:
        '우크라이나 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '멕시코': vietnamFamilyDocSpecs('멕시코', 'mx', {
    importQuarantineDoc: {
      source: '멕시코 검역사무소(OISA)',
      description:
        // '검사 수수료는 없어요.' 삭제(사용자 지정 2026-07-22) — 서류 설명이 아니라 검역
        // 절차 정보이고, 같은 내용을 도착 검역 카드가 이미 말한다. 되살리지 말 것.
        '멕시코 공항 검역사무소에서 검역을 받은 뒤 받는 서류예요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    exportQuarantineDoc: {
      name: '멕시코 수출 동물위생증명서(CZE)',
      source: '멕시코 검역기관(SENASICA)',
      description:
        '멕시코 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '브라질': vietnamFamilyDocSpecs('브라질', 'br', {
    importQuarantineDoc: {
      source: '브라질 농축산 검역기관(VIGIAGRO)',
      description:
        '브라질 공항에서 검역을 받은 뒤 받는 서류예요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    exportQuarantineDoc: {
      name: '브라질 국제수의증명서(CVI)',
      source: '브라질 농축산 검역기관(VIGIAGRO)',
      description:
        '브라질 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '카자흐스탄': vietnamFamilyDocSpecs('카자흐스탄', 'kz', {
    importQuarantineDoc: {
      source: '카자흐스탄 국경 수의검역소',
      description:
        // '반려동물 2마리 이하는 국제 반려동물 여권이 수의증명서를 갈음해요.' 삭제
        // (사용자 지정 2026-07-22). 근거(EAEU 제15장 — 2두 이하 수입허가·격리 면제, 여권이
        // 수의증명서 갈음)는 procedure-checks/kz.ts 헤더에 보존. 도착 검역 카드가 같은
        // 내용을 이미 말한다. 되살리지 말 것.
        '카자흐스탄 국경에서 검역을 받은 뒤 받는 서류예요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    exportQuarantineDoc: {
      name: '카자흐스탄 수출 수의증명서',
      source: '카자흐스탄 수의통제감독위원회',
      description:
        '카자흐스탄 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  // 아랍에미리트 — 2026-07-22 등록. 수출 서류명·발급처는 조사로 확인된 값
  // (MOCCAE 수출 건강증명서, 발급일로부터 30일 유효 — 카드와 같은 근거).
  '아랍에미리트': vietnamFamilyDocSpecs('아랍에미리트', 'ae', {
    importQuarantineDoc: {
      source: '아랍에미리트 공항 검역소',
      description:
        '아랍에미리트 공항에서 검역을 받은 뒤 받는 서류예요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    exportQuarantineDoc: {
      name: '아랍에미리트 수출 건강증명서',
      source: '아랍에미리트 기후변화환경부(MOCCAE)',
      description:
        '아랍에미리트 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  // 러시아·튀르키예 — ⚠️ 카자흐스탄 복제(2026-07-22). **발급 기관명은 비웠다** — 카자흐스탄
  //   기관(수의통제감독위원회)·국경 수의검역소를 그대로 물려주면 명백한 오안내가 된다.
  //   factory 기본값('<나라> 동물검역소')을 쓰고, 실제 기관(러시아=Rosselkhoznadzor 계열,
  //   튀르키예=농림부 지방조직)은 창구·서식 확인 후 채운다. 카드 쪽도 같은 처리.
  '러시아': vietnamFamilyDocSpecs('러시아', 'ru', {
    // 도착 검역은 심사만(가이드: 공항 동물검역소 심사, 미충족 시 입국 불가) — 발급물 없어 도착
    //   서류 항목 제거(아르헨티나와 같은 처리, 2026-07-23). 도착 카드는 유지(첨부 열림).
    omitImportQuarantineDoc: true,
    exportQuarantineDoc: {
      name: '국제수의증명서(Form 5a)',
      source: '연방수의식물위생감독청(Rosselkhoznadzor)',
      description:
        '출국 공항에서 수의증명서(Form 1)를 국제수의증명서(Form 5a)로 교환해 받아요.\n\n한국 입국 때 원본이 필요하니 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '튀르키예': vietnamFamilyDocSpecs('튀르키예', 'tr', {
    exportQuarantineDoc: {
      // ✅ 발급 = 관할 시·구 농림청(İl/İlçe Tarım ve Orman Müdürlüğü), 증명서 = Veteriner
      //   Sağlık Sertifikası. 카자흐스탄 복제 잔재('수출 수의증명서'·'튀르키예 수의당국')를
      //   조사 확정값으로 교체(2026-07-23, 카드와 통일).
      name: '튀르키예 수의건강증명서(Veteriner Sağlık Sertifikası)',
      source: '튀르키예 관할 시·구 농림청(İl/İlçe Tarım ve Orman Müdürlüğü)',
      description:
        '튀르키예 수출 검역 후 발급받아요.\n\n한국 입국 때 필요하니 원본을 잘 보관하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
  }),
  '대만': [
    {
      id: 'tw-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n대만 입국 때 격리를 피하려면 반드시 원본이 필요해요. 결과는 채혈일로부터 1년간 유효해요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'tw-import-permit',
      name: '수입 허가증(Import Permit)',
      source: '대만 검역청(APHIA)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '대만 검역청(APHIA) 온라인 시스템에서 신청 후 발급받아요.\n\n도착 120일 전까지 신청해야 격리 없이 입국할 수 있어요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'import-permit',
    },
    // 접종 및 건강증명서(별지 제25호) — 일본·태국·필리핀·중국과 동일한 한국 공식 양식.
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      // 대만 입국용 건강증명서 — 일본 Form AC·EU Annex III 와 같은 성격(한국에서 준비).
      // Form 002 = 광견병 발생국(한국 포함)에서 오는 개·고양이용. 비발생국은 Form 001.
      // 서식 원본 헤더는 아직 구 기관명 'BAPHIQ Form 002'지만, 기관이 2023년 APHIA 로
      // 개칭돼 고객 표기는 APHIA 로 통일한다(홈페이지에 옛 서식이 그대로 남아있을 뿐).
      // 운영자 앱(펫무브워크)엔 이미 'tw' 증명서로 등록돼 PDF 를 생성하는데 고객 서류 목록에만
      // 빠져 있었다(2026-07-19 사용자 지적).
      id: 'tw-health-cert',
      name: '대만 건강증명서(APHIA Form 002)',
      source: '동물병원 · 농림축산검역본부',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      description:
        '대만 입국용 건강증명서예요.\n\n출국일 기준 10일 이내에 동물병원에서 발급받아요. 이 서류는 발급하지 않는 동물병원이 많으므로 미리 확인하세요.\n\n마이크로칩 번호, 광견병 백신 접종 내용, 항체 검사 결과, 수입 허가증 번호가 기재돼요.\n\n한국 수출 검역 때 검역관 확인·서명을 받아야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    {
      id: 'tw-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 검역 후 발급돼요.\n\n대만 수입 검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'tw-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
}

/**
 * EU 패밀리 공용 서류 스펙 — 나라 표기(label)만 갈아끼우는 factory. EU 의 destination 토큰은
 * 나라 이름('프랑스' 등)이라 SPECS(토큰 키)에 못 담는다 — destinationKey 기반 SPECS_BY_KEY 로
 * 조회 (resolveRequiredDocs 의 2차 lookup).
 */
function euFamilyDocSpecs(
  label: string,
  opts?: {
    withImportPermit?: boolean
    euAhc?: boolean
    certName?: string
    // '귀국 서류 준비'(eu-export-cert) 단계를 서류탭 체크리스트에도 노출할지 — 국가별로
    // 실제 필수 여부·명칭이 확인된 경우에만 채운다(그 외 EU 패밀리는 국가마다 서류
    // 종류·필수 여부가 달라 아직 미확인 — 2026-07-17 영국만 우선 확인해 채움).
    exportCertName?: string
    // 위 서류를 관장하는 공식 기관명 — 미지정 시 일반 문구로 폴백.
    exportCertSource?: string
  },
): RequiredDocSpec[] {
  const specs: RequiredDocSpec[] = [
    {
      id: 'eu-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'rabies-titer',
      description:
        '검사를 의뢰한 동물병원을 통해 발급받아요. 검사는 농림축산검역본부에서 해요.\n\n' +
        `${label} 입국 검사 때 반드시 원본이 필요해요.\n\n광견병 백신을 유효기간 안에 계속 추가 접종하면 결과지는 계속 유효해요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.`,
      previewStepId: 'rabies-titer',
    },
    // 별지 제25호(접종 및 건강증명서) — 한국 수출 검역에 필요한 모든 목적지 공통 서류.
    // EU 패밀리도 예외 없이 필요하다(factory 최초 작성 시 누락됐던 것 보강).
    KR_FORM25_VACCINATION_HEALTH_CERT,
    {
      id: 'eu-health-cert',
      // EU 회원국(eu 키) + 스위스는 EU 협정으로 같은 공식 양식 'EU 동물건강증명서(Annex III)'
      // 사용(스위스 BLV 공식 페이지 확인, 2026-07-17). 영국은 자체 공식 명칭(GB Pet Health
      // Certificate)이 있어 certName 으로 노출. 그 외(노르웨이 등)는 공식 명칭 미확인이라
      // 일반 명칭('건강증명서(입국용)') 유지.
      name: opts?.euAhc ? 'EU 동물건강증명서(Annex III)' : (opts?.certName ?? '건강증명서(입국용)'),
      source: '동물병원 · 농림축산검역본부',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      // EU 회원국+스위스(Annex III)는 EU 공식 양식 안내, 공식 명칭이 확인된 나라(영국)는
      // 그 명칭을 문구에도 노출, 그 외는 ${label} 기반 일반 문구 유지.
      description: opts?.euAhc
        ? '유럽연합(EU) 입국용 건강증명서예요.\n\n출국일 기준 10일 이내에 동물병원에서 발급받아요. 이 서류는 발급하지 않는 동물병원이 많으므로 미리 확인하세요.\n\n한국 수출 검역 때 검역관 확인·서명을 받아야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.'
        : `${label} 입국용 건강증명서예요.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 작성하고, 한국 수출 검역 때 검역관의 확인을 받아요.\n\n마이크로칩 번호, 광견병 백신 접종 내용, 항체 검사 결과가 기재되어야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.`,
    },
    {
      id: 'eu-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        `한국 수출 검역 후 발급돼요.\n\n${label} 입국 검사 때 제시해야 할 수 있어요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.`,
      previewStepId: 'certificate-issue',
    },
    {
      id: 'eu-kr-import-quarantine-cert',
      name: '한국 수입 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'kr-import-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국 수입 검역 후 발급돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ]
  // '귀국 서류 준비' 단계 — 실제 필수 여부·서류명이 확인된 나라만(현재 영국) 체크리스트에
  // 노출. eu-kr-export-quarantine-cert(한국 출국 검역) 다음, eu-kr-import-quarantine-cert
  // (한국 입국 검역) 전 — 여정 순서(현지 발급 → 한국 입국) 그대로.
  if (opts?.exportCertName) {
    specs.splice(specs.length - 1, 0, {
      id: 'eu-export-cert-doc',
      name: opts.exportCertName,
      source: opts.exportCertSource ?? '현지 정부기관 · 지정 수의사',
      kind: 'step',
      stepRef: 'eu-export-cert',
      group: 'quarantine',
      roundTripOnly: true,
      description: `${label} 정부가 발행하는 반려동물 수출건강증명서예요.\n\n${label} 출국과 한국 입국을 위한 필수 서류로, 지정된 수의사(공인 수의사)에게 발급받아요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.`,
      previewStepId: 'eu-export-cert',
    })
  }
  if (opts?.withImportPermit) {
    specs.unshift({
      id: 'eu-import-permit-doc',
      name: '수입 허가증(FSVO)',
      source: '스위스 연방 식품안전수의청(FSVO)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '스위스 연방 식품안전수의청(FSVO)에서 발급받아요.\n\n입국 최소 3주 전까지 신청해야 해요.\n\n스위스 입국 검사 때 원본을 제시해야 해요.\n\n앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
      previewStepId: 'import-permit',
    })
  }
  return specs
}

/**
 * destinationKey(destination-config 키) 기반 스펙 — EU 패밀리처럼 destination 토큰이 나라마다
 * 달라(프랑스·독일…) 토큰 키(SPECS)로 못 담는 목적지용. resolveRequiredDocs 가 토큰 매칭 실패
 * 시 여기로 폴백.
 */
const SPECS_BY_KEY: Record<string, RequiredDocSpec[]> = {
  eu: euFamilyDocSpecs('유럽연합(EU)', { euAhc: true }),
  uk: euFamilyDocSpecs('영국', {
    certName: '영국 동물건강증명서(GB Pet Health Certificate)',
    exportCertName: '영국 수출 동물건강증명서(EHC 3908)',
    // EHC 서식(3908EHC) 상단에 DEFRA 산하 기관으로 명시된 공인 수의사(Official
    // Veterinarian) 인증 체계 — APHA(Animal and Plant Health Agency) 소관.
    exportCertSource: '영국 동식물보건청(APHA) · 공인 수의사',
  }),
  ireland: euFamilyDocSpecs('아일랜드', { euAhc: true }),
  malta: euFamilyDocSpecs('몰타', { euAhc: true }),
  norway: euFamilyDocSpecs('노르웨이'),
  finland: euFamilyDocSpecs('핀란드', { euAhc: true }),
  // 스위스는 EU 회원국은 아니지만 EU-스위스 수의 협정으로 제3국발 비상업적 반려동물
  // 수입에 같은 Annex III 서식을 쓴다(BLV 공식 안내 확인, 2026-07-17).
  switzerland: euFamilyDocSpecs('스위스', { withImportPermit: true, euAhc: true }),
  cyprus: euFamilyDocSpecs('키프로스', { euAhc: true }),
}

/** destination 토큰('프랑스'·'영국' 등) → destination-config 키('eu'·'uk'). 매칭 실패 시 null. */
function findDestinationKeyForDocs(destinationToken: string): string | null {
  const override = getDestinationOverride(destinationToken)
  if (!override) return null
  for (const [key, value] of Object.entries(DESTINATION_OVERRIDES)) {
    if (value === override) return key
  }
  return null
}

export function resolveRequiredDocs(
  destination: string | null | undefined,
  caseRow: CaseRow,
): RequiredDocItem[] | null {
  if (!destination) return null
  // 1차: destination 토큰 키('일본'·'태국' 등) / 2차: destination-config 키('eu'·'uk' 등 —
  // EU 패밀리처럼 토큰이 나라 이름이라 열거 불가능한 목적지).
  const keyForDocs = findDestinationKeyForDocs(destination)
  // 큐레이션 spec(일본·태국·필리핀·EU 패밀리)이 없으면 기본 [별지25] 로 폴백 — 모든 목적지가
  // 최소 1건의 필수 서류를 갖는다('서류 목록 없음' 케이스 제거).
  const allSpecs = SPECS[destination] ?? (keyForDocs ? SPECS_BY_KEY[keyForDocs] : undefined) ?? DEFAULT_SPECS
  // 왕복 전용 서류(예: 한국 귀국용 항체 검사 결과지)는 편도 케이스에서 제외 —
  // 목록·vet-visit 완료 게이트 양쪽에서 빠진다.
  const tripType = getTripType((caseRow.data ?? {}) as Record<string, unknown>, destination)
  const specs = allSpecs.filter((s) => !s.roundTripOnly || tripType === 'round')
  if (specs.length === 0) return null
  const flags = readBoolFlags(caseRow, 'required_doc_flags')
  const naFlags = readBoolFlags(caseRow, 'required_doc_na')
  // 운영자(펫무브워크 서류탭)가 준비상태를 '완료'로 바꾸면(export_doc_status='done') 수기 서류
  // (별지25·FormAC)를 보유로 인정 — 보호자 수기 토글·사본 첨부와 OR. 다중 목적지는 호출 전
  // 활성 목적지로 flatten 되어 by_dest 의 export_doc_status 만 surface 되므로, 한 목적지의 완료가
  // 다른 목적지 체크리스트로 번지지 않는다. (내원일·출국일 변경 시 admin 이 해당 스코프의
  // export_doc_status 를 리셋하므로 단계 되돌리기 시 서류도 자동으로 '발급 예정'으로 복귀.)
  const exportDocDone =
    ((caseRow.data ?? {}) as Record<string, unknown>).export_doc_status === 'done'
  return specs.map((spec) => {
    // 첨부 대상 stepId — step 연동 서류는 공유 step, 그 외는 doc.id 자체.
    const attachStepId = spec.previewStepId ?? spec.id
    const naAllowed = spec.naAllowed === true
    // '해당없음' 으로 표시한 서류는 보유 판정 자체를 끈다(첨부가 있어도 카운트 제외).
    const na = naAllowed && naFlags[spec.id] === true
    // 발급 step — 명시(issuanceStepId) 우선, kind='step' 이면 stepRef 폴백.
    const issuanceStepId = spec.issuanceStepId ?? (spec.kind === 'step' ? spec.stepRef : undefined)
    // 발급 step 시작 여부 — 1차 입력(검진일·신청일 등) 존재 = started. 일정탭이 단일 truth 라
    // manual 서류 verified 의 전제 조건으로 사용: 단계가 시작 전이면 수기 플래그·첨부가 남아있어도
    // 보유로 인정하지 않음 → 단계 되돌리기(검진일 삭제) 시 서류도 자동으로 '발급 예정'으로 복귀.
    const issuanceStarted = !isIssuanceNotStarted(issuanceStepId, caseRow)
    const verified =
      !na &&
      (spec.kind === 'manual'
        ? // 운영자 서류탭 '완료' OR (발급 step 시작됨 AND (수기 발급완료 플래그 OR 사본 첨부)) → '보유'.
          exportDocDone ||
          (issuanceStarted && (flags[spec.id] === true || hasAttachmentForStep(caseRow, attachStepId)))
        : spec.stepRef
          ? resolveStepDone(spec.stepRef, caseRow)
          : false)
    const awaiting = !verified && !na && !issuanceStarted
    return {
      id: spec.id,
      name: spec.name,
      source: spec.source,
      manual: spec.kind === 'manual',
      naAllowed,
      na,
      awaiting,
      description: spec.description,
      group: spec.group,
      previewStepId: spec.previewStepId,
      attachStepId,
      verified,
      templates: spec.templates,
    }
  })
}

/**
 * 발급 step 이 아직 '시작 전'인지 — 그 step 의 1차 입력(채혈일·신청일·검진일·검역일 등)이
 * 없으면 true(=발급 예정, dim). 시작됐으면(in_progress) false(=활성, '준비중'), 완료면
 * verified 가 true 라 awaiting 자체가 false.
 *
 * 'started' 판별: resolveCompletedDate 가 그 step 의 1차 날짜를 done 여부와 무관하게
 * 반환한다(없으면 null). 단 그 날짜가 **도래(≤ 오늘)** 했을 때만 시작으로 본다 —
 * 미래(예정) 검진일·신청일·채혈일은 아직 그 단계가 일어나기 전이라, 거기서 발급되는
 * 서류(별지25·FormAC·결과지·허가증 등)를 '보유/준비중'으로 잡지 않는다(발급 예정 유지).
 * (단계 완료(done-resolver)도 동일하게 날짜 ≤ 오늘 게이트를 둔다 — 표시·완료 일관.) 그래서:
 *   - 광견병 항체 검사 도래(채혈일 ≤ 오늘) → 결과지 '준비중'(활성), 미래 채혈 예정이면 발급 예정
 *   - 사전 신고 도래(신청일 ≤ 오늘) → 허가증 '준비중', 그 뒤(검진·검역) 발급 서류는 발급 예정
 * issuance step 미지정·카탈로그 누락이면 false (보수적: dim 처리 안 함).
 */
function isIssuanceNotStarted(issuanceStepId: string | undefined, caseRow: CaseRow): boolean {
  if (!issuanceStepId) return false
  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === issuanceStepId)
  if (!step) return false
  const completed = resolveCompletedDate(step.done, caseRow)
  return completed === null || completed.slice(0, 10) > todayKst()
}

/** case.data.documents 에 해당 stepId 태그의 파일이 하나라도 있으면 true. */
function hasAttachmentForStep(caseRow: CaseRow, stepId: string): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const docs = Array.isArray(data.documents) ? (data.documents as Array<Record<string, unknown>>) : []
  return docs.some((d) => !!d && typeof d === 'object' && d.stepId === stepId)
}

/**
 * 큐레이션된 필수 서류가 모두 ✓ 인지(verified 또는 해당없음). 모든 목적지가 최소 [별지25]
 * 를 갖도록 DEFAULT_SPECS 로 폴백하므로, destination 이 있으면 spec 도 항상 있다.
 *
 * `uptoStepId` 가 주어지면 그 step 까지 발급되는 서류만 게이트에 넣는다 — 그 step 보다
 * 뒤에 발급되는 서류(예: 한국 수출 동물검역증은 certificate-issue 발급물)는 아직 발급 전이라
 * 제외. 서류 페이지 체크리스트가 previewStepId 로 미래 서류를 가리는 것과 동일 규칙이라,
 * 보이는 서류가 다 ✓ 면 곧 완료가 되도록 맞춘다.
 *
 * 서류 체크리스트 done-resolver 가 'document-checklist'(order 115) 로 호출 — 그 시점까지의
 * 서류(항체검사 결과지·허가증·별지25·FormAC/RE 등)가 다 갖춰지면 자동 완료. 한국 수출
 * 동물검역증(certificate-issue, order 120)은 검역소 방문 때 발급물이라 게이트에서 제외된다.
 */
export function areAllRequiredDocsVerified(caseRow: CaseRow, uptoStepId?: string): boolean {
  const items = resolveRequiredDocs(caseRow.destination, caseRow)
  if (!items || items.length === 0) return false
  let scoped = items
  if (uptoStepId) {
    const cutoff = JOURNEY_STEP_CATALOG.find((s) => s.id === uptoStepId)?.order
    if (cutoff != null) {
      scoped = items.filter((d) => {
        // previewStepId 미지정(별지25·FormAC 등) = 현재 step 발급물 → 포함.
        if (!d.previewStepId) return true
        const ref = JOURNEY_STEP_CATALOG.find((s) => s.id === d.previewStepId)
        return ref ? ref.order <= cutoff : true
      })
    }
  }
  if (scoped.length === 0) return false
  return scoped.every((d) => d.verified || d.na)
}

/** 단일 docId 의 spec 을 찾는다 — 상세 페이지에서 사용. */
export function findRequiredDoc(
  destination: string | null | undefined,
  docId: string,
  caseRow: CaseRow,
): RequiredDocItem | null {
  const all = resolveRequiredDocs(destination, caseRow)
  if (!all) return null
  return all.find((d) => d.id === docId) ?? null
}

function resolveStepDone(stepId: string, caseRow: CaseRow): boolean {
  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!step) return false
  // 목적지 오버라이드된 done 우선 — 예: 'departure'는 일본에서 'has-jp-import-quarantine'로
  // 교체된다(base 'departure-past'면 검역 완료를 잘못 판정). done 미오버라이드면 base 그대로.
  const { destinationKey, destinationToken } = buildCaseJourneyContext(caseRow)
  const resolved = resolveStepForDestination(step, destinationKey, destinationToken)
  return resolveDone(resolved.done, caseRow)
}

/** case.data 의 boolean 플래그 맵(required_doc_flags / required_doc_na) 읽기. true 만 남긴다. */
function readBoolFlags(caseRow: CaseRow, key: string): Record<string, boolean> {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = data[key]
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out[k] = true
  }
  return out
}
