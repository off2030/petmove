"""Repair legacy NZ templates without flattening their interactive form fields.

Run from the repository root. Requires pypdf and PyMuPDF. Existing species-only
annotations become conditional drawing data; the original form text is retained.
The script is idempotent and contains no customer data.
"""
import json
import re
from pathlib import Path

import fitz
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, NameObject

ADMIN = Path(__file__).resolve().parents[1]
DATA = ADMIN / 'data'
STRIKES = DATA / 'pdf-strikes-nz-legacy.json'


def text_lines(page):
    return [line for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines']]


def text(line):
    return ''.join(span['text'] for span in line['spans']).strip()


def strike(page, page_index, start, end=None):
    lines = text_lines(page)
    first = next(i for i, line in enumerate(lines) if text(line).startswith(start))
    last = next((i for i in range(first + 1, len(lines)) if end and text(lines[i]).startswith(end)), len(lines))
    result = []
    for line in lines[first:last]:
        if not text(line):
            continue
        x0, y0, x1, y1 = line['bbox']
        result.append(dict(page=page_index, x1=round(x0, 3), y1=round(page.rect.height - (y0 + y1) / 2, 3), x2=round(x1, 3), y2=round(page.rect.height - (y0 + y1) / 2, 3)))
    return result


def annotation_lines(annot, page_index):
    quads = annot.get('/QuadPoints', [])
    if quads:
        result = []
        for i in range(0, len(quads), 8):
            q = [float(v) for v in quads[i:i+8]]
            y = (q[1] + q[5]) / 2
            result.append(dict(page=page_index, x1=q[0], y1=y, x2=q[2], y2=y))
        return result
    if annot.get('/Subtype') == '/Line' and annot.get('/L'):
        x1, y1, x2, y2 = map(float, annot['/L'])
        return [dict(page=page_index, x1=x1, y1=y1, x2=x2, y2=y2)]
    return []


def main():
    previous = json.loads(STRIKES.read_text('utf8')) if STRIKES.exists() else {}
    output = {}
    for name in ['NZ.pdf', 'NZ_2.pdf']:
        target = DATA / 'pdf-templates' / name
        visual = fitz.open(target)
        reader = PdfReader(target)
        dog_lines = []
        for index in [1, 2]:
            for ref in reader.pages[index].get('/Annots', []):
                dog_lines.extend(annotation_lines(ref.get_object(), index))
        if not dog_lines:
            dog_lines = next((g['lines'] for g in previous.get(name, []) if g['when'] == ['dog']), [])
        cat_lines = strike(visual[1], 1, 'Heartworm treatment and testing')
        cat_lines += strike(visual[2], 2, 'Brucella canis testing')
        cat_lines += strike(visual[3], 3, '(Only for a dog', '(28)')
        cat_lines += strike(visual[4], 4, '(Only for a dog', '(2)')
        # Only the sealing clause is waived. Keep IATA, clean/dry/pest-free.
        seal = strike(visual[4], 4, 'Note: If seal is broken', 'Note: Government')
        clause = next(line for line in text_lines(visual[4]) if 'was fastened with an official seal' in text(line))
        words = visual[4].get_text('words')
        row_words = sorted([w for w in words if abs(w[1] - clause['bbox'][1]) < 2], key=lambda w: w[0])
        start = next(i for i, w in enumerate(row_words) if w[4] == 'and' and i + 1 < len(row_words) and row_words[i+1][4] == 'was')
        x0, _, _, _ = row_words[start][:4]
        _, y0, x1, y1 = clause['bbox']
        y = visual[4].rect.height - (y0 + y1) / 2
        seal.append(dict(page=4, x1=x0, y1=y, x2=x1, y2=y))
        # Blank seal-number line immediately below the sealing sentence.
        next_line = text_lines(visual[4])[text_lines(visual[4]).index(clause) + 1]
        if set(text(next_line)) <= {'.'}:
            x0, y0, x1, y1 = next_line['bbox']
            y = visual[4].rect.height - (y0 + y1) / 2
            seal.append(dict(page=4, x1=x0, y1=y, x2=x1, y2=y))
        output[name] = [dict(when=['always'], lines=seal), dict(when=['dog'], lines=dog_lines), dict(when=['cat'], lines=cat_lines)]

        writer = PdfWriter()
        writer.clone_document_from_reader(reader)
        # Preserve widgets and their canonical field tree. Remove only the
        # fixed editorial annotations now drawn conditionally by the renderer.
        for index in [1, 2, 3, 4]:
            page = writer.pages[index]
            if '/Annots' in page:
                page[NameObject('/Annots')] = ArrayObject([ref for ref in page['/Annots'] if ref.get_object().get('/Subtype') == '/Widget'])
        with target.open('wb') as stream:
            writer.write(stream)
        visual.close()
        assert set(reader.get_fields() or {}) == set(PdfReader(target).get_fields() or {})
    STRIKES.write_text(json.dumps(output, indent=2) + '\n', encoding='utf8')
    mappings_path = DATA / 'pdf-field-mappings.json'
    mapping_text = mappings_path.read_text('utf8')
    for key in ['NZ', 'NZ_2']:
        section_pattern = rf'^  "{key}": \{{.*?(?=^  "[^"\n]+": \{{|\Z)'
        section = re.search(section_pattern, mapping_text, re.M | re.S).group()
        if '"strikeFlags"' not in section:
            section = section.replace('"flatten": true,', '"flatten": true,\n    "strikeFlags": "nz-legacy",', 1)
        for field, transform in [('Text58', 'multi:nz_titer_date'), ('Text59', 'multi:nz_titer_value')]:
            pattern = rf'"{field}": \{{[^}}]*\}}'
            section = re.sub(pattern, lambda m: re.sub(r'"transform": "[^"]+"', f'"transform": "{transform}"', m.group()), section)
        for field in ['Text68', 'Text69', 'Text70', 'Text71', 'Text73']:
            pattern = rf'"{field}": \{{[^}}]*\}}'
            section = re.sub(pattern, lambda m: m.group() if '"speciesOnly"' in m.group() else m.group().replace('"source":', '"speciesOnly": "dog",\n        "source":', 1), section)
        if key == 'NZ':
            if '"Check Box72"' not in section:
                section = section.replace('"fields": {', '"fields": {\n      "Check Box72": { "source": "species", "transform": "checkbox:eq:dog", "speciesOnly": "dog", "note": "Dog-only South Africa declaration; blank for cats" },', 1)
        mapping_text = re.sub(section_pattern, lambda _: section, mapping_text, count=1, flags=re.M | re.S)
    json.loads(mapping_text)
    mappings_path.write_text(mapping_text, encoding='utf8')


if __name__ == '__main__':
    main()
