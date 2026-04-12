-- Rename field_definitions labels (label only, keys unchanged)
update field_definitions set label = '전화번호' where key = 'phone' and org_id is null;
update field_definitions set label = '한국주소' where key = 'address_kr' and org_id is null;
update field_definitions set label = '영문주소' where key = 'address_en' and org_id is null;
update field_definitions set label = '해외주소' where key = 'address_overseas' and org_id is null;
update field_definitions set label = '몸무게' where key = 'weight' and org_id is null;
update field_definitions set label = '마이크로칩 삽입일' where key = 'microchip_implant_date' and org_id is null;
update field_definitions set label = '광견병항체검사일' where key = 'rabies_titer_test_date' and org_id is null;
update field_definitions set label = '광견병항체검사결과' where key = 'rabies_titer' and org_id is null;
update field_definitions set label = '심장사상충 검사일' where key = 'heartworm_test' and org_id is null;
update field_definitions set label = '전염병검사일' where key = 'infectious_disease_test' and org_id is null;
