-- Every postcode in the latest ONS Postcode Directory, live and terminated,
-- with its areas (ONS "no area" codes as null), its position, and the GB
-- electricity region it lies in (NESO's boundaries, in the same grid), or
-- the nearest one.
with onspd as (
  select * from {{ source('shared_raw', 'onspd') }}
  where SOURCEFILEID = {{ latest_file('onspd', 'ONSPD') }}
),
regions as (
  select PROPERTIES:Name::string as GSP_GROUP, PROPERTIES:Area::string as AREA, PROPERTIES:DNO_Full::string as DISTRIBUTOR,
         TO_GEOMETRY(GEOMETRY, 27700) as BOUNDARY
  from {{ source('shared_raw', 'neso_dno_area') }}
  where SOURCEFILEID = {{ latest_file('neso-dno-areas', 'NESO_DNO_AREA') }}
),
-- Great Britain only: Northern Ireland's grid references are on the Irish
-- grid, and it has no GB electricity region.
points as (
  select "pcds" as PCDS, TO_GEOMETRY('POINT(' || "east1m" || ' ' || "north1m" || ')', 27700) as POINT
  from onspd
  where "gridind" <> '9' and "ctry26cd" in ('E92000001', 'W92000004', 'S92000003')
),
inside as (
  select p.PCDS, r.GSP_GROUP, r.AREA, r.DISTRIBUTOR, false as BY_DISTANCE, 0 as DISTANCE_M
  from points p join regions r on ST_CONTAINS(r.BOUNDARY, p.POINT)
),
-- NESO's boundaries are approximate: a point on the coast can fall just
-- outside them all. It gets the nearest region, flagged.
nearest as (
  select p.PCDS, r.GSP_GROUP, r.AREA, r.DISTRIBUTOR, true as BY_DISTANCE, round(ST_DISTANCE(r.BOUNDARY, p.POINT)) as DISTANCE_M
  from points p cross join regions r
  where p.PCDS not in (select PCDS from inside)
  qualify row_number() over (partition by p.PCDS order by ST_DISTANCE(r.BOUNDARY, p.POINT), r.GSP_GROUP) = 1
),
electricity as (
  select * from inside
  union all
  select * from nearest
)
select
  o."pcds"::varchar as postcode,
  o."pcd7"::varchar as postcode_7,
  replace(o."pcds", ' ', '')::varchar as postcode_compact,
  to_date(o."dointr" || '01', 'YYYYMMDD') as introduced,
  case when o."doterm" <> '' then to_date(o."doterm" || '01', 'YYYYMMDD') end as terminated,
  (o."doterm" = '') as is_live,
  (o."usrtypind" = '1') as is_large_user,
  case when o."gridind" <> '9' then to_number(o."east1m") end as easting,
  case when o."gridind" <> '9' then to_number(o."north1m") end as northing,
  to_number(o."gridind") as grid_quality,
  case when o."gridind" <> '9' then to_double(o."lat") end as latitude,
  case when o."gridind" <> '9' then to_double(o."long") end as longitude,
  -- L93000001 and M83000003: the ONS's codes for the Channel Islands and
  -- the Isle of Man, not UK countries.
  case when o."ctry26cd" not in ('L93000001', 'M83000003') then {{ gss('o."ctry26cd"') }} end::varchar as country_code,
  {{ gss('o."rgn26cd"') }}::varchar as region_code,
  {{ gss('o."lad26cd"') }}::varchar as local_authority_code,
  {{ gss('o."cty26cd"') }}::varchar as county_code,
  {{ gss('o."ced25cd"') }}::varchar as electoral_division_code,
  {{ gss('o."wd26cd"') }}::varchar as ward_code,
  {{ gss('o."parncp26cd"') }}::varchar as parish_code,
  {{ gss('o."pcon24cd"') }}::varchar as constituency_code,
  {{ gss('o."oa21cd"') }}::varchar as oa21_code,
  {{ gss('o."lsoa21cd"') }}::varchar as lsoa21_code,
  {{ gss('o."msoa21cd"') }}::varchar as msoa21_code,
  {{ gss('o."bua24cd"') }}::varchar as built_up_area_code,
  {{ gss('o."npark16cd"') }}::varchar as national_park_code,
  {{ gss('o."pfa23cd"') }}::varchar as police_force_code,
  {{ gss('o."ttwa15cd"') }}::varchar as travel_to_work_area_code,
  {{ gss('o."icb26cd"') }}::varchar as icb_code,
  nullif(o."ruc21ind", '')::varchar as rural_urban_2021,
  nullif(o."oac21ind", '')::varchar as output_area_class_2021,
  nullif(to_number(nullif(o."imd25ind", '')), 0) as imd_rank_2025,
  ltrim(e.GSP_GROUP, '_')::varchar as electricity_region,
  e.BY_DISTANCE::boolean as electricity_region_by_distance,
  e.DISTANCE_M::number(38,0) as electricity_region_distance_m,
  e.AREA::varchar as electricity_region_name,
  e.DISTRIBUTOR::varchar as electricity_distributor,
  o.SOURCEFILEID::varchar as source_file_id
from onspd o
left join electricity e on e.PCDS = o."pcds"
