-- Every 2021 LSOA (data zone in Scotland, super data zone in Northern
-- Ireland) in the postcode directory's lookups, with its local authority
-- and MSOA (from its postcodes), its latest population estimate (Nomis,
-- England), its 2025 deprivation (English Indices of Deprivation) and its
-- ONS population-weighted centroid (England and Wales; travel times,
-- decision 19).
with lsoas as (
  select code, name from {{ ref('area_lookup') }} where area_type = 'lsoa21'
),
-- Its local authority, MSOA and country: the most common among its live
-- postcodes, or among all its postcodes if none is live.
from_postcodes as (
  select lsoa21_code,
         coalesce(mode(case when is_live then local_authority_code end), mode(local_authority_code)) as local_authority_code,
         coalesce(mode(case when is_live then msoa21_code end), mode(msoa21_code)) as msoa21_code,
         coalesce(mode(case when is_live then country_code end), mode(country_code)) as country_code,
         count_if(is_live) as live_postcodes
  from {{ ref('postcode') }}
  where lsoa21_code is not null
  group by 1
),
population as (
  select GEOGRAPHY_CODE as lsoa21_code,
         any_value(DATE_NAME) as population_year,
         max(case when C_AGE_NAME = 'All Ages' then to_number(OBS_VALUE) end) as population,
         max(case when C_AGE_NAME = 'Aged 0 to 15' then to_number(OBS_VALUE) end) as aged_0_15,
         max(case when C_AGE_NAME = 'Aged 16 to 17' then to_number(OBS_VALUE) end) as aged_16_17,
         max(case when C_AGE_NAME = 'Aged 18 to 24' then to_number(OBS_VALUE) end) as aged_18_24,
         max(case when C_AGE_NAME = 'Aged 16 to 64' then to_number(OBS_VALUE) end) as aged_16_64,
         max(case when C_AGE_NAME = 'Aged 65+' then to_number(OBS_VALUE) end) as aged_65_plus
  from {{ source('shared_raw', 'nomis_population_lsoa') }}
  where SOURCEFILEID = {{ latest_file('nomis-nm-2014-1', 'NOMIS_POPULATION_LSOA') }}
    and GENDER_NAME = 'Total' and MEASURES_NAME = 'Value'
    and DATE_NAME = (select max(DATE_NAME) from {{ source('shared_raw', 'nomis_population_lsoa') }}
                     where SOURCEFILEID = {{ latest_file('nomis-nm-2014-1', 'NOMIS_POPULATION_LSOA') }})
  group by 1
),
deprivation as (
  select "LSOA code (2021)" as lsoa21_code,
         to_number("Index of Multiple Deprivation (IMD) Score", 10, 3) as imd_score,
         to_number("Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)") as imd_rank,
         to_number("Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)") as imd_decile,
         to_number("Income Decile (where 1 is most deprived 10% of LSOAs)") as income_decile,
         to_number("Employment Decile (where 1 is most deprived 10% of LSOAs)") as employment_decile,
         to_number("Education, Skills and Training Decile (where 1 is most deprived 10% of LSOAs)") as education_decile,
         to_number("Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)") as health_decile,
         to_number("Crime Decile (where 1 is most deprived 10% of LSOAs)") as crime_decile,
         to_number("Barriers to Housing and Services Decile (where 1 is most deprived 10% of LSOAs)") as housing_decile,
         to_number("Living Environment Decile (where 1 is most deprived 10% of LSOAs)") as living_environment_decile,
         to_number("Income Deprivation Affecting Children Index (IDACI) Decile (where 1 is most deprived 10% of LSOAs)") as idaci_decile
  from {{ source('shared_raw', 'iod2025_lsoa') }}
  where SOURCEFILEID = {{ latest_file('iod-2025', 'IOD2025_LSOA') }}
),
centroid as (
  select "LSOA21CD" as lsoa21_code, to_double("x") as easting, to_double("y") as northing
  from {{ source('shared_raw', 'ons_lsoa_pwc') }}
  where SOURCEFILEID = {{ latest_file('ons-lsoa-pwc', 'ONS_LSOA_PWC') }}
)
select
  l.code::varchar as lsoa21_code,
  l.name::varchar as name,
  p.country_code::varchar as country_code,
  p.local_authority_code::varchar as local_authority_code,
  la.name::varchar as local_authority_name,
  p.msoa21_code::varchar as msoa21_code,
  m.name::varchar as msoa21_name,
  coalesce(p.live_postcodes, 0)::number(38,0) as live_postcodes,
  pop.population_year::varchar as population_year,
  pop.population::number(38,0) as population,
  pop.aged_0_15::number(38,0) as aged_0_15,
  pop.aged_16_17::number(38,0) as aged_16_17,
  pop.aged_18_24::number(38,0) as aged_18_24,
  pop.aged_16_64::number(38,0) as aged_16_64,
  pop.aged_65_plus::number(38,0) as aged_65_plus,
  d.imd_score::number(10,3) as imd_score,
  d.imd_rank::number(38,0) as imd_rank,
  d.imd_decile::number(38,0) as imd_decile,
  d.income_decile::number(38,0) as income_decile,
  d.employment_decile::number(38,0) as employment_decile,
  d.education_decile::number(38,0) as education_decile,
  d.health_decile::number(38,0) as health_decile,
  d.crime_decile::number(38,0) as crime_decile,
  d.housing_decile::number(38,0) as housing_decile,
  d.living_environment_decile::number(38,0) as living_environment_decile,
  d.idaci_decile::number(38,0) as idaci_decile,
  round(c.easting, 1)::number(10,1) as centroid_easting,
  round(c.northing, 1)::number(10,1) as centroid_northing,
  round(st_y(st_transform(st_setsrid(st_makegeompoint(c.easting, c.northing), 27700), 4326)), 6)::number(9,6) as centroid_latitude,
  round(st_x(st_transform(st_setsrid(st_makegeompoint(c.easting, c.northing), 27700), 4326)), 6)::number(9,6) as centroid_longitude
from lsoas l
left join from_postcodes p on p.lsoa21_code = l.code
left join {{ ref('local_authority') }} la on la.local_authority_code = p.local_authority_code
left join {{ ref('area_lookup') }} m on m.area_type = 'msoa21' and m.code = p.msoa21_code
left join population pop on pop.lsoa21_code = l.code
left join deprivation d on d.lsoa21_code = l.code
left join centroid c on c.lsoa21_code = l.code
