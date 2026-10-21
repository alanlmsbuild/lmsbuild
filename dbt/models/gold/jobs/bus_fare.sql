-- Typical bus fares for young people, from the operators' own fares data on
-- the Bus Open Data Service (decision 19, phase C): one row per operator,
-- kind of ticket (single, return, day, week or 28-day), who it is for
-- (child, 16-18, 18-21, student, young-person, and adult for comparison) and
-- pass or scheme (Zoom, Zoom Beyond, YP, Megarider ...). Only flat fares:
-- tickets the file prices with a few prices (up to 6). Zone-to-zone fare
-- triangles and any product the product map doesn't classify are left out
-- (silver bus_fare_unmapped). A fare is a typical price for that ticket,
-- never the price of a particular journey.
-- Every row says "as at <date>, check with the operator". Fares whose "as at"
-- date is over 12 months old stay in silver but are not in gold (Alan,
-- 21 October 2026): the public view only shows fares an operator has
-- confirmed within the year. Where one operator's products of a kind differ
-- the price reads "£1.90 to £4.00 depending on ticket", with the operator's
-- own product names beside it. Tram tickets that bus operators' datasets
-- carry (pass "Tram") are left out: Supertram's own fares are in tram_fare,
-- and TRAM_NOTE says so.
with priced as (
  select p.operator_name, p.nocs, m.category, m.who, m.pass_name, p.product_name, p.price_min, p.price_max, p.as_at, p.source_file_id
  from {{ ref('bus_fare_product') }} p
  join {{ ref('bus_fare_product_map') }} m on m.operator = p.operator_name and m.product_name = p.product_name
  where p.price_points between 1 and 6 and p.price_min > 0
    and p.as_at >= dateadd(month, -12, current_date())
    and coalesce(m.pass_name, '') <> 'Tram'
),
grouped as (
  select operator_name, any_value(nocs) as nocs, category, who, coalesce(nullif(pass_name, ''), '') as pass_name,
         min(price_min) as price_min, max(price_max) as price_max,
         listagg(distinct product_name, '; ') within group (order by product_name) as products,
         max(as_at) as as_at, count(*) as files
  from priced
  group by operator_name, category, who, coalesce(nullif(pass_name, ''), '')
)
select
  (operator_name || '|' || category || '|' || who || '|' || pass_name)::varchar as fare_key,
  operator_name::varchar as operator_name,
  nocs::varchar as nocs,
  category::varchar as category,
  who::varchar as who,
  case who when 'child' then 'Child' when '16-18' then '16 to 18' when '18-21' then '18 to 21' when 'student' then 'Student'
           when 'young-person' then 'Young person' when 'adult' then 'Adult' end::varchar as who_label,
  pass_name::varchar as pass_name,
  price_min::number(10,2) as price_min,
  price_max::number(10,2) as price_max,
  case when price_min = price_max then '£' || to_varchar(price_min, 'FM990.00')
       else '£' || to_varchar(price_min, 'FM990.00') || ' to £' || to_varchar(price_max, 'FM990.00') || ' depending on ticket' end::varchar as price_text,
  products::varchar as products,
  as_at::date as as_at,
  ('As at ' || to_varchar(as_at, 'DD FMMonth YYYY') || ': check with the operator.')::varchar as caveat,
  'Tram fares are shown separately: see Supertram.'::varchar as tram_note
from grouped
