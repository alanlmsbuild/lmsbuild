-- COLLEGE_16_18 has one row per URN in the latest year of the 16 to 18
-- results, and every one is in GIAS.
with f as (select {{ latest_file('performance-16-18', 'PERFORMANCE_16_18_INSTITUTION', 'options') }} as id)
select silver, bronze, in_gias from (
  select (select count(*) from {{ ref('college_16_18') }}) as silver,
         (select count(distinct "school_urn") from {{ source('options_raw', 'performance_16_18') }}
          where SOURCEFILEID = (select id from f)
            and "time_period" = (select max("time_period") from {{ source('options_raw', 'performance_16_18') }} where SOURCEFILEID = (select id from f))) as bronze,
         (select count(*) from {{ ref('college_16_18') }} where gias_status is not null) as in_gias
) where silver <> bronze or in_gias <> bronze
