/** 합성 데이터로 공동 보호자 저장 계약·서류 병기·기존 1인 서식 보호를 검증한다. DB 미사용. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeCoOwner,
  readCoOwner,
  documentOwnerNames,
  flattenCaseForDestination,
  isGlobalCaseDataKey,
  type CaseRow,
} from "../packages/domain/src";
import { countPackedDocuments } from "../apps/admin/lib/pdf-multi-forms";
const extra = { name_ko: "이공동", first_name_en: "Bora", last_name_en: "Lee" };
const row = {
  customer_name: "김보호",
  customer_name_en: "Legacy Name",
  destination: "일본, 일본 (2차)",
  data: {
    customer_first_name_en: "Alice",
    customer_last_name_en: "Kim",
    co_owner: extra,
  },
} as unknown as CaseRow;
const before = structuredClone(row);
assert.deepEqual(normalizeCoOwner({ ...extra, unknown: "omit" }), extra);
assert.deepEqual(normalizeCoOwner({ name_ko: "  이공동  " }), {
  name_ko: "이공동",
  first_name_en: "",
  last_name_en: "",
});
assert.equal(
  normalizeCoOwner({ name_ko: "  ", first_name_en: "", last_name_en: "" }),
  null,
);
assert.equal(normalizeCoOwner(null), null);
assert.throws(() => normalizeCoOwner("wrong"));
assert.throws(() => normalizeCoOwner({ name_ko: 123 }));
assert.throws(() => normalizeCoOwner({ name_ko: "x".repeat(121) }));
assert.throws(() => normalizeCoOwner({ first_name_en: "홍길동" }));
assert.equal(documentOwnerNames(row, row.data), "Alice Kim / Bora Lee");
assert.equal(documentOwnerNames(row, row.data, "ko"), "김보호 / 이공동");
assert.equal(
  documentOwnerNames(row, { ...row.data, co_owner: null }),
  "Alice Kim",
);
assert.equal(
  documentOwnerNames(row, { co_owner: extra }),
  "Legacy Name / Bora Lee",
);
assert.equal(
  documentOwnerNames({ ...row, customer_name_en: null }, { co_owner: extra }),
  "김보호 / Bora Lee",
);
assert.equal(
  documentOwnerNames(row, { ...row.data, co_owner: { name_ko: "이공동" } }),
  "Alice Kim / 이공동",
);
assert.equal(
  documentOwnerNames(row, {
    ...row.data,
    co_owner: { first_name_en: "Alice", last_name_en: "Kim" },
  }),
  "Alice Kim",
);
assert.equal(
  documentOwnerNames(row, {
    ...row.data,
    co_owner: { first_name_en: "alice", last_name_en: "kim" },
  }),
  "Alice Kim",
);
assert.deepEqual(
  row,
  before,
  "서류를 읽을 때 원본 보호자 정보를 변경하지 않는다",
);
assert.ok(isGlobalCaseDataKey("co_owner"));
assert.deepEqual(
  readCoOwner(flattenCaseForDestination(row, "일본 (2차)").data),
  extra,
);
const maps = JSON.parse(
  readFileSync(
    new URL("../apps/admin/data/pdf-field-mappings.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(maps.Form25.fields.owner_name.source, "document_owner_names_en");
assert.equal(maps.Form25AuNz.fields.owner_name.source, "document_owner_names_en");
for (const key of ['NZ', 'NZ_2']) {
  assert.equal(maps[key].fields.Text47.source, 'document_owner_names_en');
  assert.equal(maps[key].fields.Text51.source, 'document_owner_names_en');
}
assert.equal(maps.NZ26.fields.nz26_consignor_name.source, 'document_owner_names_en');
assert.equal(maps.NZ26.fields.nz26_consignee_name.source, 'document_owner_names_en');
for (const form of ['NZ', 'NZ_2', 'NZ26']) {
  const cases = [
    { rabiesDoseCount: 1, ownerGroup: 'Alice Kim / Bora Lee' },
    { rabiesDoseCount: 1, ownerGroup: 'Alice Kim / Other Owner' },
    { rabiesDoseCount: 1, ownerGroup: 'Alice Kim / Bora Lee' },
  ];
  assert.equal(countPackedDocuments(form, cases), 2, '공동 보호자가 다른 동물은 별도 문서');
  assert.equal(countPackedDocuments(form, [cases[0], cases[2]]), 1, '같은 보호자 둘은 합본 유지');
  assert.equal(countPackedDocuments(form, [cases[1]]), 1, '선택한 동물만 장수 계산');
  assert.equal(countPackedDocuments(form, Array(6).fill(cases[0])), 2, '동물 수 한도 유지');
}
assert.equal(countPackedDocuments('NZ', []), 0);
assert.equal(
  maps.FormAC.fields.consignor_name.source,
  "document_owner_names_en",
);
assert.equal(
  maps.FormAC.fields.consignee_name.source,
  "document_owner_names_en",
);
assert.equal(maps.TW.fields.text_4peiu.source, 'document_owner_names_en');
assert.equal(maps.VHC.fields.owner_name.source, 'document_owner_names_en');
assert.equal(
  maps.AQS_279.fields.FIRST.source,
  "customer_name_en",
  "1인용 성·이름 양식에 합본 이름을 넣지 않는다",
);
assert.equal(
  maps["ARC-OVI"].fields.text_7aada.source,
  "customer_last_name_en",
  "결제자의 성은 기존 보호자 유지",
);
assert.equal(
  maps.AnnexIII.fields.decl_undersigned_name.source,
  "customer_name_en",
  "선언인 서명은 1인 유지",
);
console.log(
  "✓ 공동 보호자: 정규화·삭제·기존 이름 보존·증명서 병기·1인 양식 구분·여행 공통 저장 검증 통과",
);
