"""Replace NZ identity-table Age headings with DOB, preserving interactive fields.

Run from any directory. Optional arguments: NZ NZ_2 NZ26. Idempotent and offline.
"""
import io
import sys
from pathlib import Path

import fitz
from pypdf import PdfReader

TEMPLATES = Path(__file__).resolve().parents[1] / 'data' / 'pdf-templates'


def widgets(reader):
    return sorted((i, str(a.get_object().get('/T', '')),
                   tuple(round(float(v), 3) for v in a.get_object().get('/Rect', [])),
                   str(a.get_object().get('/V', '')),
                   bool(a.get_object().get('/AP', {}).get('/N')))
                  for i, page in enumerate(reader.pages) for a in page.get('/Annots', [])
                  if a.get_object().get('/Subtype') == '/Widget')


for name in sys.argv[1:] or ['NZ', 'NZ_2', 'NZ26']:
    if name not in {'NZ', 'NZ_2', 'NZ26'}:
        raise ValueError(f'Unsupported NZ template: {name}')
    target = TEMPLATES / f'{name}.pdf'
    original = target.read_bytes()
    reader = PdfReader(io.BytesIO(original))
    doc = fitz.open(stream=original, filetype='pdf')
    page = doc[0]
    spans = [s for b in page.get_text('dict')['blocks'] for line in b.get('lines', []) for s in line['spans']]
    age = [s for s in spans if s['text'].strip() == 'Age']
    if not age:
        assert page.search_for('DOB'), f'{name}: neither Age nor DOB heading found'
        doc.close()
        continue
    assert len(age) == 1, f'{name}: ambiguous Age headings'
    heading = age[0]
    rect = fitz.Rect(heading['bbox'])
    if name == 'NZ26':
        # The original table heading occupies two lines: "Age or" / "Date of birth".
        rect = fitz.Rect(369.5, 533.5, 439, 569)
    # Remove only the old text. Its font bounding box overlaps the table's top
    # border in NZ/NZ_2; an opaque fill would paint over that border.
    page.add_redact_annot(rect, fill=None)
    page.apply_redactions(images=0, graphics=0)
    page.insert_text(heading['origin'], 'DOB', fontsize=heading['size'],
                     fontname='hebo' if 'Bold' in heading['font'] else 'helv', color=(0, 0, 0))
    output = doc.tobytes(garbage=3, deflate=True)
    updated = PdfReader(io.BytesIO(output))
    assert set(reader.get_fields() or {}) == set(updated.get_fields() or {}), f'{name}: field tree changed'
    assert {k: str(v.get('/V', '')) for k, v in (reader.get_fields() or {}).items()} == {
        k: str(v.get('/V', '')) for k, v in (updated.get_fields() or {}).items()
    }, f'{name}: stored field values changed'
    assert widgets(reader) == widgets(updated), f'{name}: form widgets changed'
    assert len(updated.pages) == len(reader.pages), f'{name}: page count changed'
    target.write_bytes(output)
    doc.close()
    print(f'{name}: DOB heading updated; {len(updated.get_fields() or {})} fields preserved')
