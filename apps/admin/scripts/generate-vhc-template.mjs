/**
 * Generate the blank VHC.pdf (Veterinary Health Certificate) template.
 * A4 single-page with static labels + empty AcroForm text fields that the
 * filler populates via pdf-fill.ts.
 *
 * Fields use plain English labels and are positioned for our clinic's
 * general-purpose health certificate — used for Indonesia initially, but
 * designed to be reusable for other destinations that don't need a country-
 * specific template.
 *
 * Run: node scripts/generate-vhc-template.mjs
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFile } from 'node:fs/promises'

const OUT = 'data/pdf-templates/VHC.pdf'

const PAGE_W = 595, PAGE_H = 842
const MARGIN = 40
const CONTENT_W = PAGE_W - 2 * MARGIN // 515
const RIGHT = PAGE_W - MARGIN

const BLACK = rgb(0, 0, 0)
const MUTED = rgb(0.35, 0.35, 0.35)
const RULE = rgb(0.6, 0.6, 0.6)

const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)

const page = pdf.addPage([PAGE_W, PAGE_H])
const form = pdf.getForm()

/** Draw left-aligned text. */
function text(x, y, t, opts = {}) {
  page.drawText(t, {
    x, y, font: opts.font ?? font, size: opts.size ?? 10, color: opts.color ?? BLACK,
  })
}

/** Draw center-aligned text within [x, x+w]. */
function textCenter(x, w, y, t, opts = {}) {
  const f = opts.font ?? font, s = opts.size ?? 10
  const tw = f.widthOfTextAtSize(t, s)
  text(x + (w - tw) / 2, y, t, opts)
}

/** Horizontal rule. */
function hr(y, x1 = MARGIN, x2 = RIGHT, color = RULE, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
}

/** Create borderless text field at position. */
function field(name, x, y, w, h = 14) {
  const f = form.createTextField(name)
  f.addToPage(page, { x, y: y - h + 11, width: w, height: h, borderWidth: 0 })
  return f
}

/* ── Title ── */
textCenter(MARGIN, CONTENT_W, 800, 'VETERINARY HEALTH CERTIFICATE', { font: bold, size: 15 })
textCenter(MARGIN, CONTENT_W, 783, 'For International Movement of Pet Animals from the Republic of Korea', { font: italic, size: 9, color: MUTED })
hr(770)

/* ── I. Owner Information ── */
text(MARGIN, 754, 'I. Owner Information', { font: bold, size: 10 })

// 3 rows: Name / Address / Phone
const LABEL_W = 110
const VALUE_X = MARGIN + LABEL_W
const VALUE_W = CONTENT_W - LABEL_W

text(MARGIN, 735, 'Name', { size: 9, color: MUTED })
field('owner_name', VALUE_X, 735, VALUE_W)

text(MARGIN, 717, 'Address', { size: 9, color: MUTED })
field('owner_address', VALUE_X, 717, VALUE_W)

text(MARGIN, 699, 'Telephone', { size: 9, color: MUTED })
field('owner_phone', VALUE_X, 699, VALUE_W)

/* ── II. Animal Information ── */
text(MARGIN, 678, 'II. Animal Information', { font: bold, size: 10 })

// 2-column grid
const COL1_LABEL_X = MARGIN
const COL1_VALUE_X = MARGIN + 80
const COL1_W = 160
const COL2_LABEL_X = MARGIN + 270
const COL2_VALUE_X = MARGIN + 360
const COL2_W = CONTENT_W - 360

function row2col(y, leftLabel, leftField, leftW, rightLabel, rightField, rightW) {
  text(COL1_LABEL_X, y, leftLabel, { size: 9, color: MUTED })
  field(leftField, COL1_VALUE_X, y, leftW)
  text(COL2_LABEL_X, y, rightLabel, { size: 9, color: MUTED })
  field(rightField, COL2_VALUE_X, y, rightW)
}

row2col(659, 'Species', 'pet_species', 160, 'Breed', 'pet_breed', COL2_W)
row2col(641, 'Sex', 'pet_sex', 160, 'Date of Birth', 'pet_dob', COL2_W)
row2col(623, 'Color', 'pet_color', 160, 'Weight (kg)', 'pet_weight', COL2_W)
row2col(605, 'Microchip No.', 'pet_microchip', 160, 'Implant Date', 'pet_microchip_date', COL2_W)

/* ── III. Vaccinations & Treatments ── */
text(MARGIN, 584, 'III. Vaccination & Treatment Record', { font: bold, size: 10 })

// Column layout for 6-col table
const COLS = [
  { x: MARGIN,         w: 70,  label: 'Date' },
  { x: MARGIN + 70,    w: 95,  label: 'Type' },
  { x: MARGIN + 165,   w: 115, label: 'Product' },
  { x: MARGIN + 280,   w: 100, label: 'Manufacturer' },
  { x: MARGIN + 380,   w: 70,  label: 'Batch No.' },
  { x: MARGIN + 450,   w: 65,  label: 'Validity' },
]

// Header row at y=567
const HEADER_Y = 567
for (const c of COLS) text(c.x + 2, HEADER_Y, c.label, { font: bold, size: 8, color: MUTED })
hr(HEADER_Y - 4, MARGIN, RIGHT)

// 6 vaccination rows (17pt pitch)
const ROW_PITCH = 17
const ROW_START = HEADER_Y - 18 // 549
for (let i = 0; i < 6; i++) {
  const y = ROW_START - i * ROW_PITCH
  const prefix = `vacc_${i + 1}`
  field(`${prefix}_date`, COLS[0].x + 2, y, COLS[0].w - 4)
  field(`${prefix}_type`, COLS[1].x + 2, y, COLS[1].w - 4)
  field(`${prefix}_product`, COLS[2].x + 2, y, COLS[2].w - 4)
  field(`${prefix}_manufacturer`, COLS[3].x + 2, y, COLS[3].w - 4)
  field(`${prefix}_batch`, COLS[4].x + 2, y, COLS[4].w - 4)
  field(`${prefix}_validity`, COLS[5].x + 2, y, COLS[5].w - 4)
  // faint row separator
  hr(y - 5, MARGIN, RIGHT, rgb(0.85, 0.85, 0.85), 0.3)
}

/* ── IV. Veterinarian's Declaration ── (Titer 섹션 제거로 번호 당김) */
const DECL_HEADER_Y = ROW_START - 6 * ROW_PITCH - 18 // 425
text(MARGIN, DECL_HEADER_Y, "IV. Veterinarian's Declaration", { font: bold, size: 10 })

const DECL_LINE1_Y = DECL_HEADER_Y - 16
const DECL_LINE2_Y = DECL_LINE1_Y - 12
text(MARGIN, DECL_LINE1_Y, 'I hereby certify that the animal described above has been clinically examined and found', { size: 9 })
text(MARGIN, DECL_LINE2_Y, 'to be in good health and fit for international travel.', { size: 9 })

// Vet info — 4 rows
let vy = DECL_LINE2_Y - 24 // 325
row2col(vy, 'Veterinarian', 'vet_name', 160, 'License No.', 'vet_license', COL2_W); vy -= 18
row2col(vy, 'Clinic', 'vet_clinic', 160, 'Phone', 'vet_phone', COL2_W); vy -= 18
text(COL1_LABEL_X, vy, 'Address', { size: 9, color: MUTED })
field('vet_address', COL1_VALUE_X, vy, CONTENT_W - 80); vy -= 18
text(COL1_LABEL_X, vy, 'Date of Issue', { size: 9, color: MUTED })
field('issue_date', COL1_VALUE_X, vy, 120)

// Signature area — right-aligned
const SIG_LABEL_Y = vy - 48
text(MARGIN + 320, SIG_LABEL_Y, 'Signature & Stamp', { size: 9, color: MUTED })
hr(SIG_LABEL_Y - 50, MARGIN + 320, RIGHT, rgb(0.4, 0.4, 0.4), 0.6)

/* ── Footer ── */
textCenter(MARGIN, CONTENT_W, 50, 'Lausanne Veterinary Medical Center · 1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea · +82-2-872-7588', { size: 7, color: MUTED })

/* ── Save ── */
const bytes = await pdf.save()
await writeFile(OUT, bytes)
console.log(`Written: ${OUT} (${bytes.length} bytes, ${form.getFields().length} fields)`)
