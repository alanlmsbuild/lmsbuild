-- The live courses in the National Careers Service course directory, one row
-- per course run at a venue (COURSE_RUN_ID). Codes are decoded with the
-- publication's code tables; a code they do not define is kept as published
-- with no label. Where the learning aim reference is in LARS the aim's title,
-- level, sector subject area and awarding body are alongside. Contact details
-- and free text were left out before loading. Built only when a newer
-- directory or LARS file has been loaded (ncs_reusable, dbt/macros/ncs.sql).
{% set reuse = ncs_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with c as (
  select * from {{ ncs_raw('ncs_course') }}
  where SOURCEFILEID in {{ ncs_files() }}
),
aim as (
  select
    upper(trim("LearnAimRef")) as aim_ref,
    {{ txt('"LearnAimRefTitle"') }} as aim_title,
    {{ txt('"NotionalNVQLevelv2"') }} as level_code,
    {{ txt('"SectorSubjectAreaTier2"') }} as ssa_code,
    {{ txt('"AwardOrgCode"') }} as award_org_code
  from {{ source('shared_raw', 'lars_learningdelivery') }}
  where SOURCEFILEID = {{ latest_file('lars', 'LARS_LEARNINGDELIVERY') }}
),
lvl as (
  select "NotionalNVQLevelV2" as code, "NotionalNVQLevelV2Desc" as description
  from {{ source('shared_raw', 'lars_notionalnvqlevelv2') }}
  where SOURCEFILEID = {{ latest_file('lars', 'LARS_NOTIONALNVQLEVELV2') }}
  qualify row_number() over (partition by "NotionalNVQLevelV2" order by "EffectiveFrom" desc) = 1
),
ssa as (
  select "SectorSubjectAreaTier2" as code, "SectorSubjectAreaTier2Desc" as description
  from {{ source('shared_raw', 'lars_sectorsubjectareatier2') }}
  where SOURCEFILEID = {{ latest_file('lars', 'LARS_SECTORSUBJECTAREATIER2') }}
  qualify row_number() over (partition by "SectorSubjectAreaTier2" order by "EffectiveFrom" desc) = 1
),
org as (
  select "AwardOrgCode" as code, "AwardOrgName" as name
  from {{ source('shared_raw', 'lars_awardorgcode') }}
  where SOURCEFILEID = {{ latest_file('lars', 'LARS_AWARDORGCODE') }}
  qualify row_number() over (partition by "AwardOrgCode" order by "EffectiveFrom" desc) = 1
)
select
  trim(c.COURSE_RUN_ID)::varchar as course_run_id,
  trim(c.COURSE_ID)::varchar as course_id,
  trim(c.PROVIDER_UKPRN)::varchar as provider_ukprn,
  {{ txt('c.LEARN_AIM_REF') }}::varchar as learn_aim_ref,
  {{ txt('c.COURSE_NAME') }}::varchar as course_name,
  {{ ncs_delivery_mode('trim(c.DELIVER_MODE)') }}::varchar as delivery_mode,
  {{ ncs_study_mode('trim(c.STUDY_MODE)') }}::varchar as study_mode,
  {{ ncs_attendance_pattern('trim(c.ATTENDANCE_PATTERN)') }}::varchar as attendance_pattern,
  (upper(trim(c.FLEXIBLE_STARTDATE)) = 'TRUE')::boolean as has_flexible_start,
  {{ dt('c.STARTDATE', 'DD/MM/YYYY') }}::date as start_date,
  try_to_number(trim(c.DURATION_VALUE), 10, 0)::number(10,0) as duration_value,
  {{ ncs_duration_unit('trim(c.DURATION_UNIT)') }}::varchar as duration_unit,
  try_to_number(trim(c.COST), 12, 2)::number(12,2) as cost,
  (upper(trim(c.NATIONAL)) = 'TRUE')::boolean as is_national,
  {{ txt('c.REGIONS') }}::varchar as regions,
  {{ txt('c.LOCATION_NAME') }}::varchar as venue_name,
  {{ txt('c.LOCATION_TOWN') }}::varchar as venue_town,
  {{ txt('c.LOCATION_COUNTY') }}::varchar as venue_county,
  upper({{ txt('c.LOCATION_POSTCODE') }})::varchar as venue_postcode,
  replace(upper({{ txt('c.LOCATION_POSTCODE') }}), ' ', '')::varchar as venue_postcode_compact,
  try_to_double(trim(c.LOCATION_LATITUDE))::float as venue_latitude,
  try_to_double(trim(c.LOCATION_LONGITUDE))::float as venue_longitude,
  {{ txt('c.LOCATION_WEBSITE') }}::varchar as venue_website,
  {{ txt('c.COURSE_URL') }}::varchar as course_url,
  {{ dt('c.UPDATED_DATE', 'DD/MM/YYYY') }}::date as updated_on,
  {{ txt('c.COURSE_TYPE') }}::varchar as course_type_code,
  {{ ncs_course_type('trim(c.COURSE_TYPE)') }}::varchar as course_type,
  {{ txt('c.SECTOR') }}::varchar as sector,
  {{ txt('c.EDUCATION_LEVEL') }}::varchar as education_level_code,
  {{ txt('c.AWARDING_BODY') }}::varchar as awarding_body,
  (a.aim_ref is not null)::boolean as lars_matched,
  a.aim_title::varchar as lars_title,
  lvl.description::varchar as lars_level,
  ssa.description::varchar as lars_subject_area,
  org.name::varchar as lars_awarding_body,
  {{ ncs_stamp() }}::varchar as built_from
from c
left join aim a on a.aim_ref = upper(trim(c.LEARN_AIM_REF))
left join lvl on lvl.code = a.level_code
left join ssa on ssa.code = a.ssa_code
left join org on org.code = a.award_org_code
{% endif %}
