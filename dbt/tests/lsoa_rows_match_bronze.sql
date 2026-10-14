-- LSOA has one row per 2021 LSOA in AREA_LOOKUP; as many with a population
-- as Nomis has LSOAs in its latest year; as many with deprivation as the
-- IoD 2025 file has rows.
with s as (
  select count(*) as rows_, count(population) as with_population, count(imd_rank) as with_imd from {{ ref('lsoa') }}
), b as (
  select (select count(*) from {{ ref('area_lookup') }} where area_type = 'lsoa21') as rows_,
         (select count(distinct GEOGRAPHY_CODE) from {{ source('shared_raw', 'nomis_population_lsoa') }}
          where SOURCEFILEID = {{ latest_file('nomis-nm-2014-1', 'NOMIS_POPULATION_LSOA') }}
            and DATE_NAME = (select max(DATE_NAME) from {{ source('shared_raw', 'nomis_population_lsoa') }} where SOURCEFILEID = {{ latest_file('nomis-nm-2014-1', 'NOMIS_POPULATION_LSOA') }})) as with_population,
         (select count(*) from {{ source('shared_raw', 'iod2025_lsoa') }} where SOURCEFILEID = {{ latest_file('iod-2025', 'IOD2025_LSOA') }}) as with_imd
)
select s.*, b.rows_ as bronze_rows, b.with_population as bronze_population, b.with_imd as bronze_imd
from s, b
where s.rows_ <> b.rows_ or s.with_population <> b.with_population or s.with_imd <> b.with_imd
