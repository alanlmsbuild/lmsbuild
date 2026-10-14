-- UNIVERSITY_COURSE_OUTCOME has one row per row of the three Discover Uni
-- outcome files (continuation, salary, LEO earnings), every course has rows
-- for all three measures, and a row with no subject (figures for the
-- whole course, or none) is the course's only row for that measure.
with bronze as (
  select (select count(*) from {{ source('options_raw', 'du_continuation') }} where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_CONTINUATION', 'options') }})
       + (select count(*) from {{ source('options_raw', 'du_gosalary') }} where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_GOSALARY', 'options') }})
       + (select count(*) from {{ source('options_raw', 'du_leo3') }} where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_LEO3', 'options') }}) as n
),
per_course as (
  select course_key, measure, count(*) as rows_, count(subject_code) as with_subject
  from {{ ref('university_course_outcome') }} group by 1, 2
)
select 'rows' as check_, (select count(*) from {{ ref('university_course_outcome') }}) as silver, (select n from bronze) as bronze
where (select count(*) from {{ ref('university_course_outcome') }}) <> (select n from bronze)
union all
select 'courses without all three measures', count(*), 0 from (
  select course_key from {{ ref('university_course') }}
  where course_key not in (select course_key from per_course group by 1 having count(distinct measure) = 3)
) having count(*) > 0
union all
select 'a no-subject row beside subject rows', count(*), 0 from per_course where with_subject < rows_ and rows_ > 1 having count(*) > 0
