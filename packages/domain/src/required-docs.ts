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
    '농림축산검역본부 지정 양식의 접종 및 건강증명서예요.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 발급해요.\n\n원본 2부를 준비해서, 한국 수출 동물검역 때 1부를 제출해요.\n\n접종과 출국 전 임상검사를 한 동물병원이 다른 경우, 각 동물병원에서 따로 증명서를 받아야 해요.\n\n이 서류를 발급하지 않는 동물병원도 있으니 미리 확인하세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
  templates: [
    { label: 'PDF', href: '/forms/form25.pdf', filename: '별지 제 25호 서식.pdf' },
    { label: '한글(HWP)', href: '/forms/form25.hwp', filename: '별지 제 25호 서식.hwp' },
  ],
}

/**
 * 큐레이션 spec 이 없는 목적지의 기본 필수 서류 — 별지 제25호(접종 및 건강증명서) 하나.
 * 한국에서 출국하는 모든 케이스는 최소한 이 서류가 필요하므로 '서류 목록 없음' 케이스는
 * 없다. (서류 체크리스트 단계 done='all-required-docs' 가 모든 목적지에서 동작하도록.)
 */
const DEFAULT_SPECS: RequiredDocSpec[] = [KR_FORM25_VACCINATION_HEALTH_CERT]

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
      name: '일본 증명서(Form AC)',
      source: '동물병원',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      description:
        '일본 지정 양식의 접종, 검사 및 건강증명서예요.\n출국일 기준 10일 이내에 동물병원에서 발급받아요. 이 서류는 발급하지 않는 동물병원이 많으므로 미리 확인하세요.\n\n재입국인 경우 Form AC 대신 Form RE와 일본 수출 동물검역증(Export Quarantine Certificate)을 준비해야 할 수 있어요. 일본 동물검역소 혹은 담당 동물병원에 확인하세요.\n한국 수출 동물검역 때 검역관 확인·서명을 받아야 해요.\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '한국 수출 동물검역 후 발급받아요.\n\n일본 수입 동물검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '일본 수입 동물검역 후 발급받아요.\n\n정확한 서류 이름은 Import Quarantine Certificate 입니다.\n\n일본에서 출국할 때 필요할 수 있으므로 잘 보관해두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '일본 수출 동물검역 후 발급받아요.\n\n정확한 서류 이름은 Export Quarantine Certificate 입니다.\n\n향후 일본 재입국 시 필요할 수 있으니 잘 보관해두세요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '한국 수입 동물검역 후 발급받아요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n태국 입국에는 필요하지 않지만, 한국으로 돌아올 때 반드시 원본이 필요해요.\n\n광견병 백신 면역 유효기간 유지 시 채혈일로부터 2년까지 사용할 수 있어요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'th-import-permit-doc',
      name: '수입 허가 통지서(R.6)',
      source: '태국 동물검역소(AQS)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        '수입 허가 신청 후 이메일로 받는 서류예요.\n\n발급일로부터 60일간 유효해요.\n\nPDF 파일로 발급되며, 앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
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
        '한국 수출 동물검역 후 발급받아요.\n\n태국 수입 동물검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '태국 수입 동물검역 후 발급받아요.\n\n정확한 서류 이름은 Import License(R.7) 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '태국 수출 동물검역 후 발급받아요.\n\n정확한 서류 이름은 Export License(R.9)와 Official Animal Health Certificate 입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '한국 수입 동물검역 후 발급받아요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
  '필리핀': [
    {
      id: 'ph-spsic-doc',
      name: '수입허가증(SPSIC)',
      source: '필리핀 동물산업국(BAI)',
      kind: 'step',
      stepRef: 'import-permit',
      description:
        'Intercommerce 온라인 신청 후 필리핀 동물산업국(BAI)에서 발급받아요.\n\n발급일로부터 60일간 유효하며 연장할 수 없어요.\n\n필리핀 도착 후 수입 동물검역 때 원본을 제시해야 해요.\n\n앱에 저장해두면 필요할 때 쉽게 사용할 수 있어요.',
      previewStepId: 'import-permit',
    },
    {
      id: 'ph-health-cert-en',
      name: '영문 건강증명서(Health Certificate)',
      source: '동물병원',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      description:
        '임상 수의사가 영문으로 발급하는 건강증명서예요.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 발급해요.\n\n마이크로칩 번호, 접종 기록, 기생충 치료 확인, 수의사 서명과 면허번호가 들어가야 해요.\n\n영어로 작성하거나 공인 영문 번역본이 필요해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    {
      id: 'ph-vaccine-cert-en',
      name: '예방접종·구충 증명서(영문)',
      source: '동물병원',
      kind: 'manual',
      issuanceStepId: 'general-vaccine',
      description:
        '광견병 백신·종합백신의 접종 증명서와 내외부 구충 치료 기록이에요.\n\n접종한 동물병원에서 영문으로 발급받아요. 접종한 동물병원이 여러 곳인 경우, 각 동물병원에서 따로 받아야 해요.\n\n백신 이름·제조사·접종일·유효기간과 수의사 서명이 들어가야 해요.\n\n수입허가증(SPSIC) 신청과 동물검역에 사용돼요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
    },
    {
      id: 'ph-rabies-titer-result',
      name: '광견병 항체 검사 결과지',
      source: '동물병원',
      kind: 'step',
      stepRef: 'rabies-titer',
      roundTripOnly: true,
      description:
        '검사를 의뢰한 동물병원에서 발급받아요.\n\n필리핀 입국에는 필요하지 않지만, 한국으로 돌아올 때 반드시 원본이 필요해요. 필리핀 현지에서는 검사가 어려우므로 출국 전에 미리 받아두세요.\n\n광견병 백신 면역 유효기간 유지 시 채혈일로부터 2년까지 사용할 수 있어요.\n\n앱에 사본 이미지를 저장해두면 검사 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'rabies-titer',
    },
    {
      id: 'ph-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        '한국 수출 동물검역 후 발급받아요.\n\n필리핀 수입 동물검역 때 원본을 제시해야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'certificate-issue',
    },
    {
      id: 'ph-export-quarantine-cert',
      name: '필리핀 수출 동물검역증',
      source: '필리핀 동물산업국(BAI)',
      kind: 'step',
      stepRef: 'ph-export-quarantine',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '필리핀 수출 동물검역 후 발급받아요.\n\n정확한 서류 이름은 수출 허가와 건강증명서입니다.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
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
        '한국 수입 동물검역 후 발급받아요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ],
}

/**
 * EU 패밀리 공용 서류 스펙 — 나라 표기(label)만 갈아끼우는 factory. EU 의 destination 토큰은
 * 나라 이름('프랑스' 등)이라 SPECS(토큰 키)에 못 담는다 — destinationKey 기반 SPECS_BY_KEY 로
 * 조회 (resolveRequiredDocs 의 2차 lookup).
 */
function euFamilyDocSpecs(label: string, opts?: { withImportPermit?: boolean }): RequiredDocSpec[] {
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
    {
      id: 'eu-health-cert',
      name: '건강증명서(입국용)',
      source: '동물병원·농림축산검역본부',
      kind: 'manual',
      issuanceStepId: 'vet-visit',
      description:
        `${label} 입국용 건강증명서예요.\n\n출국일 기준 10일 이내에 임상 수의사가 검진 후 작성하고, 한국 수출 동물검역 때 검역관의 확인을 받아요.\n\n마이크로칩 번호, 광견병 백신 접종 내용, 항체 검사 결과가 기재되어야 해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.`,
    },
    {
      id: 'eu-kr-export-quarantine-cert',
      name: '한국 수출 동물검역증',
      source: '농림축산검역본부',
      kind: 'step',
      stepRef: 'certificate-issue',
      group: 'quarantine',
      description:
        `한국 수출 동물검역 후 발급받아요.\n\n${label} 입국 검사 때 제시해야 할 수 있어요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.`,
      previewStepId: 'certificate-issue',
    },
    {
      id: 'eu-export-cert-doc',
      name: '현지 검역증명서',
      source: '현지 동물병원·정부 기관',
      kind: 'step',
      stepRef: 'eu-export-cert',
      group: 'quarantine',
      roundTripOnly: true,
      description:
        '한국으로 돌아오기 전 현지 동물병원·정부 기관에서 발급받는 한국 입국용 건강증명서(검역증명서)예요.\n\n한국 수입 동물검역 때 제출해요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'eu-export-cert',
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
        '한국 수입 동물검역 후 발급받아요.\n\n앱에 사본 이미지를 저장해두면 관련 정보를 확인할 때 편리해요.',
      previewStepId: 'kr-import-quarantine',
    },
  ]
  if (opts?.withImportPermit) {
    specs.unshift({
      id: 'eu-import-permit-doc',
      name: '수입허가증(FSVO)',
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
  eu: euFamilyDocSpecs('유럽연합(EU)'),
  uk: euFamilyDocSpecs('영국'),
  ireland: euFamilyDocSpecs('아일랜드'),
  malta: euFamilyDocSpecs('몰타'),
  norway: euFamilyDocSpecs('노르웨이'),
  finland: euFamilyDocSpecs('핀란드'),
  switzerland: euFamilyDocSpecs('스위스', { withImportPermit: true }),
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
  // (별지25·FormAC)를 보유로 인정 — 보호자 수기 토글·사본 첨부와 OR. export_doc_status 는
  // 케이스 단위(top-level) 상태라 케이스 전체에 적용된다. (내원일·출국일 변경 시 admin 이
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
  const { destinationKey } = buildCaseJourneyContext(caseRow)
  const resolved = resolveStepForDestination(step, destinationKey)
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
