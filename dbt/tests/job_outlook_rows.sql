-- JOB_OUTLOOK has one row per SOC 2020 unit group and area (13 areas), and
-- a pay figure is always labelled with where it is for.
select 'rows' as check_, (select count(*) from {{ ref('job_outlook') }}) as got, (select count(*) * 13 from {{ soc_unit_groups() }}) as want
where (select count(*) from {{ ref('job_outlook') }}) <> (select count(*) * 13 from {{ soc_unit_groups() }})
union all
select 'pay without its area', count(*), 0 from {{ ref('job_outlook') }} where pay_median is not null and pay_area is null having count(*) > 0
