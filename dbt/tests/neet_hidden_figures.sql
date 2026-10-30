-- A hidden NEET figure has no number in gold, and a shown one has: the honesty
-- rule (a rate based on fewer than 10 young people is not shown; a withheld
-- one says so).
select neet_key from {{ ref('neet_la_year') }}
where (neet_status = 'shown') <> (neet_percent is not null)
   or (not_known_status = 'shown') <> (not_known_percent is not null)
   or (neet_or_not_known_status = 'shown') <> (neet_or_not_known_percent is not null)
