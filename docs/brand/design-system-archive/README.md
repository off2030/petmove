# 펫무브 (PetMove) Design System

> 반려동물을 해외로 데리고 갈 때 필요한 준비 가이드, 일정 관리, 서류 작성, 정보 관리를 도와주는 앱
> _A companion app for taking your pet abroad — preparation guides, scheduling, document workflows, and a single place to keep every record needed for international relocation._

PetMove sits in an emotionally heavy, paperwork-heavy corner of the consumer-app world: people moving overseas with a beloved pet, navigating microchip rules, rabies titer tests, country-specific import permits, airline cargo bookings, and quarantine schedules. The product's job is to make the process feel **calm, organized, and trustworthy** — not the panicked tab-stack of regulations the user is trying to escape.

The visual system is built around that brief: **warm cream surfaces, an editorial serif voice, a friendly coral-peach voltage, and a sky-and-mint accent family that signals progress and safe-passage**. It deliberately rejects the cool blue/purple of typical SaaS travel apps — paperwork shouldn't feel like a TSA kiosk.

---

## Sources & Inspiration

- **Attached folder:** `Design System Inspired by Claude_files/preview.html` — a visual reference document of Claude's marketing design system. We borrowed Claude's _atmospheric_ choices (warm cream canvas, editorial serif display, coral-family voltage, color-block-first elevation) as a starting point and retuned them for PetMove's pet-relocation context. See _Visual Foundations_ below for what we kept, what we softened, and what we added.
- **Brand brief:** Korean-first product (UI text in Korean, Pretendard as primary sans). Document and timeline workflows are the dominant surfaces; marketing site is secondary.

This is **not** Claude's design system. PetMove is its own brand — Claude just happens to be the only adjacent system whose tonal warmth fit the brief.

---

## Index

| Path | What's there |
| --- | --- |
| `colors_and_type.css` | All color, type, spacing, radius, elevation tokens as CSS variables. The single source of truth — every other file imports this. |
| `README.md` | (this file) |
| `SKILL.md` | Claude Code-compatible skill manifest |
| `preview/` | Small specimen cards rendered in the Design System tab — palettes, type scale, components in isolation |
| `ui_kits/mobile-app/` | The primary product surface. Mobile React/JSX components + click-thru `index.html` showing onboarding → checklist → document detail → timeline flows |
| `ui_kits/marketing-site/` | Secondary marketing site — landing page, pricing, footer |
| `assets/` | Brand mark, illustration placeholders, icon notes |
| `fonts/` | Webfont notes — fonts are loaded from CDN (Pretendard, EB Garamond, JetBrains Mono) |

---

## Content Fundamentals

PetMove writes like a calm friend who happens to have done this twenty times. The voice is warm, specific, and lightly editorial — never jokey, never bureaucratic.

### Voice & tone (Korean primary)

- **2인칭 / 친근한 존댓말.** "OO님" or just an implied "you" — never the formal 귀하/고객님 register that customs paperwork uses. Example: "출국 90일 전, 광견병 항체가 검사를 받으세요" not "고객님께서는 광견병 항체가 검사를 받으셔야 합니다."
- **Plain-language regulation.** When we have to explain a rule, we name it once in technical terms, then immediately translate. "광견병 항체가 검사 (Rabies titer test) — 채혈 후 결과까지 약 4주 걸려요."
- **Time references are concrete.** Never "soon" or "later" — always "출국 30일 전", "다음 주 화요일", "결과 도착까지 약 3주". The product's job is to remove vagueness.
- **Emotion is allowed in onboarding and milestone screens.** "축하해요! 모든 서류가 준비됐어요." A short emoji-free sentence is enough; we don't pile on celebration.

### English (secondary)

- Sentence case for all UI labels. "Add a document", not "Add A Document" or "ADD DOCUMENT."
- Active voice. "We'll remind you 7 days before" not "A reminder will be sent."
- The brand wordmark is **PetMove** (camel) in marketing copy, **펫무브** in Korean copy.

### Casing rules

- **Display headlines** — sentence case, period only if multi-sentence.
- **Buttons** — sentence case. "서류 추가하기" / "Add document".
- **Section overlines** — UPPERCASE with 1.5px tracking, sparingly. Used for category labels above section heads.
- **Document IDs and dates** — JetBrains Mono with tabular figures. `2026-05-23` / `KR-EXP-9842`.

### What we don't do

- ❌ Emoji as decoration in product UI. Pet photos and the hand-drawn paw mark are the warmth.
- ❌ Exclamation marks beyond one per screen, max.
- ❌ "Awesome!" / "Oops!" / cheerleader copy. The user is anxious about a real animal — we sound steady.
- ❌ Caps-lock urgency on warnings. Amber pill + clear sentence is enough.

### Examples

| Context | ✅ PetMove voice | ❌ Off-brand |
| --- | --- | --- |
| Onboarding hero | "반려동물과 함께 떠나는 첫걸음, 차분하게 도와드릴게요." | "🐾 Let's go on an adventure!! 🐾" |
| Empty state | "아직 추가된 서류가 없어요. 출국 국가를 먼저 선택해 주세요." | "Nothing here yet — add some stuff!" |
| Reminder | "출국 21일 전 — 광견병 항체가 채혈일이에요." | "URGENT: Action required" |
| Success | "Maple's microchip number is on file." | "Awesome! You did it 🎉" |

---

## Visual Foundations

### Color philosophy

The system is **cream-first**. Pure white reads as a hospital form; the warm tinted cream (`#fbf8f2`) is what makes the app feel like a care companion rather than a portal.

- **Coral-peach primary** (`#e08a64`) — softer and warmer than Claude's coral. Used scarcely on individual CTAs, generously on full-bleed coral milestone cards.
- **Sky** (`#6fa8c4`) and **mint** (`#6fb89a`) are the supporting trust accents — sky for destination/travel chrome, mint for completed/approved checklist items.
- **Amber** (`#e8a55a`) is the "due soon" warning. **Error red** stays scarce, used only on real validation failure.
- **Dark warm-black surface** (`#1f1c17`) appears on document scan previews, the airport-day countdown card, and the footer. Never pure black — the warm shift keeps it on-brand against the cream.

### Type rhythm

EB Garamond (display, weight 400, negative tracking) for every headline; Pretendard (sans, 400/500/600) for body, UI, and Korean text; JetBrains Mono for dates and document numbers. The serif/sans split is the editorial signal — switching the display to a sans would make the app feel like a generic todo tracker.

Display sizes use weight 400, never bold. Negative letter-spacing is mandatory on display sizes — Garamond at 0 tracking reads loose and library-y.

### Backgrounds & imagery

- **No gradients on chrome.** The system is color-block-first.
- **Hand-drawn paw / leash / passport line illustrations** in coral or ink stroke on cream — used sparingly on empty states and milestone moments. Never photo-realistic.
- **Photography is real pet portraits.** Owners can attach their pet's photo; we crop to a soft-rounded square (`--pm-radius-lg`), never perfect circles (Pet ≠ avatar). Tone of stock imagery is warm, natural light, never the desaturated "lifestyle stock" cliché.
- **No texture or grain overlays.** The cream surface IS the texture.

### Animation

- **Default ease:** `cubic-bezier(0.2, 0.8, 0.2, 1)` (a soft, slightly springy out-curve), 200–280ms for most transitions.
- **Bottom sheets** rise on a 320ms ease-out with a 16px overshoot.
- **Checklist items** check with a 180ms scale 1→1.08→1 plus a mint fill sweep. Just enough to register, never bouncy.
- **No parallax. No marquee. No looping background motion.** The app is a calming surface; movement is reserved for state-change feedback.

### States

- **Hover** — 4% darken on cream surfaces, no scale change. On primary buttons, a tone darker (`--pm-primary-active`). Never a glow or outer ring.
- **Press / active** — primary darkens to active token; secondary buttons drop opacity to 0.9; cards shift inward by 1px and lose their shadow for the duration.
- **Focus** — 3px coral-at-15%-alpha outer ring on inputs and tappable cards; visible for keyboard focus only.
- **Disabled** — desaturated cream-tinted color (`--pm-primary-disabled`), 100% cursor not-allowed.

### Borders & elevation

- **1px hairline** in `--pm-hairline` (`#e8ddc9`) is the default card and input border on cream.
- **Color-block first, shadow rare.** Most depth comes from the cream-vs-cream-card-vs-dark surface contrast.
- Two shadow tokens only: `--pm-shadow-soft` for floating tiles and `--pm-shadow-pop` for active dropdowns / popovers. A third (`--pm-shadow-sheet`) for bottom-sheet upward shadow.
- **No inner shadows.** No frosted glass / backdrop-filter blur on chrome. (Only used in one place: the photo-detail sheet's nav bar fades the image behind it via a 30%-opacity cream protection gradient.)

### Corner radii (hierarchical)

`4 → 6 → 10 → 14 → 20 → pill`. Buttons and inputs at `--pm-radius-md` (10px), cards at `--pm-radius-lg` (14px), hero containers and bottom sheets at `--pm-radius-xl` (20px), badges at `pill`. We never mix radii within a single composition (all-card-edges-match rule).

### Layout rules

- Mobile is the primary surface — design at 390pt width baseline (iPhone 13 Pro), bottom-tab nav at 56pt, safe-area-aware.
- Marketing max content width: 1200px centered.
- Section rhythm 96px on web, 48px between major mobile sections.
- Internal card padding: 24px standard, 32px on milestone/coral cards.

### Transparency & blur

Used in **two** places only:
1. The mobile photo-detail screen's top bar — a 30% cream protection gradient ensures back-button legibility over a pet photo.
2. The marketing-site sticky nav once scrolled — `backdrop-filter: blur(12px)` with `rgba(251,248,242,0.85)`.

Everywhere else: solid surfaces.

### Imagery color vibe

Warm, naturally-lit, slight golden-hour cast preferred. Never heavily filtered, never cool/blue grade, never B&W. Pets shot at eye level on neutral floors / soft outdoor light.

### Card anatomy

A standard PetMove card is: `--pm-surface-card` background, no shadow, `--pm-radius-lg` corners, 1px hairline border (optional — used when card sits on `--pm-canvas`; dropped when card sits on `--pm-surface-soft`), 24px internal padding, headline in Pretendard 600 17px, body in 15px regular.

A **milestone / coral card** flips: `--pm-primary` fill, white text, `--pm-radius-lg`, 32px padding, no border, no shadow.

A **dark document card** uses `--pm-surface-dark` fill, cream-tinted white type (`--pm-on-dark`), 14px JetBrains Mono for dates and document IDs.

---

## Iconography

PetMove uses **Lucide** (https://lucide.dev) as the primary icon set — outline icons, 1.5px stroke, 24px default size. Lucide's stroke weight matches our type rhythm and sits comfortably on cream without optical heaviness. See `assets/icons.md` for usage notes.

A few **bespoke pet-domain glyphs** are added on top — a paw mark, a passport-stamp glyph, a kennel/carrier line icon, and a small coral spike-mark used as the brand wordmark prefix (analogous to Anthropic's spike mark, but redrawn). These live in `assets/`.

- **No emoji in product UI.** A real paw glyph beats a 🐾.
- **No filled icon variants** except the bottom-tab active state (filled mint paw on the "내 펫" tab when active).
- **Color rules:** icons inherit text color by default. Coral primary is reserved for active/selected states inside controls (e.g., a checked checklist item's check glyph).

When we substitute a Lucide icon for a missing asset, we flag it in the consuming component file and prefer a sibling Lucide name with matching stroke weight (never a heavier or filled variant).

---

## Known caveats

- Fonts (Pretendard, EB Garamond, JetBrains Mono) load from CDN — no local TTFs are bundled. If offline use is needed, download from the linked URLs in `colors_and_type.css`.
- The Lucide icons are referenced by import name in JSX components — the marketing site loads them via the Lucide CDN bundle.
- We don't have access to PetMove's actual existing UI or codebase — components here are an _initial proposal_ in the brand voice the brief describes, not a recreation. The user should review and tell us where reality differs.
