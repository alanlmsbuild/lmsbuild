-- The NCS silver tables have one row per row of the latest course and provider
-- files, and the course card one per course run.
select table_name, silver, bronze from (
  select 'ncs_course' as table_name,
         (select count(*) from {{ ref('ncs_course') }}) as silver,
         (select count(*) from {{ ncs_raw('ncs_course') }} where SOURCEFILEID in {{ ncs_files() }}) as bronze
  union all
  select 'ncs_provider',
         (select count(*) from {{ ref('ncs_provider') }}),
         (select count(distinct trim(PROVIDER_UKPRN)) from {{ ncs_raw('ncs_provider') }} where SOURCEFILEID in {{ ncs_files() }})
  union all
  select 'ncs_course_card',
         (select count(*) from {{ ref('ncs_course_card') }}),
         (select count(*) from {{ ref('ncs_course') }})
) where silver <> bronze
