-- The bus and tram timetables the travel times use (decision 19): the
-- latest Bus Open Data Service GTFS feed for Yorkshire, one row: its version,
-- the dates it covers, the date BODS made it (its feed_version starts with
-- it) and how many routes it has of each kind (GTFS route types: 3 bus, 200
-- coach, 0 tram).
with info as (
  select * from {{ source('shared_raw', 'bods_gtfs_feed_info') }}
  where SOURCEFILEID = {{ latest_file('bods-gtfs', 'BODS_GTFS_FEED_INFO') }}
),
routes as (
  select "route_type" as route_type, count(*) as n from {{ source('shared_raw', 'bods_gtfs_routes') }}
  where SOURCEFILEID = {{ latest_file('bods-gtfs', 'BODS_GTFS_ROUTES') }}
  group by 1
)
select
  i."feed_version"::varchar as feed_version,
  i."feed_publisher_name"::varchar as publisher,
  try_to_date(i."feed_start_date", 'YYYYMMDD') as feed_start_date,
  try_to_date(i."feed_end_date", 'YYYYMMDD') as feed_end_date,
  try_to_date(left(i."feed_version", 8), 'YYYYMMDD') as published_on,
  coalesce((select n from routes where route_type = '3'), 0)::number(38,0) as bus_routes,
  coalesce((select n from routes where route_type = '200'), 0)::number(38,0) as coach_routes,
  coalesce((select n from routes where route_type = '0'), 0)::number(38,0) as tram_routes,
  (select count(*) from routes where route_type not in ('3', '200', '0'))::number(38,0) as other_route_types,
  i.SOURCEFILEID::varchar as source_file_id
from info i
