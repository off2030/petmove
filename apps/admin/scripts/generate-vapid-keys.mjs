#!/usr/bin/env node
// VAPID 공개/비공개 키 1회 생성. Web Push 구독에 필요.
// 실행: pnpm --filter @petmove/admin gen:vapid
//
// 출력된 두 줄을 .env.local 및 Vercel 프로젝트 환경변수에 추가:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>      (브라우저 노출 OK)
//   VAPID_PRIVATE_KEY=<privateKey>                (서버 전용, 절대 노출 X)
//   VAPID_SUBJECT=mailto:admin@petmove.kr         (도메인 메일로 변경)
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()
console.log('# .env.local 및 Vercel 환경변수에 추가:')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log('VAPID_SUBJECT=mailto:admin@petmove.kr  # 본인 도메인 메일로 변경')
