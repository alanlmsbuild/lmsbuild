-- The bus fare products the product map (seed bus_fare_product_map) does not
-- classify, with how often each appears and the prices where the file
-- gives them (decision 19, phase C). Nothing here is guessed into a
-- category: a person looks at this list and adds a row to the map, or
-- leaves the product out. Zone-to-zone fare triangles ("Adult Single" on
-- one line) are in it too, with no flat price.
select
  p.operator_name::varchar as operator_name,
  p.product_name::varchar as product_name,
  any_value(p.product_type)::varchar as product_type,
  any_value(p.user_ref)::varchar as user_ref,
  count(*)::number(38,0) as files,
  min(p.price_min)::number(10,2) as price_min,
  max(p.price_max)::number(10,2) as price_max
from {{ ref('bus_fare_product') }} p
left join {{ ref('bus_fare_product_map') }} m on m.operator = p.operator_name and m.product_name = p.product_name
where m.product_name is null
group by p.operator_name, p.product_name
