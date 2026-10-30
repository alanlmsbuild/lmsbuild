-- In the course count each area's level rows add up to its All levels row (for
-- course runs, which are counted once each; courses are counted once per area,
-- so a course with runs at different levels is not expected to add up).
select area_code, runs_by_level, runs_all
from (
  select area_code,
    sum(case when is_all_levels then 0 else course_runs end) as runs_by_level,
    sum(case when is_all_levels then course_runs else 0 end) as runs_all
  from {{ ref('ncs_course_count') }}
  group by area_code
) where runs_by_level <> runs_all
