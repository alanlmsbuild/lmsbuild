-- travel_time_lsoa has every South Yorkshire LSOA as an origin and as a
-- destination, and one row for every pair (none missing, none extra).
with area as (select lsoa21_code from {{ ref('lsoa') }} where local_authority_code in {{ travel_area_las() }}),
t as (select * from {{ ref('travel_time_lsoa') }}),
checks as (
  select 'origins' as what, (select count(distinct origin_lsoa21) from t) as found, (select count(*) from area) as expected
  union all select 'destinations', (select count(distinct destination_lsoa21) from t), (select count(*) from area)
  union all select 'pairs', (select count(*) from t), (select count(*) * count(*) from area)
  union all select 'outside the area', (select count(*) from t where origin_lsoa21 not in (select lsoa21_code from area) or destination_lsoa21 not in (select lsoa21_code from area)), 0
)
select * from checks where found <> expected
