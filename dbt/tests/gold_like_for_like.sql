-- Comparisons are like for like: a result's national figure is the one for
-- its institution's own comparison type (by its kind), the same cohort and
-- the same year, and nothing else.
with kinds as ({{ school_kinds() }}),
r as (
  select r.*, k.grades_type, k.retention_type
  from {{ ref('institution_result') }} r
  join {{ ref('institution_card') }} c on c.urn = r.urn
  join kinds k on k.kind = c.kind
)
select r.result_key, r.measure, r.compared_with_type, r.national_value_text, r.national_value_number
from r
left join {{ ref('national_comparison') }} n
  on n.establishment_type = r.compared_with_type and n.cohort = r.cohort and n.academic_year = r.academic_year
where (r.measure in ('grade', 'best3') and (r.compared_with_type is distinct from r.grades_type
         or not equal_null(r.national_value_text, case r.measure when 'grade' then n.grade else n.best3_grade end)))
   or (r.measure = 'retained' and (r.compared_with_type is distinct from r.retention_type
         or not equal_null(r.national_value_number, case when r.retention_type is not null then n.retained_percent end)))
   or (r.measure not in ('grade', 'best3', 'retained') and (r.national_value_text is not null or r.national_value_number is not null))
