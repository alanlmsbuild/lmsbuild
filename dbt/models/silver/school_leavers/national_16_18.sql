-- National 16 to 18 figures by institution type, cohort and year (all
-- students), as published: the average grade, best three A levels and
-- number of institutions (attainment), and level 3 retention. What an
-- institution's figures are compared with, like for like (same year, same
-- type, same cohort).
with attainment as (
  select * from {{ source('options_raw', 'national_attainment_16_18') }}
  where SOURCEFILEID = {{ latest_file('ees-national-attainment', 'EES_NATIONAL_ATTAINMENT_16_18', 'options') }}
    and "geographic_level" = 'National' and "sex" = 'All'
),
retention as (
  select * from {{ source('options_raw', 'national_retention_16_18') }}
  where SOURCEFILEID = {{ latest_file('ees-national-retention', 'EES_NATIONAL_RETENTION_16_18', 'options') }}
    and "geographic_level" = 'National' and "sex" = 'All' and "qualification_level" = 'Level 3'
)
select
  (coalesce(a."establishment_type", r."establishment_type") || '|' || coalesce(a."exam_cohort", r."exam_cohort") || '|' || coalesce(a."time_period", r."time_period"))::varchar as national_key,
  coalesce(a."establishment_type", r."establishment_type")::varchar as establishment_type,
  coalesce(a."exam_cohort", r."exam_cohort")::varchar as cohort,
  coalesce(a."time_period", r."time_period")::varchar as time_period,
  (left(coalesce(a."time_period", r."time_period"), 4) || '/' || right(coalesce(a."time_period", r."time_period"), 2))::varchar as academic_year,
  a."aps_per_entry_grade"::varchar as grade_published,
  a."best_three_alevels_grade"::varchar as best3_grade_published,
  a."institution_count"::varchar as institutions_published,
  r."retained_percent"::varchar as retained_percent_published,
  a.SOURCEFILEID::varchar as attainment_source_file_id,
  r.SOURCEFILEID::varchar as retention_source_file_id
from attainment a
full outer join retention r
  on r."establishment_type" = a."establishment_type" and r."exam_cohort" = a."exam_cohort" and r."time_period" = a."time_period"
