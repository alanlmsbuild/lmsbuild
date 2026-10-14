-- New online job adverts by place, occupation and period (ONS, from
-- Textkernel; official statistics in development), unpivoted from the
-- spreadsheet: one row per table, area, SOC group and month or quarter.
--   Table 3: ITL1 region (and Total UK), SOC 4-digit unit group, month
--   Table 4: local authority, SOC 3-digit minor group, month
--   Table 5: local authority, SOC 4-digit unit group, quarter
-- The file's local authorities are as of April 2023, except that London's
-- boroughs are given as one area, London (the file's note 2): those rows
-- are geography london, with no local authority. A code not in today's list
-- (E08000016 Barnsley, E08000019 Sheffield) is matched by name, and the
-- code as published is kept. "[x]" (not available) is an empty count with
-- its note.
with cells as (
  select SHEET, to_number(SHEETROW) as r, to_number(SHEETCOLUMN) as c, VALUE
  from {{ source('shared_raw', 'published_cell') }}
  where SOURCEFILEID = {{ latest_file('ons-online-job-adverts', 'PUBLISHED_CELL') }}
    and SHEET in ('Table 3', 'Table 4', 'Table 5') and to_number(SHEETROW) >= 5
),
headers as (select SHEET, c, VALUE as period_label from cells where r = 5),
labels as (
  select SHEET, r,
    max(case when c = 1 then VALUE end) as region,
    max(case when SHEET <> 'Table 3' and c = 2 then VALUE end) as itl2,
    max(case when SHEET <> 'Table 3' and c = 3 then VALUE end) as la_name,
    max(case when (SHEET = 'Table 3' and c = 2) or (SHEET <> 'Table 3' and c = 4) then VALUE end) as soc_code,
    max(case when (SHEET = 'Table 3' and c = 3) or (SHEET <> 'Table 3' and c = 5) then VALUE end) as soc_label,
    nullif(max(case when SHEET <> 'Table 3' and c = 6 then VALUE end), '') as la_code
  from cells where r > 5 and c <= case when SHEET = 'Table 3' then 3 else 6 end
  group by 1, 2
),
vals as (
  select SHEET, r, c, VALUE from cells
  where r > 5 and c > case when SHEET = 'Table 3' then 3 else 6 end
),
la as (select local_authority_code, name from {{ ref('local_authority') }})
select
  (v.SHEET || '|' || coalesce(l.la_code, l.region) || '|' || l.soc_code || '|' || h.period_label)::varchar as labour_demand_key,
  v.SHEET::varchar as source_table,
  case when v.SHEET = 'Table 3' then 'itl1_region' when l.la_code is null then 'london' else 'local_authority' end::varchar as geography,
  coalesce(l.la_name, l.region)::varchar as area_name,
  l.region::varchar as region_name,
  l.itl2::varchar as itl2_name,
  coalesce(cur.local_authority_code, byname.local_authority_code)::varchar as local_authority_code,
  l.la_code::varchar as local_authority_code_published,
  length(l.soc_code)::number(38,0) as soc_digits,
  l.soc_code::varchar as soc_code,
  l.soc_label::varchar as soc_label,
  case when v.SHEET = 'Table 5' then 'quarter' else 'month' end::varchar as period_type,
  case when v.SHEET = 'Table 5'
       then date_from_parts(to_number(left(h.period_label, 4)), (to_number(right(h.period_label, 1)) - 1) * 3 + 1, 1)
       else to_date('01-' || h.period_label, 'DD-MON-YY') end as period_start,
  h.period_label::varchar as period_label,
  {{ num('v.VALUE') }}::number(38,0) as adverts,
  case when try_to_number(v.VALUE) is null then v.VALUE end::varchar as adverts_note
from vals v
join labels l on l.SHEET = v.SHEET and l.r = v.r
join headers h on h.SHEET = v.SHEET and h.c = v.c
left join la cur on cur.local_authority_code = l.la_code
left join la byname on cur.local_authority_code is null and l.la_code is not null and byname.name = l.la_name
