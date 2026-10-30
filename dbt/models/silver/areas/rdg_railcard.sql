-- The railcards the panel mentions, from the feed's railcards file (RSPS5045
-- 4.14.2): the 16-17 Saver (TSU) and the 16-25 Railcard (YNG), each with the
-- status codes the discount tables use for its adult and child fares, and
-- the child fare (status 001) with no railcard. The current record of each.
with cards as (
  select
    substr(line, 1, 3) as railcard_code,
    trim(substr(line, 29, 20)) as description,
    substr(line, 119, 3) as adult_status,
    substr(line, 122, 3) as child_status,
    {{ rdg_date(12) }} as start_date,
    {{ rdg_date(4) }} as end_date
  from {{ rdg_lines('RLC') }}
  where substr(line, 1, 3) in ('TSU', 'YNG')
    and current_date() between {{ rdg_date(12) }} and {{ rdg_date(4) }}
  qualify row_number() over (partition by substr(line, 1, 3) order by {{ rdg_date(12) }} desc) = 1
)
select
  railcard_code::varchar as railcard_code,
  description::varchar as description,
  adult_status::varchar as adult_status,
  child_status::varchar as child_status,
  start_date::date as valid_from,
  end_date::date as valid_to
from cards
