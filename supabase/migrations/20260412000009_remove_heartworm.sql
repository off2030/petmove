-- Remove heartworm field definition and clear data from cases
delete from field_definitions where key = 'heartworm_test' and org_id is null;
