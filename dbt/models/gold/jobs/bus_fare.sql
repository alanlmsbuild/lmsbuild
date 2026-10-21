-- Typical bus fares for young people, from the operators' own fares data on
-- the Bus Open Data Service (decision 19, phase C): one row per operator,
-- kind of ticket (single, return, day, week or 28-day), who it is for
-- (child, 16-18, 18-21, student, young-person, and adult for comparison) and
-- pass or scheme (Zoom, Zoom Beyond, YP, Megarider ...). Only flat fares:
-- tickets the file prices with a few prices (up to 6). Zone-to-zone fare
-- triangles and any product the product map doesn't classify are left out
-- (silver bus_fare_unmapped). A fare is a typical price for that ticket,
-- never the price of a particular journey.
-- Every row says "as at <date>, check with the operator". Tram fares are not
-- in the Bus Open Data Service: TRAM_NOTE says so.
with priced as (
  select p.operator_name, p.nocs, m.category, m.who, m.pass_name, p.product_name, p.price_min, p.price_max, p.as_at, p.source_file_id
  from {{ ref('bus_fare_product') }} p
  join {{ ref('bus_fare_product_map') }} m on m.operator = p.operator_name and m.product_name = p.product_name
  where p.price_points between 1 and 6 and p.price_min > 0
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
  pass_name::varchar as pass_name,
  price_min::number(10,2) as price_min,
  price_max::number(10,2) as price_max,
  case when price_min = price_max then '£' || to_varchar(price_min, 'FM990.00')
       else '£' || to_varchar(price_min, 'FM990.00') || ' to £' || to_varchar(price_max, 'FM990.00') end::varchar as price_text,
  products::varchar as products,
  as_at::date as as_at,
  ('As at ' || to_varchar(as_at, 'DD FMMonth YYYY') || ': check with the operator.')::varchar as caveat,
  'Tram fares: see Supertram.'::varchar as tram_note
from grouped
