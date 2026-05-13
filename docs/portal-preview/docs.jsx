// docs.jsx — 서류함 (Calm 디자인 시스템: Stone palette + Fraunces serif)

const DOCS_C = {
  bg: '#F5EFE8', surface: '#FBF7F1', ink: '#2A2620', ink2: '#6B6457', ink3: '#9A9286',
  line: 'rgba(42,38,32,.10)', accent: '#B89968', soft: '#E8DCC4', sage: '#8FA68C',
};
const docsSerif = { fontFamily: "'Fraunces', 'Pretendard Variable', serif", fontWeight: 500, letterSpacing: '-0.01em' };
const docsNum = { fontFamily: "'Fraunces', 'Inter', serif", fontVariantNumeric: 'tabular-nums', fontWeight: 400 };
const docsMonoCap = { fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: DOCS_C.ink3, fontWeight: 500 };

function Documents({ scenario }) {
  const { documents, pet, trip } = scenario;
  const [uploading, setUploading] = React.useState(false);
  const [uploaded, setUploaded] = React.useState(null);

  const handleUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setUploaded({ id: 'd-new', name: '광견병 항체가 검사 결과지', fresh: true });
    }, 1600);
  };

  const verified = documents.filter(d => d.verified);
  const pending = documents.filter(d => !d.verified);

  return (
    <div className="pm-fade-up pm-noscroll" style={{
      position: 'absolute', inset: 0, background: DOCS_C.bg, color: DOCS_C.ink,
      paddingTop: 72, paddingBottom: 100, overflow: 'auto',
    }}>
      <div style={{ padding: '0 24px' }}>
        <div style={{ paddingTop: 8, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ alignSelf: 'center' }}><PetAvatar size={36}/></span>
          <h1 style={{ ...docsSerif, fontSize: 30, lineHeight: 1.12, margin: 0, color: DOCS_C.ink }}>
            {pet.name}
          </h1>
          <div style={{ fontSize: 12.5, color: DOCS_C.ink2, display: 'flex', alignItems: 'center', gap: 6, transform: 'translateY(-2px)' }}>
            <span>{trip.fromCity}</span>
            <span style={{ color: DOCS_C.ink3 }}>→</span>
            <span>{trip.toCity}</span>
          </div>
        </div>
        <div style={{ ...docsMonoCap, marginTop: 10 }}>
          <span style={docsNum}>{verified.length}</span> 보관 · <span style={docsNum}>{pending.length}</span> 대기
        </div>

        {uploaded && <CalmUploadedBanner />}

        <DocList documents={documents} verified={verified} pending={pending} onUpload={!uploading ? handleUpload : undefined} uploading={uploading} />
      </div>
    </div>
  );
}

function CalmUpload({ uploading, onClick }) {
  return (
    <div onClick={onClick} className="pm-pressable" style={{
      borderRadius: 14, padding: 14, marginTop: 8,
      background: uploading ? 'linear-gradient(110deg, #FBF7F1 30%, #F0E6D5 50%, #FBF7F1 70%)' : 'transparent',
      backgroundSize: '200% 100%',
      animation: uploading ? 'pm-shimmer 1.4s linear infinite' : 'none',
      border: `1px dashed ${DOCS_C.accent}80`,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: DOCS_C.soft, color: DOCS_C.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v14M5 10l7-7 7 7M3 21h18"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        {uploading ? (
          <>
            <div style={{ ...docsSerif, fontSize: 13.5, color: DOCS_C.ink }}>업로드 중…</div>
            <div style={{ fontSize: 11, color: DOCS_C.ink3, marginTop: 2 }}>담당 수의사에게 자동 전달됩니다</div>
          </>
        ) : (
          <>
            <div style={{ ...docsSerif, fontSize: 13.5, color: DOCS_C.ink }}>사본 추가 업로드</div>
            <div style={{ fontSize: 11, color: DOCS_C.ink3, marginTop: 2 }}>PDF · 사진 · 최대 10MB</div>
          </>
        )}
      </div>
    </div>
  );
}

function CalmUploadedBanner() {
  return (
    <div className="pm-fade-up" style={{
      marginTop: 12, padding: 12, borderRadius: 14,
      background: 'rgba(143,166,140,.14)', border: `.5px solid ${DOCS_C.sage}40`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: DOCS_C.sage, color: DOCS_C.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: DOCS_C.ink }}>업로드 완료</div>
        <div style={{ fontSize: 11.5, color: DOCS_C.ink2, marginTop: 1 }}>담당 수의사에게 알림이 전송되었습니다</div>
      </div>
    </div>
  );
}

function CalmSectionLabel({ children, right }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginTop: 22, marginBottom: 10, padding: '0 4px',
    }}>
      <span style={docsMonoCap}>{children}</span>
      {right && <span style={{ ...docsMonoCap, fontSize: 9.5 }}>{right}</span>}
    </div>
  );
}

function CalmDocRow({ doc, isLast, pending }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: !isLast ? `.5px solid ${DOCS_C.line}` : 'none',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <CalmDocIcon doc={doc} pending={pending} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 500,
            color: pending ? DOCS_C.ink2 : DOCS_C.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{doc.name}</span>
          {doc.fresh && (
            <span style={{
              ...docsMonoCap, fontSize: 8.5, padding: '1px 6px',
              background: DOCS_C.soft, color: DOCS_C.accent, borderRadius: 999, fontWeight: 600,
            }}>NEW</span>
          )}
        </div>
        <div style={{ ...docsNum, fontSize: 11, color: DOCS_C.ink3, marginTop: 3 }}>
          {doc.date ? doc.date.replace(/-/g, '·') : '발급 대기'}{doc.size && ` · ${doc.size}`} · {doc.source}
        </div>
      </div>
      {pending ? (
        <span style={{ ...docsMonoCap, fontSize: 9, padding: '4px 8px', background: 'rgba(42,38,32,.04)', borderRadius: 999 }}>대기</span>
      ) : (
        <button style={{
          width: 32, height: 32, borderRadius: '50%', border: `.5px solid ${DOCS_C.line}`,
          background: 'transparent', color: DOCS_C.ink2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function CalmDocIcon({ doc, pending }) {
  return (
    <div style={{
      width: 36, height: 44, borderRadius: 4, flexShrink: 0,
      background: pending ? 'rgba(42,38,32,.04)' : DOCS_C.soft,
      border: pending ? `.5px dashed ${DOCS_C.line}` : 'none',
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {pending ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={DOCS_C.ink3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
      ) : (
        <span style={{ ...docsNum, fontSize: 8.5, fontWeight: 500, color: DOCS_C.accent, letterSpacing: '0.08em' }}>
          {doc.type.toUpperCase()}
        </span>
      )}
      {!pending && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 9, height: 9,
          background: 'rgba(255,255,255,.5)',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
        }}/>
      )}
    </div>
  );
}

// 1) 필수 서류 체크리스트  2) 증명서 자동 작성  3) 보관 중인 서류
function DocList({ documents, onUpload, uploading }) {
  const checklist = documents;

  const autoDocs = documents.filter(d =>
    d.source === 'PetMove' || d.source === '발급 예정'
  );
  const copyDocs = documents.filter(d =>
    d.source === '병원 발급' || d.source === '고객 업로드'
  );

  const checklistDone = checklist.filter(d => d.verified).length;

  return (
    <>
      {/* 1) Checklist */}
      <CalmSectionLabel right={`${checklistDone}/${checklist.length}`}>필수 서류 체크리스트</CalmSectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {checklist.map((d) => {
          const ok = d.verified;
          return (
            <div key={d.id} style={{
              background: DOCS_C.surface, border: `.5px solid ${DOCS_C.line}`,
              borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: ok ? DOCS_C.sage : 'transparent',
                border: ok ? 'none' : `1px dashed ${DOCS_C.ink3}`,
                color: DOCS_C.surface,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {ok && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13.5, fontWeight: 500,
                  color: ok ? DOCS_C.ink : DOCS_C.ink2,
                }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: DOCS_C.ink3, marginTop: 2 }}>
                  {d.source}
                </div>
              </div>
              <span style={{
                ...docsMonoCap, fontSize: 9,
                color: ok ? DOCS_C.sage : DOCS_C.ink3,
                fontWeight: 600,
              }}>
                {ok ? '보유' : '대기'}
              </span>
            </div>
          );
        })}
      </div>

      {/* 2) 증명서 자동 작성 — 서류 1건당 카드 */}
      <CalmSectionLabel right={`${autoDocs.length}건`}>증명서 자동 작성</CalmSectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {autoDocs.map((d) => (
          <div key={d.id} style={{ background: DOCS_C.surface, border: `.5px solid ${DOCS_C.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <CalmDocRow doc={d} isLast pending={!d.verified} />
          </div>
        ))}
      </div>

      {/* 3) 보관 중인 서류 — 서류 1건당 카드 */}
      <CalmSectionLabel right={`${copyDocs.length}건`}>보관 중인 서류</CalmSectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {copyDocs.map((d) => (
          <div key={d.id} style={{ background: DOCS_C.surface, border: `.5px solid ${DOCS_C.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <CalmDocRow doc={d} isLast />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <CalmUpload uploading={uploading} onClick={onUpload} />
      </div>
    </>
  );
}

Object.assign(window, { Documents });
