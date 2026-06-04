// app.jsx — 보호자 앱 메인 셸: iOS 디바이스 프레임, 상하단 chrome, 화면 라우팅

function PetMoveApp() {
  const [screen, setScreen] = React.useState('timeline');
  const scenario = window.SCENARIO;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(155deg, oklch(0.92 0.04 295) 0%, oklch(0.91 0.05 320) 40%, oklch(0.90 0.05 40) 75%, oklch(0.92 0.04 60) 100%)',
        zIndex: -1,
      }} />
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}>
        <PhoneShell screen={screen} onNav={setScreen} scenario={scenario} ringShape="B"/>
      </div>
    </>
  );
}

function PhoneShell({ screen, onNav, scenario, ringShape }) {
  return (
    <div style={{ position: 'relative' }}>
      <IOSDevice width={390} height={844} dark={false}>
        <PMScreenContent screen={screen} scenario={scenario} onNav={onNav} ringShape={ringShape}/>
        <ThemeControls onNav={onNav}/>
        <BottomNav screen={screen} onNav={onNav} />
      </IOSDevice>
    </div>
  );
}

function PMScreenContent({ screen, scenario, onNav, ringShape }) {
  return (
    <div className="pm-app pm-noscroll" style={{
      paddingTop: 76,
      height: '100%', overflow: 'auto',
      background: '#F4EFEA',
    }}>
      {screen === 'timeline' && <Timeline scenario={scenario} onNav={onNav} ringShape={ringShape}/>}
      {screen === 'docs' && <Documents scenario={scenario} onNav={onNav}/>}
      {screen === 'info' && <Info scenario={scenario}/>}
      {screen === 'profile' && <Profile scenario={scenario}/>}
    </div>
  );
}

// 다이내믹 아일랜드 우측: PETMOVE 워드마크 (좌, 클릭 시 첫 화면=timeline) + 팔레트·다크모드 (우)
function ThemeControls({ onNav }) {
  const btn = {
    width: 40, height: 40, borderRadius: '50%', border: 0,
    background: 'transparent',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--pm-ink-2)',
    padding: 0,
  };
  return (
    <div style={{
      position: 'absolute', top: 44, left: 0, right: 0, zIndex: 50,
      height: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 22px',
      pointerEvents: 'none',
    }}>
      <button
        type="button"
        aria-label="첫 화면"
        onClick={() => onNav && onNav('timeline')}
        style={{
          // 펫무브워크 PETMOVE 워드마크와 동일 — Alonzo ExtraLight + faux bold.
          fontFamily: "'Alonzo', 'Bodoni Moda', 'Playfair Display', serif",
          fontWeight: 700, fontSize: 17, letterSpacing: '0.025em',
          color: 'var(--pm-ink-3)',
          pointerEvents: 'auto', lineHeight: 1,
          background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
        }}
      >PETMOVE</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'auto' }}>
        {/* 설정 진입 — 테마·다크는 빈 토글이 아니라 설정(/settings) 안으로 이동. */}
        <button aria-label="설정" title="설정" style={btn} onClick={() => onNav && onNav('settings')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function BottomNav({ screen, onNav }) {
  const items = [
    { id: 'timeline', label: '일정', icon: 'route' },
    { id: 'docs', label: '서류', icon: 'doc' },
    { id: 'info', label: '정보', icon: 'info' },
    { id: 'profile', label: '프로필', icon: 'user' },
  ];
  // Liquid Glass (iOS 26 풍) — 흰색 글래스로 페이지 살구 톤과 의도적 대비.
  return (
    <div style={{
      position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
      zIndex: 40, display: 'flex', gap: 12, padding: 6, borderRadius: 9999,
      background: 'rgba(255,255,255,0.30)',
      backdropFilter: 'blur(28px) saturate(180%)',
      WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.45)',
      boxShadow: '0 14px 36px -10px rgba(0,0,0,0.20), 0 2px 8px -2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
    }}>
      {items.map(it => {
        const active = screen === it.id;
        return (
          <button key={it.id} onClick={() => onNav(it.id)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: active ? 'rgba(255,255,255,0.75)' : 'transparent',
            border: 'none', cursor: 'pointer',
            padding: '7px 20px', borderRadius: 9999, fontFamily: 'inherit',
            color: active ? 'var(--pm-ink)' : 'var(--pm-ink-3)',
            boxShadow: active
              ? '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.75)'
              : 'none',
            transition: 'background 180ms ease, color 180ms ease',
          }}>
            <Icon name={it.icon} size={19} stroke={active ? 2 : 1.7}/>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── 정보: 보호자 / 동물 / 여행 / 항공권 ──────────────────────────────────
function Info({ scenario }) {
  const { pet, guardian, trip, flights } = scenario;

  const C = {
    bg: '#F2EDE6', surface: '#FBF7F1', ink: '#2A2620', ink2: '#6B6457', ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)', accent: '#B89968', soft: '#E8DCC4', sage: '#8FA68C',
  };
  const serif = { fontFamily: "'Fraunces', 'Pretendard Variable', serif", fontWeight: 500, letterSpacing: '-0.01em' };
  const num = { fontFamily: "'Fraunces', 'Inter', serif", fontVariantNumeric: 'tabular-nums', fontWeight: 400 };
  const monoCap = { fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.ink3, fontWeight: 500 };

  const Section = ({ label, children }) => (
    <>
      <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>{label}</div>
      <div style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 18, padding: '4px 16px' }}>
        {children}
      </div>
    </>
  );

  const Row = ({ label, value, value2, last, wrap }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: wrap ? 'flex-start' : 'center',
      padding: '13px 0', borderBottom: last ? 'none' : `.5px solid ${C.line}`,
      gap: 12,
    }}>
      <span style={{ fontSize: 12.5, color: C.ink2, flexShrink: 0, paddingTop: wrap ? 2 : 0 }}>{label}</span>
      <div style={{ textAlign: 'right', minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13.5, color: C.ink, fontWeight: 500,
          overflow: wrap ? 'visible' : 'hidden',
          textOverflow: wrap ? 'clip' : 'ellipsis',
          whiteSpace: wrap ? 'normal' : 'nowrap',
          lineHeight: wrap ? 1.5 : 1.3,
          textWrap: 'pretty',
        }}>{value}</div>
        {value2 && <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{value2}</div>}
      </div>
    </div>
  );

  const isRoundtrip = trip.tripType === 'roundtrip';

  return (
    <div className="pm-fade-up pm-noscroll" style={{
      position: 'absolute', inset: 0, background: C.bg, color: C.ink,
      paddingTop: 72, paddingBottom: 100, overflow: 'auto',
    }}>
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 30, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>정보</h1>
        <Section label="보호자 정보">
          <Row label="성함" value={
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span>{guardian.name}</span>
              <span style={{ width: 1, height: 11, background: C.line, display: 'inline-block', alignSelf: 'center' }}/>
              <span style={{ ...serif, fontStyle: 'italic', fontWeight: 400, color: C.ink2 }}>{guardian.nameEn}</span>
            </span>
          }/>
          <Row label="전화번호" value={<span style={num}>{guardian.phone}</span>}/>
          <Row label="이메일" value={guardian.email}/>
          <Row label="한국주소"
            value={`(${guardian.postalCode}) ${guardian.addressKo}`}
            wrap/>
          <Row label="영문주소" value={guardian.addressEn} wrap last/>
        </Section>

        <Section label="동물 정보">
          <Row label="이름" value={
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span>{pet.name}</span>
              <span style={{ width: 1, height: 11, background: C.line, display: 'inline-block', alignSelf: 'center' }}/>
              <span style={{ ...serif, fontStyle: 'italic', fontWeight: 400, color: C.ink2 }}>{pet.nameEn}</span>
            </span>
          }/>
          <Row label="마이크로칩번호" value={<span style={{ ...num, letterSpacing: '0.06em' }}>{pet.microchip}</span>}/>
          <Row label="생년월일"
            value={<span style={num}>{pet.birthDate}</span>}
            value2={`연령 ${pet.age}`}/>
          <Row label="종" value={pet.species}/>
          <Row label="품종" value={pet.breed}/>
          <Row label="모색" value={pet.color}/>
          <Row label="성별" value={pet.sex}/>
          <Row label="몸무게" value={<span style={num}>{pet.weight}</span>} last/>
        </Section>

        <Section label="여행 정보">
          <Row label="여행지" value={trip.toCountry}/>
          <Row label="유형"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  ...monoCap, fontSize: 9, padding: '3px 8px', borderRadius: 999,
                  background: isRoundtrip ? C.soft : 'rgba(42,38,32,.04)',
                  color: isRoundtrip ? C.accent : C.ink2,
                  fontWeight: 600,
                }}>{isRoundtrip ? '왕복' : '편도'}</span>
              </span>
            }/>
          <Row label="출국일"
            value={<span style={num}>{trip.departureDate.replace(/-/g, '·')}</span>}
            value2={`D-${trip.daysLeft}`}
            last={!isRoundtrip || !trip.returnDate}/>
          {isRoundtrip && trip.returnDate && (
            <Row label="귀국일" value={<span style={num}>{trip.returnDate.replace(/-/g, '·')}</span>} last/>
          )}
        </Section>

        <Section label="항공권 정보">
          {(flights || []).map((f, i, arr) => {
            const last = i === arr.length - 1;
            return (
              <div key={f.direction} style={{
                padding: '14px 0', borderBottom: last ? 'none' : `.5px solid ${C.line}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ ...monoCap, fontSize: 9.5 }}>{f.label}</span>
                  <span style={{ ...num, fontSize: 12, color: C.ink2 }}>{f.date.replace(/-/g, '·')}</span>
                </div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
                    <div style={{ ...serif, fontSize: 20, color: C.ink, lineHeight: 1 }}>{f.from}</div>
                    <div style={{ ...num, fontSize: 11, color: C.ink3, marginTop: 4 }}>{f.depart}</div>
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: 12 }}>
                    <div style={{ position: 'absolute', top: '50%', left: 6, right: 6, height: 1, background: C.line }}/>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: C.surface, padding: 1,
                    }}>
                      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                    </svg>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...serif, fontSize: 20, color: C.ink, lineHeight: 1 }}>{f.to}</div>
                    <div style={{ ...num, fontSize: 11, color: C.ink3, marginTop: 4 }}>{f.arrive}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
                  <span style={{ color: C.ink, fontWeight: 500 }}>{f.airline} <span style={{ ...num, color: C.ink2, marginLeft: 4 }}>{f.flightNo}</span></span>
                  <span style={{ color: C.ink3, fontSize: 11 }}>{f.cabin} · {f.kennel}</span>
                </div>
              </div>
            );
          })}
        </Section>

      </div>
    </div>
  );
}

// ── 프로필: 보호자+동물 hero / 동물병원 / 에이전시 / 계정 ─────────────────
function Profile({ scenario }) {
  const { pet, guardian, clinic, transport } = scenario;
  const C = {
    bg: '#F2EDE6', surface: '#FBF7F1', ink: '#2A2620', ink2: '#6B6457', ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)', accent: '#B89968', soft: '#E8DCC4', sage: '#8FA68C',
  };
  const serif = { fontFamily: "'Fraunces', 'Pretendard Variable', serif", fontWeight: 500, letterSpacing: '-0.01em' };
  const num = { fontFamily: "'Fraunces', 'Inter', serif", fontVariantNumeric: 'tabular-nums', fontWeight: 400 };
  const monoCap = { fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.ink3, fontWeight: 500 };

  const PartnerCard = ({ cap, name, role, sub, phone, icon }) => (
    <div style={{
      marginTop: 14, padding: 18, borderRadius: 18,
      background: C.surface, border: `.5px solid ${C.line}`,
    }}>
      <div style={{ ...monoCap, fontSize: 9.5 }}>{cap}</div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: C.soft, color: C.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...serif, fontSize: 16, color: C.ink, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>{role}{sub ? ` · ${sub}` : ''}</div>
        </div>
      </div>
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: `.5px solid ${C.line}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ ...monoCap, fontSize: 9 }}>연락처</span>
        <span style={{ ...num, fontSize: 13, color: C.ink }}>{phone}</span>
      </div>
    </div>
  );

  return (
    <div className="pm-fade-up pm-noscroll" style={{
      position: 'absolute', inset: 0, background: C.bg, color: C.ink,
      paddingTop: 72, paddingBottom: 100, overflow: 'auto',
    }}>
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 30, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>프로필</h1>

        {/* Guardian + Pet hero */}
        <div style={{
          marginTop: 22, padding: 18, borderRadius: 18,
          background: C.surface, border: `.5px solid ${C.line}`,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
              background: C.soft, color: C.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...num, fontSize: 18, fontWeight: 500,
            }}>{guardian.name.slice(-2)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...serif, fontSize: 18, color: C.ink }}>{guardian.name}</span>
                <span style={{ ...serif, fontStyle: 'italic', fontSize: 13, color: C.ink3, fontWeight: 400 }}>{guardian.nameEn}</span>
              </div>
              <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>{guardian.relation}</div>
            </div>
          </div>
          <div style={{ height: .5, background: C.line }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <PetAvatar size={52}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...serif, fontSize: 18, color: C.ink }}>{pet.name}</span>
                <span style={{ ...serif, fontStyle: 'italic', fontSize: 13, color: C.ink3, fontWeight: 400 }}>{pet.nameEn}</span>
              </div>
              <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>
                {pet.breed} · {pet.age} · {pet.weight}
              </div>
            </div>
          </div>
        </div>

        <PartnerCard
          cap="동물병원" name={clinic.name} role={clinic.role} sub={clinic.address} phone={clinic.phone}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11H5a2 2 0 0 0-2 2v7h18v-7a2 2 0 0 0-2-2h-4M12 11V3M9 7h6"/></svg>}/>

        <PartnerCard
          cap="에이전시" name={transport.name} role={transport.contact} sub={transport.role} phone={transport.phone}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>}/>

        <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>계정</div>
        <div style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 18, padding: '4px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0', borderBottom: `.5px solid ${C.line}` }}>
            <span style={{ fontSize: 12.5, color: C.ink2 }}>알림</span>
            <span style={{ fontSize: 13.5, color: C.ink3 }}>모두 켜짐 ›</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0' }}>
            <span style={{ fontSize: 12.5, color: C.ink2 }}>로그아웃</span>
            <span style={{ fontSize: 13.5, color: C.ink3 }}>›</span>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PetMoveApp/>);
