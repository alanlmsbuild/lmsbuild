-- Open schools and colleges that share a UKPRN. None do today (October
-- 2026); if some start to, per-UKPRN figures (achievement rates, Ofsted FE)
-- on PROVIDER apply to all of them, and the app must say so.
{{ config(severity = 'warn') }}
select ukprn, count(distinct urn) as establishments
from (
  select urn, ukprn from {{ ref('school') }} where is_open and ukprn is not null
  union
  select urn, ukprn from {{ ref('college_16_18') }} where is_open and ukprn is not null
)
group by 1
having count(distinct urn) > 1
