// Rename KSVDL.pdf fields from XFA-style subform names to flat clean names.
// Strategy: keep PDF AcroForm tree intact (don't move parents), but set the
// partial T name on each leaf so the full qualified name becomes shorter.
// pdf-lib joins parent.partial → with our names the full path stays prefixed
// by `form1[0].#subform[0].` — but we ALSO clear that prefix by re-parenting
// each leaf onto the root AcroForm.Fields array.

import { PDFDocument, PDFName, PDFString, PDFArray, PDFRef } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const RENAMES = {
  // BILL TO row
  'form1[0].#subform[0].Clinic[0]': 'bill_to_clinic',
  'form1[0].#subform[0].Owner[0]': 'bill_to_owner',
  'form1[0].#subform[0].ThirdParty[0]': 'bill_to_third_party',
  'form1[0].#subform[0].Yes[0]': 'third_party_results_yes',
  'form1[0].#subform[0].No[0]': 'third_party_results_no',
  'form1[0].#subform[0].ThirdPartyContact[0]': 'third_party_contact_2',
  'form1[0].#subform[0].ThirdPartyContact[1]': 'third_party_contact_1',

  // OWNER section
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerName[0]': 'owner_name',
  'form1[0].#subform[0].OwnerConactInfo[0].Business[0]': 'owner_business',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerAddress[0]': 'owner_address',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerCity[0]': 'owner_city',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerState[0]': 'owner_state',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerZIP[0]': 'owner_zip',
  'form1[0].#subform[0].OwnerConactInfo[0].VetCity[0]': 'owner_country',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerPhone[0]': 'owner_phone',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerCell[0]': 'owner_cell',
  'form1[0].#subform[0].OwnerConactInfo[0].OwnerFaxEmail[0]': 'owner_fax_email',
  'form1[0].#subform[0].OwnerResultsPref[0]': 'owner_results_pref',

  // VET section
  'form1[0].#subform[0].Account[0]': 'vet_account',
  'form1[0].#subform[0].Veterinarian[0]': 'vet_name',
  'form1[0].#subform[0].VetClinicCompany[0]': 'vet_clinic',
  'form1[0].#subform[0].VetAddress[0]': 'vet_address',
  'form1[0].#subform[0].VetCity[0]': 'vet_city',
  'form1[0].#subform[0].VetState[0]': 'vet_state',
  'form1[0].#subform[0].VetZip[0]': 'vet_zip',
  'form1[0].#subform[0].VetCity[1]': 'vet_country',
  'form1[0].#subform[0].VetPhone[0]': 'vet_phone',
  'form1[0].#subform[0].VetFax[0]': 'vet_fax',
  'form1[0].#subform[0].VetEmail[0]': 'vet_email',

  // Send Results Via row (Owner[1]/Clinic[1]/ThirdParty[1] at y=484 — labels: E-Mail/Fax/Also send to Owner)
  'form1[0].#subform[0].Owner[1]': 'send_via_email',
  'form1[0].#subform[0].Clinic[1]': 'send_via_fax',
  'form1[0].#subform[0].ThirdParty[1]': 'send_to_owner_also',

  // ANIMAL section (left side, below VET)
  'form1[0].#subform[0].Veterinarian[1]': 'animal_species',
  'form1[0].#subform[0].Veterinarian[2]': 'animal_name',
  'form1[0].#subform[0].Veterinarian[3]': 'animal_microchip',
  'form1[0].#subform[0].DateField1[0]': 'animal_date_blood_drawn',
  'form1[0].#subform[0].Veterinarian[4]': 'animal_country_sent_to',

  // TEST checkboxes (right column, top-down)
  'form1[0].#subform[0].CheckBox1[0]': 'test_brucellosis',
  'form1[0].#subform[0].CheckBox1[1]': 'test_ehrlichia',
  'form1[0].#subform[0].CheckBox1[2]': 'test_leptospira',
  'form1[0].#subform[0].CheckBox1[3]': 'test_leishmania',
  'form1[0].#subform[0].CheckBox1[4]': 'test_heartworm',
  'form1[0].#subform[0].CheckBox1[5]': 'test_knotts',
  'form1[0].#subform[0].CheckBox1[6]': 'test_difil',

  // Notes / large text area
  'form1[0].#subform[0].TextField1[0]': 'notes',

  // Lab Use Only (Receiving form) — leave but rename for cleanliness
  'form1[0].#subform[0].ReceivingForm[0].OpenedBy[0]': 'lab_opened_by',
  'form1[0].#subform[0].ReceivingForm[0].Courier[0]': 'lab_via_courier',
  'form1[0].#subform[0].ReceivingForm[0].FedEx[0]': 'lab_via_fedex',
  'form1[0].#subform[0].ReceivingForm[0].HandDelivered[0]': 'lab_via_hand',
  'form1[0].#subform[0].ReceivingForm[0].Mail[0]': 'lab_via_mail',
  'form1[0].#subform[0].ReceivingForm[0].UPS[0]': 'lab_via_ups',
  'form1[0].#subform[0].ReceivingForm[0].CoolantPack[0]': 'lab_pkg_coolant',
  'form1[0].#subform[0].ReceivingForm[0].DryIce[0]': 'lab_pkg_dryice',
  'form1[0].#subform[0].ReceivingForm[0].Frozen[0]': 'lab_pkg_frozen',
  'form1[0].#subform[0].ReceivingForm[0].None[0]': 'lab_pkg_none',
  'form1[0].#subform[0].ReceivingForm[0].Good[0]': 'lab_state_good',
  'form1[0].#subform[0].ReceivingForm[0].Broken[0]': 'lab_state_broken',
  'form1[0].#subform[0].ReceivingForm[0].Leaked[0]': 'lab_state_leaked',
  'form1[0].#subform[0].ReceivingForm[0].Other[0]': 'lab_state_other',
  'form1[0].#subform[0].ReceivingForm[0].Frozen[1]': 'lab_state_frozen',
}

const SRC = process.argv[2] ?? 'apps/admin/data/pdf-templates/KSVDL.pdf'
const DST = process.argv[3] ?? SRC

const pdf = await PDFDocument.load(await readFile(SRC))
const form = pdf.getForm()

// Build map old full-name → field
const byOldName = new Map()
for (const f of form.getFields()) byOldName.set(f.getName(), f)

// Collect leaf field refs to move to root.
const acroForm = pdf.catalog.lookup(PDFName.of('AcroForm'))
const rootFields = acroForm.lookup(PDFName.of('Fields'))
if (!(rootFields instanceof PDFArray)) throw new Error('AcroForm.Fields not an array')

// New flat fields array.
const flat = pdf.context.obj([])

let renamedCount = 0
let unmappedCount = 0

for (const f of form.getFields()) {
  const oldName = f.getName()
  const newPartial = RENAMES[oldName]
  if (!newPartial) {
    unmappedCount++
    console.log(`  unmapped (kept as-is): ${oldName}`)
    continue
  }
  // Detach from parent: clear /Parent so the field becomes root-level.
  const dict = f.acroField.dict
  dict.delete(PDFName.of('Parent'))
  // Set new partial name.
  dict.set(PDFName.of('T'), PDFString.of(newPartial))
  // Clear MaxLen for phone-like fields — Korean +82 국제번호(14자)는 10자 제한에 걸려 잘림.
  if (/^(owner_phone|owner_cell|vet_phone|vet_fax)$/.test(newPartial)) {
    dict.delete(PDFName.of('MaxLen'))
  }
  // Add to flat root array.
  flat.push(f.acroField.ref)
  renamedCount++
}

// Replace AcroForm.Fields with flat list.
acroForm.set(PDFName.of('Fields'), flat)

const out = await pdf.save()
await writeFile(DST, out)
console.log(`renamed ${renamedCount}, unmapped ${unmappedCount}, wrote ${DST}`)
