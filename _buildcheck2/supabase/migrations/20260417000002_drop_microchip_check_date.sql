-- =============================================================================
-- Drop microchip_check_date
--   Field was duplicated with australia_extra.id_date (identical concept).
--   Remove field_definitions row and strip existing values from cases.data.
-- =============================================================================

delete from field_definitions where key = 'microchip_check_date';

update cases
set data = data - 'microchip_check_date'
where data ? 'microchip_check_date';
