-- 16 to 18 results by institution, year and cohort, every figure exactly as
-- published (text): numbers, and the publisher's marks c (withheld), low
-- (too few), x (not available) and z (not applicable) kept apart, so gold
-- can apply the honesty rules (macros/figure.sql). All students
-- (disadvantage status Total), every year and cohort in the latest file.
select
  (r."school_urn" || '|' || r."time_period" || '|' || r."exam_cohort")::varchar as result_key,
  r."school_urn"::varchar as urn,
  r."time_period"::varchar as time_period,
  (left(r."time_period", 4) || '/' || right(r."time_period", 2))::varchar as academic_year,
  r."exam_cohort"::varchar as cohort,
  r."school_name"::varchar as results_name,
  r."end1618_student_count"::varchar as students_published,
  r."aps_per_entry_grade"::varchar as grade_published,
  r."aps_per_entry_student_count"::varchar as grade_base_published,
  r."best_three_alevels_grade"::varchar as best3_grade_published,
  r."best_three_alevels_student_count"::varchar as best3_base_published,
  r."progress_banding"::varchar as progress_published,
  r."value_added"::varchar as value_added_published,
  r."value_added_lower_ci"::varchar as value_added_lower_published,
  r."value_added_upper_ci"::varchar as value_added_upper_published,
  r."retained_percent"::varchar as retained_percent_published,
  r."retained_student_count"::varchar as retained_base_published,
  r.SOURCEFILEID::varchar as source_file_id
from {{ source('options_raw', 'performance_16_18') }} r
where r.SOURCEFILEID = {{ latest_file('performance-16-18', 'PERFORMANCE_16_18_INSTITUTION', 'options') }}
  and r."disadvantage_status" = 'Total'
