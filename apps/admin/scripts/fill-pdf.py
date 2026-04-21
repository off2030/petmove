"""
Fill 한국_renamed.pdf with case data from JSON stdin.
Usage: echo '{"text":{...}, "checkboxes":{...}}' | py scripts/fill-pdf.py
"""
import sys, json, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

data = json.loads(sys.stdin.read())
text_fields = data['text']
checkbox_fields = data.get('checkboxes', {})

src = data.get('src', r'G:\내 드라이브\펫무브워크\한국, 일본\한국_renamed.pdf')
dst = data.get('dst', r'G:\내 드라이브\펫무브워크\한국, 일본\한국_filled_test.pdf')

reader = PdfReader(src)
writer = PdfWriter()
writer.append(reader)

filled = 0

# Fill all fields by iterating AcroForm
acro = writer._root_object.get('/AcroForm', {})
fields_list = acro.get('/Fields', [])

for field_ref in fields_list:
    field_obj = field_ref.get_object()
    name = str(field_obj.get('/T', ''))

    if name in text_fields and text_fields[name]:
        field_obj[NameObject('/V')] = TextStringObject(text_fields[name])
        # Also set appearance to make value visible in most viewers
        kids = field_obj.get('/Kids', [])
        for kid_ref in kids:
            kid = kid_ref.get_object()
            kid[NameObject('/V')] = TextStringObject(text_fields[name])
        filled += 1

    if name in checkbox_fields:
        field_obj[NameObject('/V')] = NameObject('/Yes')
        field_obj[NameObject('/AS')] = NameObject('/Yes')
        kids = field_obj.get('/Kids', [])
        for kid_ref in kids:
            kid = kid_ref.get_object()
            kid[NameObject('/V')] = NameObject('/Yes')
            kid[NameObject('/AS')] = NameObject('/Yes')
        filled += 1

with open(dst, 'wb') as f:
    writer.write(f)

print(f'Filled {filled} fields → {dst}')
