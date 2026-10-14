-- Every school in Get Information about Schools, open or closed (every
-- establishment except colleges and universities, which are in
-- COLLEGE_16_18 and PROVIDER), one row per URN, with its place (by
-- postcode), its latest Ofsted inspection and its latest key stage 4 results.
with gias as (
  select * from {{ source('options_raw', 'gias_establishment') }}
  where SOURCEFILEID = {{ latest_file('gias', 'GIAS_ESTABLISHMENT', 'options') }}
    and "EstablishmentTypeGroup (name)" not in ('Colleges', 'Universities')
),
ofsted as (
  select * from {{ source('options_raw', 'ofsted_schools_most_recent') }}
  where SOURCEFILEID = {{ latest_file('ofsted-schools', 'OFSTED_SCHOOLS_D2_MOST_RECENT', 'options') }}
),
ks4 as (
  select * from {{ source('options_raw', 'ks4_performance_school') }}
  where SOURCEFILEID = {{ latest_file('ks4-performance-school', 'KS4_PERFORMANCE_SCHOOL', 'options') }}
    and "breakdown_topic" = 'Total'
  qualify row_number() over (partition by "school_urn" order by "time_period" desc) = 1
)
select
  g."URN"::varchar as urn,
  nullif(g."UKPRN", '')::varchar as ukprn,
  (g."LA (code)" || nullif(g."EstablishmentNumber", ''))::varchar as laestab,
  g."EstablishmentName"::varchar as name,
  g."EstablishmentStatus (name)"::varchar as status,
  (g."EstablishmentStatus (name)" like 'Open%') as is_open,
  g."TypeOfEstablishment (name)"::varchar as type,
  g."EstablishmentTypeGroup (name)"::varchar as type_group,
  {{ school_kind('g') }}::varchar as kind,
  {{ txt('g."PhaseOfEducation (name)"') }}::varchar as phase,
  {{ num('g."StatutoryLowAge"') }}::number(38,0) as statutory_low_age,
  {{ num('g."StatutoryHighAge"') }}::number(38,0) as statutory_high_age,
  case g."OfficialSixthForm (name)" when 'Has a sixth form' then true when 'Does not have a sixth form' then false end as has_sixth_form,
  case when g."Gender (name)" in ('', 'Not applicable') then null else g."Gender (name)" end::varchar as gender,
  case when g."ReligiousCharacter (name)" in ('', 'Does not apply', 'None') then null else g."ReligiousCharacter (name)" end::varchar as religious_character,
  case when g."AdmissionsPolicy (name)" in ('', 'Not applicable') then null else g."AdmissionsPolicy (name)" end::varchar as admissions_policy,
  {{ num('g."NumberOfPupils"') }}::number(38,0) as pupils,
  {{ num('g."SchoolCapacity"') }}::number(38,0) as capacity,
  {{ num('g."PercentageFSM"', 1) }}::number(5,1) as percentage_fsm,
  {{ dt('g."OpenDate"', 'DD-MM-YYYY') }} as opened,
  {{ dt('g."CloseDate"', 'DD-MM-YYYY') }} as closed,
  nullif(g."Trusts (name)", '')::varchar as trust_name,
  case when g."SchoolWebsite" = '' then null when g."SchoolWebsite" ilike 'http%' then g."SchoolWebsite" else 'https://' || g."SchoolWebsite" end::varchar as website,
  coalesce(nullif(g."Town", ''), nullif(g."Locality", ''))::varchar as town,
  nullif(g."Postcode", '')::varchar as postcode,
  p.postcode::varchar as matched_postcode,
  p.local_authority_code::varchar as local_authority_code,
  p.lsoa21_code::varchar as lsoa21_code,
  nullif(g."LA (name)", '')::varchar as gias_la_name,
  nullif(g."Country (name)", '')::varchar as gias_country,
  case when {{ dt('o."Inspection start date"', 'DD/MM/YYYY') }} is not null then 'renewed'
       when {{ dt('o."Inspection start date of latest OEIF graded inspection"', 'DD/MM/YYYY') }} is not null then 'original' end::varchar as ofsted_framework,
  coalesce({{ dt('o."Inspection start date"', 'DD/MM/YYYY') }}, {{ dt('o."Inspection start date of latest OEIF graded inspection"', 'DD/MM/YYYY') }}) as ofsted_inspected,
  {{ txt('o."Latest OEIF overall effectiveness"') }}::varchar as ofsted_oeif_overall,
  {{ dt('o."Inspection start date of latest OEIF graded inspection"', 'DD/MM/YYYY') }} as ofsted_oeif_inspected,
  {{ txt('o."Achievement"') }}::varchar as ofsted_achievement,
  {{ txt('o."Category of concern"') }}::varchar as ofsted_category_of_concern,
  {{ txt('o."Web Link (opens in new window) [link address]"') }}::varchar as ofsted_url,
  (left(k."time_period", 4) || '/' || right(k."time_period", 2))::varchar as ks4_year,
  {{ num('k."pupil_count"') }}::number(38,0) as ks4_pupils,
  {{ num('k."attainment8_average"', 1) }}::number(5,1) as attainment8,
  {{ num('k."progress8_average"', 2) }}::number(5,2) as progress8,
  {{ num('k."progress8_lower_95_ci"', 2) }}::number(5,2) as progress8_lower_ci,
  {{ num('k."progress8_upper_95_ci"', 2) }}::number(5,2) as progress8_upper_ci,
  {{ num('k."engmath_95_percent"', 1) }}::number(5,1) as english_maths_grade5_percent,
  g.SOURCEFILEID::varchar as source_file_id
from gias g
left join {{ ref('postcode') }} p on p.postcode_compact = {{ compact_postcode('g."Postcode"') }}
left join ofsted o on o."URN" = g."URN"
left join ks4 k on k."school_urn" = g."URN"
