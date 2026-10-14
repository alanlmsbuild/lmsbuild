-- Each LSOA's live postcodes are all in one MSOA, and at least 80% of them
-- in the local authority LSOA gives it (the most common). ONSPD places a
-- postcode in a local authority by its own grid reference, so a few on a
-- boundary fall in the next one (32 postcodes in 24 LSOAs, October 2026).
with counts as (
  select lsoa21_code, local_authority_code, count(*) as n
  from {{ ref('postcode') }}
  where is_live and lsoa21_code is not null
  group by 1, 2
),
shares as (
  select lsoa21_code, max(n) / sum(n) as top_share from counts group by 1
),
msoas as (
  select lsoa21_code, count(distinct msoa21_code) as msoas
  from {{ ref('postcode') }}
  where is_live and lsoa21_code is not null
  group by 1
)
select s.lsoa21_code, s.top_share, m.msoas
from shares s join msoas m on m.lsoa21_code = s.lsoa21_code
where s.top_share < 0.8 or m.msoas > 1
