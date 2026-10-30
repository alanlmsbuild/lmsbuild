-- One silver row per row of the latest NEET file, and the gold table has the
-- total-group rows of ages 16, 17 and 16 to 17 and nothing else.
select what, silver, bronze from (
  select 'neet_participation' as what,
         (select count(*) from {{ ref('neet_participation') }}) as silver,
         (select count(*) from {{ source('shared_raw', 'neet_16_17_by_characteristics') }} where SOURCEFILEID in {{ neet_files() }}) as bronze
  union all
  select 'neet_la_year',
         (select count(*) from {{ ref('neet_la_year') }}),
         (select count(*) from {{ source('shared_raw', 'neet_16_17_by_characteristics') }}
          where SOURCEFILEID in {{ neet_files() }} and "characteristic_grouping" = 'Total' and "characteristic" = 'Total' and "age" in ('16', '17', '16 to 17'))
) where silver <> bronze
