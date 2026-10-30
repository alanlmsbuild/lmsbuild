-- Supertram's fares for young people and adults (decision 19, phase C), from
-- Supertram's own published fares (Travel South Yorkshire's Supertram tickets
-- and fares page, checked by hand): one row per ticket. Supertram is not in
-- the Bus Open Data Service, so these are written down by hand, not read from
-- a feed. 16 to 18s pay the child fares: there is no separate 16-18 tram fare.
-- PRICE_MIN and PRICE_MAX are both the price (the same shape as bus_fare, where a
-- kind of ticket can have a range).
-- Every row says "as at <date>: check with Supertram" (the date a person
-- checked the page). A fare whose date is over 12 months old is left out, as
-- in bus_fare.
select
  (ticket || '|' || who)::varchar as fare_key,
  'Supertram'::varchar as operator_name,
  ticket::varchar as ticket,
  category::varchar as category,
  who::varchar as who,
  case who when 'child' then 'Child' when '16-18' then '16 to 18' when '18-21' then '18 to 21' when 'student' then 'Student' when 'adult' then 'Adult' end::varchar as who_label,
  price::number(10,2) as price_min,
  price::number(10,2) as price_max,
  ('£' || to_varchar(price, 'FM990.00'))::varchar as price_text,
  case when ticket ilike '%in advance%' then 'in advance' end::varchar as bought,
  note::varchar as note,
  source_url::varchar as source_url,
  date_checked::date as as_at,
  ('As at ' || {{ long_date('date_checked') }} || ': check with Supertram.')::varchar as caveat,
  current_date()::date as built_on
from {{ ref('supertram_fare') }}
where date_checked >= dateadd(month, -12, current_date())
