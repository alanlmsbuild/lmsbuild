-- SCHOOL has one row per GIAS establishment that is not a college or
-- university, in the latest GIAS file.
select silver, bronze from (
  select (select count(*) from {{ ref('school') }}) as silver,
         (select count(*) from {{ source('options_raw', 'gias_establishment') }}
          where SOURCEFILEID = {{ latest_file('gias', 'GIAS_ESTABLISHMENT', 'options') }}
            and "EstablishmentTypeGroup (name)" not in ('Colleges', 'Universities')) as bronze
) where silver <> bronze
