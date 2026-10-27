"""Build the fillable SGP certificate from AVS Schedule III (01042026), pp. 4-6.

Usage: python apps/admin/scripts/update-sgp-template.py official-schedule-iii.pdf
Source: https://avs.nparks.gov.sg/pets/importing-exporting-a-pet/import/dogs-and-cats/
Only the official blank certificate and mapping are changed; no case data is used.
Requires PyMuPDF. Existing field names keep the production generator compatible.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import pymupdf as pdf

DATA = Path(__file__).resolve().parents[1] / 'data'
SOURCE_URL = 'https://isomer-user-content.by.gov.sg/30/09b135c8-00b2-4859-8d90-9ee700d2b67b/DOGCAT%2083-3%20(w_feeattd1)%2001042026.pdf'


def lines(page):
    return [l for b in page.get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] if ''.join(s['text'] for s in l['spans']).strip()]


def text(line):
    return ''.join(s['text'] for s in line['spans'])


def line_for(page, prefix, occurrence=0):
    return [l for l in lines(page) if text(l).strip().startswith(prefix)][occurrence]


def blank(page, prefix, occurrence=0, run=0, width=None):
    line = line_for(page, prefix, occurrence)
    span = next(s for s in line['spans'] if '_' in s['text'])
    matches = list(re.finditer(r'_{3,}', span['text']))
    m = matches[run]
    # Locate within this line, rather than a same-length blank elsewhere.
    candidates = page.search_for(m.group())
    r = next(r for r in candidates if abs(r.y0 - span['bbox'][1]) < 1 and r.x0 >= span['bbox'][0] - 1)
    if run:
        r = [r for r in candidates if abs(r.y0-span['bbox'][1]) < 1][-1]
    return pdf.Rect(r.x0, r.y0 - 2, r.x0 + width if width else r.x1, r.y1)


def strike(page, index, rect, label):
    return dict(_at=label, page=index, x1=round(rect.x0, 2), y1=round(page.rect.height-(rect.y0+rect.y1)/2, 2), x2=round(rect.x1, 2), y2=round(page.rect.height-(rect.y0+rect.y1)/2, 2))


def main():
    source = Path(sys.argv[1])
    original = pdf.open(source)
    assert len(original) == 10 and '01042026' in original[3].get_text()
    doc = pdf.open()
    doc.insert_pdf(original, from_page=3, to_page=5)
    p1, p2, p3 = [doc[i] for i in range(3)]
    fields = {}

    def field(page, name, rect):
        widget = pdf.Widget()
        widget.field_name = name
        widget.field_type = pdf.PDF_WIDGET_TYPE_TEXT
        widget.rect = rect
        widget.text_font = 'Helv'
        widget.text_fontsize = 9
        widget.border_width = 0
        page.add_widget(widget)
        fields[name] = list(rect)

    specs = [
        ('text_1vqxe', 'NParks/AVS Import Licence No.', 0),
        ('text_2dlhd', 'NParks/AVS Import Licence No.', 1),
        ('text_3tcic', 'Species:', 0), ('text_4okuj', 'Breed:', 0),
        ('text_5wcle', 'Name of animal:', 0), ('text_6vatu', 'Age or Date of Birth:', 0),
        ('text_7nvqf', 'Colour:', 0), ('text_9qhaf', 'Microchip Number:', 0),
        ('text_10ehnj', 'The animal has been scanned on', 0),
        ('text_11qfuf', 'I,', 0), ('text_12gljs', 'veterinarian (delete as appropriate) of', 0),
        ('text_13vpdl', 'Canine distemper virus:', 0),
        ('text_14yyzu', 'Canine adenovirus type 1:', 0),
        ('text_15ggyf', 'Canine parvovirus type 2:', 0),
    ]
    for name, prefix, run in specs:
        field(p1, name, blank(p1, prefix, run=run))
    for name, prefix in [('text_16wkhs', 'Feline Calicivirus:'), ('text_17ffjz', 'Feline Herpesvirus-1:'), ('text_18uqim', 'Feline Panleukopenia virus:'), ('text_19jz', 'Date of rabies vaccination:'), ('text_20olqh', 'Date of blood sampling:'), ('text_21irsk', 'Rabies neutralising antibody titre:')]:
        field(p2, name, blank(p2, prefix))
    for occurrence, names in enumerate([['text_22mqjk', 'text_23ltyb', 'text_24egtj'], ['text_25pv', 'text_26zheb', 'text_27lonm']]):
        for name, prefix in zip(names, ['Date of treatment:', 'Name of product:', 'Active ingredient:']):
            field(p2, name, blank(p2, prefix, occurrence=occurrence, width=360 if prefix == 'Active ingredient:' else None))
    field(p3, 'text_28wkfi', blank(p3, 'Signature:', run=1))
    field(p3, 'text_32xsfq', pdf.Rect(74, 140, 510, 153))
    for name, top in [('text_29ulae', 209), ('text_30hspb', 225.5), ('text_31tz', 242), ('text_32fjpy', 258.5)]:
        field(p3, name, pdf.Rect(74, top, 510, top+13))
    # A fourth contact line accommodates email without merging it into the phone.
    p3.draw_line(pdf.Point(73.32, 272.5), pdf.Point(510.68, 272.5), width=.5)

    mapping_file = DATA / 'pdf-field-mappings.json'
    source_mapping = mapping_file.read_text('utf8')
    mapping = json.loads(source_mapping)['SGP']
    assert set(fields) == set(mapping['fields']), 'Template/mapping field mismatch'
    mapping['description'] = 'Singapore Schedule III veterinary certificate — official AVS 01042026, certificate pages 4-6. Dog/cat fields and sex/species overlays are aligned to this edition.'
    mapping['_source_url'] = SOURCE_URL
    mapping['_source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    mapping['_source_pages'] = [4, 5, 6]
    mapping['markOverlays'][0]['_note'] = 'Ellipse bounds derived from the sex labels in the official 01042026 certificate.'
    for value, label in [('male', 'Male'), ('neutered_male', 'Neutered Male'), ('female', 'Female'), ('spayed_female', 'Neutered female')]:
        r = next(pdf.Rect(l['bbox']) for l in lines(p1) if text(l).strip() == label)
        mapping['markOverlays'][0]['cases'][value] = dict(cx=round((r.x0+r.x1)/2,2), cy=round(p1.rect.height-(r.y0+r.y1)/2,2), rx=round(r.width/2+4,2), ry=8)
    # Private vet signs Sections I-III; official government vet completes Section IV.
    official = p1.search_for('Official government')[0]
    continued = line_for(p1, 'veterinarian (delete as appropriate) of')
    vet = p1.search_for('veterinarian')[0:]
    tail = next(r for r in vet if abs(r.y0-continued['bbox'][1]) < 1)
    endorsement = p3.search_for('or an official government veterinarian')[-1]
    mapping['lineOverlays'] = [strike(p1, 0, official, 'SECTION III official government'), strike(p1, 0, tail, 'SECTION III veterinarian continuation'), strike(p3, 2, endorsement, 'Endorsement alternative official veterinarian')]
    mapping['_lineOverlays_note'] = 'Strike the non-applicable official-vet alternative in Sections I-III only; preserve Section IV.'
    species_lines = dict(dog=[], cat=[])
    for species, word in [('dog', 'cat'), ('cat', 'dog')]:
        for prefix in ['After due enquiry I am satisfied that the dog/cat', 'certify in respect of the dog/cat']:
            line = line_for(p1, prefix)
            r = next(r for r in p1.search_for(word) if abs(r.y0-line['bbox'][1]) < 1)
            species_lines[species].append(strike(p1,0,r,prefix+' — '+word))
        prefixes = ['The cat was vaccinated', 'the vaccine manufacturer'] if species == 'dog' else ['The dog was vaccinated', 'according to the vaccine manufacturer', 'Date of vaccinations:', 'Canine distemper virus:', 'Canine adenovirus type 1:', 'Canine parvovirus type 2:']
        for prefix in prefixes:
            l = line_for(p1, prefix)
            species_lines[species].append(strike(p1,0,pdf.Rect(l['bbox']),prefix))
        if species == 'dog':
            for prefix in ['Date of vaccinations:', 'Feline Calicivirus:', 'Feline Herpesvirus-1:', 'Feline Panleukopenia virus:']:
                l = line_for(p2,prefix)
                species_lines[species].append(strike(p2,1,pdf.Rect(l['bbox']),prefix))
    mapping['conditionalLines'][0]['cases'] = species_lines
    mapping['conditionalLines'][0]['_note'] = 'Species words and non-applicable core-vaccination blocks from official 01042026 coordinates.'
    replacement = '  "SGP": '+json.dumps(mapping, ensure_ascii=False, indent=2).replace('\n','\n  ')+',\n'
    source_mapping = re.sub(r'  "SGP": \{.*?(?=  "TW": \{)', lambda _: replacement, source_mapping, flags=re.S)
    assert json.loads(source_mapping)['SGP'] == mapping
    doc.set_metadata(dict(title='Singapore Schedule III Veterinary Certificate 01042026', subject=SOURCE_URL))
    doc.save(DATA / 'pdf-templates' / 'SGP.pdf', garbage=4, deflate=True)
    mapping_file.write_text(source_mapping,encoding='utf8')
    print(f'Updated SGP: {len(doc)} pages, {len(fields)} fields, source SHA256 {mapping["_source_sha256"]}')


if __name__ == '__main__':
    main()
