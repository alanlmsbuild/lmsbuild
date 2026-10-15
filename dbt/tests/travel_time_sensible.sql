-- Journey times hang together: 25th percentile <= median <= 75th
-- percentile <= the cap; walking within the cap; bus and tram never slower
-- than walking (the transit times allow walking the whole way); staying put
-- takes no time.
select travel_key, transit_minutes_p25, transit_minutes_p50, transit_minutes_p75, walk_minutes, max_minutes
from {{ ref('travel_time_lsoa') }}
where transit_minutes_p25 > transit_minutes_p50
   or transit_minutes_p50 > transit_minutes_p75
   or transit_minutes_p75 > max_minutes
   or walk_minutes > max_minutes
   or transit_minutes_p50 > walk_minutes
   or (transit_minutes_p50 is null and walk_minutes is not null)
   or (origin_lsoa21 = destination_lsoa21 and coalesce(transit_minutes_p50, 1) + coalesce(walk_minutes, 1) <> 0)
