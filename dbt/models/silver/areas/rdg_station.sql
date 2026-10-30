-- The stations in the train_journey seed, from the feed's locations file
-- (RSPS5045 4.19.2): one row per station, its current location record (the
-- file keeps every dated version). The NLC code is how flows name it.
with wanted as (
  select from_crs as crs from {{ ref('train_journey') }}
  union
  select to_crs from {{ ref('train_journey') }}
)
select
  substr(line, 57, 3)::varchar as crs,
  substr(line, 37, 4)::varchar as nlc,
  trim(substr(line, 70, 6))::varchar as fare_group,
  trim(substr(line, 41, 16))::varchar as description,
  {{ rdg_date(18) }}::date as valid_from,
  {{ rdg_date(10) }}::date as valid_to
from {{ rdg_lines('LOC') }}
where substr(line, 2, 1) = 'L'
  and substr(line, 57, 3) in (select crs from wanted)
  and trim(substr(line, 41, 16)) not like '%+BUS%'
  and current_date() between {{ rdg_date(18) }} and {{ rdg_date(10) }}
qualify row_number() over (partition by substr(line, 57, 3) order by {{ rdg_date(18) }} desc) = 1
