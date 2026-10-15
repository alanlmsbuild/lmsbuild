-- A provider's achievement rates beside DfE's national rate for the same
-- provider type, year, kind, provision type, level and age, for Warren:
-- one row per provider (UKPRN), year and measure. Never ranked.
--   Like for like: the provider's rate and the national rate come from the
--     same DfE release (achievement_measure), and only the national rate
--     for exactly the same provider type, year and breakdown is used; a
--     provider whose type has no national figure that year is not compared.
--   Honesty rules (macros/figure.sql): fewer than 10 leavers hidden, 10 to
--     29 shown as a small group, DfE's withheld or missing figures shown as
--     unavailable with the reason, never as zero.
--   Compared in words only when the provider's figure is shown and not a
--     small group: above or below when more than 5 percentage points from
--     the national rate, about the same otherwise. The 5 points are
--     Rarebit's own rule, not DfE's. COMPARISON_NOTE says why a row is not
--     compared.
--   With the provider's latest Ofsted further education and skills
--     inspection and its APAR entry, each with its source and dates.
with m as (select * from {{ ref('achievement_measure') }}),
provider as (
  select m.*, {{ figure_status('m.rate_published', 'm.leavers_published') }} as rate_status
  from m where m.geographic_level = 'provider'
),
national as (
  select provider_type, kind, time_period, provision_type, level, age, rate_published, leavers_published, source_file_id,
         {{ reading_kind('rate_published') }} as rate_kind
  from m where geographic_level = 'national'
),
ofsted as (select * from {{ ref('ofsted_fe_provider') }}),
apar as (select * from {{ ref('apar_provider') }}),
files as (select {{ latest_file('apar', 'APAR_PROVIDER') }} as apar_file),
joined as (
  select p.*,
         n.rate_published as national_rate_published, n.leavers_published as national_leavers_published,
         n.rate_kind as national_rate_kind, n.source_file_id as national_source_file_id,
         {{ reading_number('n.rate_published') }} as national_rate,
         {{ reading_number('p.rate_published') }} as provider_rate,
         {{ reading_number('p.leavers_published') }} as provider_leavers
  from provider p
  left join national n on n.provider_type = p.provider_type and n.kind = p.kind and n.time_period = p.time_period
    and n.provision_type = p.provision_type and n.level = p.level and n.age = p.age
)
select
  j.measure_key::varchar as benchmark_key,
  j.ukprn::varchar as ukprn,
  j.provider_name::varchar as provider_name,
  j.provider_type::varchar as provider_type,
  j.kind::varchar as kind,
  j.academic_year::varchar as academic_year,
  j.provision_type::varchar as provision_type,
  j.level::varchar as level,
  j.age::varchar as age,
  (case j.kind when 'apprenticeships' then 'Apprenticeships' else 'Education and training' end
   || case when j.kind = 'education' then case j.provision_type when 'Total' then '' when 'Education and Training exc TL / CL' then ' (not tailored or community learning)' else ' (' || lower(j.provision_type) || ')' end else '' end
   || case when j.level = 'Total' then '' else ', ' || lower(j.level) end
   || case j.age when 'all' then ', all ages' when 'under 19' then ', under 19' else ', aged ' || j.age end)::varchar as measure,
  {{ figure_columns('j.rate_published', 'j.leavers_published') }},
  case when j.national_rate_kind = 'number' then j.national_rate end::float as national_rate,
  case when j.national_rate_kind = 'number' then {{ reading_number('j.national_leavers_published') }} end::number(38,0) as national_leavers,
  case when j.national_rate_published is null then 'none'
       when j.national_rate_kind = 'number' then 'shown'
       else coalesce(j.national_rate_kind, 'none') end::varchar as national_status,
  case when j.rate_status = 'shown' and j.provider_leavers >= {{ var('honesty_care_below') }} and j.national_rate_kind = 'number'
       then round(j.provider_rate - j.national_rate, 1) end::number(6,1) as difference_points,
  case when j.rate_status = 'shown' and j.provider_leavers >= {{ var('honesty_care_below') }} and j.national_rate_kind = 'number'
       then case when round(j.provider_rate - j.national_rate, 1) > 5 then 'above'
                 when round(j.provider_rate - j.national_rate, 1) < -5 then 'below'
                 else 'about the same' end end::varchar as compared_with_national,
  case
    when j.rate_status is null then 'Not applicable: DfE publishes no rate here.'
    when j.rate_status <> 'shown' then 'Not compared: the provider''s rate is not shown (' || j.rate_status || ').'
    when j.provider_leavers < {{ var('honesty_care_below') }} then 'Not compared: a small group (10 to 29 leavers), treat with care.'
    when j.national_rate_published is null then 'Not compared: DfE publishes no national rate for this provider type and breakdown in this year.'
    when j.national_rate_kind <> 'number' then 'Not compared: DfE does not publish the national rate for this provider type and breakdown in this year.'
  end::varchar as comparison_note,
  o.provider_urn::varchar as ofsted_provider_urn,
  case when o.renewed_inspected is not null then 'renewed' when o.original_inspected is not null then 'previous' end::varchar as ofsted_framework,
  coalesce(o.renewed_inspected, o.original_inspected)::date as ofsted_inspected,
  case when o.renewed_inspected is null then o.original_overall end::varchar as ofsted_overall_effectiveness,
  case when o.renewed_inspected is null then case o.original_overall when '1' then 'Outstanding' when '2' then 'Good' when '3' then 'Requires improvement' when '4' then 'Inadequate' end end::varchar as ofsted_overall_effectiveness_words,
  o.renewed_apprenticeships_achievement::varchar as ofsted_apprenticeships_achievement,
  o.renewed_young_people_achievement::varchar as ofsted_young_people_achievement,
  o.renewed_leadership_and_governance::varchar as ofsted_leadership_and_governance,
  o.ofsted_url::varchar as ofsted_url,
  o.source_file_id::varchar as ofsted_source_file_id,
  to_date(osf.ORIGINALMODIFIEDAT) as ofsted_downloaded_on,
  osf.PUBLISHEDON as ofsted_published_on,
  (a.ukprn is not null)::boolean as apar_on_register,
  a.register_route::varchar as apar_register_route,
  a.status::varchar as apar_status,
  a.can_deliver_apprenticeships::boolean as apar_can_deliver_apprenticeships,
  a.on_register_from::date as apar_on_register_from,
  f.apar_file::varchar as apar_source_file_id,
  to_date(apsf.ORIGINALMODIFIEDAT) as apar_downloaded_on,
  case j.kind when 'apprenticeships' then 'achievement-app' else 'achievement-et-provider' end::varchar as source,
  j.source_file_id::varchar as source_file_id,
  to_date(sf.ORIGINALMODIFIEDAT) as downloaded_on,
  sf.PUBLISHEDON as published_on,
  j.national_source_file_id::varchar as national_source_file_id,
  nsf.PUBLISHEDON as national_published_on,
  current_timestamp()::timestamp_ltz as as_of
from joined j
cross join files f
left join ofsted o on o.ukprn = j.ukprn
left join apar a on a.ukprn = j.ukprn
{{ source_file_join('sf', 'j.source_file_id') }}
{{ source_file_join('nsf', 'j.national_source_file_id') }}
{{ source_file_join('osf', 'o.source_file_id') }}
{{ source_file_join('apsf', 'f.apar_file', 'shared') }}
