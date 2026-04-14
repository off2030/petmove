export interface CalcInput {
  country: string
  departureDate: string // YYYY-MM-DD
  testDate: string      // YYYY-MM-DD (광견병 항체가 검사일/채혈일)
}

export interface CalcResult {
  label: string
  date: string  // YYYY-MM-DD
  description: string
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function subtractDays(dateStr: string, days: number): string {
  return addDays(dateStr, -days)
}

export function calculate(input: CalcInput): CalcResult[] {
  const results: CalcResult[] = []

  switch (input.country) {
    case 'japan': {
      if (input.testDate) {
        results.push({
          label: '입국가능일',
          date: addDays(input.testDate, 180),
          description: '채혈일 + 180일 (광견병 항체가 대기기간)',
        })
      }
      if (input.departureDate) {
        results.push({
          label: '수입신고 마감일',
          date: subtractDays(input.departureDate, 40),
          description: '출발일 - 40일 (NACCS 사전신고 기한)',
        })
      }
      break
    }
    case 'australia': {
      if (input.departureDate) {
        results.push({
          label: '전염병검사 가능일',
          date: subtractDays(input.departureDate, 45),
          description: '출발일 - 45일 (검사 유효기간 시작)',
        })
      }
      if (input.testDate) {
        results.push({
          label: '입국가능일',
          date: addDays(input.testDate, 180),
          description: '채혈일 + 180일 (광견병 항체가 대기기간)',
        })
      }
      break
    }
    case 'newzealand': {
      if (input.departureDate) {
        results.push({
          label: '전염병검사 가능일',
          date: subtractDays(input.departureDate, 30),
          description: '출발일 - 30일 (검사 유효기간 시작)',
        })
      }
      if (input.testDate) {
        results.push({
          label: '입국가능일',
          date: addDays(input.testDate, 180),
          description: '채혈일 + 180일 (광견병 항체가 대기기간)',
        })
      }
      break
    }
  }

  return results
}

export const COUNTRIES = [
  { value: 'japan', label: '일본' },
  { value: 'australia', label: '호주' },
  { value: 'newzealand', label: '뉴질랜드' },
] as const
