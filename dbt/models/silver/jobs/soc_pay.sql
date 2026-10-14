-- Pay by occupation (SOC 2020) and area from ASHE, the Annual Survey of
-- Hours and Earnings: Table 14 for the UK (SOC 1 to 4 digits) and Table 15
-- for work regions (SOC 3 and 4 digits), 2024 revised and 2025
-- provisional. One row per year, table, pay measure, group (all, male,
-- full-time...), area and SOC code, with the median, mean and percentiles
-- and the median's and mean's coefficients of variation (from the
-- matching "b" file, row for row). ONS publishes no SOC pay by local
-- authority; Nomis's pay by local authority (all jobs) stays in bronze.
-- "x" (unreliable or disclosive) and blank are empty figures. Table 14's
-- two rows without a SOC code, All employees and Not Classified, keep
-- their titles (key parts all and not-classified).
with parsed as (
  select o.*,
    regexp_substr(ZIPMEMBER, 'Table (14|15 \\([34]\\))\\.([0-9]+)([ab]) +(.*) ([0-9]{4})( CV)?\\.xlsx$', 1, 1, 'e', 1) as ashe_table,
    to_number(regexp_substr(ZIPMEMBER, 'Table (14|15 \\([34]\\))\\.([0-9]+)([ab]) +(.*) ([0-9]{4})( CV)?\\.xlsx$', 1, 1, 'e', 2)) as measure_number,
    regexp_substr(ZIPMEMBER, 'Table (14|15 \\([34]\\))\\.([0-9]+)([ab]) +(.*) ([0-9]{4})( CV)?\\.xlsx$', 1, 1, 'e', 3) as kind,
    regexp_substr(ZIPMEMBER, 'Table (14|15 \\([34]\\))\\.([0-9]+)([ab]) +(.*) ([0-9]{4})( CV)?\\.xlsx$', 1, 1, 'e', 4) as pay_measure,
    to_number(regexp_substr(ZIPMEMBER, 'Table (14|15 \\([34]\\))\\.([0-9]+)([ab]) +(.*) ([0-9]{4})( CV)?\\.xlsx$', 1, 1, 'e', 5)) as year,
    (ZIPMEMBER like '%PROV - %') as is_provisional
  from {{ source('shared_raw', 'ashe_occupation') }} o
),
figures as (select * from parsed where kind = 'a'),
cvs as (select * from parsed where kind = 'b'),
areas as (
  select code, name from {{ ref('area_lookup') }} where area_type in ('region', 'country')
),
rows_ as (
  select f.*,
    case when f.ashe_table = '14' then 'uk' else 'region' end as geography,
    case when f.ashe_table = '14' then 'United Kingdom' else trim(split_part(f."Description", ',', 1)) end as area_name,
    trim(case when f.ashe_table = '14' then f."Description" else substr(f."Description", position(',' in f."Description") + 1) end) as soc_title,
    c."Median" as median_cv_raw, c."Mean" as mean_cv_raw
  from figures f
  left join cvs c on c.ashe_table = f.ashe_table and c.measure_number = f.measure_number and c.year = f.year
    and c.is_provisional = f.is_provisional and c.SHEET = f.SHEET and c.SHEETROW = f.SHEETROW
)
select
  (r.year || '|' || r.ashe_table || '|' || r.measure_number || '|' || r.SHEET || '|' || r.area_name || '|' || coalesce(nullif(r."Code", ''), case when r.soc_title = 'All employees' then 'all' else lower(regexp_replace(r.soc_title, '[^A-Za-z]+', '-')) end))::varchar as soc_pay_key,
  r.year::number(38,0) as year,
  r.is_provisional as is_provisional,
  ('Table ' || r.ashe_table)::varchar as ashe_table,
  r.measure_number::number(38,0) as pay_measure_number,
  r.pay_measure::varchar as pay_measure,
  r.SHEET::varchar as worker_group,
  r.geography::varchar as geography,
  r.area_name::varchar as area_name,
  a.code::varchar as area_code,
  nullif(r."Code", '')::varchar as soc_code,
  length(r."Code")::number(38,0) as soc_digits,
  r.soc_title::varchar as soc_title,
  {{ num('r."Number of jobs (thousand)"', 1) }}::number(12,1) as jobs_thousands,
  {{ num('r."Median"', 2) }}::number(14,2) as median,
  {{ num('r."Mean"', 2) }}::number(14,2) as mean,
  {{ num('r."10"', 2) }}::number(14,2) as p10,
  {{ num('r."20"', 2) }}::number(14,2) as p20,
  {{ num('r."25"', 2) }}::number(14,2) as p25,
  {{ num('r."30"', 2) }}::number(14,2) as p30,
  {{ num('r."40"', 2) }}::number(14,2) as p40,
  {{ num('r."60"', 2) }}::number(14,2) as p60,
  {{ num('r."70"', 2) }}::number(14,2) as p70,
  {{ num('r."75"', 2) }}::number(14,2) as p75,
  {{ num('r."80"', 2) }}::number(14,2) as p80,
  {{ num('r."90"', 2) }}::number(14,2) as p90,
  {{ num('r."Median annual percentage change"', 1) }}::number(8,1) as median_change_percent,
  {{ num('r."Mean annual percentage change"', 1) }}::number(8,1) as mean_change_percent,
  {{ num('r.median_cv_raw', 1) }}::number(8,1) as median_cv,
  {{ num('r.mean_cv_raw', 1) }}::number(8,1) as mean_cv,
  r.SOURCEFILEID::varchar as source_file_id
from rows_ r
left join areas a on a.name = case r.area_name when 'East' then 'East of England' else r.area_name end
