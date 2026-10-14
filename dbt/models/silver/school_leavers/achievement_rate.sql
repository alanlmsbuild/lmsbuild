-- Achievement rates for 16 to 18 year olds by provider (UKPRN) and year,
-- as published: education and training (the "Under 19" band, all subject
-- areas) and apprenticeships (started aged 16 to 18, all subjects, levels
-- and standards; each year from the newest publication that has it).
with et as (
  select "provider_ukprn" as ukprn, 'education' as kind, "time_period" as time_period, "provider_type" as provider_type, "provider_name" as provider_name,
         "achievement_rate" as rate_published, "leavers" as leavers_published, SOURCEFILEID
  from {{ source('options_raw', 'achievement_et') }}
  where SOURCEFILEID = {{ latest_file('achievement-et', 'ACHIEVEMENT_ET_PROVIDER_SUMMARY', 'options') }}
    and "age_band" = 'Under 19' and "sector_subject_area_t1" = 'Total'
),
app_files as (
  select SOURCEFILEID, max("time_period") as newest_year from {{ source('options_raw', 'achievement_app') }} group by 1
),
app as (
  select a."provider_ukprn", 'apprenticeships', a."time_period", a."provider_type", a."provider_name", a."achievement_rate", a."leavers", a.SOURCEFILEID
  from {{ source('options_raw', 'achievement_app') }} a
  join app_files f on f.SOURCEFILEID = a.SOURCEFILEID
  where a."ssa_tier_1" = 'Total' and a."level" = 'Total' and a."std_fwk_name_stcode" = 'Total' and a."age_youth_adult" = '16-18' and a."age_group" = 'Total'
  qualify dense_rank() over (partition by a."time_period" order by f.newest_year desc, a.SOURCEFILEID) = 1
),
rows_ as (select * from et union all select * from app)
select
  (ukprn || '|' || kind || '|' || time_period)::varchar as achievement_key,
  ukprn::varchar as ukprn,
  kind::varchar as kind,
  time_period::varchar as time_period,
  (left(time_period, 4) || '/' || right(time_period, 2))::varchar as academic_year,
  provider_type::varchar as provider_type,
  provider_name::varchar as provider_name,
  rate_published::varchar as rate_published,
  leavers_published::varchar as leavers_published,
  SOURCEFILEID::varchar as source_file_id
from rows_
