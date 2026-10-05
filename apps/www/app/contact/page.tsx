import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CONTACT } from '@/lib/site-data'

export const metadata: Metadata = {
  title: '문의 · 펫무브',
  description: '펫무브 상담·문의 - 카카오톡 상담·전화·네이버 예약으로 편하게 연락주세요.',
  alternates: { canonical: '/contact/' },
}

export default function ContactPage() {
  return (
    <div className="pg pg-hub">
      <SiteHeader active="contact" />

      <div className="phead">
        <div className="container">
          <h1>문의</h1>
          <p className="lead">궁금한 점이 있으면 편한 채널로 연락주세요</p>
        </div>
      </div>

      <section>
        <div className="container">
          <div className="csec">
            <div className="cblock">
              <h2 className="cl">고객 상담</h2>
              <a className="chan" href={CONTACT.kakao} target="_blank" rel="noopener">
                <i className="ti ti-message-circle" />
                <span>
                  <span className="cv">카카오톡 상담</span>
                  {/* 설명 줄 없음(2026-10-05 사용자 지정). 앱 이용 문의 카드를 지운 뒤 앱 문의도 이 채널로 받는다. */}
                </span>
              </a>
              <a className="chan" href={`tel:${CONTACT.tel}`}>
                <i className="ti ti-phone" />
                <span>
                  <span className="cv">전화 {CONTACT.tel}</span>
                  <div className="cs">로잔동물의료센터</div>
                </span>
              </a>
              <a className="chan" href={CONTACT.naverBooking} target="_blank" rel="noopener">
                <span className="nlogo">N</span>
                <span>
                  <span className="cv">네이버 예약</span>
                  <div className="cs">로잔동물의료센터</div>
                </span>
              </a>
              <div className="copen">
                <i className="ti ti-clock" />
                응대 시간 {CONTACT.hours}
              </div>
            </div>
            <div className="cblock">
              <h2 className="cl">제휴 업무 문의</h2>
              <a className="chan" href={`mailto:${CONTACT.email}`}>
                <i className="ti ti-mail" />
                <span>
                  <span className="cv">{CONTACT.email}</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
