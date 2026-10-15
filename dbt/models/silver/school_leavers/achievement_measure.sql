-- Achievement rates by provider (UKPRN) and nationally by provider type,
-- from the same releases (academic year 2025/26: 2022/23 to 2024/25), so a
-- provider's rate and the national rate for its type compare like for
-- like. All subject areas and standards together; each breakdown the
-- files give:
--   apprenticeships: level (all, intermediate, advanced, higher) and age
--     (all, 16-18, 19+, 19-23, 24+);
--   education and training: provision type (all, education and training
--     not counting tailored or community learning, community learning,
--     tailored learning) and age (all, under 19, 19+); regulated and
--     non-regulated together, with GCSEs.
-- As published: the rate and leavers are text (a number, or DfE's mark).
with app_files as (
  select SOURCEFILEID, max("time_period") as newest_year
  from {{ source('options_raw', 'achievement_app') }} group by 1
),
app_provider as (
  select 'Provider' as geographic_level, a."provider_ukprn" as ukprn, a."provider_name" as provider_name, a."provider_type" as provider_type,
         'apprenticeships' as kind, a."time_period" as time_period, 'Apprenticeships' as provision_type, a."level" as level,
         a."age_youth_adult" as age_youth_adult, a."age_group" as age_group, a."leavers" as leavers_published, a."achievers" as achievers_published,
         a."achievement_rate" as rate_published, a.SOURCEFILEID
  from {{ source('options_raw', 'achievement_app') }} a
  where a.SOURCEFILEID = (select SOURCEFILEID from app_files qualify row_number() over (order by newest_year desc, SOURCEFILEID) = 1)
    and a."ssa_tier_1" = 'Total' and a."std_fwk_name_stcode" = 'Total'
),
app_national as (
  select 'National', null, null, n."provider_type", 'apprenticeships', n."time_period", 'Apprenticeships', n."level",
         n."age_youth_adult", n."age_group", n."leavers", n."achievers", n."achievement_rate", n.SOURCEFILEID
  from {{ source('options_raw', 'achievement_app_national') }} n
  where n.SOURCEFILEID = {{ latest_file('achievement-app-national', 'ACHIEVEMENT_APP_NATIONAL', 'options') }}
    and n."ssa_tier_1" = 'Total'
),
et_provider as (
  select 'Provider', e."provider_ukprn", e."provider_name", e."provider_type", 'education', e."time_period", e."provision_type", 'Total',
         e."age_band", null, e."leavers", e."achievers", e."achievement_rate", e.SOURCEFILEID
  from {{ source('options_raw', 'achievement_et_provider') }} e
  where e.SOURCEFILEID = {{ latest_file('achievement-et-provider', 'ACHIEVEMENT_ET_PROVIDER', 'options') }}
    and e."sector_subject_area_t1" = 'Total' and e."regulated_qualification" = 'Total'
),
et_national as (
  select 'National', null, null, n."provider_type", 'education', n."time_period", n."provision_type", 'Total',
         n."age_band", null, n."leavers", n."achievers", n."achievement_rate", n.SOURCEFILEID
  from {{ source('options_raw', 'achievement_et_national') }} n
  where n.SOURCEFILEID = {{ latest_file('achievement-et-national', 'ACHIEVEMENT_ET_NATIONAL', 'options') }}
    and n."sector_subject_area_t1" = 'Total' and n."regulated_qualification" = 'Total'
),
all_rows as (
  select * from app_provider union all select * from app_national
  union all select * from et_provider union all select * from et_national
),
shaped as (
  select r.*,
    case
      when kind = 'education' then case age_youth_adult when 'Total' then 'all' when 'Under 19' then 'under 19' when 'Adult' then '19+' end
      when age_youth_adult = 'Total' and age_group = 'Total' then 'all'
      when age_youth_adult = '16-18' and age_group = 'Total' then '16-18'
      when age_youth_adult = '19+' and age_group = 'Total' then '19+'
      when age_youth_adult = '19+' then age_group
    end as age
  from all_rows r
)
select
  (geographic_level || '|' || coalesce(ukprn, provider_type) || '|' || kind || '|' || time_period || '|' || provision_type || '|' || level || '|' || age)::varchar as measure_key,
  lower(geographic_level)::varchar as geographic_level,
  ukprn::varchar as ukprn,
  provider_name::varchar as provider_name,
  provider_type::varchar as provider_type,
  kind::varchar as kind,
  time_period::varchar as time_period,
  (left(time_period, 4) || '/' || right(time_period, 2))::varchar as academic_year,
  provision_type::varchar as provision_type,
  level::varchar as level,
  age::varchar as age,
  rate_published::varchar as rate_published,
  leavers_published::varchar as leavers_published,
  achievers_published::varchar as achievers_published,
  SOURCEFILEID::varchar as source_file_id
from shaped
-- The apprenticeship file repeats 16-18 as 16-18 within 16-18: kept once.
where age is not null
