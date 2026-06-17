// timeline.jsx — Calm 디자인 시스템 (Stone palette + Fraunces serif)
// 최종 디자인은 Calm 변형만 사용 (chat2: "타임라인 뷰 링뷰 제거" 이후)

function Timeline({ scenario, onNav, ringShape = 'H' }) {
  return <TimelineCalm scenario={scenario} onNav={onNav} ringShape={ringShape} />;
}

function TimelineCalm({ scenario, onNav, ringShape = 'H' }) {
  const { stages, trip, pet } = scenario;
  const total = stages.length;
  const done = stages.filter((s) => s.state === 'done').length;
  const pct = done / total;

  // Stone palette tokens — scoped to this view only
  const C = {
    bg: '#F5EFE8', surface: '#FBF7F1', ink: '#2A2620', ink2: '#6B6457', ink3: '#9A9286',
    line: 'rgba(42,38,32,.07)', accent: '#E8A55A', soft: '#EDE4D7', bar: '#D4C7AC', sage: '#8FA68C',
    cardSoft: 'linear-gradient(160deg, #F0E8DB 0%, #EDE4D7 50%, #E6DDCD 100%)',
    cardList: 'linear-gradient(160deg, #F5EDE0 0%, #F2E9DC 50%, #ECE3D3 100%)',
    cardHero: 'radial-gradient(140% 100% at 80% 18%, #E8DECC 0%, #DCD2BD 45%, #CBC1AB 100%)',
  };

  const serif = { fontFamily: "'Fraunces', 'Pretendard Variable', serif", fontWeight: 500, letterSpacing: '-0.01em' };
  const num = { fontFamily: "'Fraunces', 'Inter', serif", fontVariantNumeric: 'tabular-nums', fontWeight: 400 };
  const monoCap = {
    fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase',
    color: C.ink3, fontWeight: 500
  };

  // ring math
  const R = 100, CIRC = 2 * Math.PI * R;

  // Entry animations — ring draws + number counts up + label fades
  const [animPct, setAnimPct] = React.useState(0);
  const [animNum, setAnimNum] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    const dur = 1400;
    const ease = (x) => 1 - Math.pow(1 - x, 3); // easeOutCubic
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = ease(k);
      setAnimPct(pct * e);
      setAnimNum(Math.round(pct * 100 * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const animOffset = CIRC * (1 - animPct);

  return (
    <div style={{
      position: 'absolute', inset: 0, top: 0, bottom: 0,
      background: C.bg, color: C.ink,
      paddingTop: 72, paddingBottom: 100, overflow: 'auto',
      animation: 'pm-fade-up 0.5s cubic-bezier(0.2,0.8,0.2,1) both'
    }} className="pm-noscroll">
      <div style={{ padding: '0 24px' }}>

        {/* Header — quiet serif H1 */}
        <div style={{ paddingTop: 8, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ alignSelf: 'center' }}><PetAvatar size={36}/></span>
          <h1 style={{ ...serif, fontSize: 30, lineHeight: 1.12, margin: 0, color: C.ink }}>
            {pet.name}
          </h1>
          <div style={{ fontSize: 12.5, color: C.ink2, display: 'flex', alignItems: 'center', gap: 6, transform: 'translateY(-2px)' }}>
            <span>{trip.fromCity}</span>
            <span style={{ color: C.ink3 }}>{trip.tripType === 'roundtrip' ? '⇄' : '→'}</span>
            <span>{trip.toCity}</span>
          </div>
        </div>

        {/* 다음 할 일 — soft taupe gradient card. 헤더 1회 + 할 일 항목들(각 행 클릭 가능, 구분선).
            non-blocking step 뒤엔 할 일이 여럿 — 한 카드에 묶어 표시. */}
        <div
          style={{
            marginTop: 22, padding: 22, borderRadius: 22,
            background: C.cardSoft,
            boxShadow: '0 1px 0 rgba(255,255,255,.45) inset',
          }}
        >
          {/* D-day 는 진행률 링 카드에만 — 중복 방지로 헤더는 라벨만. */}
          <div style={{ ...monoCap, color: 'rgba(45,38,28,.55)' }}>다음 할 일</div>
          {[
            { label: '광견병 항체가 검사', desc: '2026년 5월 10일 이후 일본 지정 검사기관에서 광견병 항체가 검사를 받습니다.' },
            { label: '검역 신청', desc: '농림축산검역본부에 출국 전 검역을 사전 신고합니다.' },
          ].map((task, i) => (
            <button
              key={task.label}
              type="button"
              onClick={() => onNav && onNav('timeline')}
              className="pm-pressable"
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'transparent', border: 0, padding: 0,
                color: 'inherit', fontFamily: 'inherit', cursor: 'pointer',
                marginTop: i === 0 ? 12 : 14,
                paddingTop: i === 0 ? 0 : 14,
                borderTop: i === 0 ? 0 : '1px solid rgba(45,38,28,.12)',
              }}
            >
              <h3 style={{
                ...serif, margin: 0,
                fontSize: 26, lineHeight: 1.18, color: '#2A2620', fontWeight: 500,
                textWrap: 'balance',
              }}>
                {task.label}
              </h3>
              <p style={{
                margin: '8px 0 0',
                fontSize: 13, lineHeight: 1.55, color: 'rgba(45,38,28,.65)',
              }}>
                {task.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Now-Step hero — big circular progress (Now Playing pattern) */}
        <div style={{
          marginTop: 22, padding: '28px 18px 22px', borderRadius: 22,
          background: C.cardHero,
          boxShadow: '0 1px 0 rgba(255,255,255,.35) inset',
          display: 'flex', flexDirection: 'column', alignItems: 'center'
        }}>
          <div style={{ position: 'relative', width: 220, height: 220 }}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              {ringShape === 'A' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.line} strokeWidth="1" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" />
              </>}
              {ringShape === 'B' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(60,48,28,.13)" strokeWidth="10" />
                <circle cx="110" cy="110" r={R} fill="none" stroke="#735B3D" strokeWidth="10" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" />
              </>}
              {ringShape === 'F' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(42,38,32,.08)" strokeWidth="4" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" />
                <circle cx="110" cy="110" r={R - 15} fill="none" stroke="rgba(42,38,32,.08)" strokeWidth="4" />
                <circle cx="110" cy="110" r={R - 15} fill="none" stroke={C.sage} strokeWidth="4" strokeLinecap="round" strokeDasharray={2 * Math.PI * (R - 15)} strokeDashoffset={2 * Math.PI * (R - 15) * 0.5} transform="rotate(-90 110 110)" />
              </>}
              {ringShape === 'H' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(232,165,90,.14)" strokeWidth="14" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" style={{ filter: 'drop-shadow(0 0 6px rgba(232,165,90,.5))' }} />
              </>}
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{ ...num, fontSize: 56, lineHeight: 1, color: C.ink, letterSpacing: '-0.02em' }}>
                {animNum}<span style={{ fontSize: 22, color: C.ink3, marginLeft: 2 }}>%</span>
              </div>
              <div style={{
                marginTop: 8, fontSize: 11.5, color: C.ink3,
                animation: 'pm-fade-up 0.6s cubic-bezier(0.2,0.8,0.2,1) 0.9s both'
              }}>
                <span style={num}>{done}</span>
                <span> / {total} 단계 · D-7</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stage list — quiet, mono-cap dates */}
        <h3 style={{ ...serif, margin: '24px 0 12px', fontSize: 16 }}>전체 일정</h3>
        <div style={{
          background: C.cardList, borderRadius: 20,
          boxShadow: '0 1px 0 rgba(255,255,255,.45) inset',
          padding: '4px 14px'
        }}>
          {stages.map((s, i) => {
            const isDone = s.state === 'done';
            const isCurr = s.state === 'current';
            const last = i === stages.length - 1;
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 0',
                borderBottom: last ? 'none' : `.5px solid ${C.line}`
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDone ? C.sage : isCurr ? C.accent : 'transparent',
                  border: !isDone && !isCurr ? `1px solid ${C.line}` : 'none',
                  color: isDone || isCurr ? C.surface : C.ink3,
                  ...num, fontSize: 11
                }}>
                  {isDone ?
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg> :
                  i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    minHeight: 22
                  }}>
                    <div style={{
                      fontSize: 17, lineHeight: '22px',
                      color: isCurr ? C.ink : isDone ? C.ink2 : C.ink3,
                      fontWeight: isCurr ? 600 : 500,
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{s.label}</div>
                    <div style={{
                      ...monoCap,
                      color: isCurr ? C.accent : C.ink3,
                      fontWeight: isCurr ? 700 : 500,
                      textAlign: 'right', flexShrink: 0
                    }}>
                      {isCurr ? '예정' : s.date ? `${s.date.slice(2, 4)}·${s.date.slice(5, 7)}·${s.date.slice(8, 10)}` : '—'}
                    </div>
                  </div>
                  {s.desc &&
                  <div style={{ fontSize: 12, color: C.ink3, marginTop: 2, lineHeight: 1.4 }}>
                      {s.desc}
                    </div>
                  }
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

Object.assign(window, { Timeline });
