-- The feed's fare routes (RSPS5045 4.20.2): each route code's current record
-- and its name, for saying which route a fare is for ("any permitted", "via ...").
select
  substr(line, 3, 5)::varchar as route_code,
  trim(substr(line, 32, 16))::varchar as description,
  {{ rdg_date(16) }}::date as valid_from,
  {{ rdg_date(8) }}::date as valid_to
from {{ rdg_lines('RTE') }}
where substr(line, 2, 1) = 'R'
  and current_date() between {{ rdg_date(16) }} and {{ rdg_date(8) }}
qualify row_number() over (partition by substr(line, 3, 5) order by {{ rdg_date(16) }} desc) = 1
