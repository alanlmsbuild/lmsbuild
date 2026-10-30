-- The date in a fare's caveat is written in words ("As at 9 September 2026: ..."): a
-- wrong date format once gave "09 F09ont0 2026". Returns the fares whose caveat isn't.
select fare_key, 'bus_fare' as model, caveat from {{ ref('bus_fare') }}
where not regexp_like(caveat, '^As at [0-9]{1,2} [A-Z][a-z]+ 20[0-9]{2}: check with the operator\\.$')
union all
select fare_key, 'tram_fare', caveat from {{ ref('tram_fare') }}
where not regexp_like(caveat, '^As at [0-9]{1,2} [A-Z][a-z]+ 20[0-9]{2}: check with Supertram\\.$')
