-- What an institution's 16 to 18 figures are compared with, like for like:
-- the national figure for the same DfE institution type, cohort and year.
-- The cohorts the app shows; retention is level 3, to one decimal place.
select
  n.national_key::varchar as national_key,
  n.establishment_type::varchar as establishment_type,
  n.cohort::varchar as cohort,
  n.academic_year::varchar as academic_year,
  case when trim(coalesce(n.grade_published, '')) not in ('', 'z', 'c', 'x', 'low') then trim(n.grade_published) end::varchar as grade,
  case when n.cohort = 'A level' and trim(coalesce(n.best3_grade_published, '')) not in ('', 'z', 'c', 'x', 'low') then trim(n.best3_grade_published) end::varchar as best3_grade,
  {{ reading_number('n.institutions_published') }}::number(38,0) as institutions,
  round({{ reading_number('n.retained_percent_published') }} * 10) / 10 as retained_percent,
  'ees-national-attainment, ees-national-retention'::varchar as source,
  n.attainment_source_file_id::varchar as attainment_source_file_id,
  n.retention_source_file_id::varchar as retention_source_file_id,
  to_date(sf.ORIGINALMODIFIEDAT) as downloaded_on
from {{ ref('national_16_18') }} n
{{ source_file_join('sf', 'n.attainment_source_file_id') }}
where n.cohort in {{ school_cohorts() }}
