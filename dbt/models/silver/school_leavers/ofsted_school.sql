-- Ofsted's latest inspections of state-funded schools, one row per URN:
-- the latest under the renewed framework (report cards, from November 2025)
-- and the latest graded one under the original framework, each grade as
-- published ("NULL" and blanks empty; 9 and 0 kept: they mean "not judged").
with o as (
  select * from {{ source('options_raw', 'ofsted_schools_most_recent') }}
  where SOURCEFILEID = {{ latest_file('ofsted-schools', 'OFSTED_SCHOOLS_D2_MOST_RECENT', 'options') }}
)
select
  "URN"::varchar as urn,
  regexp_replace({{ txt('o."Web Link (opens in new window) [link address]"') }}, '^http:', 'https:')::varchar as ofsted_url,
  {{ dt('o."Inspection start date"', 'DD/MM/YYYY') }} as renewed_inspected,
  {{ dt('o."Publication date"', 'DD/MM/YYYY') }} as renewed_published,
  {{ txt('o."Safeguarding standards"') }}::varchar as renewed_safeguarding,
  {{ txt('o."Category of concern"') }}::varchar as renewed_category_of_concern,
  {{ txt('o."Inclusion"') }}::varchar as renewed_inclusion,
  {{ txt('o."Curriculum and teaching"') }}::varchar as renewed_curriculum_and_teaching,
  {{ txt('o."Achievement"') }}::varchar as renewed_achievement,
  {{ txt('o."Attendance and behaviour"') }}::varchar as renewed_attendance_and_behaviour,
  {{ txt('o."Personal development and wellbeing"') }}::varchar as renewed_personal_development_and_wellbeing,
  {{ txt('o."Post-16 provision (where applicable)"') }}::varchar as renewed_post_16_provision,
  {{ txt('o."Leadership and governance"') }}::varchar as renewed_leadership_and_governance,
  {{ dt('o."Inspection start date of latest OEIF graded inspection"', 'DD/MM/YYYY') }} as original_inspected,
  {{ dt('o."Publication date of latest OEIF graded inspection"', 'DD/MM/YYYY') }} as original_published,
  {{ txt('o."Latest OEIF overall effectiveness"') }}::varchar as original_overall,
  {{ txt('o."Latest OEIF quality of education"') }}::varchar as original_quality_of_education,
  {{ txt('o."Latest OEIF behaviour and attitudes"') }}::varchar as original_behaviour_and_attitudes,
  {{ txt('o."Latest OEIF personal development"') }}::varchar as original_personal_development,
  {{ txt('o."Latest OEIF effectiveness of leadership and management"') }}::varchar as original_leadership_and_management,
  {{ txt('o."Latest OEIF sixth form provision (where applicable)"') }}::varchar as original_sixth_form_provision,
  (o."Does the latest OEIF graded inspection relate to the URN of the current school?" <> 'No') as original_same_school,
  o.SOURCEFILEID::varchar as source_file_id
from o
