-- The product map only holds the categories and who-values gold understands,
-- and every row is for an operator and product that exists in the files (a
-- typo would map nothing).
select m.operator, m.product_name
from {{ ref('bus_fare_product_map') }} m
left join (select distinct operator_name, product_name from {{ ref('bus_fare_product') }}) p
  on p.operator_name = m.operator and p.product_name = m.product_name
where p.product_name is null
   or m.category not in ('single', 'return', 'day', 'week', '28-day')
   or m.who not in ('child', '16-18', '18-21', 'student', 'young-person', 'adult')
