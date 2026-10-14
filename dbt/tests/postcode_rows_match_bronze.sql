-- POSTCODE has exactly one row per row of the latest ONSPD file.
select silver, bronze from (
  select (select count(*) from {{ ref('postcode') }}) as silver,
         (select count(*) from {{ source('shared_raw', 'onspd') }} where SOURCEFILEID = {{ latest_file('onspd', 'ONSPD') }}) as bronze
) where silver <> bronze
