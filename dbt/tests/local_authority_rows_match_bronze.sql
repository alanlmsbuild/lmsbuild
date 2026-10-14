-- LOCAL_AUTHORITY has one row per real local authority code among the live
-- postcodes of the latest ONSPD file.
select silver, bronze from (
  select (select count(*) from {{ ref('local_authority') }}) as silver,
         (select count(distinct "lad26cd") from {{ source('shared_raw', 'onspd') }}
          where SOURCEFILEID = {{ latest_file('onspd', 'ONSPD') }}
            and "doterm" = '' and "lad26cd" <> '' and "lad26cd" not like '_99999999') as bronze
) where silver <> bronze
