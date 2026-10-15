-- What a local authority is like, one row per authority (today's,
-- LOCAL_AUTHORITY), for Meadow and the school leavers app. Nothing is
-- ranked: an area is described in words against similar areas and
-- England, never placed in a league.
--   Population: the latest mid-year estimate (England only: Nomis NM_31_1
--     as loaded covers England).
--   Deprivation: the share of its LSOAs in England's most deprived 10%
--     (IMD 2025; England only).
--   Crime and anti-social behaviour (police.uk; England and Wales, as
--     police.uk has no Police Scotland data): reports in the last 12 months
--     per 1,000 people, only when every one of those months is complete for
--     the area and the population is known. A month is complete when the
--     area's force (the one recording most of its reports) sent at least
--     half its usual month (its median); a force that stops sending data
--     can leave a handful of reports from neighbouring forces, which would
--     otherwise look like a fall. An area has no crime figures when no
--     force recorded reports in at least half its LSOAs (Greater Manchester
--     Police sends none to police.uk; its boroughs have only stray reports
--     from neighbouring forces). Both halves are Rarebit's own rules. Compared with similar areas and England in words: higher
--     or lower when more than 10% apart, about the same otherwise. Rising
--     or falling compares like for like: each month against the same
--     month a year before, where both are complete; rising or falling
--     when more than 5% apart (at least 6 months). Both thresholds and the
--     similar-areas grouping are Rarebit's own rules, not ONS's or the
--     police's: similar areas are English authorities whose postcodes are
--     mostly in the same 2021 rural-urban class and which are in the same
--     fifth for deprivation (the average IMD score of their LSOAs).
--   Fuel poverty (DESNZ, England): the share of households fuel poor, with
--     England's; DESNZ says use these for general trends.
--   Most-advertised occupations: the five SOC 2020 minor groups with most
--     new online job adverts over the months ONS published in full for the
--     area (at least 6 of the last 12). London's boroughs are one area in
--     that data, so none for them.
with la as (select * from {{ ref('local_authority') }}),
pop_latest as (select max(year) as y from {{ ref('local_authority_population') }}),
pop as (
  select p.* from {{ ref('local_authority_population') }} p
  where p.year = (select y from pop_latest)
),
england_pop as (select population from pop where area_code = 'E92000001'),
imd as (
  select local_authority_code, count(*) as lsoas, avg(imd_score) as mean_imd_score,
         count_if(imd_decile = 1) / nullif(count(imd_decile), 0) as most_deprived_share
  from {{ ref('lsoa') }} where lsoa21_code like 'E%' group by 1
),
ruc as (
  select local_authority_code, mode(rural_urban_2021) as ruc
  from {{ ref('postcode') }} where is_live and local_authority_code is not null group by 1
),
groups as (
  select i.local_authority_code, r.ruc,
         ntile(5) over (order by i.mean_imd_score desc) as deprivation_fifth
  from imd i left join ruc r on r.local_authority_code = i.local_authority_code
  where i.mean_imd_score is not null
),
force_month as (
  select force, month, sum(reports) as reports
  from {{ ref('crime_lsoa_month') }} group by 1, 2
),
force_usual as (select force, median(reports) as usual from force_month group by 1),
force_complete as (
  select m.force, m.month from force_month m join force_usual u on u.force = m.force
  where m.reports >= u.usual * 0.5
),
la_lsoas as (select local_authority_code, count(*) as lsoas from {{ ref('lsoa') }} where local_authority_code is not null group by 1),
la_force as (
  select l.local_authority_code, c.force,
         row_number() over (partition by l.local_authority_code order by sum(c.reports) desc, c.force) as n
  from {{ ref('crime_lsoa_month') }} c
  join {{ ref('lsoa') }} l on l.lsoa21_code = c.lsoa21_code
  join la_lsoas a on a.local_authority_code = l.local_authority_code
  where l.local_authority_code is not null
  group by 1, 2, a.lsoas
  -- The force covers the area: reports in at least half its LSOAs (a force
  -- with no police.uk data, such as Greater Manchester's, leaves only stray
  -- reports from neighbouring forces near the border).
  having count(distinct c.lsoa21_code) >= a.lsoas * 0.5
),
crime_la as (
  select l.local_authority_code, c.month, c.kind, sum(c.reports) as reports
  from {{ ref('crime_lsoa_month') }} c
  join {{ ref('lsoa') }} l on l.lsoa21_code = c.lsoa21_code
  join la_force f on f.local_authority_code = l.local_authority_code and f.n = 1
  join force_complete fc on fc.force = f.force and fc.month = c.month
  group by 1, 2, 3
),
crime_last as (select max(month) as last_month from {{ ref('crime_lsoa_month') }}),
crime_12 as (
  select c.local_authority_code, c.kind,
         count(distinct c.month) as months_present,
         sum(c.reports) as reports
  from crime_la c cross join crime_last l
  where c.month > dateadd(month, -12, l.last_month)
  group by 1, 2
),
crime_trend as (
  select c.local_authority_code, c.kind,
         count(*) as compared_months, sum(c.reports) as compared_last, sum(p.reports) as compared_previous
  from crime_la c
  cross join crime_last l
  join crime_la p on p.local_authority_code = c.local_authority_code and p.kind = c.kind and p.month = dateadd(year, -1, c.month)
  where c.month > dateadd(month, -12, l.last_month)
  group by 1, 2
),
rates as (
  select c.local_authority_code, c.kind,
         case when c.months_present = 12 then c.reports end as reports_12,
         case when c.months_present = 12 and p.population > 0 then c.reports / p.population * 1000 end as rate,
         c.months_present
  from crime_12 c left join pop p on p.area_code = c.local_authority_code
),
compare as (
  select r.local_authority_code, r.kind, r.rate,
         sum(case when r2.rate is not null then r2.reports_12 end) / nullif(sum(case when r2.rate is not null then p2.population end), 0) * 1000 as similar_rate,
         count(distinct case when r2.rate is not null then r2.local_authority_code end) as similar_areas
  from rates r
  join groups g on g.local_authority_code = r.local_authority_code
  join groups g2 on g2.ruc = g.ruc and g2.deprivation_fifth = g.deprivation_fifth
  join rates r2 on r2.local_authority_code = g2.local_authority_code and r2.kind = r.kind
  join pop p2 on p2.area_code = r2.local_authority_code
  group by 1, 2, 3
),
england as (
  select r.kind, sum(r.reports_12) / nullif(sum(p.population), 0) * 1000 as england_rate
  from rates r join pop p on p.area_code = r.local_authority_code
  where r.rate is not null and r.local_authority_code like 'E%'
  group by 1
),
fuel as (select * from {{ ref('fuel_poverty_area') }} where area_level in ('district', 'county_or_unitary')),
fuel_england as (select * from {{ ref('fuel_poverty_area') }} where area_level = 'country'),
ad_month as (
  select local_authority_code, period_start, count_if(adverts is null) as missing
  from {{ ref('labour_demand') }} where source_table = 'Table 4' and geography = 'local_authority'
  group by 1, 2
),
ad_last as (select max(period_start) as last_month from ad_month),
ad_full as (
  select m.local_authority_code, m.period_start from ad_month m cross join ad_last l
  where m.missing = 0 and m.period_start > dateadd(month, -12, l.last_month)
),
ad_top as (
  select d.local_authority_code, d.soc_code, max(d.soc_label) as soc_label, sum(d.adverts) as adverts,
         row_number() over (partition by d.local_authority_code order by sum(d.adverts) desc, d.soc_code) as n
  from {{ ref('labour_demand') }} d
  join ad_full f on f.local_authority_code = d.local_authority_code and f.period_start = d.period_start
  where d.source_table = 'Table 4'
  group by 1, 2
),
ad_months as (select local_authority_code, count(*) as months from ad_full group by 1),
top_occupations as (
  select t.local_authority_code,
         array_agg(object_construct('soc_code', t.soc_code, 'title', t.soc_label, 'adverts', t.adverts)) within group (order by t.n) as occupations
  from ad_top t join ad_months m on m.local_authority_code = t.local_authority_code
  where t.n <= 5 and m.months >= 6
  group by 1
),
words as (
  select local_authority_code, kind,
    case when rate is null or similar_rate is null or similar_areas < 3 then null
         when rate > similar_rate * 1.1 then 'higher' when rate < similar_rate * 0.9 then 'lower' else 'about the same' end as vs_similar
  from compare
)
select
  la.local_authority_code::varchar as local_authority_code,
  la.name::varchar as name,
  la.region_name::varchar as region_name,
  la.country_name::varchar as country_name,
  p.population::number(38,0) as population,
  case when p.population is not null then p.year end::number(38,0) as population_year,
  i.lsoas::number(38,0) as lsoas,
  round(i.most_deprived_share * 100, 1)::number(5,1) as most_deprived_10_percent_share,
  g.ruc::varchar as rural_urban_class,
  g.deprivation_fifth::number(38,0) as deprivation_fifth,
  rc.reports_12::number(38,0) as crimes_last_12_months,
  round(rc.rate, 1)::number(10,1) as crime_rate_per_1000,
  rc.months_present::number(38,0) as crime_months_present,
  round(cc.similar_rate, 1)::number(10,1) as crime_rate_similar_areas,
  cc.similar_areas::number(38,0) as crime_similar_areas,
  wc.vs_similar::varchar as crime_vs_similar_areas,
  round(ec.england_rate, 1)::number(10,1) as crime_rate_england,
  case when rc.rate is null or ec.england_rate is null then null
       when rc.rate > ec.england_rate * 1.1 then 'higher' when rc.rate < ec.england_rate * 0.9 then 'lower' else 'about the same' end::varchar as crime_vs_england,
  tc.compared_months::number(38,0) as crime_trend_compared_months,
  case when tc.compared_months >= 6 and tc.compared_previous > 0 then round((tc.compared_last - tc.compared_previous) / tc.compared_previous * 100, 1) end::number(8,1) as crime_change_percent,
  case when coalesce(tc.compared_months, 0) < 6 or coalesce(tc.compared_previous, 0) = 0 then null
       when (tc.compared_last - tc.compared_previous) / tc.compared_previous > 0.05 then 'rising'
       when (tc.compared_last - tc.compared_previous) / tc.compared_previous < -0.05 then 'falling'
       else 'about the same' end::varchar as crime_trend,
  ra.reports_12::number(38,0) as asb_last_12_months,
  round(ra.rate, 1)::number(10,1) as asb_rate_per_1000,
  round(ea.england_rate, 1)::number(10,1) as asb_rate_england,
  case when ta.compared_months >= 6 and ta.compared_previous > 0 then round((ta.compared_last - ta.compared_previous) / ta.compared_previous * 100, 1) end::number(8,1) as asb_change_percent,
  case when coalesce(ta.compared_months, 0) < 6 or coalesce(ta.compared_previous, 0) = 0 then null
       when (ta.compared_last - ta.compared_previous) / ta.compared_previous > 0.05 then 'rising'
       when (ta.compared_last - ta.compared_previous) / ta.compared_previous < -0.05 then 'falling'
       else 'about the same' end::varchar as asb_trend,
  (select last_month from crime_last)::date as crime_last_month,
  f.households::number(38,0) as households,
  f.fuel_poor_households::number(38,0) as fuel_poor_households,
  round(f.fuel_poor_percent, 1)::number(5,1) as fuel_poor_percent,
  round(fe.fuel_poor_percent, 1)::number(5,1) as fuel_poor_percent_england,
  f.data_year::number(38,0) as fuel_poverty_year,
  t.occupations::variant as top_advertised_occupations,
  am.months::number(38,0) as adverts_months_used,
  p.source_file_id::varchar as population_source_file_id,
  psf.PUBLISHEDON as population_published_on,
  f.source_file_id::varchar as fuel_poverty_source_file_id,
  fsf.PUBLISHEDON as fuel_poverty_published_on,
  {{ latest_file('police-uk-street', 'POLICE_STREET_CRIME') }}::varchar as crime_source_file_id,
  current_timestamp()::timestamp_ltz as as_of
from la
left join pop p on p.area_code = la.local_authority_code
left join imd i on i.local_authority_code = la.local_authority_code
left join groups g on g.local_authority_code = la.local_authority_code
left join rates rc on rc.local_authority_code = la.local_authority_code and rc.kind = 'crime'
left join rates ra on ra.local_authority_code = la.local_authority_code and ra.kind = 'anti-social behaviour'
left join compare cc on cc.local_authority_code = la.local_authority_code and cc.kind = 'crime'
left join words wc on wc.local_authority_code = la.local_authority_code and wc.kind = 'crime'
left join england ec on ec.kind = 'crime'
left join england ea on ea.kind = 'anti-social behaviour'
left join crime_trend tc on tc.local_authority_code = la.local_authority_code and tc.kind = 'crime'
left join crime_trend ta on ta.local_authority_code = la.local_authority_code and ta.kind = 'anti-social behaviour'
left join fuel f on f.area_code = la.local_authority_code
left join fuel_england fe on true
left join top_occupations t on t.local_authority_code = la.local_authority_code
left join ad_months am on am.local_authority_code = la.local_authority_code
{{ source_file_join('psf', 'p.source_file_id', 'shared') }}
{{ source_file_join('fsf', 'f.source_file_id', 'shared') }}
