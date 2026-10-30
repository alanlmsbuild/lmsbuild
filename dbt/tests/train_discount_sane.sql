-- Train discounts: a percentage between 0 and 100 exclusive, the words the page shows
-- ("... % off the adult fare (from the discount table)"), and a railcard never on a season.
select discount_key, 'bad percentage or words' as problem from {{ ref('train_discount') }}
where percentage <= 0 or percentage >= 100 or discount_text not like '%% off the adult fare (from the discount table)'
union all
select discount_key, 'railcard on a season' from {{ ref('train_discount') }}
where who <> 'child' and kind = 'seven-day'
