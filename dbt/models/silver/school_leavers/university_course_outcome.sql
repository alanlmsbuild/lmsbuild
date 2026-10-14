-- Discover Uni's outcome figures for each course, one row per course,
-- measure and subject, exactly as HESA splits them: continuation, salary
-- 15 months after finishing (Graduate Outcomes) and earnings 3 years after
-- (LEO). A joint course has a row for each subject HESA gives; each measure
-- has its own split (by subject or subject group, or none: figures for the
-- whole course, or not available), so subjects are never matched across
-- measures.
with cah as (
  select "CAH3_code" as code, max("CAH3_subject") as name
  from {{ source('options_raw', 'leo_grad_cah3_subject') }}
  where SOURCEFILEID = {{ latest_file('leo-grad-cah3-subject', 'LEO_GRAD_CAH3_SUBJECT', 'options') }}
  group by 1
  union all
  select "CAH2_code", max("CAH2_subject")
  from {{ source('options_raw', 'leo_grad_cah3_subject') }}
  where SOURCEFILEID = {{ latest_file('leo-grad-cah3-subject', 'LEO_GRAD_CAH3_SUBJECT', 'options') }}
  group by 1
),
rows_ as (
  select 'continuation' as measure, PUBUKPRN, KISCOURSEID, KISMODE, CONTSBJ as subject, CONTUNAVAILREASON as unavailable_reason,
         CONTAGG as aggregation, CONTAGGYEAR as aggregation_years, CONTPOP as population,
         UCONT as value, null as lower_quartile, null as upper_quartile, SOURCEFILEID
  from {{ source('options_raw', 'du_continuation') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_CONTINUATION', 'options') }}
  union all
  select 'salary_15_months', PUBUKPRN, KISCOURSEID, KISMODE, GOSALSBJ, GOSALUNAVAILREASON,
         GOSALAGG, GOSALAGGYEAR, GOSALPOP, GOINSTMED, GOINSTLQ, GOINSTUQ, SOURCEFILEID
  from {{ source('options_raw', 'du_gosalary') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_GOSALARY', 'options') }}
  union all
  select 'earnings_3_years', PUBUKPRN, KISCOURSEID, KISMODE, LEO3SBJ, LEO3UNAVAILREASON,
         LEO3AGG, LEO3AGGYEAR, LEO3POP, LEO3INSTMED, LEO3INSTLQ, LEO3INSTUQ, SOURCEFILEID
  from {{ source('options_raw', 'du_leo3') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_LEO3', 'options') }}
)
select
  (r.PUBUKPRN || '|' || r.KISCOURSEID || '|' || r.KISMODE || '|' || r.measure || '|' || r.subject)::varchar as outcome_key,
  (r.PUBUKPRN || '|' || r.KISCOURSEID || '|' || r.KISMODE)::varchar as course_key,
  r.measure::varchar as measure,
  nullif(r.subject, '')::varchar as subject_code,
  cah.name::varchar as subject_name,
  {{ txt('r.unavailable_reason') }}::varchar as unavailable_reason,
  {{ txt('r.aggregation') }}::varchar as aggregation,
  {{ txt('r.aggregation_years') }}::varchar as aggregation_years,
  {{ num('r.population') }}::number(38,0) as population,
  {{ num('r.value') }}::number(38,0) as value,
  {{ num('r.lower_quartile') }}::number(38,0) as lower_quartile,
  {{ num('r.upper_quartile') }}::number(38,0) as upper_quartile,
  r.SOURCEFILEID::varchar as source_file_id
from rows_ r
left join cah on cah.code = r.subject
