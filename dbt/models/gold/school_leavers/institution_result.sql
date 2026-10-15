-- The school leavers app's 16 to 18 results, one row per institution, year,
-- cohort and measure, with the honesty rules applied (macros/figure.sql):
-- fewer than 10 hidden, 10 to 29 a small group, the publisher's reasons
-- kept, and each beside the national figure for the same type, cohort and
-- year (national_comparison). Measures: grade, best3 (A levels), progress,
-- value_added (only when shown), retained, and students (cohort "all").
with kinds as ({{ school_kinds() }}),
kept as ({{ school_leavers_kept() }}),
inst as (
  select c.urn, k.grades_type, k.retention_type
  from {{ ref('college_16_18') }} c join kinds k on k.kind = c.kind
  where c.urn in (select urn from kept)
),
perf as (
  select r.*,
    {{ figure_status('r.grade_published', 'r.grade_base_published', true) }} as grade_s,
    {{ figure_status('r.retained_percent_published', 'r.retained_base_published') }} as retained_s,
    {{ figure_status('r.progress_published', 'r.grade_base_published', true) }} as progress_s
  from {{ ref('performance_16_18_result') }} r
  where r.cohort in {{ school_cohorts() }} and r.urn in (select urn from kept)
),
-- A year of a cohort is shown when it has a grade, a retention figure or a
-- progress banding (shown or hidden); otherwise the institution doesn't
-- teach it that year.
years as (select * from perf where coalesce(grade_s, retained_s, progress_s) is not null),
measures as (
  select urn, academic_year, cohort, 'grade' as measure, {{ figure_columns('grade_published', 'grade_base_published', true) }}, null::float as value_low, null::float as value_high, source_file_id from years
  union all
  select urn, academic_year, cohort, 'best3', {{ figure_columns('best3_grade_published', 'best3_base_published', true) }}, null, null, source_file_id from years where cohort = 'A level'
  union all
  select urn, academic_year, cohort, 'progress', {{ figure_columns('progress_published', 'grade_base_published', true) }}, null, null, source_file_id from years
  union all
  select urn, academic_year, cohort, 'value_added', {{ figure_columns('value_added_published', 'grade_base_published') }},
    {{ reading_number('value_added_lower_published') }}, {{ reading_number('value_added_upper_published') }}, source_file_id from years
  union all
  select urn, academic_year, cohort, 'retained', {{ figure_columns('retained_percent_published', 'retained_base_published') }}, null, null, source_file_id from years
  union all
  -- Students who finished 16 to 18 study there: the whole institution's
  -- number, the same on each cohort's row.
  select urn, academic_year, 'all', 'students', {{ figure_columns('students_published', 'students_published') }}, null, null, source_file_id
  from perf qualify row_number() over (partition by urn, academic_year order by cohort) = 1
),
shown as (
  -- value_added appears only when shown (the app's rule); every other
  -- measure appears whenever it applies, shown or hidden.
  select * from measures where status is not null and (measure <> 'value_added' or status = 'shown')
)
select
  (m.urn || '|' || m.academic_year || '|' || m.cohort || '|' || m.measure)::varchar as result_key,
  m.urn::varchar as urn,
  m.academic_year::varchar as academic_year,
  m.cohort::varchar as cohort,
  m.measure::varchar as measure,
  m.status::varchar as status,
  m.value_text::varchar as value_text,
  m.value_number::float as value_number,
  m.base::number(38,0) as base,
  m.small_group::boolean as small_group,
  m.hidden_reason::varchar as hidden_reason,
  case when m.status = 'shown' then m.value_low end::float as value_low,
  case when m.status = 'shown' then m.value_high end::float as value_high,
  case m.measure when 'grade' then n.grade when 'best3' then ng.best3_grade end::varchar as national_value_text,
  case when m.measure = 'retained' and i.retention_type is not null then nr.retained_percent end::float as national_value_number,
  case when m.measure in ('grade', 'best3') then i.grades_type when m.measure = 'retained' then i.retention_type end::varchar as compared_with_type,
  'performance-16-18'::varchar as source,
  m.source_file_id::varchar as source_file_id,
  to_date(sf.ORIGINALMODIFIEDAT) as downloaded_on,
  sf.PUBLISHEDON as published_on
from shown m
join inst i on i.urn = m.urn
{{ source_file_join('sf', 'm.source_file_id') }}
left join {{ ref('national_comparison') }} n on m.measure = 'grade' and n.establishment_type = i.grades_type and n.cohort = m.cohort and n.academic_year = m.academic_year
left join {{ ref('national_comparison') }} ng on m.measure = 'best3' and ng.establishment_type = i.grades_type and ng.cohort = m.cohort and ng.academic_year = m.academic_year
left join {{ ref('national_comparison') }} nr on m.measure = 'retained' and nr.establishment_type = i.retention_type and nr.cohort = m.cohort and nr.academic_year = m.academic_year
