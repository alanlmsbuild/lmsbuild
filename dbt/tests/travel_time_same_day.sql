-- Bus and rail use the same day (decision 19, phase B): the run's departure
-- date is the one day the rail feed covers, and inside the BODS feed's dates.
select t.departure_date, r.timetable_date, f.feed_start_date, f.feed_end_date
from (select distinct departure_date, rail_feed_version, gtfs_feed_version from {{ ref('travel_time_lsoa') }}) t
left join {{ ref('rail_feed') }} r on r.feed_version = t.rail_feed_version
left join {{ ref('gtfs_feed') }} f on f.feed_version = t.gtfs_feed_version
where r.timetable_date is null or t.departure_date <> r.timetable_date
   or f.feed_start_date is null or t.departure_date not between f.feed_start_date and f.feed_end_date
