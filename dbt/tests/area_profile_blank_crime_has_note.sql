-- A missing crime or anti-social behaviour rate always says why
-- (POLICE_DATA_NOTE), so a blank never reads as no crime; and a note is
-- only there when something is missing or held back.
select local_authority_code, name, crime_rate_per_1000, asb_rate_per_1000, police_data_note
from {{ ref('area_profile') }}
where ((crime_rate_per_1000 is null or asb_rate_per_1000 is null) and police_data_note is null)
   or (crime_rate_per_1000 is not null and asb_rate_per_1000 is not null and police_data_note is not null)
