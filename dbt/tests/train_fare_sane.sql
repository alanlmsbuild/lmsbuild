-- Train fares: every priced row has a real price (positive, lowest not above highest, in
-- pence steps), every row that is not priced says exactly "No current fare: check National
-- Rail" and has no price, a range names its routes, and every journey in the seed has at
-- least one row. Returns the rows that break a rule.
select fare_key, 'bad price' as problem from {{ ref('train_fare') }}
where price_min is not null and (price_min <= 0 or price_max < price_min or price_min * 100 <> round(price_min * 100) or price_max * 100 <> round(price_max * 100))
union all
select fare_key, 'unpriced row without the words' from {{ ref('train_fare') }}
where price_min is null and (price_max is not null or price_text <> 'No current fare: check National Rail')
union all
select fare_key, 'priced row says no fare' from {{ ref('train_fare') }}
where price_min is not null and price_text like 'No current fare%'
union all
select fare_key, 'range without routes' from {{ ref('train_fare') }}
where price_min < price_max and routes_text is null
union all
select journey_key, 'journey with no fare rows' from {{ ref('train_journey') }}
where journey_key not in (select journey_key from {{ ref('train_fare') }})
