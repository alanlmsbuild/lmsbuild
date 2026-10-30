-- The feed's fare operators (RSPS5045 4.21.3, "Fare TOC" records): who is responsible
-- for the fares on a flow (the flow's TOC code), with the name the feed gives. Gold
-- uses it to say who set a fare on a route the feed does not name. toc_label is the
-- name in ordinary capitals, without the feed's "PTE" (Passenger Transport Executive):
-- "South Yorkshire", "East Midlands Railway".
select
  substr(line, 2, 3)::varchar as fare_toc_id,
  trim(substr(line, 7, 30))::varchar as toc_name,
  trim(regexp_replace(initcap(trim(substr(line, 7, 30))), ' Pte$', ''))::varchar as toc_label
from {{ rdg_lines('TOC') }}
where substr(line, 1, 1) = 'F'
qualify row_number() over (partition by substr(line, 2, 3) order by substr(line, 7, 30)) = 1
