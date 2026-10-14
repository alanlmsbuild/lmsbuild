-- Ofsted's further education and skills providers, one row per provider URN:
-- its full inspection under the renewed framework this year (if any) and its
-- latest inspection before it, each grade as published ("-" and blanks
-- empty).
with d4 as (
  select * from {{ source('options_raw', 'ofsted_fe_provider_list') }}
  where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D4_PROVIDER_LIST', 'options') }}
),
d1 as (
  select * from {{ source('options_raw', 'ofsted_fe_full_inspections') }}
  where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D1_FULL_INSPECTIONS', 'options') }}
)
select
  d4."Provider URN"::varchar as provider_urn,
  {{ txt('d4."Provider UKPRN"') }}::varchar as ukprn,
  d4."Provider name"::varchar as provider_name,
  regexp_replace(coalesce({{ txt('d1."Web link to Ofsted provider webpage (opens in new window) [link address]"') }},
                          {{ txt('d4."Web link to Ofsted provider webpage (opens in new window) [link address]"') }}), '^http:', 'https:')::varchar as ofsted_url,
  {{ dt('d1."First day of inspection"', 'DD/MM/YYYY') }} as renewed_inspected,
  {{ dt('d1."Date published"', 'DD/MM/YYYY') }} as renewed_published,
  {{ txt('d1."Safeguarding standards"') }}::varchar as renewed_safeguarding,
  {{ txt('d1."Inclusion"') }}::varchar as renewed_inclusion,
  {{ txt('d1."Leadership and governance"') }}::varchar as renewed_leadership_and_governance,
  {{ txt('d1."Education programmes for young people - curriculum, teaching and training"') }}::varchar as renewed_young_people_curriculum,
  {{ txt('d1."Education programmes for young people - achievement"') }}::varchar as renewed_young_people_achievement,
  {{ txt('d1."Education programmes for young people - participation and development"') }}::varchar as renewed_young_people_participation,
  {{ txt('d1."Apprenticeships - curriculum, teaching and training"') }}::varchar as renewed_apprenticeships_curriculum,
  {{ txt('d1."Apprenticeships - achievement"') }}::varchar as renewed_apprenticeships_achievement,
  {{ txt('d1."Apprenticeships - participation and development"') }}::varchar as renewed_apprenticeships_participation,
  {{ txt('d1."Provision for learners and apprentices with high needs - curriculum, teaching and training"') }}::varchar as renewed_high_needs_curriculum,
  {{ txt('d1."Contribution to meeting skills needs"') }}::varchar as renewed_skills_needs,
  {{ dt('d4."First day of inspection of latest inspection before renewed EIF"', 'DD/MM/YYYY') }} as original_inspected,
  {{ txt('d4."Latest overall effectiveness before renewed EIF"') }}::varchar as original_overall,
  {{ txt('d4."Latest quality of education before renewed EIF"') }}::varchar as original_quality_of_education,
  {{ txt('d4."Latest behaviour and attitudes before renewed EIF"') }}::varchar as original_behaviour_and_attitudes,
  {{ txt('d4."Latest personal development before renewed EIF"') }}::varchar as original_personal_development,
  {{ txt('d4."Latest leadership and management before renewed EIF"') }}::varchar as original_leadership_and_management,
  d4.SOURCEFILEID::varchar as source_file_id
from d4
left join d1 on d1."Provider URN" = d4."Provider URN"
