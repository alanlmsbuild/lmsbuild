-- Where a postcode is, for Warren and Burrow (learner and employer
-- addresses): one row per postcode in the ONS Postcode Directory, live or
-- terminated (an old address may use a terminated one), with its areas by
-- name and its LSOA's deprivation decile (England). No personal data: a
-- postcode is a place.
select
  p.postcode_compact::varchar as postcode_compact,
  p.postcode::varchar as postcode,
  p.is_live::boolean as is_live,
  p.terminated::date as terminated,
  p.country_code::varchar as country_code,
  c.name::varchar as country_name,
  p.region_code::varchar as region_code,
  r.name::varchar as region_name,
  p.local_authority_code::varchar as local_authority_code,
  la.name::varchar as local_authority_name,
  p.ward_code::varchar as ward_code,
  w.name::varchar as ward_name,
  p.constituency_code::varchar as constituency_code,
  pc.name::varchar as constituency_name,
  p.lsoa21_code::varchar as lsoa21_code,
  l.name::varchar as lsoa21_name,
  p.msoa21_code::varchar as msoa21_code,
  l.imd_decile::number(38,0) as imd_decile,
  p.rural_urban_2021::varchar as rural_urban_2021,
  p.latitude::float as latitude,
  p.longitude::float as longitude
from {{ ref('postcode') }} p
left join {{ ref('area_lookup') }} c on c.area_type = 'country' and c.code = p.country_code
left join {{ ref('area_lookup') }} r on r.area_type = 'region' and r.code = p.region_code
left join {{ ref('local_authority') }} la on la.local_authority_code = p.local_authority_code
left join {{ ref('area_lookup') }} w on w.area_type = 'ward' and w.code = p.ward_code
left join {{ ref('area_lookup') }} pc on pc.area_type = 'constituency' and pc.code = p.constituency_code
left join {{ ref('lsoa') }} l on l.lsoa21_code = p.lsoa21_code
