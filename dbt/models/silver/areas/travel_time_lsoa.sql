-- Journey times between LSOA population-weighted centroids (decision 19),
-- from the latest run of scripts/travel/compute.py: one row per origin and
-- destination. Transit is walk, bus, coach, tram (BODS) and, from phase B,
-- train (Network Rail), on the day and in the window the run states;
-- minutes at the 25th, 50th and 75th percentile of the departures in that
-- window; bus only (no train), train only and walking only beside it, and
-- the modes each journey used (estimated, compute.py). Empty over the cap
-- (max_minutes). Runs from phase A have no bus, train or modes columns.
-- Derived from OpenStreetMap: ODbL.
with run as (
  select * from {{ source('shared_raw', 'travel_time_lsoa_run') }}
  where SOURCEFILEID = {{ latest_file('rarebit-travel-time', 'TRAVEL_TIME_LSOA_RUN') }}
),
osm as (
  select SOURCEFILEID, try_to_date(left(HEADER:osmosis_replication_timestamp::varchar, 10)) as data_date
  from {{ source('shared_raw', 'osm_extract') }}
)
select
  (r."origin_lsoa21" || '|' || r."destination_lsoa21")::varchar as travel_key,
  r."origin_lsoa21"::varchar as origin_lsoa21,
  r."destination_lsoa21"::varchar as destination_lsoa21,
  {{ num('r."transit_minutes_p25"') }}::number(38,0) as transit_minutes_p25,
  {{ num('r."transit_minutes_p50"') }}::number(38,0) as transit_minutes_p50,
  {{ num('r."transit_minutes_p75"') }}::number(38,0) as transit_minutes_p75,
  {{ num('r."walk_minutes"') }}::number(38,0) as walk_minutes,
  {{ num('r."bus_minutes_p25"') }}::number(38,0) as bus_minutes_p25,
  {{ num('r."bus_minutes_p50"') }}::number(38,0) as bus_minutes_p50,
  {{ num('r."bus_minutes_p75"') }}::number(38,0) as bus_minutes_p75,
  {{ num('r."rail_minutes_p25"') }}::number(38,0) as rail_minutes_p25,
  {{ num('r."rail_minutes_p50"') }}::number(38,0) as rail_minutes_p50,
  {{ num('r."rail_minutes_p75"') }}::number(38,0) as rail_minutes_p75,
  nullif(r."modes_used", '')::varchar as modes_used,
  try_to_date(r."departure_date") as departure_date,
  r."window_start"::varchar as window_start,
  {{ num('r."window_minutes"') }}::number(38,0) as window_minutes,
  {{ num('r."max_minutes"') }}::number(38,0) as max_minutes,
  r."modes"::varchar as modes,
  r."gtfs_feed_version"::varchar as gtfs_feed_version,
  r."gtfs_source_file_id"::varchar as gtfs_source_file_id,
  nullif(r."rail_feed_version", '')::varchar as rail_feed_version,
  nullif(r."rail_source_file_id", '')::varchar as rail_source_file_id,
  r."osm_source_file_id"::varchar as osm_source_file_id,
  o.data_date as osm_data_date,
  r."centroid_source_file_id"::varchar as centroid_source_file_id,
  r."r5py_version"::varchar as r5py_version,
  r."run_id"::varchar as run_id,
  try_to_timestamp_tz(r."computed_at")::timestamp_ltz as computed_at,
  r.SOURCEFILEID::varchar as source_file_id
from run r
left join osm o on o.SOURCEFILEID = r."osm_source_file_id"
