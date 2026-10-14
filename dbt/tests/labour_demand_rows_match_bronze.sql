-- LABOUR_DEMAND has one row per count cell of Tables 3, 4 and 5 (below the
-- header row, right of the label columns).
select silver, bronze from (
  select (select count(*) from {{ ref('labour_demand') }}) as silver,
         (select count(*) from {{ source('shared_raw', 'published_cell') }}
          where SOURCEFILEID = {{ latest_file('ons-online-job-adverts', 'PUBLISHED_CELL') }}
            and SHEET in ('Table 3', 'Table 4', 'Table 5') and to_number(SHEETROW) > 5
            and to_number(SHEETCOLUMN) > case when SHEET = 'Table 3' then 3 else 6 end) as bronze
) where silver <> bronze
