import type { ContactSection } from './jp-quarantine-contacts'

export type { ContactEmail, ContactRow, ContactSection } from './jp-quarantine-contacts'

/**
 * 태국 동물검역소(AQS — Animal Quarantine Station, 축산국 DLD 소속) 연락처 —
 * '수입 허가 신청' step 에서 진입하는 내부 leaf 페이지 데이터.
 *
 * 출처: 태국 축산국(DLD) 공식 안내 + 태국 외교부 PDF(Rev. 30 Jan 2025).
 * 수입 허가 신청·문의는 입국하는 공항의 동물검역소 이메일로 한다.
 */
export const TH_AQS_CONTACTS: ContactSection[] = [
  {
    title: '태국 입국 공항 동물검역소(AQS)',
    subtitle:
      '수입 허가 신청과 문의는 입국하는 공항의 동물검역소 이메일로 합니다. 신청서(R1/1)와 서류를 첨부해 보내세요.',
    rows: [
      {
        name: '수완나품 국제공항 (BKK)',
        location: '방콕',
        phones: [],
        faxes: [],
        emails: [{ address: 'qsap_bkk_import@dld.go.th' }],
      },
      {
        name: '돈므앙 국제공항 (DMK)',
        location: '방콕',
        phones: [],
        faxes: [],
        emails: [{ address: 'qsap_dmk@dld.go.th' }],
      },
      {
        name: '치앙마이 국제공항 (CNX)',
        location: '치앙마이',
        phones: [],
        faxes: [],
        emails: [{ address: 'qsap_cnx@dld.go.th' }],
      },
      {
        name: '푸켓 국제공항 (HKT)',
        location: '푸켓',
        phones: [],
        faxes: [],
        emails: [{ address: 'qsap_hkt@dld.go.th' }],
      },
    ],
  },
]
