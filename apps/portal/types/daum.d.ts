// 카카오(다음) 우편번호 API 글로벌 — share-form 의 주소 검색 위젯에서 사용.
// admin 의 동일 declaration 을 portal 도 동일 형태로 가짐 (단일 출처화는 추후 packages/* 정리 시).

export interface DaumPostcodeResult {
  roadAddress: string
  roadAddressEnglish: string
  jibunAddress: string
  zonecode: string
  buildingName: string
  apartment: string
  sido: string
  sigungu: string
  bname: string
  roadname: string
}

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: {
        oncomplete: (data: DaumPostcodeResult) => void
        width?: string
        height?: string
      }) => { embed: (el: HTMLElement) => void }
    }
  }
}
