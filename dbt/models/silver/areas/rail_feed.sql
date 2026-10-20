-- The rail timetable the travel times use (decision 19, phase B): the latest
-- rail GTFS built from the Network Rail SCHEDULE extract
-- (scripts/travel/cif_to_gtfs.py), one row: its version (the extract's
-- date and time), the date of the extract (the timetable is as at that
-- date), the one day it covers, and its trains, stations and operators.
with info as (
  select * from {{ source('shared_raw', 'nr_gtfs_feed_info') }}
  where SOURCEFILEID = {{ latest_file('network-rail-schedule', 'NR_GTFS_FEED_INFO') }}
)
select
  i."feed_version"::varchar as feed_version,
  try_to_date(left(i."feed_version", 8), 'YYYYMMDD') as timetable_as_at,
  try_to_date(i."feed_start_date", 'YYYYMMDD') as timetable_date,
  (select count(*) from {{ source('shared_raw', 'nr_gtfs_trips') }} where SOURCEFILEID = {{ latest_file('network-rail-schedule', 'NR_GTFS_TRIPS') }})::number(38,0) as trains,
  (select count(*) from {{ source('shared_raw', 'nr_gtfs_stops') }} where SOURCEFILEID = {{ latest_file('network-rail-schedule', 'NR_GTFS_STOPS') }})::number(38,0) as stations,
  (select count(*) from {{ source('shared_raw', 'nr_gtfs_agency') }} where SOURCEFILEID = {{ latest_file('network-rail-schedule', 'NR_GTFS_AGENCY') }})::number(38,0) as operators,
  i.SOURCEFILEID::varchar as source_file_id
from info i
