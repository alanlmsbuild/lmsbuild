-- The feed's ticket types (RSPS5045 4.6.2) for the ticket kinds the panel shows:
-- the current record of each code, with its discount category (which line of
-- the discount tables applies to it).
select
  substr(line, 2, 3)::varchar as ticket_code,
  trim(substr(line, 29, 15))::varchar as description,
  substr(line, 44, 1)::varchar as ticket_class,
  substr(line, 45, 1)::varchar as ticket_type,
  try_to_number(substr(line, 112, 2))::number(2,0) as discount_category,
  {{ rdg_date(13) }}::date as valid_from,
  {{ rdg_date(5) }}::date as valid_to
from {{ rdg_lines('TTY') }}
where substr(line, 1, 1) = 'R'
  and substr(line, 2, 3) in (select ticket_code from {{ ref('train_ticket_kind') }})
  and current_date() between {{ rdg_date(13) }} and {{ rdg_date(5) }}
qualify row_number() over (partition by substr(line, 2, 3) order by {{ rdg_date(13) }} desc) = 1
