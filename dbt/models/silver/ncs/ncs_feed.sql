-- Which National Careers Service course directory files silver and gold are
-- built from: the latest courses and providers files in bronze, when they
-- were published (the publication page's date), downloaded and loaded, and the
-- stamp every NCS model stores in built_from (macros/ncs.sql), which also
-- covers the LARS files the course card reads. One row.
{% if var('ncs_scratch', false) %}
select
  'scratch'::varchar as course_file_id,
  'scratch'::varchar as provider_file_id,
  null::date as published_on,
  'https://www.gov.uk/government/publications/national-careers-service-course-directory'::varchar as source_url,
  current_date()::date as downloaded_on,
  current_timestamp()::timestamp_ltz as loaded_at,
  'scratch'::varchar as built_from
{% else %}
with ids as (
  select SOURCEFILEID from {{ ncs_files() }}
  union all
  select SOURCEFILEID from {{ ncs_lars_files() }}
),
stamp as (
  select md5(listagg(SOURCEFILEID, ',') within group (order by SOURCEFILEID)) || '|v1' as built_from from ids
),
c as (
  select * from {{ source('options_raw', 'source_file') }}
  where SOURCEFILEID in {{ ncs_files() }}
)
select
  max(case when TARGETTABLE = 'OPTIONS_DB.RAW.NCS_COURSE' then SOURCEFILEID end)::varchar as course_file_id,
  max(case when TARGETTABLE = 'OPTIONS_DB.RAW.NCS_PROVIDER' then SOURCEFILEID end)::varchar as provider_file_id,
  max(case when TARGETTABLE = 'OPTIONS_DB.RAW.NCS_COURSE' then PUBLISHEDON end)::date as published_on,
  max(case when TARGETTABLE = 'OPTIONS_DB.RAW.NCS_COURSE' then PAGEURL end)::varchar as source_url,
  max(case when TARGETTABLE = 'OPTIONS_DB.RAW.NCS_COURSE' then to_date(ORIGINALMODIFIEDAT) end)::date as downloaded_on,
  max(LOADEDAT)::timestamp_ltz as loaded_at,
  any_value(s.built_from)::varchar as built_from
from c cross join stamp s
{% endif %}
