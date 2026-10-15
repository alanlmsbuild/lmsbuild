-- police.uk street-level crimes counted by 2021 LSOA, month, kind and the
-- force that recorded them ("Falls within"):
-- crime (every crime type) or anti-social behaviour (police.uk lists both;
-- crime rates leave anti-social behaviour out, as ONS does). Locations are
-- approximate by design (police.uk moves each to a nearby map point), so
-- an LSOA count is close, not exact. Crimes with no LSOA (about 4%, mostly
-- British Transport Police) are left out. A force that sent no data for a
-- month has no rows for it.
select
  (c."LSOA code" || '|' || c."Month" || '|' || case when c."Crime type" = 'Anti-social behaviour' then 'anti-social behaviour' else 'crime' end || '|' || c."Falls within")::varchar as crime_key,
  c."LSOA code"::varchar as lsoa21_code,
  to_date(c."Month" || '-01') as month,
  case when c."Crime type" = 'Anti-social behaviour' then 'anti-social behaviour' else 'crime' end::varchar as kind,
  c."Falls within"::varchar as force,
  count(*)::number(38,0) as reports,
  max(c.SOURCEFILEID)::varchar as source_file_id
from {{ source('shared_raw', 'police_street_crime') }} c
where c.SOURCEFILEID = {{ latest_file('police-uk-street', 'POLICE_STREET_CRIME') }}
  and c."LSOA code" <> ''
group by 1, 2, 3, 4, 5
