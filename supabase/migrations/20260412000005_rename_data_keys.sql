-- =============================================================================
-- Rename jsonb keys inside cases.data to match the renamed field_definitions
-- keys. The data was originally imported with the old names; the user then
-- renamed the corresponding field_definitions.key values, so the UI could no
-- longer find the old data.
--
-- Key migrations:
--   microchip_check_date  -> microchip_implant_date
--   comprehensive         -> general_vaccine
--   rabies_titer_date     -> rabies_titer_test_date
--   rabies_titer_value    -> rabies_titer
--   heartworm             -> heartworm_test
--   infectious_disease    -> infectious_disease_test
--
-- Approach: for every row whose data contains at least one of the old keys,
-- drop the old keys and insert the new ones. `jsonb_strip_nulls` removes any
-- new key whose source value was absent (jsonb->'missing' returns null).
-- =============================================================================

update cases
set data = jsonb_strip_nulls(
  (data
    - 'microchip_check_date'
    - 'comprehensive'
    - 'rabies_titer_date'
    - 'rabies_titer_value'
    - 'heartworm'
    - 'infectious_disease')
  || jsonb_build_object(
    'microchip_implant_date',  data -> 'microchip_check_date',
    'general_vaccine',         data -> 'comprehensive',
    'rabies_titer_test_date',  data -> 'rabies_titer_date',
    'rabies_titer',            data -> 'rabies_titer_value',
    'heartworm_test',          data -> 'heartworm',
    'infectious_disease_test', data -> 'infectious_disease'
  )
)
where data ?| array[
  'microchip_check_date',
  'comprehensive',
  'rabies_titer_date',
  'rabies_titer_value',
  'heartworm',
  'infectious_disease'
];
