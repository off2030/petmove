#!/usr/bin/env node
/**
 * Test: fill the 한국_renamed.pdf with case data
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
dotenv.config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// Get test case (슈/이주헌)
const { data: c } = await sb.from('cases').select('*').eq('id', 'ee80defa-e727-4194-bdef-942254eb996b').single()
const d = c.data

// Calculate age
const birth = new Date(d.birth_date)
const now = new Date()
const ageYears = now.getFullYear() - birth.getFullYear()
const ageMonths = now.getMonth() - birth.getMonth() + (now.getDate() < birth.getDate() ? -1 : 0)
const adjustedYears = ageMonths < 0 ? ageYears - 1 : ageYears
const adjustedMonths = ageMonths < 0 ? ageMonths + 12 : ageMonths

// Weight category
const weight = Number(d.weight) || 0
const weightCategory = weight <= 5 ? 'under5' : weight <= 10 ? '5to10' : 'over10'

// Map case data → PDF field values
const textFields = {
  owner_name: `${d.customer_first_name_en} ${d.customer_last_name_en}`,
  owner_phone: d.phone?.replace(/(\d{3})(\d{4})(\d{4})/, '+82-$1-$2-$3') || '',
  owner_address: d.address_en || '',
  age_years: String(adjustedYears),
  age_months: String(adjustedMonths),
  birth_date: d.birth_date?.replace(/-/g, '/') || '',
  color: d.color_en || '',
  pet_name: c.pet_name_en || '',
  breed: d.breed_en || '',
  weight_kg: String(weight),
  microchip_no: (c.microchip || '').replace(/\s/g, ''),
  microchip_implant_date: d.microchip_implant_date?.replace(/-/g, '/') || '',
}

// Rabies dates
const rabiesDates = d.rabies_dates || []
if (rabiesDates[0]) textFields.rabies1_date = rabiesDates[0].replace(/-/g, '/')
if (rabiesDates[1]) textFields.rabies2_date = rabiesDates[1].replace(/-/g, '/')
if (rabiesDates[2]) textFields.rabies3_date = rabiesDates[2].replace(/-/g, '/')

// Checkbox fields (value = '/Yes' to check)
const checkboxFields = {}

// Species
if (d.species === 'dog') checkboxFields.species_dog = true
else if (d.species === 'cat') checkboxFields.species_cat = true

// Sex
const sexMap = { female: 'sex_female', male: 'sex_male', spayed_female: 'sex_neutered_female', neutered_male: 'sex_neutered_male' }
if (sexMap[d.sex]) checkboxFields[sexMap[d.sex]] = true

// Weight
if (weightCategory === 'under5') checkboxFields.weight_under5 = true
else if (weightCategory === '5to10') checkboxFields.weight_5to10 = true
else checkboxFields.weight_over10 = true

// Microchip yes/no
if (c.microchip) checkboxFields.microchip_yes = true
else checkboxFields.microchip_none = true

console.log('=== Text Fields ===')
for (const [k, v] of Object.entries(textFields)) {
  if (v) console.log(`  ${k}: ${v}`)
}
console.log('\n=== Checkbox Fields ===')
for (const [k, v] of Object.entries(checkboxFields)) {
  if (v) console.log(`  ${k}: ✓`)
}

// Now fill the PDF using Python subprocess
import { execSync } from 'child_process'

const fillScript = `
import sys, json
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject, BooleanObject

data = json.loads(sys.argv[1])
text_fields = data['text']
checkbox_fields = data['checkboxes']

src = r'G:\\내 드라이브\\펫무브워크\\한국, 일본\\한국_renamed.pdf'
dst = r'G:\\내 드라이브\\펫무브워크\\한국, 일본\\한국_filled_test.pdf'

reader = PdfReader(src)
writer = PdfWriter()
writer.append(reader)

# Fill text fields
for field_name, value in text_fields.items():
    try:
        writer.update_page_form_field_values(writer.pages[0], {field_name: value})
    except Exception as e:
        print(f'Text fill failed: {field_name}: {e}', file=sys.stderr)

# Fill checkboxes
acro = writer._root_object.get('/AcroForm', {})
fields_list = acro.get('/Fields', [])
for field_ref in fields_list:
    field_obj = field_ref.get_object()
    name = str(field_obj.get('/T', ''))
    if name in checkbox_fields:
        # Try to check the checkbox
        field_obj[NameObject('/V')] = NameObject('/Yes')
        field_obj[NameObject('/AS')] = NameObject('/Yes')
        kids = field_obj.get('/Kids', [])
        for kid_ref in kids:
            kid = kid_ref.get_object()
            kid[NameObject('/V')] = NameObject('/Yes')
            kid[NameObject('/AS')] = NameObject('/Yes')

with open(dst, 'wb') as f:
    writer.write(f)

print(f'Output: {dst}')
`

const payload = JSON.stringify({ text: textFields, checkboxes: checkboxFields })
const result = execSync(`py -c "${fillScript.replace(/"/g, '\\"')}" "${payload.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
console.log('\n' + result)
