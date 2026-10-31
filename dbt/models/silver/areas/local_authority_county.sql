-- The county each local authority district is in (ONS Local Authority District
-- to County and Unitary Authority lookup, April 2025): one row per district in
-- the UK. A unitary authority (metropolitan, London, Welsh, Scottish, Northern
-- Irish and the English unitaries) is its own county_or_unitary, and is not
-- two_tier. Used to point a district at the county council whose figures cover
-- it where a measure is published for counties and not for districts.
select
  trim(LAD25CD)::varchar as local_authority_code,
  trim(LAD25NM)::varchar as local_authority_name,
  trim(CTYUA25CD)::varchar as county_code,
  trim(CTYUA25NM)::varchar as county_name,
  (trim(LAD25CD) <> trim(CTYUA25CD))::boolean as two_tier
from {{ source('shared_raw', 'ons_lad_county') }}
where SOURCEFILEID in {{ lad_county_files() }}
