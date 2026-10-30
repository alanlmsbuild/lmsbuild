-- The feed's status discounts (RSPS5045 4.16): for a status (child, or a
-- railcard's adult or child fare) and a discount category, what the discount
-- is. indicator 0 is a plain percentage off the adult fare; the other
-- indicators (flat fare, a maximum or a minimum applies, none) are kept as
-- published and are not turned into percentages. Only the statuses the
-- railcard model names, and the child status 001, with their current record.
with wanted as (
  select '001' as status_code
  union
  select adult_status from {{ ref('rdg_railcard') }}
  union
  select child_status from {{ ref('rdg_railcard') }}
),
status as (
  select substr(line, 2, 3) as status_code, {{ rdg_date(5) }} as end_date, trim(substr(line, 21, 5)) as description
  from {{ rdg_lines('DIS') }}
  where substr(line, 1, 1) = 'S'
    and substr(line, 2, 3) in (select status_code from wanted)
    and current_date() between {{ rdg_date(13) }} and {{ rdg_date(5) }}
)
select
  substr(d.line, 2, 3)::varchar as status_code,
  s.description::varchar as description,
  try_to_number(substr(d.line, 13, 2))::number(2,0) as discount_category,
  substr(d.line, 15, 1)::varchar as indicator,
  (try_to_number(substr(d.line, 16, 3)) / 10)::number(4,1) as percentage
from {{ rdg_lines('DIS') }} d
join status s on s.status_code = substr(d.line, 2, 3) and s.end_date = {{ rdg_date(5, 'd.line') }}
where substr(d.line, 1, 1) = 'D'
