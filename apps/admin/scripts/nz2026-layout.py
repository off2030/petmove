# 뉴질랜드 신 IHS 2026 서식 3종의 입력칸·취소선 좌표 계산 (2026-10-06).
#
#   NZ26   — Model certificate template for Category 3 (사용자 제공 docx → Word PDF 변환본)
#   NZ_ID  — Appendix 2B Model pre-export identification check form (MPI 공식 PDF, 2026-09-29 수정본)
#   RCF    — Rabies Certification Form (MPI 2026 IHS 공식 PDF, Version: October 2025)
#
# 좌표를 손으로 적지 않고 **문구 위치에서 계산**한다 — 양식이 바뀌면 원본만 바꿔 다시 돌리면 된다.
# 출력: data/pdf-templates/src/nz2026-layout.json (build-nz2026-templates.mjs 가 읽는다)
#       data/pdf-strikes-nz26.json (NZ26 취소선 — pdf-fill.ts 가 읽는다).
#
# 실행(apps/admin 에서): python scripts/nz2026-layout.py [--preview <dir>]
#   원본 = data/pdf-templates/src/{NZ26,NZ_ID,RCF}_base.pdf
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

SRC = Path('data/pdf-templates/src')
OUT = SRC / 'nz2026-layout.json'
# 취소선 좌표만 따로 — lib/pdf-fill.ts 가 import 한다(매핑 JSON 은 손으로 관리하는 파일이라 생성물을 섞지 않는다).
STRIKES_OUT = Path('data/pdf-strikes-nz26.json')


# ── 공통 ──────────────────────────────────────────────────────────────────────

class Page:
    def __init__(self, doc, pno):
        self.pno = pno
        self.page = doc[pno]
        self.h = self.page.rect.height
        rows = {}
        for b in self.page.get_text('dict')['blocks']:
            for ln in b.get('lines', []):
                text = ''.join(s['text'] for s in ln['spans'])
                spans = [s for s in ln['spans'] if s['text'].strip()]
                if not spans:
                    continue
                # 줄 상자는 **글자가 있는 조각**으로만 잡는다 — Word 변환본은 공백 조각의 상자가
                # 더 커서(위로 6pt 가량) 그대로 쓰면 입력칸이 윗줄로 올라간다.
                x0 = min(s['bbox'][0] for s in spans)
                y0 = min(s['bbox'][1] for s in spans)
                x1 = max(s['bbox'][2] for s in spans)
                y1 = max(s['bbox'][3] for s in spans)
                rows.setdefault(round(y0), []).append((x0, y0, x1, y1, text))
        # 같은 높이의 줄 조각(번호 'a)' + 본문)을 한 줄로 합친다.
        self.lines = []
        for key in sorted(rows):
            parts = sorted(rows[key])
            self.lines.append({
                'x0': min(p[0] for p in parts), 'y0': min(p[1] for p in parts),
                'x1': max(p[2] for p in parts), 'y1': max(p[3] for p in parts),
                'text': ''.join(p[4] for p in parts),
                'parts': parts,
            })

    def find(self, sub, after=0.0, before=1e9, x_min=0.0, x_max=1e9):
        for ln in self.lines:
            if ln['y0'] < after or ln['y0'] > before:
                continue
            for p in ln['parts']:
                if sub in p[4] and x_min <= p[0] <= x_max:
                    return ln, p
        raise SystemExit(f'p{self.pno + 1}: "{sub}" (after {after}) 를 찾지 못함')

    def label_end(self, sub, part):
        hits = self.page.search_for(sub, clip=fitz.Rect(part[0] - 1, part[1] - 1, part[2] + 1, part[3] + 1))
        if not hits:
            raise SystemExit(f'p{self.pno + 1}: "{sub}" 글자 위치 없음')
        return hits[0]

    def bl(self, x0, y0, x1, y1):
        """좌상단 기준 사각형 → pdf-lib(좌하단 기준) x, y, w, h."""
        return {'x': round(x0, 2), 'y': round(self.h - y1, 2), 'w': round(x1 - x0, 2), 'h': round(y1 - y0, 2)}


def field_after(pg, name, label, after=0.0, right=None, x_min=0.0, x_max=1e9, pad_left=2.0, before=1e9):
    """'Label: …………' 줄 — 라벨 끝부터 점선 끝(또는 right)까지."""
    ln, part = pg.find(label, after=after, before=before, x_min=x_min, x_max=x_max)
    r = pg.label_end(label, part)
    x1 = right if right is not None else max(ln['x1'], r.x1 + 60)
    return {'name': name, 'page': pg.pno, **pg.bl(r.x1 + pad_left, ln['y0'] - 0.5, x1, ln['y1'] + 0.5)}, ln


def field_box(pg, name, x0, y0, x1, y1, max_h=None):
    """칸 상자. max_h 를 주면 칸 세로 가운데에 그 높이로 — 글자 크기는 입력칸 높이로 정해지므로
    (pdf-fill computeMaxFontSize) 키 큰 칸을 그대로 쓰면 글자가 20pt 넘게 커진다."""
    if max_h is not None and (y1 - y0) > max_h:
        mid = (y0 + y1) / 2
        y0, y1 = mid - max_h / 2, mid + max_h / 2
    return {'name': name, 'page': pg.pno, **pg.bl(x0, y0, x1, y1)}


SKIP_TEXT = ('Signature, date', 'official government', 'Exporting Country', 'Certificate reference number')


def strike_between(pg, start, end, start_after=0.0, end_after=None, x_min=0.0):
    """start 문구 줄 ~ end 문구 줄(포함) 사이의 모든 본문 줄에 취소선."""
    s_ln, _ = pg.find(start, after=start_after, x_min=x_min)
    e_ln, _ = pg.find(end, after=end_after if end_after is not None else s_ln['y0'] - 0.1, x_min=x_min)
    out = []
    for ln in pg.lines:
        if ln['y0'] < s_ln['y0'] - 0.1 or ln['y0'] > e_ln['y0'] + 0.1:
            continue
        # 서명 상자·머리글 글자는 같은 높이에 있어도 본문이 아니다.
        parts = [p for p in ln['parts'] if not any(t in p[4] for t in SKIP_TEXT) and p[4].strip()]
        parts = [p for p in parts if p[0] < 355 or ln['x0'] < 355]
        if not parts:
            continue
        x0 = min(p[0] for p in parts)
        x1 = max(p[2] for p in parts)
        if x0 > 355:  # 서명 상자 안 글자뿐인 줄
            continue
        y0 = min(p[1] for p in parts)
        y1 = max(p[3] for p in parts)
        y = y0 + (y1 - y0) * 0.55
        out.append({'page': pg.pno, 'x1': round(x0, 2), 'y1': round(pg.h - y, 2), 'x2': round(x1, 2), 'y2': round(pg.h - y, 2)})
    if not out:
        raise SystemExit(f'p{pg.pno + 1}: "{start}"~"{end}" 사이에 줄이 없음')
    return out


def check_on_glyph(pg, name, glyph_after, glyph='☐', x_max=1e9):
    """인쇄된 ☐ 위에 체크박스를 겹친다. ☐ 은 기호 글꼴 조각이라 글자 검색 대신 조각 상자를 쓴다."""
    # 블록 순서는 위→아래가 아니다 — 조건에 맞는 조각 중 **가장 위**를 고른다.
    cands = [sp for b in pg.page.get_text('dict')['blocks'] for ln in b.get('lines', []) for sp in ln['spans']
             if sp['text'].strip().startswith(glyph) and sp['bbox'][1] >= glyph_after and sp['bbox'][0] <= x_max]
    if not cands:
        raise SystemExit(f'p{pg.pno + 1}: {glyph} (after {glyph_after}) 없음')
    sp = min(cands, key=lambda c: c['bbox'][1])
    x0, y0, x1, y1 = sp['bbox']
    w = (x1 - x0) if sp['text'].strip() == glyph else sp['size'] * 0.9
    s = sp['size'] * 0.72
    cx, cy = (x0 + x0 + w) / 2, (y0 + y1) / 2 + 0.8
    return {'name': name, 'page': pg.pno, **pg.bl(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2)}


def span_box(pg, name, sub, after, before, pad=1.0):
    """특정 글자 조각(예: 점선) 자리에 입력칸."""
    for b in pg.page.get_text('dict')['blocks']:
        for ln in b.get('lines', []):
            for sp in ln['spans']:
                x0, y0, x1, y1 = sp['bbox']
                if sub in sp['text'] and after <= y0 <= before:
                    return {'name': name, 'page': pg.pno, **pg.bl(x0 + pad, y0 - 0.5, x1 - pad, y1 + 0.5)}
    raise SystemExit(f'p{pg.pno + 1}: "{sub}" 조각 없음')


# ── NZ26 건강증명서 ───────────────────────────────────────────────────────────

def build_nz26():
    doc = fitz.open(SRC / 'NZ26_base.pdf')
    P = [Page(doc, i) for i in range(doc.page_count)]
    f = []
    strikes = []  # {when: [flags…], lines: [...]}

    def S(when, *ranges):
        lines = []
        for r in ranges:
            lines += strike_between(*r) if isinstance(r, tuple) else r
        strikes.append({'when': when, 'lines': lines})

    p1 = P[0]
    MID, RIGHT = 296.0, 558.0

    def addr(fld, bottom):
        """주소 칸 — 칸 아래 테두리까지 늘려 여러 줄로."""
        top = p1.h - fld['y'] - fld['h']
        return {**fld, **p1.bl(fld['x'], top, fld['x'] + fld['w'], bottom), 'multiline': True}
    f.append(field_after(p1, 'consignor_name', 'Name:', right=MID)[0])
    f.append(addr(field_after(p1, 'consignor_address', 'Address:', right=MID)[0], 222.5))
    f.append(field_after(p1, 'competent_authority', 'Competent Authority:', right=RIGHT)[0])
    f.append(field_after(p1, 'consignee_name', 'Name:', after=240, right=MID)[0])
    f.append(addr(field_after(p1, 'consignee_address', 'Address:', after=250, right=MID)[0], 305.0))
    f.append(field_after(p1, 'origin_country', 'Country of origin:', right=RIGHT)[0])
    f.append(field_after(p1, 'origin_iso', 'ISO Code*:', right=RIGHT)[0])
    f.append(field_after(p1, 'departure_date', 'Scheduled date of departure:', right=MID)[0])
    f.append(field_after(p1, 'port_departure', 'Port of departure:', right=RIGHT)[0])
    f.append(field_after(p1, 'origin_place_name', 'Name:', after=360, right=MID)[0])
    f.append(addr(field_after(p1, 'origin_place_address', 'Address:', after=375, right=MID)[0], 414.5))
    f.append(field_after(p1, 'transport_identification', 'Identification:', right=RIGHT)[0])
    f.append(field_after(p1, 'port_arrival', 'Port of arrival:', right=MID)[0])
    f.append(field_after(p1, 'permit_no', 'Import permit number:', right=RIGHT)[0])
    f.append(field_after(p1, 'total_animals', 'Total number of animals:', right=MID)[0])
    f.append(field_after(p1, 'transit_country', 'Country of transit/transhipment (if applicable):', right=RIGHT)[0])
    # 10. Means of transport — Aeroplane 체크(항상 항공).
    f.append({**check_on_glyph(p1, 'transport_aeroplane', 365, x_max=330), 'type': 'check'})
    # 15. 동물 표 — 6행 × 8열 (표 선 좌표: get_drawings 로 확인).
    rows_y = [570.3, 587.9, 604.3, 621.8, 638.1, 655.7, 672.1]
    cols_x = [39.5, 99.3, 156.0, 205.6, 304.9, 365.1, 446.7, 495.5, 557.4]
    cols = ['name', 'species', 'breed', 'microchip', 'microchip_location', 'age', 'sex', 'desexed']
    for r in range(6):
        for c, key in enumerate(cols):
            f.append(field_box(p1, f'animal_row{r + 1}_{key}', cols_x[c] + 1.5, rows_y[r] + 1, cols_x[c + 1] - 1.5, rows_y[r + 1] - 1, max_h=12))

    # 2~8쪽 머리글 'Exporting Country:'
    for pg in P[1:]:
        f.append(field_after(pg, f'exporting_country_p{pg.pno + 1}', 'Exporting Country:', right=296)[0])

    p2, p3, p4, p5, p6, p7, p8 = P[1:8]
    # ── p2 — 1. 종·임신 ──
    S(['dog'], (p2, 'Is a domestic cat', 'Is a domestic cat'))
    S(['cat'], (p2, 'Is a domestic dog', 'Is a domestic dog'))
    S(['all_male'], (p2, 'Will not be more than 42 days pregnant', 'Will not be more than 42 days pregnant'))

    # ── p3 — 15. 동반 서류 / 17. 검진 / 20~22. 광견병 ──
    S(['cat'], (p3, 'Desexing certificate or', 'Desexing certificate or'))
    S(['always'], (p3, 'For a New Zealand-origin cat or dog: Veterinary', 'from New Zealand.*'))
    S(['cat'], (p3, 'residency declaration.*', 'residency declaration.*'))
    S(['cat'], (p3, 'Free from evidence of recent dog bites', 'Free from evidence of recent dog bites'))
    S(['cat'], (p3, 'If the dog is an entire male or female', 'examination of the extruded penis'))
    S(['all_desexed'], (p3, 'If the dog is an entire male or female', 'examination of the extruded penis'))

    f.append(field_after(p3, 'rabies_date', 'Date of vaccination:')[0])
    f.append(field_after(p3, 'rabies_doi', 'Duration of immunity of vaccine:')[0])
    f.append(field_after(p3, 'rabies_prev_date', 'Date of previous vaccination (if applicable):')[0])
    f.append(field_after(p3, 'rabies_prev_doi', 'Duration of immunity of previous vaccine (if applicable):')[0])
    # 21. 'Test used:' 는 줄 끝에 있고 점선은 다음 줄이다.
    tu_ln, _ = p3.find('…………', after=580, before=592)
    f.append(field_box(p3, 'titer_test', tu_ln['x0'], tu_ln['y0'] - 0.5, tu_ln['x1'], tu_ln['y1'] + 0.5))
    f.append(field_after(p3, 'titer_date', 'Sample collection date(s):', after=590)[0])
    f.append(field_after(p3, 'titer_result', 'Test Result:', after=600)[0])
    f.append(field_after(p3, 'scan1_date', 'Date of first scan:')[0])
    # 22. 채혈 6~12개월(인증 1회) ↔ 3~6개월(인증 2회)
    S(['nzid2'], (p3, '22. The rabies neutralising antibody titration test', 'microchip scanned by an official veterinarian in a categorised country before'))
    S(['nzid1'], (p3, 'The sample was taken at least 3 months and less than 6 months', 'Date of first scan:'),
      (p4, 'The second scan was done in the country of export', 'Date of second scan:'))

    # ── p4 — 뉴질랜드 출생 동물 / 27·28. 외부구충 ──
    f.append(field_after(p4, 'scan2_date', 'Date of second scan:')[0])
    S(['always'], (p4, 'For a New-Zealand origin cat or dog returning', 'Test Result:'))
    f.append(field_after(p4, 'ext_cat_date', 'Treatment/inspection date:')[0])
    f.append(field_after(p4, 'ext_cat_product', 'Product name:', after=380)[0])
    f.append(field_after(p4, 'ext_cat_ingredient', 'Active ingredient(s):', after=390)[0])
    f.append(field_after(p4, 'ext_cat_weight', 'Weight of cat at time of treatment (kg):')[0])
    f.append(field_after(p4, 'ext_cat_dose', 'Dose given:', after=410)[0])
    S(['dog'], (p4, '27. The cat was treated', 'Dose given:', 0, 410))

    f.append(field_after(p4, 'ext1_date', 'First treatment/inspection date:')[0])
    f.append(field_after(p4, 'ext1_product', 'Product name:', after=470)[0])
    f.append(field_after(p4, 'ext1_ingredient', 'Active ingredient(s):', after=485)[0])
    f.append(field_after(p4, 'ext_dog_weight', 'Weight of dog at time of treatments (kg):')[0])
    f.append(field_after(p4, 'ext1_dose', 'Dose given:', after=505)[0])
    f.append(field_after(p4, 'ext2_date', 'Second treatment/inspection date:')[0])
    f.append(field_after(p4, 'ext2_product', 'Product name:', after=535)[0])
    f.append(field_after(p4, 'ext2_ingredient', 'Active ingredient(s):', after=545)[0])
    f.append(field_after(p4, 'ext2_dose', 'Dose given:', after=555)[0])
    f.append(field_after(p4, 'ext3_date', 'Additional treatment/inspection date:')[0])
    f.append(field_after(p4, 'ext3_product', 'Product name:', after=585)[0])
    f.append(field_after(p4, 'ext3_ingredient', 'Active ingredient(s):', after=600)[0])
    f.append(field_after(p4, 'ext3_dose', 'Dose given:', after=610)[0])
    S(['cat'], (p4, '28. The dog was treated at least twice', 'The dog was free from visible signs of external parasites'))
    S(['dog', 'ext_no_extra'], (p4, 'An additional external parasite treatment', 'Dose given:', 0, 610))

    # ── p5 — 29. 내부구충 / 30. 폐충 / 31·32. 심장사상충 / 33·34. 바베시아 로시 ──
    f.append(field_after(p5, 'int1_date', 'date:', after=105, x_max=80)[0])
    f.append(field_after(p5, 'int1_product', 'name(s):', after=115)[0])  # 'Product  name(s)' — 두 칸 띄어쓰기
    f.append(field_after(p5, 'int1_ingredient', 'Active ingredient(s):', after=128)[0])
    f.append(field_after(p5, 'int1_weight', 'Weight of animal at time of treatment (kg):', after=140)[0])
    f.append(field_after(p5, 'int1_dose', 'Dose given:', after=150)[0])
    f.append(field_after(p5, 'int2_date', 'Second treatment date:')[0])
    f.append(field_after(p5, 'int2_product', 'Product name(s):', after=185)[0])
    f.append(field_after(p5, 'int2_ingredient', 'Active ingredient(s):', after=198)[0])
    f.append(field_after(p5, 'int2_weight', 'Weight of animal at time of treatment (kg):', after=210)[0])
    f.append(field_after(p5, 'int2_dose', 'Dose given:', after=220)[0])

    f.append(field_after(p5, 'lungworm_date', 'Date of treatment:', after=300)[0])
    f.append(field_after(p5, 'lungworm_treatment', 'Treatment used:', after=312)[0])
    f.append(field_after(p5, 'lungworm_weight', 'Weight of dog at time of treatment (kg):', after=325)[0])
    f.append(field_after(p5, 'lungworm_dose', 'Dose given:', after=336)[0])
    S(['cat'], (p5, 'For Angiostrongylus vasorum', 'Dose given:', 0, 336))

    f.append(field_after(p5, 'heartworm_test_date', 'Sample collection date:', after=380)[0])
    f.append(field_after(p5, 'heartworm_date', 'Date of treatment:', after=460)[0])
    f.append(field_after(p5, 'heartworm_treatment', 'Treatment used:', after=472)[0])
    f.append(field_after(p5, 'heartworm_weight', 'Weight of dog at time of treatment (kg):', after=485)[0])
    f.append(field_after(p5, 'heartworm_dose', 'Total dose:', after=496)[0])
    S(['cat'], (p5, 'For heartworm (Dirofilaria immitis)', 'Total dose:', 0, 555))
    # 32b(서방형 목시덱틴 주사)는 쓰지 않는다 — 예방약 투약(32a)으로 기록한다.
    S(['dog'], (p5, 'Up to date with a sustained-release injection', 'Total dose:', 0, 555))

    # 33. 아프리카 거주 이력 — 한국 출발 개는 '없음'(호주 서식 Babesia 'N/A' 와 같은 판단).
    f.append({**check_on_glyph(p5, 'babesia_rossi_no', 603), 'type': 'check'})
    S(['cat'], (p5, 'For Babesia rossi (dogs only)', 'Total dose:', 0, 695))
    S(['dog'], (p5, 'If yes or unknown:', 'Total dose:', 0, 695))

    # ── p6 — 35~37 바베시아 로시(예/모름일 때만) / 38·39 바베시아 깁소니 / 40~42 브루셀라 ──
    S(['always'], (p6, '35. The dog was treated by a veterinarian with 2 doses', 'Third sample collection date:', 0, 345))
    f.append(field_after(p6, 'gibsoni_ext_date', 'date:', after=410)[0])  # 'First  external  parasite' — 두 칸 띄어쓰기
    f.append(field_after(p6, 'gibsoni_ifa_date', 'IFA/ELISA test sample collection date:', after=420)[0])
    f.append(field_after(p6, 'gibsoni_test', 'Test used (IFA or ELISA):', after=432)[0])
    f.append(field_after(p6, 'gibsoni_pcr_date', 'PCR test sample collection date:', after=444)[0])
    S(['cat'], (p6, 'For Babesia gibsoni (dogs only)', 'Third sample collection date:', 0, 590))
    S(['dog'], (p6, 'b)', 'Third sample collection date:', 465, 525))
    S(['dog'], (p6, '39. For a dog that was under 6 months', 'Third sample collection date:', 0, 590))

    # 브루셀라 — 고양이 전부 / 중성화견 40만 / 미중성화견 42 + 42a.
    S(['cat'], (p6, 'For Brucella canis (dogs only)', '42. A written declaration'),
      (p7, 'The entire dog (male or female) was subjected to either', 'Sample collection date:', 0, 440))
    S(['all_entire'], (p6, '40. A record signed by a veterinarian', '41. The dog originates'))
    S(['dog', 'all_desexed'], (p6, '41. The dog originates', '42. A written declaration'),
      (p7, 'The entire dog (male or female) was subjected to either', 'Sample collection date:', 0, 440))
    S(['dog', 'all_entire'],
      (p7, 'or', 'Sample collection date:', 110, 170),
      (p7, '43. The entire dog (male or female) was bred', 'Sample collection date:', 0, 440))
    f.append(field_after(p7, 'brucella_test', 'Test used:', after=85, x_max=100)[0])
    f.append(field_after(p7, 'brucella_date', 'Sample collection date:', after=100)[0])

    # ── p7 — 44. 개 독감 ──
    civ_ln, _ = p7.find('………', after=538, before=548)
    f.append(field_box(p7, 'civ_date', civ_ln['x0'], civ_ln['y0'] - 0.5, civ_ln['x1'], civ_ln['y1'] + 0.5))
    f.append(field_after(p7, 'civ_name', 'Name of vaccine:')[0])
    f.append(field_after(p7, 'civ_doi', 'Duration of immunity of vaccine:', after=560)[0])
    f.append(field_after(p7, 'civ_pcr_date', 'Sample collection date:', after=625)[0])
    S(['cat'], (p7, '44. For a dog from countries that present a risk', 'Sample collection date:', 0, 625))
    S(['dog', 'civ_vac'], (p7, 'Or', 'Sample collection date:', 585, 625))

    # ── p8 — 46·47 리슈마니아 / 48~51 렙토 / 서명란 ──
    f.append(field_after(p8, 'leish_test', 'Test used:', after=185, before=195)[0])
    f.append(field_after(p8, 'leish_date', 'Sample collection date:', after=198, before=206)[0])
    S(['cat'], (p8, 'For leishmaniosis (dogs only)', 'Sample collection date:', 0, 325))
    S(['dog'], (p8, '46. There have been no endemic cases', 'The dog has been continuously resident'))
    S(['dog'], (p8, 'For dogs vaccinated with a serology-interfering vaccine', 'accompanies the dog (as applicable)', 160, 175))
    S(['dog'], (p8, 'or', 'Sample collection date:', 210, 325))
    f.append(field_after(p8, 'lepto_date', 'Sample collection date:', after=385, before=395)[0])
    S(['cat'], (p8, 'For leptospirosis', 'Daily dose given:'))
    S(['dog'], (p8, '48. The exporting country is free from Leptospira', '48. The exporting country is free from Leptospira'))
    S(['dog'], (p8, '50. The dog had a positive MAT', 'Daily dose given:'))

    f.append(field_after(p8, 'vet_name', 'Name:', after=590, x_max=60, right=296)[0])
    f.append(field_after(p8, 'vet_address', 'Address:', after=610, x_max=60, right=296)[0])
    f.append(field_after(p8, 'vet_email', 'Email:', after=628, x_max=60, right=296)[0])
    f.append(field_after(p8, 'vet_date', 'Date:', after=610, before=630, x_min=300, right=RIGHT)[0])

    for x in f:
        x['name'] = 'nz26_' + x['name']
        x.setdefault('type', 'text')
    return {'base': 'NZ26_base.pdf', 'out': 'NZ26.pdf', 'fields': f, 'strikes': strikes}


# ── NZ_ID 사전 ID 확인서 ──────────────────────────────────────────────────────

def build_nz_id():
    # MPI 공식 'Appendix 2B (guidance)' 2026 IHS 판(2026-09-29 수정본, 2쪽). 사용자 제공 docx 판은
    #   "The RNATT sample **was taken** … on (date)" 처럼 아직 하지 않은 채혈을 한 것처럼 읽혀 헷갈렸다 —
    #   MPI 가 "is to be taken" 으로 고치고 문장 속 (date) 칸을 없앤 이 판으로 교체(2026-10-06 사용자 지시).
    doc = fitz.open(SRC / 'NZ_ID_base.pdf')
    p1, p2 = Page(doc, 0), Page(doc, 1)
    f = []
    # 경로 체크 — ☐ * 6~12개월 / ☐ ** 3~6개월, 그 아래 1: 첫 인증 / 2. 두 번째 인증.
    f.append({**check_on_glyph(p1, 'path_6to12', 255, x_max=75), 'type': 'check'})
    f.append({**check_on_glyph(p1, 'path_3to6', 320, x_max=75), 'type': 'check'})
    f.append({**check_on_glyph(p1, 'scan_first', 350), 'type': 'check'})
    f.append({**check_on_glyph(p1, 'scan_second', 390), 'type': 'check'})
    # Section A 동물 표 — 5행 × 4마리. 표 선 좌표(get_drawings 의 얇은 사각형).
    rows_y = [489.5, 529.5, 569.5, 622.7, 662.7, 702.7]
    cols_x = [171.1, 263.2, 355.4, 447.6, 539.9]
    keys = ['microchip', 'sex', 'description', 'scan_date', 'permit_app']
    for a in range(4):
        for r, key in enumerate(keys):
            f.append(field_box(p1, f'animal_row{a + 1}_{key}', cols_x[a] + 2, rows_y[r] + 1.5, cols_x[a + 1] - 2, rows_y[r + 1] - 1.5, max_h=13))
    # Section B 검역관 — 이름은 1쪽 끝, 나머지는 2쪽.
    f.append(field_box(p1, 'ov_name', 223, 742.7 + 1, 538, 758.7 - 1, max_h=13))
    vrows = [72.2, 100.7, 129.2, 143.0, 156.7, 170.4, 184.1]
    for i, key in enumerate(['ov_authority', 'ov_address', 'ov_country', 'ov_phone', 'ov_email', 'ov_date']):
        f.append(field_box(p2, key, 223, vrows[i] + 1, 538, vrows[i + 1] - 1, max_h=13))
    for x in f:
        x['name'] = 'nzid_' + x['name']
        x.setdefault('type', 'text')
    return {'base': 'NZ_ID_base.pdf', 'out': 'NZ_ID.pdf', 'fields': f, 'strikes': []}


# ── RCF — OVD 입력칸을 구역별로 옮겨 붙인다 ─────────────────────────────────

def build_rcf():
    ovd = fitz.open('data/pdf-templates/OVD.pdf')[0]
    rcf_doc = fitz.open(SRC / 'RCF_base.pdf')
    rcf = rcf_doc[0]
    H = rcf.rect.height

    def shift(text, nth=0):
        o = ovd.search_for(text)[nth]
        r = rcf.search_for(text)[nth]
        return r.x0 - o.x0, r.y0 - o.y0

    # OVD 입력칸을 **구역마다 다른 이동량**으로 옮긴다 — RCF 는 칸 구성은 같지만 줄 간격이
    # 구역마다 달라 하나의 이동량으로는 아래로 갈수록 어긋난다(항체가 숫자칸·2차 접종 줄).
    def band(rr):
        if rr.y0 < 260:
            return shift('Date (Day/Month/Year)')
        if rr.y0 < 470:
            return shift('Primary microchip number')
        if rr.y0 < 560:
            return shift('Microchip implantation date')
        if rr.y0 < 650:
            return shift('IU/ML') if rr.x0 >= 290 else shift('Blood sample for the titration')
        if rr.y0 < 706:
            return shift('Vaccination 1')
        return shift('Vaccination 2')

    f = []
    for w in ovd.widgets():
        rr = w.rect
        dx, dy = band(rr)
        x0, y0, x1, y1 = rr.x0 + dx, rr.y0 + dy, rr.x1 + dx, rr.y1 + dy
        f.append({'name': w.field_name, 'page': 0, 'type': 'check' if w.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX else 'text',
                  'x': round(x0, 2), 'y': round(H - y1, 2), 'w': round(x1 - x0, 2), 'h': round(y1 - y0, 2),
                  'fontSize': w.text_fontsize or 0})
    # OVD 에는 수의사·병원·주소·검사기관이 페이지 글자로 박혀 있었다(로잔 고정) — RCF 는 칸으로 만들어
    # 선택한 수의사·검사기관이 찍히게 한다. 값 칸 = 등록 수의사 열(x 133~291).
    pg = Page(rcf_doc, 0)
    VX0, VX1 = 135.0, 289.0
    def row(label, name, bottom=None, after=0.0):
        ln, part = pg.find(label, after=after, x_max=60)
        top = ln['y0'] - 1.5
        f.append({'name': name, 'page': 0, 'type': 'text', **pg.bl(VX0, top, VX1, bottom if bottom else ln['y1'] + 1.5),
                  **({'multiline': True} if bottom else {})})
    date_ln, _ = pg.find('Date (Day/Month/Year)', x_max=60)
    row('Name of Veterinarian', 'rcf_vet_name')
    row('Veterinary Practice', 'rcf_vet_practice')
    row('Address', 'rcf_vet_address', bottom=date_ln['y0'] - 4, after=185)
    lab_ln, _ = pg.find('Name of the government-approved laboratory')
    f.append({'name': 'rcf_lab_name', 'page': 0, 'type': 'text', **pg.bl(lab_ln['x0'], lab_ln['y1'] + 1, 400, lab_ln['y1'] + 13)})
    return {'base': 'RCF_base.pdf', 'out': 'RCF.pdf', 'fields': f, 'strikes': []}


def preview(layouts, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for key, lay in layouts.items():
        doc = fitz.open(SRC / lay['base'])
        for x in lay['fields']:
            pg = doc[x['page']]
            H = pg.rect.height
            r = fitz.Rect(x['x'], H - x['y'] - x['h'], x['x'] + x['w'], H - x['y'])
            pg.draw_rect(r, color=(1, 0, 0) if x['type'] == 'text' else (0, 0.6, 0), width=0.6)
        for g in lay['strikes']:
            col = (0, 0, 1) if g['when'] != ['always'] else (0.6, 0, 0.6)
            for l in g['lines']:
                pg = doc[l['page']]
                H = pg.rect.height
                pg.draw_line((l['x1'], H - l['y1']), (l['x2'], H - l['y2']), color=col, width=0.8)
        for i, pg in enumerate(doc):
            pg.get_pixmap(dpi=110).save(out_dir / f'{key}_p{i + 1}.png')


if __name__ == '__main__':
    layouts = {'NZ26': build_nz26(), 'NZ_ID': build_nz_id(), 'RCF': build_rcf()}
    OUT.write_text(json.dumps(layouts, ensure_ascii=False, indent=1), encoding='utf-8')
    STRIKES_OUT.write_text(json.dumps(layouts['NZ26']['strikes'], ensure_ascii=False), encoding='utf-8')
    print(OUT, {k: (len(v['fields']), sum(len(g['lines']) for g in v['strikes'])) for k, v in layouts.items()})
    if '--preview' in sys.argv:
        preview(layouts, sys.argv[sys.argv.index('--preview') + 1])
