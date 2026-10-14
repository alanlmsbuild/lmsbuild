-- The school leavers app's institutions, one row per URN: every one in the
-- 16 to 18 results that GIAS says is open and has results to show (the
-- app's rule). What its page shows about the place: name, kind, where it
-- is, its website (empty while the link check hides it), and its latest
-- Ofsted inspections in the app's own shape (renewed report card and
-- original grades, never converted into each other). From the schools
-- list by URN, else the further education list by URN, else by UKPRN (a
-- college that merged).
with kinds as ({{ school_kinds() }}),
kept as ({{ school_leavers_kept() }}),
c as (select * from {{ ref('college_16_18') }} where urn in (select urn from kept)),
os as (select * from {{ ref('ofsted_school') }}),
fe as (select * from {{ ref('ofsted_fe_provider') }}),
fe_match as (
  select c.urn, coalesce(f1.provider_urn, f2.provider_urn) as provider_urn
  from c
  left join fe f1 on f1.provider_urn = c.urn
  left join fe f2 on f1.provider_urn is null and f2.ukprn = c.ukprn
),
ofsted as (
  select c.urn,
    case when os.urn is not null then 'ofstedSchools' when fe.provider_urn is not null then 'ofstedFE' end as ofsted_from,
    case when os.urn is not null then os.ofsted_url else fe.ofsted_url end as ofsted_url,
    case
      when os.urn is not null and os.renewed_inspected is not null then object_construct(
        'framework', 'renewed', 'inspected', to_varchar(os.renewed_inspected, 'YYYY-MM-DD'), 'published', to_varchar(os.renewed_published, 'YYYY-MM-DD'),
        'safeguarding', os.renewed_safeguarding,
        'areas', array_construct_compact(
      case when os.renewed_inclusion is not null and os.renewed_inclusion not in ('Not applicable') then array_construct('Inclusion', os.renewed_inclusion) end,
      case when os.renewed_curriculum_and_teaching is not null and os.renewed_curriculum_and_teaching not in ('Not applicable') then array_construct('Curriculum and teaching', os.renewed_curriculum_and_teaching) end,
      case when os.renewed_achievement is not null and os.renewed_achievement not in ('Not applicable') then array_construct('Achievement', os.renewed_achievement) end,
      case when os.renewed_attendance_and_behaviour is not null and os.renewed_attendance_and_behaviour not in ('Not applicable') then array_construct('Attendance and behaviour', os.renewed_attendance_and_behaviour) end,
      case when os.renewed_personal_development_and_wellbeing is not null and os.renewed_personal_development_and_wellbeing not in ('Not applicable') then array_construct('Personal development and wellbeing', os.renewed_personal_development_and_wellbeing) end,
      case when os.renewed_post_16_provision is not null and os.renewed_post_16_provision not in ('Not applicable') then array_construct('Post-16 provision', os.renewed_post_16_provision) end,
      case when os.renewed_leadership_and_governance is not null and os.renewed_leadership_and_governance not in ('Not applicable') then array_construct('Leadership and governance', os.renewed_leadership_and_governance) end),
        'concern', os.renewed_category_of_concern)
      when os.urn is null and fe.renewed_inspected is not null then object_construct(
        'framework', 'renewed', 'inspected', to_varchar(fe.renewed_inspected, 'YYYY-MM-DD'), 'published', to_varchar(fe.renewed_published, 'YYYY-MM-DD'),
        'safeguarding', fe.renewed_safeguarding,
        'areas', array_construct_compact(
      case when fe.renewed_inclusion is not null and fe.renewed_inclusion not in ('Not applicable') then array_construct('Inclusion', fe.renewed_inclusion) end,
      case when fe.renewed_leadership_and_governance is not null and fe.renewed_leadership_and_governance not in ('Not applicable') then array_construct('Leadership and governance', fe.renewed_leadership_and_governance) end,
      case when fe.renewed_young_people_curriculum is not null and fe.renewed_young_people_curriculum not in ('Not applicable') then array_construct('Education programmes for young people - curriculum, teaching and training', fe.renewed_young_people_curriculum) end,
      case when fe.renewed_young_people_achievement is not null and fe.renewed_young_people_achievement not in ('Not applicable') then array_construct('Education programmes for young people - achievement', fe.renewed_young_people_achievement) end,
      case when fe.renewed_young_people_participation is not null and fe.renewed_young_people_participation not in ('Not applicable') then array_construct('Education programmes for young people - participation and development', fe.renewed_young_people_participation) end,
      case when fe.renewed_apprenticeships_curriculum is not null and fe.renewed_apprenticeships_curriculum not in ('Not applicable') then array_construct('Apprenticeships - curriculum, teaching and training', fe.renewed_apprenticeships_curriculum) end,
      case when fe.renewed_apprenticeships_achievement is not null and fe.renewed_apprenticeships_achievement not in ('Not applicable') then array_construct('Apprenticeships - achievement', fe.renewed_apprenticeships_achievement) end,
      case when fe.renewed_apprenticeships_participation is not null and fe.renewed_apprenticeships_participation not in ('Not applicable') then array_construct('Apprenticeships - participation and development', fe.renewed_apprenticeships_participation) end,
      case when fe.renewed_high_needs_curriculum is not null and fe.renewed_high_needs_curriculum not in ('Not applicable') then array_construct('Provision for learners and apprentices with high needs - curriculum, teaching and training', fe.renewed_high_needs_curriculum) end,
      case when fe.renewed_skills_needs is not null and fe.renewed_skills_needs not in ('Not applicable') then array_construct('Contribution to meeting skills needs', fe.renewed_skills_needs) end))
    end as ofsted_renewed,
    case
      when os.urn is not null and os.original_inspected is not null then object_construct(
        'framework', 'original', 'inspected', to_varchar(os.original_inspected, 'YYYY-MM-DD'), 'published', to_varchar(os.original_published, 'YYYY-MM-DD'),
        'overall', os.original_overall,
        'areas', array_construct_compact(
      case when os.original_quality_of_education is not null and os.original_quality_of_education not in ('9', '0') then array_construct('Quality of education', os.original_quality_of_education) end,
      case when os.original_behaviour_and_attitudes is not null and os.original_behaviour_and_attitudes not in ('9', '0') then array_construct('Behaviour and attitudes', os.original_behaviour_and_attitudes) end,
      case when os.original_personal_development is not null and os.original_personal_development not in ('9', '0') then array_construct('Personal development', os.original_personal_development) end,
      case when os.original_leadership_and_management is not null and os.original_leadership_and_management not in ('9', '0') then array_construct('Leadership and management', os.original_leadership_and_management) end,
      case when os.original_sixth_form_provision is not null and os.original_sixth_form_provision not in ('9', '0') then array_construct('Sixth form provision', os.original_sixth_form_provision) end),
        'sameSchool', os.original_same_school)
      when os.urn is null and fe.original_inspected is not null then object_construct(
        'framework', 'original', 'inspected', to_varchar(fe.original_inspected, 'YYYY-MM-DD'), 'overall', fe.original_overall,
        'areas', array_construct_compact(
      case when fe.original_quality_of_education is not null then array_construct('Quality of education', fe.original_quality_of_education) end,
      case when fe.original_behaviour_and_attitudes is not null then array_construct('Behaviour and attitudes', fe.original_behaviour_and_attitudes) end,
      case when fe.original_personal_development is not null then array_construct('Personal development', fe.original_personal_development) end,
      case when fe.original_leadership_and_management is not null then array_construct('Leadership and management', fe.original_leadership_and_management) end),
        'sameSchool', true)
    end as ofsted_original,
    coalesce(os.source_file_id, fe.source_file_id) as ofsted_source_file_id
  from c
  left join os on os.urn = c.urn
  left join fe_match m on m.urn = c.urn
  left join fe on os.urn is null and fe.provider_urn = m.provider_urn
)
select
  c.urn::varchar as urn,
  c.ukprn::varchar as ukprn,
  c.name::varchar as name,
  c.kind::varchar as kind,
  k.label::varchar as kind_label,
  k.group_name::varchar as compared_with,
  c.town::varchar as town,
  c.postcode::varchar as postcode,
  c.gias_la_name::varchar as local_authority_name,
  c.gias_region::varchar as region_name,
  c.local_authority_code::varchar as local_authority_code,
  case when not c.website_link_hidden then c.website_url end::varchar as website_url,
  c.website_link_status::varchar as website_link_status,
  c.statutory_low_age::number(38,0) as statutory_low_age,
  c.statutory_high_age::number(38,0) as statutory_high_age,
  c.gender::varchar as gender,
  c.religious_character::varchar as religious_character,
  c.admissions_policy::varchar as admissions_policy,
  c.pupils::number(38,0) as pupils,
  o.ofsted_from::varchar as ofsted_from,
  o.ofsted_url::varchar as ofsted_url,
  o.ofsted_renewed::variant as ofsted_renewed,
  o.ofsted_original::variant as ofsted_original,
  o.ofsted_source_file_id::varchar as ofsted_source_file_id
from c
join kinds k on k.kind = c.kind
left join ofsted o on o.urn = c.urn
