-- SOC_PAY has one row per row of ASHE's figures ("a") files, every one with
-- its CV row from the matching "b" file, and every 4-digit SOC code is a
-- unit group in the ONS SOC 2020 framework.
with figures as (
  select count(*) as n from {{ source('shared_raw', 'ashe_occupation') }} where regexp_like(ZIPMEMBER, '.*\\.[0-9]+a +.*')
)
select 'rows' as check_, (select count(*) from {{ ref('soc_pay') }}) as silver, (select n from figures) as bronze
where (select count(*) from {{ ref('soc_pay') }}) <> (select n from figures)
union all
select 'unknown 4-digit SOC codes', count(distinct soc_code), 0 from {{ ref('soc_pay') }}
where soc_digits = 4 and soc_code not in (select code from {{ soc_unit_groups() }})
having count(distinct soc_code) > 0
