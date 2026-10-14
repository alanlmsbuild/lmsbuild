-- The schools and colleges with 16 to 18 results (DfE's performance tables,
-- by URN), one row per URN, open or closed, with their latest year's
-- headline results for A levels, applied general and tech levels, and
-- their latest Ofsted inspection. The school leavers app shows those GIAS
-- says are open.
with results as (
  select * from {{ source('options_raw', 'performance_16_18') }}
  where SOURCEFILEID = {{ latest_file('performance-16-18', 'PERFORMANCE_16_18_INSTITUTION', 'options') }}
    and "time_period" = (select max("time_period") from {{ source('options_raw', 'performance_16_18') }}
                         where SOURCEFILEID = {{ latest_file('performance-16-18', 'PERFORMANCE_16_18_INSTITUTION', 'options') }})
    and "disadvantage_status" = 'Total'
),
by_urn as (
  select
    r."school_urn" as urn,
    any_value(r."school_name") as results_name,
    any_value(r."time_period") as time_period,
    max({{ num('r."end1618_student_count"') }}) as students,
  max(case when r."exam_cohort" = 'A level' then {{ txt('r."aps_per_entry_grade"') }} end)::varchar as a_level_grade,
  max(case when r."exam_cohort" = 'A level' then {{ num('r."aps_per_entry"', 2) }} end)::number(6,2) as a_level_points_per_entry,
  max(case when r."exam_cohort" = 'A level' then {{ num('r."aps_per_entry_student_count"') }} end)::number(38,0) as a_level_students,
  max(case when r."exam_cohort" = 'A level' then {{ txt('r."progress_banding"') }} end)::varchar as a_level_progress,
  max(case when r."exam_cohort" = 'A level' then {{ num('r."value_added"', 2) }} end)::number(6,2) as a_level_value_added,
  max(case when r."exam_cohort" = 'A level' then {{ num('r."retained_percent"', 1) }} end)::number(5,1) as a_level_retained_percent,
  max(case when r."exam_cohort" = 'A level' then {{ num('r."retained_student_count"') }} end)::number(38,0) as a_level_retained_students,
  max(case when r."exam_cohort" = 'Applied general' then {{ txt('r."aps_per_entry_grade"') }} end)::varchar as applied_general_grade,
  max(case when r."exam_cohort" = 'Applied general' then {{ num('r."aps_per_entry"', 2) }} end)::number(6,2) as applied_general_points_per_entry,
  max(case when r."exam_cohort" = 'Applied general' then {{ num('r."aps_per_entry_student_count"') }} end)::number(38,0) as applied_general_students,
  max(case when r."exam_cohort" = 'Applied general' then {{ txt('r."progress_banding"') }} end)::varchar as applied_general_progress,
  max(case when r."exam_cohort" = 'Applied general' then {{ num('r."value_added"', 2) }} end)::number(6,2) as applied_general_value_added,
  max(case when r."exam_cohort" = 'Applied general' then {{ num('r."retained_percent"', 1) }} end)::number(5,1) as applied_general_retained_percent,
  max(case when r."exam_cohort" = 'Applied general' then {{ num('r."retained_student_count"') }} end)::number(38,0) as applied_general_retained_students,
  max(case when r."exam_cohort" = 'Tech level' then {{ txt('r."aps_per_entry_grade"') }} end)::varchar as tech_level_grade,
  max(case when r."exam_cohort" = 'Tech level' then {{ num('r."aps_per_entry"', 2) }} end)::number(6,2) as tech_level_points_per_entry,
  max(case when r."exam_cohort" = 'Tech level' then {{ num('r."aps_per_entry_student_count"') }} end)::number(38,0) as tech_level_students,
  max(case when r."exam_cohort" = 'Tech level' then {{ txt('r."progress_banding"') }} end)::varchar as tech_level_progress,
  max(case when r."exam_cohort" = 'Tech level' then {{ num('r."value_added"', 2) }} end)::number(6,2) as tech_level_value_added,
  max(case when r."exam_cohort" = 'Tech level' then {{ num('r."retained_percent"', 1) }} end)::number(5,1) as tech_level_retained_percent,
  max(case when r."exam_cohort" = 'Tech level' then {{ num('r."retained_student_count"') }} end)::number(38,0) as tech_level_retained_students,
    max(case when r."exam_cohort" = 'A level' then {{ txt('r."best_three_alevels_grade"') }} end)::varchar as a_level_best_three_grade
  from results r
  group by 1
),
gias as (
  select * from {{ source('options_raw', 'gias_establishment') }}
  where SOURCEFILEID = {{ latest_file('gias', 'GIAS_ESTABLISHMENT', 'options') }}
),
ofsted_schools as (
  select * from {{ source('options_raw', 'ofsted_schools_most_recent') }}
  where SOURCEFILEID = {{ latest_file('ofsted-schools', 'OFSTED_SCHOOLS_D2_MOST_RECENT', 'options') }}
),
ofsted_fe as (
  select * from {{ source('options_raw', 'ofsted_fe_provider_list') }}
  where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D4_PROVIDER_LIST', 'options') }}
),
ofsted_fe_renewed as (
  select * from {{ source('options_raw', 'ofsted_fe_full_inspections') }}
  where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D1_FULL_INSPECTIONS', 'options') }}
),
-- A college that merged can be under another URN in Ofsted's FE list: then
-- it is found by its UKPRN (as the app does).
fe_match as (
  select b.urn, coalesce(f1."Provider URN", f2."Provider URN") as fe_urn
  from by_urn b
  left join gias g on g."URN" = b.urn
  left join ofsted_fe f1 on f1."Provider URN" = b.urn
  left join ofsted_fe f2 on f1."Provider URN" is null and f2."Provider UKPRN" = nullif(g."UKPRN", '')
)
select
  b.urn::varchar as urn,
  coalesce(nullif(g."UKPRN", ''), nullif(fe."Provider UKPRN", ''))::varchar as ukprn,
  coalesce(g."EstablishmentName", b.results_name)::varchar as name,
  g."EstablishmentStatus (name)"::varchar as gias_status,
  coalesce(g."EstablishmentStatus (name)" like 'Open%', false) as is_open,
  g."TypeOfEstablishment (name)"::varchar as type,
  {{ school_kind('g') }}::varchar as kind,
  coalesce(nullif(g."Town", ''), nullif(g."Locality", ''))::varchar as town,
  nullif(g."Postcode", '')::varchar as postcode,
  {{ website_url('g."SchoolWebsite"') }}::varchar as website_url,
  p.local_authority_code::varchar as local_authority_code,
  p.lsoa21_code::varchar as lsoa21_code,
  (left(b.time_period, 4) || '/' || right(b.time_period, 2))::varchar as results_year,
  b.students::number(38,0) as students,
  b.a_level_grade, b.a_level_points_per_entry, b.a_level_students, b.a_level_progress, b.a_level_value_added, b.a_level_retained_percent, b.a_level_retained_students,
  b.applied_general_grade, b.applied_general_points_per_entry, b.applied_general_students, b.applied_general_progress, b.applied_general_value_added, b.applied_general_retained_percent, b.applied_general_retained_students,
  b.tech_level_grade, b.tech_level_points_per_entry, b.tech_level_students, b.tech_level_progress, b.tech_level_value_added, b.tech_level_retained_percent, b.tech_level_retained_students,
  b.a_level_best_three_grade,
  case when os."URN" is not null then 'schools' when fe."Provider URN" is not null then 'further-education' end::varchar as ofsted_source,
  coalesce({{ dt('os."Inspection start date"', 'DD/MM/YYYY') }}, {{ dt('fr."First day of inspection"', 'DD/MM/YYYY') }}) as ofsted_renewed_inspected,
  coalesce({{ txt('os."Latest OEIF overall effectiveness"') }}, {{ txt('fe."Latest overall effectiveness before renewed EIF"') }})::varchar as ofsted_previous_overall,
  coalesce({{ dt('os."Inspection start date of latest OEIF graded inspection"', 'DD/MM/YYYY') }}, {{ dt('fe."First day of inspection of latest inspection before renewed EIF"', 'DD/MM/YYYY') }}) as ofsted_previous_inspected,
  coalesce({{ txt('os."Web Link (opens in new window) [link address]"') }}, {{ txt('fe."Web link to Ofsted provider webpage (opens in new window) [link address]"') }})::varchar as ofsted_url
from by_urn b
left join gias g on g."URN" = b.urn
left join {{ ref('postcode') }} p on p.postcode_compact = {{ compact_postcode('g."Postcode"') }}
left join ofsted_schools os on os."URN" = b.urn
left join fe_match m on m.urn = b.urn
left join ofsted_fe fe on os."URN" is null and fe."Provider URN" = m.fe_urn
left join ofsted_fe_renewed fr on fe."Provider URN" is not null and fr."Provider URN" = fe."Provider URN"
