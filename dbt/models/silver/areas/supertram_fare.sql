-- Supertram's own fares (decision 19, phase C), as written down by hand from
-- Travel South Yorkshire's Supertram tickets and fares page
-- (scripts/fares/supertram-fares.csv, load:data step 49): the latest load,
-- one row per ticket, with the page and the date a person checked it there.
select
  "ticket"::varchar as ticket,
  "who"::varchar as who,
  "category"::varchar as category,
  try_to_decimal("price", 10, 2)::number(10,2) as price,
  nullif("note", '')::varchar as note,
  "source_url"::varchar as source_url,
  try_to_date("date_checked")::date as date_checked,
  SOURCEFILEID::varchar as source_file_id
from {{ source('shared_raw', 'supertram_fare') }}
where SOURCEFILEID = {{ latest_file('supertram-fares', 'SUPERTRAM_FARE') }}
