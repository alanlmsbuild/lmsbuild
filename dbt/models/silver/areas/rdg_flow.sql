-- The adult flows (status 000) between the seed journeys' stations, from the
-- flow file's flow records (RSPS5045 4.1.2): a flow is a fare-setting
-- between two places (stations or clusters) over a route, with the dates it
-- applies. Every dated version is here, past and future; gold takes the ones
-- current on the day it is built. A reversible flow (direction R) counts both
-- ways. Only the places of the seed's stations are read from the 8.5 million
-- lines of the file.
with flows as (
  select
    substr(line, 3, 4) as origin_code,
    substr(line, 7, 4) as destination_code,
    substr(line, 11, 5) as route_code,
    substr(line, 19, 1) as usage_code,
    substr(line, 20, 1) as direction,
    {{ rdg_date(21) }} as end_date,
    {{ rdg_date(29) }} as start_date,
    substr(line, 37, 3) as toc,
    substr(line, 43, 7) as flow_id
  from {{ rdg_lines('FFL') }}
  where substr(line, 2, 1) = 'F'
    and substr(line, 16, 3) = '000'
    and substr(line, 3, 4) in (select place from {{ ref('rdg_place') }})
    and substr(line, 7, 4) in (select place from {{ ref('rdg_place') }})
)
select distinct
  j.journey_key::varchar as journey_key,
  f.flow_id::varchar as flow_id,
  f.origin_code::varchar as origin_code,
  f.destination_code::varchar as destination_code,
  f.route_code::varchar as route_code,
  f.usage_code::varchar as usage_code,
  f.direction::varchar as direction,
  f.toc::varchar as toc,
  f.start_date::date as start_date,
  f.end_date::date as end_date
from flows f
join {{ ref('rdg_place') }} po on po.place = f.origin_code
join {{ ref('rdg_place') }} pd on pd.place = f.destination_code
join {{ ref('train_journey') }} j
  on (po.crs = j.from_crs and pd.crs = j.to_crs)
  or (f.direction = 'R' and po.crs = j.to_crs and pd.crs = j.from_crs)
