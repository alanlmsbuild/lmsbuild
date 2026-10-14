-- The local authorities (districts and unitary authorities) that have live
-- postcodes in the latest postcode directory, with their names, country,
-- region and county.
with las as (
  select local_authority_code,
         mode(country_code) as country_code,
         mode(region_code) as region_code,
         mode(county_code) as county_code,
         count(*) as live_postcodes
  from {{ ref('postcode') }}
  where is_live and local_authority_code is not null
  group by 1
),
names as (select area_type, code, name, name_welsh from {{ ref('area_lookup') }})
select
  l.local_authority_code::varchar as local_authority_code,
  la.name::varchar as name,
  la.name_welsh::varchar as name_welsh,
  l.country_code::varchar as country_code,
  c.name::varchar as country_name,
  l.region_code::varchar as region_code,
  r.name::varchar as region_name,
  l.county_code::varchar as county_code,
  cty.name::varchar as county_name,
  l.live_postcodes::number as live_postcodes
from las l
left join names la on la.area_type = 'local_authority' and la.code = l.local_authority_code
left join names c on c.area_type = 'country' and c.code = l.country_code
left join names r on r.area_type = 'region' and r.code = l.region_code
left join names cty on cty.area_type = 'county' and cty.code = l.county_code
