-- The day the travel times are for runs a normal service: its trips in the
-- whole BODS feed are within 2% of the median of the other Tuesdays,
-- Wednesdays and Thursdays in the week before and after (a half-term,
-- strike or bank holiday timetable would fail it).
with feed as (select {{ latest_file('bods-gtfs', 'BODS_GTFS_FEED_INFO') }} as id),
day_ as (select max(departure_date) as d from {{ ref('travel_time_lsoa') }}),
files as (
  -- The feed's other files: the same zip, loaded with feed_info.txt.
  select s.SOURCEFILEID, s.MEMBER from {{ source('shared_raw', 'source_file') }} s
  join {{ source('shared_raw', 'source_file') }} f on f.SOURCEFILEID = (select id from feed) and s.ORIGINALSHA256 = f.ORIGINALSHA256
  where s.SOURCE = 'bods-gtfs'
),
cal as (select c.* from {{ source('shared_raw', 'bods_gtfs_calendar') }} c join files f on f.SOURCEFILEID = c.SOURCEFILEID and f.MEMBER = 'calendar.txt'),
ex as (select x.* from {{ source('shared_raw', 'bods_gtfs_calendar_dates') }} x join files f on f.SOURCEFILEID = x.SOURCEFILEID and f.MEMBER = 'calendar_dates.txt'),
trips as (select t."service_id" as service_id, count(*) as n from {{ source('shared_raw', 'bods_gtfs_trips') }} t
          join files f on f.SOURCEFILEID = t.SOURCEFILEID and f.MEMBER = 'trips.txt' group by 1),
days as (
  select dateadd(day, o.value::int, (select d from day_)) as d, o.value::int = 0 as is_day
  from table(flatten(input => parse_json('[-7, -6, -5, 0, 1, 2, 7]'))) o
),
active as (
  select dy.d, dy.is_day, sum(t.n) as trips
  from days dy
  cross join trips t
  left join cal c on c."service_id" = t.service_id
  left join ex x on x."service_id" = t.service_id and x."date" = to_char(dy.d, 'YYYYMMDD')
  where x."exception_type" = '1'
     or (coalesce(x."exception_type", '') <> '2'
         and to_char(dy.d, 'YYYYMMDD') between c."start_date" and c."end_date"
         and decode(dayofweekiso(dy.d), 1, c."monday", 2, c."tuesday", 3, c."wednesday", 4, c."thursday", 5, c."friday", 6, c."saturday", 7, c."sunday") = '1')
  group by 1, 2
)
select (select trips from active where is_day) as day_trips, median(trips) as usual_trips
from active where not is_day
having abs(day_trips - usual_trips) > usual_trips * 0.02 or day_trips is null
