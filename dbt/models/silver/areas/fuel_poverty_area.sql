-- Fuel poverty in England (DESNZ sub-regional statistics, the latest
-- workbook), by area: England, its regions, counties and unitaries, local
-- authority districts (Table 2) and LSOAs (Table 4). DESNZ: estimates for
-- general trends; LSOA figures with care (its notes 3 and 6).
with f as (
  select f.SOURCEFILEID, f.MEMBER from {{ source('shared_raw', 'source_file') }} f
  where f.SOURCE = 'fuel-poverty-sub-regional'
  qualify row_number() over (order by regexp_substr(f.MEMBER, '20[0-9]{2}') desc nulls last, f.LOADEDAT desc) = 1
),
cells as (
  select c.SHEET, to_number(c.SHEETROW) as r, to_number(c.SHEETCOLUMN) as col, c.VALUE, c.SOURCEFILEID
  from {{ source('shared_raw', 'published_cell') }} c
  where c.SOURCEFILEID = (select SOURCEFILEID from f) and c.SHEET in ('Table 2', 'Table 4', 'Title')
),
data_year as (
  select max(to_number(regexp_substr(VALUE, '(20[0-9]{2})\\.?$', 1, 1, 'e', 1))) as y from cells where SHEET = 'Title' and VALUE ilike 'Data in this release covers%'
),
t2 as (
  select r, max(case when col = 1 then VALUE end) as code, max(case when col = 2 then VALUE end) as region,
         max(case when col = 3 then VALUE end) as county_or_ua, max(case when col = 4 then VALUE end) as district,
         max(case when col = 5 then VALUE end) as households, max(case when col = 6 then VALUE end) as fuel_poor,
         max(case when col = 7 then VALUE end) as proportion, max(SOURCEFILEID) as sf
  from cells where SHEET = 'Table 2' and r > 3 group by 1
),
t4 as (
  select r, max(case when col = 1 then VALUE end) as code, max(case when col = 2 then VALUE end) as name,
         max(case when col = 5 then VALUE end) as region,
         max(case when col = 6 then VALUE end) as households, max(case when col = 7 then VALUE end) as fuel_poor,
         max(case when col = 8 then VALUE end) as proportion, max(SOURCEFILEID) as sf
  from cells where SHEET = 'Table 4' and r > 3 group by 1
),
rows_ as (
  select code, coalesce(nullif(district, ''), nullif(county_or_ua, ''), initcap(region)) as name,
         case when code like 'E92%' then 'country' when code like 'E12%' then 'region'
              when nullif(district, '') is not null then 'district' else 'county_or_unitary' end as area_level,
         households, fuel_poor, proportion, sf
  from t2 where code like 'E%'
  union all
  select code, name, 'lsoa', households, fuel_poor, proportion, sf from t4 where code like 'E01%'
)
select
  (code || '|' || area_level)::varchar as fuel_poverty_key,
  code::varchar as area_code,
  name::varchar as area_name,
  area_level::varchar as area_level,
  (select y from data_year)::number(38,0) as data_year,
  {{ num('households') }}::number(38,0) as households,
  {{ num('fuel_poor') }}::number(38,0) as fuel_poor_households,
  {{ num('proportion', 4) }}::number(10,4) as fuel_poor_percent,
  sf::varchar as source_file_id
from rows_
