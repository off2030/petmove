// journey-cards.jsx — 여정 완료/지난여정/완료확인 팝업 디자인 시안
// 설계: docs/journey-lifecycle-design.md §4(팝업)·§5(지난 여정)·§8(표식)
// 기존 톤 재사용: IOSDevice(ios-frame), PetAvatar·Icon(shared), Stone Calm 팔레트.

const C = {
  bg: '#F5EFE8', surface: '#FBF7F1', ink: '#2A2620', ink2: '#6B6457', ink3: '#9A9286',
  line: 'rgba(42,38,32,.08)', line2: 'rgba(42,38,32,.14)',
  accent: '#B89968', soft: '#E8DCC4', sage: '#8FA68C', sageDeep: '#6E8A6B',
  cardList: 'linear-gradient(160deg, #F5EDE0 0%, #F2E9DC 50%, #ECE3D3 100%)',
  cardHero: 'radial-gradient(140% 100% at 80% 18%, #E8DECC 0%, #DCD2BD 45%, #CBC1AB 100%)',
};
const serif = { fontFamily: "'Fraunces', 'Pretendard Variable', serif", fontWeight: 500, letterSpacing: '-0.01em' };
const num = { fontFamily: "'Fraunces', 'Inter', serif", fontVariantNumeric: 'tabular-nums', fontWeight: 400 };
const monoCap = { fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.ink3, fontWeight: 500 };

// ── 도착 도장 (여권 스탬프 스타일 — 회전 + 이중 테두리, 세이지 잉크) ──────────
function ArrivalStamp({ size = 108, date = '2025.11', rotate = -8 }) {
  const ink = C.sageDeep;
  return (
    <div style={{ width: size, height: size, position: 'relative', transform: `rotate(${rotate}deg)`, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2.5px solid ${ink}`, opacity: .5 }} />
      <div style={{ position: 'absolute', inset: size * 0.08, borderRadius: '50%', border: `1px solid ${ink}`, opacity: .38 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: ink, opacity: .8 }}>
        <div style={{ fontSize: size * 0.085, letterSpacing: '0.22em', fontWeight: 700 }}>ARRIVED</div>
        <div style={{ ...serif, fontSize: size * 0.2, lineHeight: 1, margin: '3px 0' }}>도착</div>
        <div style={{ ...num, fontSize: size * 0.09 }}>{date}</div>
      </div>
    </div>
  );
}

// 작은 도장 (지난 여정 목록 — 원 테두리 + 체크)
function MiniStamp({ size = 44, rotate = -6 }) {
  const ink = C.sageDeep;
  return (
    <div style={{ width: size, height: size, position: 'relative', transform: `rotate(${rotate}deg)`, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${ink}`, opacity: .45 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, opacity: .72 }}>
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
    </div>
  );
}

// ── ① 완료 카드 (도착 직후, 일정 탭) ────────────────────────────────────────
function ArrivalCard() {
  return (
    <div style={{ margin: '0 24px', padding: '30px 24px 26px', borderRadius: 22, background: C.cardHero, boxShadow: '0 1px 0 rgba(255,255,255,.35) inset', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <ArrivalStamp size={112} date="2025.11" />
      <h2 style={{ ...serif, fontSize: 24, margin: '22px 0 0', color: C.ink, fontWeight: 500 }}>몽이와 잘 도착했어요</h2>
      <div style={{ fontSize: 13, color: C.ink2, marginTop: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>한국</span><span style={{ color: C.ink3 }}>⇄</span><span>일본</span>
        <span style={{ ...num, color: C.ink3, marginLeft: 4 }}>2025.06.23 – 11.15</span>
      </div>
      <button style={{ marginTop: 22, padding: '11px 22px', borderRadius: 999, border: 'none', background: C.accent, color: '#FBF7F1', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <Icon name="sparkle" size={15} color="#FBF7F1" /> 소감 남기기
      </button>
    </div>
  );
}

// ── ② 지난 여정 카드 목록 (반려동물 › 여정, 진행 중 카드 아래) ───────────────
function PastJourneys() {
  const items = [
    { dest: '일본', date: '2025.06.23', arrow: '⇄' },
    { dest: '베트남', date: '2024.03.10', arrow: '→' },
  ];
  return (
    <div style={{ margin: '0 24px', background: C.cardList, borderRadius: 20, boxShadow: '0 1px 0 rgba(255,255,255,.45) inset', padding: '2px 16px' }}>
      {items.map((it, i, arr) => (
        <div key={it.dest + it.date} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i === arr.length - 1 ? 'none' : `.5px solid ${C.line}`, cursor: 'pointer' }} className="pm-pressable">
          <MiniStamp size={44} rotate={i % 2 === 0 ? -6 : 5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...serif, fontSize: 16, color: C.ink2, fontWeight: 500 }}>
              한국 <span style={{ color: C.ink3 }}>{it.arrow}</span> {it.dest}
            </div>
            <div style={{ ...num, fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{it.date} 출국</div>
          </div>
          <Icon name="chevron" size={16} color={C.ink3} />
        </div>
      ))}
    </div>
  );
}

// ── ③ 완료 확인 팝업 (바텀시트) ─────────────────────────────────────────────
function ConfirmSheet({ title, sub, options }) {
  return (
    <div style={{ margin: '0 24px', borderRadius: 24, background: C.surface, boxShadow: '0 12px 40px rgba(42,38,32,.16)', border: `.5px solid ${C.line}`, padding: '10px 20px 20px' }}>
      <div style={{ width: 38, height: 4, borderRadius: 999, background: C.line2, margin: '4px auto 16px' }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><PetAvatar size={52} /></div>
      <h3 style={{ ...serif, fontSize: 19, textAlign: 'center', margin: 0, color: C.ink, fontWeight: 500, lineHeight: 1.35, textWrap: 'balance' }}>{title}</h3>
      {sub && <p style={{ fontSize: 12.5, textAlign: 'center', color: C.ink2, margin: '9px 0 0', lineHeight: 1.5 }}>{sub}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
        {options.map((o) => (
          <button key={o.label} style={{
            padding: '13px', borderRadius: 14, fontFamily: 'inherit', fontSize: 14.5, cursor: 'pointer',
            ...(o.kind === 'primary'
              ? { background: C.accent, color: '#FBF7F1', border: 'none', fontWeight: 600 }
              : o.kind === 'danger'
                ? { background: 'transparent', color: C.ink3, border: 'none', fontWeight: 500 }
                : { background: 'transparent', color: C.ink, border: `1px solid ${C.line2}`, fontWeight: 600 }),
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── 갤러리 ─────────────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ ...monoCap, padding: '0 24px', marginBottom: 12 }}>{label}</div>
      {children}
    </div>
  );
}

function JourneyCardsGallery() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '32px 16px', background: 'linear-gradient(155deg, #DCD4F2 0%, #E8DCEB 35%, #F5DCD8 70%, #F8E1CE 100%)' }}>
      <IOSDevice width={390} height={844}>
        <div className="pm-noscroll" style={{ height: '100%', overflow: 'auto', background: C.bg }}>
          <div style={{ ...serif, fontSize: 25, color: C.ink, padding: '64px 24px 24px', fontWeight: 500 }}>여정 카드 시안</div>
          <Section label="일정 탭 · 완료 카드"><ArrivalCard /></Section>
          <Section label="반려동물 › 여정 · 지난 여정"><PastJourneys /></Section>
          <Section label="완료 확인 · A형 (출국·귀국 다음날)">
            <ConfirmSheet
              title="몽이와의 일본 여정 잘 마쳤나요?"
              options={[
                { label: '잘 다녀왔어요', kind: 'primary' },
                { label: '아직 진행 중이에요', kind: 'secondary' },
                { label: '이 여정은 취소할게요', kind: 'danger' },
              ]}
            />
          </Section>
          <Section label="완료 확인 · B형 (유효기간 만료·방치)">
            <ConfirmSheet
              title="몽이의 일본 준비가 멈춰 있어요"
              sub="광견병 항체 유효기간이 지났어요. 계속 준비하시나요?"
              options={[
                { label: '네, 계속 준비할게요', kind: 'primary' },
                { label: '이 여정은 취소할게요', kind: 'danger' },
              ]}
            />
          </Section>
          <div style={{ height: 30 }} />
        </div>
      </IOSDevice>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<JourneyCardsGallery />);
