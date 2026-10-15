-- What the job market looks like for an occupation in an area, one row per
-- SOC 2020 unit group and area (the English regions, Wales, Scotland,
-- Northern Ireland and the UK): typical pay, how many online adverts there
-- have been and whether that is going up or down, how many adverts are
-- open now, and the apprenticeship standards that lead to it. Nothing is
-- ranked.
--   Pay: ASHE's median gross annual pay for full-time employees, the latest
--     year (2025 is provisional), by place of work. Where ONS publishes no
--     figure for the area (too few, or not reliable enough), the UK figure
--     is given and PAY_AREA says so. PAY_PRECISION is ONS's own band for
--     the median's coefficient of variation.
--   Adverts: ONS's new online job adverts (from Textkernel; official
--     statistics in development). The trend compares like for like: each
--     of the last 12 months with the same month a year before, where ONS
--     published both; up or down when the change is more than 5% (our
--     rule), about the same otherwise; empty with fewer than 6 such months.
--     12-month totals only when no month is missing.
--   Open now: live adverts whose closing date is still to come, coded to
--     the occupation (scripts/vacancy-soc.js), in the area.
with soc as (select code as soc2020, title as soc_title from {{ soc_unit_groups() }}),
areas as (
  select code as area_code, name as area_name, 'region' as geography from {{ ref('area_lookup') }} where area_type = 'region'
  union all
  select code, name, 'country' from {{ ref('area_lookup') }} where area_type = 'country' and code in ('W92000004', 'S92000003', 'N92000002')
  union all
  select 'K02000001', 'United Kingdom', 'uk'
),
grid as (select * from soc cross join areas),
pay as (
  select area_code, soc_code, median, p25, p75, median_cv, year, is_provisional, source_file_id
  from {{ ref('soc_pay') }}
  where pay_measure_number = 7 and worker_group = 'Full-Time' and soc_digits = 4
    and year = (select max(year) from {{ ref('soc_pay') }}) and median is not null
),
adverts_months as (
  select case when l.area_name = 'Total UK' then 'K02000001' else a.area_code end as area_code,
         l.soc_code, l.period_start, l.adverts
  from {{ ref('labour_demand') }} l
  left join areas a on a.area_name = l.area_name
  where l.source_table = 'Table 3' and l.soc_digits = 4
),
latest as (select max(period_start) as last_month from adverts_months),
-- Like for like: each of the last 12 months against the same month a year
-- before, only where ONS published both (it left out March 2026 for every
-- occupation, and some months for affected ones). 12-month totals only
-- when no month is missing.
adverts as (
  select m.area_code, m.soc_code,
    count_if(m.adverts is not null and p.adverts is not null) as compared_months,
    sum(case when m.adverts is not null and p.adverts is not null then m.adverts end) as compared_last,
    sum(case when m.adverts is not null and p.adverts is not null then p.adverts end) as compared_previous,
    case when count_if(m.adverts is null) = 0 then sum(m.adverts) end as last_12,
    case when count_if(p.adverts is null) = 0 and count(p.period_start) = 12 then sum(p.adverts) end as previous_12,
    count_if(m.adverts is null) + count_if(p.adverts is null) as not_published,
    max(l.last_month) as last_month
  from adverts_months m
  cross join latest l
  left join adverts_months p on p.area_code = m.area_code and p.soc_code = m.soc_code and p.period_start = dateadd(year, -1, m.period_start)
  where m.period_start > dateadd(month, -12, l.last_month)
  group by 1, 2
),
open_now as (
  select coalesce(la.region_code, la.country_code) as area_code, s.soc2020, count(distinct v.vacancy_reference) as open_adverts
  from {{ ref('vacancy') }} v
  join {{ ref('vacancy_soc') }} s on s.vacancy_reference = v.vacancy_reference and s.is_current
  join {{ ref('local_authority') }} la on la.local_authority_code = v.local_authority_code
  where v.is_live and v.closing_at > current_timestamp()
  group by 1, 2
  union all
  select 'K02000001', s.soc2020, count(distinct v.vacancy_reference)
  from {{ ref('vacancy') }} v
  join {{ ref('vacancy_soc') }} s on s.vacancy_reference = v.vacancy_reference and s.is_current
  where v.is_live and v.closing_at > current_timestamp()
  group by 2
),
standards as (
  select soc2020, count(distinct st_reference) as standards_count,
         array_agg(distinct object_construct('st_reference', st_reference, 'lars_code', lars_code, 'title', standard_title)) as standards
  from {{ ref('standard_soc') }}
  group by 1
),
files as (select {{ latest_file('ons-online-job-adverts', 'PUBLISHED_CELL') }} as adverts_file)
select
  (g.soc2020 || '|' || g.area_code)::varchar as outlook_key,
  g.soc2020::varchar as soc2020,
  g.soc_title::varchar as soc_title,
  g.area_code::varchar as area_code,
  g.area_name::varchar as area_name,
  g.geography::varchar as geography,
  coalesce(pa.median, pu.median)::number(14,2) as pay_median,
  coalesce(case when pa.median is not null then pa.p25 end, case when pa.median is null then pu.p25 end)::number(14,2) as pay_p25,
  coalesce(case when pa.median is not null then pa.p75 end, case when pa.median is null then pu.p75 end)::number(14,2) as pay_p75,
  case when pa.median is not null then g.area_name when pu.median is not null then 'United Kingdom' end::varchar as pay_area,
  case
    when coalesce(pa.median, pu.median) is null then null
    when coalesce(case when pa.median is not null then pa.median_cv end, pu.median_cv) <= 5 then 'precise'
    when coalesce(case when pa.median is not null then pa.median_cv end, pu.median_cv) <= 10 then 'reasonably precise'
    when coalesce(case when pa.median is not null then pa.median_cv end, pu.median_cv) <= 20 then 'acceptable, use with caution'
    else 'precision not stated'
  end::varchar as pay_precision,
  coalesce(pa.year, pu.year)::number(38,0) as pay_year,
  coalesce(pa.is_provisional, pu.is_provisional)::boolean as pay_provisional,
  ad.last_12::number(38,0) as adverts_last_12_months,
  ad.previous_12::number(38,0) as adverts_previous_12_months,
  ad.not_published::number(38,0) as adverts_months_not_published,
  ad.compared_months::number(38,0) as adverts_compared_months,
  case when ad.compared_months >= 6 and ad.compared_previous > 0
       then round((ad.compared_last - ad.compared_previous) / ad.compared_previous * 100, 1) end::number(8,1) as adverts_change_percent,
  case
    when not (ad.compared_months >= 6 and ad.compared_previous > 0) then null
    when (ad.compared_last - ad.compared_previous) / ad.compared_previous > 0.05 then 'up'
    when (ad.compared_last - ad.compared_previous) / ad.compared_previous < -0.05 then 'down'
    else 'about the same'
  end::varchar as adverts_trend,
  ad.last_month::date as adverts_last_month,
  coalesce(o.open_adverts, 0)::number(38,0) as open_adverts,
  coalesce(st.standards_count, 0)::number(38,0) as standards_count,
  st.standards::variant as standards,
  'ashe-occupation,ons-online-job-adverts,faa-vacancies,skills-england'::varchar as source,
  case when pa.median is not null then pa.source_file_id else pu.source_file_id end::varchar as pay_source_file_id,
  to_date(psf.ORIGINALMODIFIEDAT) as pay_downloaded_on,
  psf.PUBLISHEDON as pay_published_on,
  f.adverts_file::varchar as adverts_source_file_id,
  to_date(asf.ORIGINALMODIFIEDAT) as adverts_downloaded_on,
  asf.PUBLISHEDON as adverts_published_on,
  current_timestamp()::timestamp_ltz as as_of
from grid g
cross join files f
left join pay pa on pa.area_code = g.area_code and pa.soc_code = g.soc2020
left join pay pu on pu.area_code = 'K02000001' and pu.soc_code = g.soc2020
left join adverts ad on ad.area_code = g.area_code and ad.soc_code = g.soc2020
left join open_now o on o.area_code = g.area_code and o.soc2020 = g.soc2020
left join standards st on st.soc2020 = g.soc2020
{{ source_file_join('psf', 'case when pa.median is not null then pa.source_file_id else pu.source_file_id end', 'shared') }}
{{ source_file_join('asf', 'f.adverts_file', 'shared') }}
