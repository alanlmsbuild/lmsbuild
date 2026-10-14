-- UNIVERSITY_COURSE has one row per row of the latest Discover Uni course file.
select silver, bronze from (
  select (select count(*) from {{ ref('university_course') }}) as silver,
         (select count(*) from {{ source('options_raw', 'du_kiscourse') }}
          where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_KISCOURSE', 'options') }}) as bronze
) where silver <> bronze
