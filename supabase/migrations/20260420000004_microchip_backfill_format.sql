-- =============================================================================
-- Normalize existing microchip values to "NNN NNN NNN NNN NNN" format
--   Context: the apply form (and earlier intake paths) could save raw 15-digit
--   strings without the canonical spacing used by the web app. This left the
--   case list with mixed formats (e.g. "933000320606599" vs "410 097 800 198 858").
--   Going forward, all write paths normalize via formatMicrochip(); this
--   migration reconciles historical rows.
-- =============================================================================

update cases
set microchip = concat_ws(
  ' ',
  substr(regexp_replace(microchip, '\D', '', 'g'), 1, 3),
  substr(regexp_replace(microchip, '\D', '', 'g'), 4, 3),
  substr(regexp_replace(microchip, '\D', '', 'g'), 7, 3),
  substr(regexp_replace(microchip, '\D', '', 'g'), 10, 3),
  substr(regexp_replace(microchip, '\D', '', 'g'), 13, 3)
)
where microchip is not null
  and length(regexp_replace(microchip, '\D', '', 'g')) = 15
  and microchip !~ '^\d{3} \d{3} \d{3} \d{3} \d{3}$';
