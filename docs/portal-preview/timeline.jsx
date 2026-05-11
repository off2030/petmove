// timeline.jsx — Calm 디자인 시스템 (Stone palette + Fraunces serif)
// 최종 디자인은 Calm 변형만 사용 (chat2: "타임라인 뷰 링뷰 제거" 이후)

function Timeline({ scenario, onNav, ringShape = 'B' }) {
  return <TimelineCalm scenario={scenario} onNav={onNav} ringShape={ringShape} />;
}

function TimelineCalm({ scenario, onNav, ringShape = 'B' }) {
  const { stages, trip, pet } = scenario;
  const total = stages.length;
  const done = stages.filter((s) => s.state === 'done').length;
  const pct = done / total;

  // Stone palette tokens — scoped to this view only
  const C = {
    bg: '#F2EDE6', surface: '#FBF7F1', ink: '#2A2620', ink2: '#6B6457', ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)', accent: '#B89968', soft: '#E8DCC4', bar: '#D4C7AC', sage: '#8FA68C'
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
            <span style={{ color: C.ink3 }}>→</span>
            <span>{trip.toCity}</span>
          </div>
        </div>

        {/* 다음 할 일 — italic Fraunces quote */}
        <div style={{
          marginTop: 22, padding: 18, borderRadius: 18,
          background: 'rgba(251,247,241,.55)', border: `.5px solid ${C.line}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={monoCap}>다음 할 일</div>
            <span style={{ ...monoCap, fontSize: 9.5, color: C.accent, fontWeight: 600 }}>D-7</span>
          </div>
          <h3 style={{
            ...serif, margin: '10px 0 0',
            fontSize: 22, lineHeight: 1.2, color: C.ink, fontWeight: 500,
            textWrap: 'balance',
          }}>
            광견병 항체가 검사
          </h3>
          <p style={{
            margin: '6px 0 0',
            fontSize: 13, lineHeight: 1.55, color: C.ink2,
          }}>
            5월 10일부터 검사 가능 · 채혈 → 일본 지정 검사기관 송부
          </p>
          <button
            onClick={() => onNav && onNav('timeline')}
            style={{
              marginTop: 14, padding: '9px 14px', borderRadius: 999,
              border: `.5px solid ${C.line}`, background: C.surface,
              color: C.ink, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.005em',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            자세히 보기
            <span style={{ color: C.ink3 }}>→</span>
          </button>
        </div>

        {/* Now-Step hero — big circular progress (Now Playing pattern) */}
        <div style={{
          marginTop: 22, padding: '28px 18px 22px', borderRadius: 22,
          background: C.surface, border: `.5px solid ${C.line}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center'
        }}>
          <div style={{ position: 'relative', width: 220, height: 220 }}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              {ringShape === 'A' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.line} strokeWidth="1" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" />
              </>}
              {ringShape === 'B' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(42,38,32,.08)" strokeWidth="10" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="10" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" />
              </>}
              {ringShape === 'F' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(42,38,32,.08)" strokeWidth="4" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" />
                <circle cx="110" cy="110" r={R - 15} fill="none" stroke="rgba(42,38,32,.08)" strokeWidth="4" />
                <circle cx="110" cy="110" r={R - 15} fill="none" stroke={C.sage} strokeWidth="4" strokeLinecap="round" strokeDasharray={2 * Math.PI * (R - 15)} strokeDashoffset={2 * Math.PI * (R - 15) * 0.5} transform="rotate(-90 110 110)" />
              </>}
              {ringShape === 'H' && <>
                <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(184,153,104,.14)" strokeWidth="14" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={C.accent} strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={animOffset} transform="rotate(-90 110 110)" style={{ filter: 'drop-shadow(0 0 6px rgba(184,153,104,.5))' }} />
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
        <h3 style={{ ...serif, margin: '24px 0 12px', fontSize: 16 }}>전체 여정</h3>
        <div style={{
          background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 18,
          padding: '4px 14px'
        }}>
          {stages.map((s, i) => {
            const isDone = s.state === 'done';
            const isCurr = s.state === 'current';
            const last = i === stages.length - 1;
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0',
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
                    fontSize: 13.5,
                    color: isCurr ? C.ink : isDone ? C.ink2 : C.ink3,
                    fontWeight: isCurr ? 600 : 500
                  }}>{s.label}</div>
                  {s.desc &&
                  <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, lineHeight: 1.4 }}>
                      {s.desc}
                    </div>
                  }
                </div>
                <div style={{
                  ...monoCap, fontSize: 9.5,
                  color: isCurr ? C.accent : C.ink3,
                  fontWeight: isCurr ? 700 : 500,
                  textAlign: 'right', flexShrink: 0
                }}>
                  {isCurr ? 'D-7' : s.date ? s.date.slice(5).replace('-', '·') : '—'}
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
