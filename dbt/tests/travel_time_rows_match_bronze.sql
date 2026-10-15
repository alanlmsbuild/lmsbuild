-- travel_time_lsoa has exactly the rows of the latest run in bronze.
select silver, bronze from (
  select (select count(*) from {{ ref('travel_time_lsoa') }}) as silver,
         (select count(*) from {{ source('shared_raw', 'travel_time_lsoa_run') }}
          where SOURCEFILEID = {{ latest_file('rarebit-travel-time', 'TRAVEL_TIME_LSOA_RUN') }}) as bronze
) where silver <> bronze
