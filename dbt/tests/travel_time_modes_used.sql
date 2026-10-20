-- modes_used follows the 2-minute rule (decision 19, phase B): empty exactly
-- when the all-modes median is over the cap; train only when the train-only
-- median is within 2 minutes of it, bus only when the bus-only median is;
-- train and bus only when it beats both by more than 2 minutes.
select travel_key, transit_minutes_p50, bus_minutes_p50, rail_minutes_p50, walk_minutes, modes_used
from {{ ref('travel_time_lsoa') }}
where (modes_used is null) <> (transit_minutes_p50 is null)
   or (modes_used = 'train' and not coalesce(rail_minutes_p50 <= transit_minutes_p50 + 2, false))
   or (modes_used = 'bus' and not coalesce(bus_minutes_p50 <= transit_minutes_p50 + 2, false))
   or (modes_used = 'walk' and not coalesce(walk_minutes <= transit_minutes_p50 + 2, false))
   or (modes_used = 'train and bus' and (coalesce(rail_minutes_p50 <= transit_minutes_p50 + 2, false) or coalesce(bus_minutes_p50 <= transit_minutes_p50 + 2, false)))
