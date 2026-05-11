// shared.jsx — small reusable bits used across screens

function PetAvatar({ size = 44, tone = 'mocha' }) {
  // SVG illustrative placeholder — soft circle with shiba-like silhouette
  const s = size;
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: 'linear-gradient(135deg, #F2C9A4 0%, #E5A776 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
      boxShadow: 'inset 0 1px 2px rgba(255,255,255,.4), 0 1px 2px rgba(0,0,0,.06)',
    }}>
      <svg width={s * 0.7} height={s * 0.7} viewBox="0 0 40 40">
        {/* head */}
        <path d="M20 8c-7 0-12 4.5-12 11 0 5 3 9 8 10.5 1.2.3 2.6.5 4 .5s2.8-.2 4-.5c5-1.5 8-5.5 8-10.5 0-6.5-5-11-12-11z"
              fill="#FFF6EE"/>
        {/* ears */}
        <path d="M11 11l3.5 5.5L9 16l2-5z" fill="#C9824D"/>
        <path d="M29 11l-3.5 5.5L31 16l-2-5z" fill="#C9824D"/>
        <path d="M11.5 12l2.5 4L10.5 16l1-4z" fill="#FFD9B5"/>
        <path d="M28.5 12l-2.5 4L29.5 16l-1-4z" fill="#FFD9B5"/>
        {/* face shading */}
        <path d="M14 18c-1 3-1 6 0 8 1 2 3.5 3 6 3s5-1 6-3c1-2 1-5 0-8-2-1-4-1.5-6-1.5s-4 .5-6 1.5z"
              fill="#F5DCC1"/>
        {/* eyes */}
        <circle cx="16" cy="20" r="1.2" fill="#1F1B2E"/>
        <circle cx="24" cy="20" r="1.2" fill="#1F1B2E"/>
        {/* nose */}
        <ellipse cx="20" cy="24" rx="1.4" ry="1" fill="#1F1B2E"/>
        {/* mouth */}
        <path d="M20 25v1.5M18 27c.5.5 1.2.7 2 .7s1.5-.2 2-.7" stroke="#1F1B2E" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
      </svg>
    </div>
  );
}

function VetAvatar({ size = 44 }) {
  const s = size;
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%',
      background: 'linear-gradient(135deg, #C9DBCB 0%, #97B69A 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
      boxShadow: 'inset 0 1px 2px rgba(255,255,255,.4), 0 1px 2px rgba(0,0,0,.06)',
    }}>
      <svg width={s * 0.7} height={s * 0.7} viewBox="0 0 40 40">
        {/* head */}
        <circle cx="20" cy="17" r="7" fill="#F5E4D2"/>
        {/* hair */}
        <path d="M13 14c1-4 4-6 7-6s6 2 7 6c-1-1-3-2-7-2s-6 1-7 2z" fill="#2A2530"/>
        {/* body w/ scrubs */}
        <path d="M8 38c0-7 5-12 12-12s12 5 12 12H8z" fill="#FFFFFF"/>
        {/* collar */}
        <path d="M16 26l4 3 4-3-4-1z" fill="#9BB8A0"/>
        {/* stethoscope hint */}
        <circle cx="24" cy="33" r="1.2" fill="#9BB8A0"/>
      </svg>
    </div>
  );
}

function FlagBadge({ flag, size = 22 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.08)',
      fontSize: size * 0.7, lineHeight: 1,
    }}>{flag}</span>
  );
}

function Pill({ children, tone = 'neutral', style = {} }) {
  const tones = {
    neutral: { bg: 'rgba(31,27,46,.06)', fg: 'var(--pm-ink-2)' },
    accent:  { bg: 'rgba(140,110,210,.14)', fg: 'oklch(0.45 0.15 295)' },
    peach:   { bg: 'rgba(232,160,110,.18)', fg: 'oklch(0.50 0.13 50)' },
    sage:    { bg: 'rgba(140,180,150,.20)', fg: 'oklch(0.42 0.10 165)' },
    white:   { bg: '#fff', fg: 'var(--pm-ink)' },
  }[tone] || tones?.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 9px', borderRadius: 999,
      background: tones.bg, color: tones.fg,
      fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.01em',
      ...style,
    }}>{children}</span>
  );
}

function Card({ children, style = {}, onClick, pad = 16, elevated = true }) {
  return (
    <div className={onClick ? 'pm-pressable' : ''} onClick={onClick} style={{
      background: 'var(--pm-surface)',
      borderRadius: 'var(--pm-r-lg)',
      padding: pad,
      boxShadow: elevated ? 'var(--pm-shadow-1)' : 'none',
      border: elevated ? 'none' : '0.5px solid var(--pm-line)',
      ...style,
    }}>{children}</div>
  );
}

function Icon({ name, size = 20, color = 'currentColor', stroke = 1.6 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home':     return <svg {...p}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2v-9z"/></svg>;
    case 'route':    return <svg {...p} strokeWidth="2.4"><circle cx="12" cy="12" r="9" opacity=".3"/><path d="M12 3a9 9 0 0 1 6.4 15.4"/></svg>;
    case 'doc':      return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>;
    case 'chat':     return <svg {...p}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>;
    case 'plane':    return <svg {...p}><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>;
    case 'check':    return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'plus':     return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'chevron':  return <svg {...p}><polyline points="9 18 15 12 9 6"/></svg>;
    case 'chevronD': return <svg {...p}><polyline points="6 9 12 15 18 9"/></svg>;
    case 'bell':     return <svg {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M14 21a2 2 0 0 1-4 0"/></svg>;
    case 'download': return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
    case 'upload':   return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>;
    case 'shield':   return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'syringe':  return <svg {...p}><path d="M18 2l4 4M15 5l4 4M2 22l5-5M11.5 8.5l4 4M3 21l9-9 4 4-9 9H3v-4z"/></svg>;
    case 'chip':     return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/><rect x="9" y="9" width="6" height="6"/></svg>;
    case 'stamp':    return <svg {...p}><path d="M9 15h6l1 5H8l1-5zM12 3v6M9 9h6M7 12h10v3H7z"/></svg>;
    case 'inbox':    return <svg {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case 'sparkle':  return <svg {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/></svg>;
    case 'phone':    return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>;
    case 'send':     return <svg {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>;
    case 'paperclip':return <svg {...p}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
    case 'user':     return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case 'info':     return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>;
    case 'camera':   return <svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
    default: return null;
  }
}

Object.assign(window, { PetAvatar, VetAvatar, FlagBadge, Pill, Card, Icon });
