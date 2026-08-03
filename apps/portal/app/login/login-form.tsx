'use client'

import { useEffect, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { nativeGoogleLogin } from '@/lib/native/native-oauth'
import { nativeAppleLogin } from '@/lib/native/native-apple'
import { LogoMark } from '@/components/portal-shell/logo-mark'

const buttonBaseClass =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-md h-10 px-md text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30 disabled:pointer-events-none disabled:opacity-50 select-none'
const socialButtonClass = `${buttonBaseClass} border border-[rgba(33,33,36,0.16)] bg-white text-[#212124] hover:bg-[#F2F2F4]`
// 카카오·네이버 = 각 사 공식 버튼 색(카카오 노랑 #FEE500+검정 85%, 네이버 초록 #03C75A+흰색).
// 구글은 공식 가이드가 흰 아웃라인이라 socialButtonClass 그대로.
const kakaoButtonClass = `${buttonBaseClass} bg-[#FEE500] text-[rgba(0,0,0,0.85)] hover:bg-[#F2DA00]`
const naverButtonClass = `${buttonBaseClass} bg-[#03C75A] text-white hover:bg-[#02B351]`
// 주 버튼 = 브랜드 하늘색(#0BAEFF, --pm-accent). 이 화면은 bg-white 고정이라 라이트 값 사용.
const primaryButtonClass = `${buttonBaseClass} bg-[#0BAEFF] text-white hover:bg-[#099CE6] focus-visible:ring-[#0BAEFF]/40`
// Apple 가이드라인: Sign in with Apple 버튼은 검정/흰색 + Apple 로고, 다른 소셜 버튼과
// 동등한 크기·위치(Guideline 4.8). 흰색(아웃라인) 변형 — 카카오·네이버·구글의 크림 톤과
// 어울리도록. 로고·글자는 검정(currentColor). iOS 네이티브에서만 노출.
const appleButtonClass = `${buttonBaseClass} border border-[rgba(0,0,0,0.18)] bg-white text-black hover:bg-[#F4F4F4]`

// 앱스토어/플레이 심사용 숨김 로그인 — 이 이메일을 입력할 때만 비밀번호칸이 나타나고
// 비밀번호 로그인으로 전환된다. 일반 사용자는 평소처럼 매직링크. (계정 비번은 코드에 없음)
const REVIEW_EMAIL = 'review@petmove.co.kr'

// 모바일 키보드가 이메일에 끼워넣는 공백·비가시 문자(NBSP·zero-width 등)까지 제거해
// 비교한다 — 심사관/운영자가 손으로 입력해도 판정이 어긋나지 않도록. 이메일엔 내부 공백이
// 없으므로 전부 제거해도 안전.
// ⚠️ 유니코드 property escape(\p{...})는 일부 구형 모바일 브라우저가 파싱 못 해 청크 전체를
//   깨뜨린다 → \s + 명시적 \u 이스케이프만 사용(전 브라우저 안전).
function normalizeEmail(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .toLowerCase()
}

export function LoginForm({
  next,
  initialError = null,
}: {
  next: string
  initialError?: string | null
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 자동완성 동기화용 — 아래 useEffect 참고.
  const emailRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  // 이메일 로그인 = 6자리 인증번호 방식. 링크 클릭 방식은 "링크를 요청한 브라우저(앱)"와
  // "링크를 연 브라우저(메일앱→크롬/사파리)"가 달라지면 보안 검증이 어긋나 로그인이 안 되는
  // 구조적 문제가 있어 폐기 (2026-08-01, 실사용자 로그인 실패 사례). 인증번호는 요청한 화면
  // 안에서 입력해 끝나므로 이 문제가 없다.
  // step: 'email' = 이메일 입력 화면, 'otp' = 인증번호 입력 화면.
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [otp, setOtp] = useState('')
  // 발송에 실제로 쓴(정규화된) 이메일 — 검증 요청은 반드시 이 값과 짝을 이뤄야 한다.
  const [sentEmail, setSentEmail] = useState('')
  // Apple 로그인은 iOS 네이티브에서만 동작 — 그 환경에서만 버튼을 노출한다.
  const [isIOSNative, setIsIOSNative] = useState(false)

  useEffect(() => {
    void import('@capacitor/core').then(({ Capacitor }) => {
      setIsIOSNative(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios')
    })
  }, [])

  useEffect(() => {
    if (!initialError || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.has('error')) {
      url.searchParams.delete('error')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [initialError])

  // Google·카카오는 둘 다 Supabase builtin OAuth — provider 만 다름.
  async function oauthLogin(provider: 'google' | 'kakao') {
    setLoading(provider)
    setError(null)
    setInfo(null)

    // 구글은 네이티브 앱에서 WebView OAuth 가 차단됨(disallowed_useragent) → Custom Tab +
    // 딥링크 경로로 처리. 웹/PWA 면 handled=false 라 아래 builtin 흐름으로 이어진다.
    if (provider === 'google') {
      const res = await nativeGoogleLogin(next)
      if (res.handled) {
        if (res.error) {
          setError(res.error)
          setLoading(null)
        }
        // 성공: Custom Tab 열림 → 복귀는 NativeAuthListener 가 처리. loading 유지.
        return
      }
    }

    // next 는 cookie 로 — Supabase OAuth 의 redirect_to allowlist 가 query 포함
    // URL 을 정확 매칭 못 해서 query 는 비우고 callback 에서 cookie 로 읽음.
    const redirectTo = `${window.location.origin}/auth/callback`
    if (next && next !== '/') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // 카카오는 프로필 사진을 명시적으로 요청해야 동의 화면에 뜨고 반환됨 (구글은 기본 제공).
        ...(provider === 'kakao'
          ? { scopes: 'account_email profile_nickname profile_image' }
          : {}),
      },
    })

    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  function naverOAuth() {
    // 네이버는 Supabase builtin 이 아니라 자체 라우트 사용 (apps/portal/app/api/auth/naver).
    setLoading('naver')
    setError(null)
    setInfo(null)
    window.location.href = `/api/auth/naver?next=${encodeURIComponent(next)}`
  }

  async function appleLogin() {
    setLoading('apple')
    setError(null)
    setInfo(null)
    const res = await nativeAppleLogin(next)
    if (res.error) {
      setError(res.error)
      setLoading(null)
      return
    }
    // 성공(success): nativeAppleLogin 이 window.location.href 로 전체 리로드를 건 상태 →
    // loading 을 풀지 않고 '로그인 중…' 스피너를 유지한다(리로드가 끝날 때까지). 풀면 그 사이
    // 로그인 폼(첫 화면)이 잠깐 보였다가 로그인됨. 구글(handled 시 return)과 동일한 처리.
    if (res.success) return
    // 성공도 에러도 아니면 = 사용자가 Apple 시트를 취소 → 폼으로 복귀.
    setLoading(null)
  }

  const isReviewLogin = normalizeEmail(email) === REVIEW_EMAIL

  // 브라우저·비밀번호 관리자가 **페이지 로드 시점에** 채우는 자동완성은 React 에 input 이벤트를
  // 흘리지 않는다 — DOM 에는 이메일이 보이는데 state 는 빈 채로 남는다. 그래서 심사용 이메일이
  // 채워져 있어도 isReviewLogin 이 false 라 비밀번호칸이 안 뜨고 버튼도 '인증번호 받기'에
  // 머물렀다(2026-08-03 재현 — 자동완성만 그렇고 손으로 치면 정상이라 원인이 안 보였다).
  // 이메일 단계가 떠 있는 동안 DOM 실제 값을 주기적으로 state 에 맞춘다. 마운트 직후 몇 번만
  // 확인하는 방식은 자동완성이 언제 도착하느냐에 기대게 되는데, 그 시점이 브라우저·비밀번호
  // 관리자마다 제각각이라(로드 직후 / 포커스 시 / 한참 뒤) 놓치는 조합이 남는다.
  // 로그인 화면 한 곳의 가벼운 비교라 주기 확인이 가장 확실하다.
  // (사용자가 직접 고른 자동완성이나 손 입력은 input 이벤트가 정상적으로 흘러 onChange 가 처리한다.)
  useEffect(() => {
    if (step !== 'email') return
    const sync = () => {
      const v = emailRef.current?.value
      if (v) setEmail((prev) => (prev === v ? prev : v))
    }
    sync()
    const id = setInterval(sync, 300)
    return () => clearInterval(id)
  }, [step])

  // Supabase 인증 에러(영어)를 사용자 언어로. 매칭 안 되면 원문 그대로.
  function otpErrorMessage(message: string): string {
    if (/expired|invalid/i.test(message))
      return '인증번호가 올바르지 않거나 만료됐어요. 다시 확인하거나 아래에서 새 인증번호를 받아주세요.'
    const wait = message.match(/after (\d+) seconds/i)
    if (wait) return `보안을 위해 잠시 후 다시 요청할 수 있어요. (${wait[1]}초 뒤)`
    if (/rate limit/i.test(message))
      return '요청이 너무 많아 잠시 막혔어요. 조금 뒤에 다시 시도해주세요.'
    return message
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setError('이메일을 먼저 입력하세요.')
      return
    }
    setError(null)
    setInfo(null)

    // 심사용 비밀번호 로그인 (숨김) — 지정 이메일일 때만.
    if (isReviewLogin) {
      if (!password) {
        setError('비밀번호를 입력하세요.')
        return
      }
      setLoading('magic')
      // 판정이 통과했으니 실제 로그인엔 깨끗한 상수 이메일을 쓴다(입력에 낀 비가시 문자 방지).
      const { error } = await supabaseBrowser.auth.signInWithPassword({ email: REVIEW_EMAIL, password })
      setLoading(null)
      if (error) {
        setError(error.message)
        return
      }
      window.location.href = next && next !== '/' ? next : '/cases'
      return
    }

    setLoading('magic')

    if (next && next !== '/') {
      document.cookie = `pm_oauth_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`
    }

    // 발송·검증이 같은 이메일 문자열로 짝을 이루도록 정규화본을 쓴다.
    const target = normalizeEmail(email)
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email: target,
      // 메일 템플릿의 예비 링크({{ .ConfirmationURL }})용 — 주 경로는 인증번호 입력.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setLoading(null)
    if (error) {
      setError(otpErrorMessage(error.message))
      return
    }
    setSentEmail(target)
    setOtp('')
    setStep('otp')
    setInfo(null)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    const token = otp.replace(/\D/g, '')
    if (token.length !== 6) {
      setError('메일로 받은 6자리 인증번호를 입력하세요.')
      return
    }
    setError(null)
    setInfo(null)
    setLoading('verify')

    const { error } = await supabaseBrowser.auth.verifyOtp({
      email: sentEmail,
      token,
      type: 'email',
    })

    if (error) {
      setLoading(null)
      setError(otpErrorMessage(error.message))
      return
    }
    // 세션 쿠키가 생긴 상태 → 서버 콜백에서 보호자 프로필 생성 + 케이스 자동 연결을 마친 뒤
    // next 로 이동한다 (OAuth 로그인과 같은 마무리 경로). loading 유지 = 이동 중 스피너.
    window.location.href = `/auth/callback${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`
  }

  async function resendOtp() {
    setError(null)
    setInfo(null)
    setLoading('magic')
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email: sentEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(null)
    if (error) {
      setError(otpErrorMessage(error.message))
      return
    }
    setOtp('')
    setInfo('인증번호를 다시 보냈습니다. 메일을 확인하세요.')
  }

  // 소셜 로그인 진행 중(특히 구글은 외부 브라우저를 다녀오는 ~2초)에는 로그인 폼 대신
  // 스플래시와 같은 화면(하늘 그라디언트+"펫무브"+구름·P)을 보여준다 — 앱 시작→로그인→진입이
  // 한 장면처럼 이어지고, 구글 복귀 시 로그인 폼이 다시 뜬 것처럼 보이던 것도 방지.
  // 레이아웃 수치는 네이티브 스플래시 스펙(docs/brand/app-assets-wip/SPEC.md)과 동일:
  // 워드마크 상단 42%·화면폭 10%·자간 -0.03em, 구름 하단 고정·폭 100%·높이 67vw.
  // 매직링크(magic)는 같은 화면에서 끝나며 안내문을 보여줘야 하므로 제외.
  if (loading === 'google' || loading === 'kakao' || loading === 'naver' || loading === 'apple') {
    return (
      <div
        className="relative min-h-dvh overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #63C9FF, #0BAEFF)' }}
      >
        <span
          className="absolute inset-x-0 top-[42%] text-center text-white"
          style={{ fontSize: 'clamp(34px, 10vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em' }}
        >
          펫무브
        </span>
        <div className="absolute inset-x-0 top-[58%] flex flex-col items-center gap-sm">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
          <p className="text-sm text-white/90">로그인 중…</p>
        </div>
        {/* 구름+P — www 시안 최종 CTA 와 같은 문법: 그림을 절대 늘이지 않는다.
            원본 비율(208:134) 고정으로 하단 가운데 정렬 → P 가 어떤 화면에서도 안 찌그러짐.
            화면이 그림보다 넓으면(데스크톱) 그림의 평평한 밑단(y160, 아래 40/134)과 같은
            높이의 전폭 흰 지면 밴드가 좌우를 채운다.
            --cw 104vw = 세로 폰에서 구 스펙(폭 200 viewBox·높이 67vw)과 동일 스케일,
            상한 34vh*208/134 = 그림 높이 34vh 제한(워드마크 42%·스피너 58% 안 덮음). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ '--cw': 'min(104vw, 34vh * 208 / 134)' } as React.CSSProperties}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-white"
            style={{ height: 'calc(var(--cw) * 40 / 208)' }}
          />
          <svg
            className="absolute bottom-0 left-1/2 -translate-x-1/2"
            style={{ width: 'var(--cw)', height: 'calc(var(--cw) * 134 / 208)' }}
            viewBox="-6 66 208 134"
          >
            <path
              d="M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106"
              fill="none"
              stroke="#FFC93C"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="-6" y="160" width="208" height="40" fill="#ffffff" />
            <circle cx="46" cy="168" r="52" fill="#ffffff" />
            <circle cx="72" cy="120" r="48" fill="#ffffff" />
            <circle cx="112" cy="148" r="34" fill="#ffffff" />
            <circle cx="146" cy="138" r="38" fill="#ffffff" />
            <circle cx="178" cy="154" r="24" fill="#ffffff" />
            <path
              d="M116 132 L116 118"
              fill="none"
              stroke="#FFC93C"
              strokeWidth="18"
              strokeLinecap="round"
              opacity="0.34"
            />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-md py-xl">
      <div className="w-full max-w-sm space-y-lg">
        <div className="space-y-md text-center">
          {/* 브랜드 로고 — 스플래시(하늘·구름·P)와 이어지는 인상. 상단바 LogoMark 재사용. */}
          <div className="flex justify-center">
            <LogoMark size={56} />
          </div>
          <h1 className="font-display text-[28px] leading-tight text-[#212124]">펫무브</h1>
          {/* 첫 방문자용 한 줄 소개 — "무슨 앱인지"만. 홍보 문구(두 번째 줄)는 2026-07-15 제거. */}
          <p className="text-sm leading-snug text-[#97979C]">반려동물과 함께하는 해외여행</p>
        </div>

        <div className="space-y-sm">
          {isIOSNative && (
            <button
              type="button"
              className={appleButtonClass}
              disabled={loading !== null}
              onClick={appleLogin}
            >
              <svg viewBox="0 0 384 512" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C32.7 141.5-8 184.6-8 270.7c0 25.4 4.6 51.7 13.9 78.8 12.4 35.7 57.2 123.3 103.9 121.9 24.4-.6 41.7-17.3 73.5-17.3 30.8 0 46.8 17.3 73.9 17.3 47.1-.7 87.6-80.3 99.4-116.1-63.1-29.7-59.8-87-58.8-86.6zM255.2 80.9c30.6-36.3 27.8-69.4 26.9-81.3-26.9 1.6-58 18.4-75.7 39.1-19.5 22.2-31 49.7-28.5 80.2 29.1 2.2 55.6-12.7 77.3-38z" />
              </svg>
              {loading === 'apple' ? '로그인 중…' : 'Apple로 계속하기'}
            </button>
          )}
          <button
            type="button"
            className={kakaoButtonClass}
            disabled={loading !== null}
            onClick={() => oauthLogin('kakao')}
          >
            {/* 카카오 공식 심볼 — 말풍선 */}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.33 4.68 6.75-.15.52-.96 3.33-1 3.55 0 0-.02.17.09.24.11.07.24.02.24.02.32-.04 3.66-2.4 4.24-2.81.57.08 1.15.13 1.75.13 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
            </svg>
            {loading === 'kakao' ? '이동 중…' : '카카오 계정으로 계속'}
          </button>
          <button
            type="button"
            className={naverButtonClass}
            disabled={loading !== null}
            onClick={naverOAuth}
          >
            {/* 네이버 공식 심볼 — N */}
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
              <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
            </svg>
            {loading === 'naver' ? '이동 중…' : '네이버 계정으로 계속'}
          </button>
          <button
            type="button"
            className={socialButtonClass}
            disabled={loading !== null}
            onClick={() => oauthLogin('google')}
          >
            {loading === 'google' ? '이동 중…' : 'Google 계정으로 계속'}
          </button>
        </div>

        <div className="flex items-center gap-sm text-xs text-[#97979C]">
          <div className="h-px flex-1 bg-[rgba(33,33,36,0.12)]" />
          <span>또는 이메일</span>
          <div className="h-px flex-1 bg-[rgba(33,33,36,0.12)]" />
        </div>

        {step === 'email' ? (
          <form onSubmit={sendOtp} className="space-y-sm">
            <input
              ref={emailRef}
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={(e) => setEmail(e.currentTarget.value)}
              onCompositionEnd={(e) => setEmail(e.currentTarget.value)}
              // 일부 모바일 키보드는 조합 중 onChange 를 늦게 흘려 state 가 안 갱신될 수 있다 —
              // 포커스가 빠질 때(빈 화면 탭 등) DOM 실제 값으로 한 번 더 동기화.
              onBlur={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-md border border-[rgba(33,33,36,0.16)] bg-white px-sm py-2 text-sm text-[#212124] placeholder:text-[#97979C]/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30"
            />
            {isReviewLogin && (
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-[rgba(33,33,36,0.16)] bg-white px-sm py-2 text-sm text-[#212124] placeholder:text-[#97979C]/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30"
              />
            )}
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={loading !== null || !email || (isReviewLogin && !password)}
            >
              {isReviewLogin
                ? loading === 'magic'
                  ? '로그인 중…'
                  : '로그인'
                : loading === 'magic'
                  ? '발송 중…'
                  : '이메일로 인증번호 받기'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-sm">
            <p className="text-center text-xs leading-relaxed text-[#5C5C60]">
              <span className="font-medium text-[#212124]">{sentEmail}</span> 로 보낸
              <br />
              6자리 인증번호를 입력하세요.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              // 메일앱에서 복사해 온 번호를 iOS/Android 키보드가 자동 제안하도록.
              autoComplete="one-time-code"
              autoFocus
              className="w-full rounded-md border border-[rgba(33,33,36,0.16)] bg-white px-sm py-2 text-center text-[20px] font-semibold tracking-[0.4em] text-[#212124] placeholder:text-[#97979C]/40 placeholder:tracking-[0.4em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#212124]/30"
            />
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={loading !== null || otp.length !== 6}
            >
              {loading === 'verify' ? '로그인 중…' : '로그인'}
            </button>
            <div className="flex items-center justify-center gap-md pt-1 text-xs text-[#97979C]">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[#5C5C60] disabled:opacity-50"
                disabled={loading !== null}
                onClick={resendOtp}
              >
                {loading === 'magic' ? '발송 중…' : '인증번호 다시 받기'}
              </button>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[#5C5C60] disabled:opacity-50"
                disabled={loading !== null}
                onClick={() => {
                  setStep('email')
                  setOtp('')
                  setError(null)
                  setInfo(null)
                }}
              >
                이메일 변경
              </button>
            </div>
          </form>
        )}

        {info && (
          <p className="rounded-md border border-[rgba(33,33,36,0.16)] bg-[#F7F7F8] p-sm text-xs text-[#5C5C60]">
            {info}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-[#C26A4A]/30 bg-[#C26A4A]/10 p-sm text-xs text-[#C26A4A]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
