-- A card for every live course run in the National Careers Service course
-- directory (one row per course run at a venue): the provider, the venue and
-- its postcode (with the local authority it is in), the level and subject, the
-- qualification (the learning aim's title in LARS where the learning aim
-- reference matches, else the course name), the start date or "Flexible start",
-- the study mode and the course page. Level and subject come from LARS only
-- (the directory's own level and sector fields are filled for a few hundred
-- courses and its sector codes are not explained); a course with no LARS match
-- has none. Venue postcodes and coordinates are the venue's, not a person's.
-- Built only when a newer directory or LARS file has been loaded (ncs_reusable).
{% set reuse = ncs_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
select
  c.course_run_id::varchar as course_run_id,
  c.course_id::varchar as course_id,
  c.provider_ukprn::varchar as provider_ukprn,
  p.provider_name::varchar as provider_name,
  p.trading_name::varchar as provider_trading_name,
  c.course_name::varchar as course_name,
  coalesce(c.lars_title, c.course_name)::varchar as qualification,
  c.learn_aim_ref::varchar as learn_aim_ref,
  coalesce(c.awarding_body, c.lars_awarding_body)::varchar as awarding_body,
  c.lars_level::varchar as level,
  c.lars_subject_area::varchar as subject,
  c.course_type::varchar as course_type,
  c.delivery_mode::varchar as delivery_mode,
  c.study_mode::varchar as study_mode,
  c.attendance_pattern::varchar as attendance_pattern,
  c.start_date::date as start_date,
  c.has_flexible_start::boolean as has_flexible_start,
  case when c.start_date is not null then 'Starts ' || {{ long_date('c.start_date') }} else 'Flexible start' end::varchar as starts_text,
  case when c.duration_value is not null and c.duration_unit is not null then c.duration_value::varchar || ' ' || c.duration_unit end::varchar as duration_text,
  c.cost::number(12,2) as cost,
  c.venue_name::varchar as venue_name,
  c.venue_town::varchar as venue_town,
  c.venue_postcode::varchar as venue_postcode,
  pc.local_authority_code::varchar as local_authority_code,
  la.name::varchar as local_authority_name,
  c.venue_latitude::float as venue_latitude,
  c.venue_longitude::float as venue_longitude,
  c.is_national::boolean as is_national,
  c.regions::varchar as regions,
  c.course_url::varchar as course_url,
  c.venue_website::varchar as venue_website,
  c.lars_matched::boolean as lars_matched,
  c.updated_on::date as updated_on,
  f.published_on::date as published_on,
  f.source_url::varchar as source_url,
  f.downloaded_on::date as downloaded_on,
  'Contains public sector information licensed under the Open Government Licence v3.0. National Careers Service course directory, Department for Education.'::varchar as attribution,
  {{ ncs_stamp() }}::varchar as built_from
from {{ ref('ncs_course') }} c
left join {{ ref('ncs_provider') }} p on p.ukprn = c.provider_ukprn
left join {{ ref('postcode') }} pc on pc.postcode_compact = c.venue_postcode_compact
left join {{ ref('local_authority') }} la on la.local_authority_code = pc.local_authority_code
cross join {{ ref('ncs_feed') }} f
{% endif %}
