-- Mid-year population estimates for England and Wales and their local
-- authorities (districts and unitaries), all ages, every year (Nomis
-- NM_31_1, fetched in two files: England, and Wales). Each area and year
-- comes from the newest file that has it (a later fetch holds only the
-- newest years, revised). Its authorities are as of April 2023: a code no
-- longer in use is matched to today's by name, and the code as published
-- is kept.
with p as (
  select r.* from {{ source('shared_raw', 'nomis_population_la') }} r
  join {{ source('shared_raw', 'source_file') }} f on f.SOURCEFILEID = r.SOURCEFILEID and f.SOURCE = 'nomis-nm-31-1'
  where r.SEX_NAME = 'Total' and r.AGE_NAME = 'All ages' and r.MEASURES_NAME = 'Value'
    and (r.GEOGRAPHY_TYPE like 'local authorities: district%' or r.GEOGRAPHY_TYPE = 'countries')
  qualify row_number() over (partition by r.GEOGRAPHY_CODE, r.DATE_NAME order by f.LOADEDAT desc, f.SOURCEFILEID) = 1
),
la as (select local_authority_code, name from {{ ref('local_authority') }})
select
  (coalesce(cur.local_authority_code, byname.local_authority_code, p.GEOGRAPHY_CODE) || '|' || p.DATE_NAME)::varchar as population_key,
  coalesce(cur.local_authority_code, byname.local_authority_code, p.GEOGRAPHY_CODE)::varchar as area_code,
  p.GEOGRAPHY_CODE::varchar as area_code_published,
  p.GEOGRAPHY_NAME::varchar as area_name,
  case when p.GEOGRAPHY_TYPE = 'countries' then 'country' else 'local_authority' end::varchar as geography,
  to_number(p.DATE_NAME)::number(38,0) as year,
  {{ num('p.OBS_VALUE') }}::number(38,0) as population,
  p.SOURCEFILEID::varchar as source_file_id
from p
left join la cur on cur.local_authority_code = p.GEOGRAPHY_CODE
left join la byname on cur.local_authority_code is null and p.GEOGRAPHY_TYPE <> 'countries' and byname.name = p.GEOGRAPHY_NAME
