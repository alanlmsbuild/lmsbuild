-- Each standard has one LARS code across its versions, and no LARS code
-- belongs to two standards.
select st_reference, count(distinct lars_code) as lars_codes from {{ ref('standard_soc') }} group by 1 having count(distinct lars_code) > 1
union all
select max(st_reference), count(distinct st_reference) from {{ ref('standard_soc') }} where lars_code is not null group by lars_code having count(distinct st_reference) > 1
