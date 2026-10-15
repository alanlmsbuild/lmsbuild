-- University course outcomes as the app may show them, one row per course,
-- measure and subject (UNIVERSITY_COURSE_OUTCOME), with the honesty rules
-- applied (macros/figure.sql): based on fewer than 10, hidden; 10 to 29, a
-- small group. HESA gives no figure where it isn't available (with its
-- reason code): that is shown as hidden, unavailable, never as nothing or
-- zero. Each subject's figures are only ever its own.
with o as (
  select o.*, coalesce(to_varchar(o.value), 'x') as value_published, to_varchar(o.population) as population_published
  from {{ ref('university_course_outcome') }} o
)
select
  o.outcome_key::varchar as outcome_key,
  o.course_key::varchar as course_key,
  o.measure::varchar as measure,
  o.subject_code::varchar as subject_code,
  o.subject_name::varchar as subject_name,
  {{ figure_columns('o.value_published', 'o.population_published') }},
  case when o.measure <> 'continuation' and o.value is not null and o.population >= {{ var('honesty_hide_below') }} then o.lower_quartile end::float as lower_quartile,
  case when o.measure <> 'continuation' and o.value is not null and o.population >= {{ var('honesty_hide_below') }} then o.upper_quartile end::float as upper_quartile,
  o.unavailable_reason::varchar as hesa_unavailable_reason,
  o.aggregation_years::varchar as aggregation_years,
  'discover-uni'::varchar as source,
  o.source_file_id::varchar as source_file_id,
  to_date(sf.ORIGINALMODIFIEDAT) as downloaded_on,
  sf.PUBLISHEDON as published_on
from o
{{ source_file_join('sf', 'o.source_file_id') }}
