-- The university courses the school leavers app can show, one row per
-- course (Discover Uni): what it is, who teaches it, where, and its own
-- page (empty while the link check hides it). Its outcomes are in
-- UNIVERSITY_COURSE_RESULT.
select
  c.course_key::varchar as course_key,
  c.publishing_ukprn::varchar as publishing_ukprn,
  c.teaching_ukprn::varchar as teaching_ukprn,
  c.course_id::varchar as course_id,
  c.title::varchar as title,
  c.title_welsh::varchar as title_welsh,
  c.qualification::varchar as qualification,
  c.mode::varchar as mode,
  c.years::number(38,0) as years,
  c.honours::boolean as honours,
  c.foundation_year::varchar as foundation_year,
  c.placement_year::varchar as placement_year,
  c.year_abroad::varchar as year_abroad,
  c.distance_learning::varchar as distance_learning,
  c.ucas_programme_code::varchar as ucas_programme_code,
  c.provider_name::varchar as provider_name,
  c.provider_postcode::varchar as provider_postcode,
  c.local_authority_code::varchar as local_authority_code,
  la.name::varchar as local_authority_name,
  c.main_subject_code::varchar as main_subject_code,
  c.main_subject_name::varchar as main_subject_name,
  c.subject_count::number(38,0) as subject_count,
  case when not c.website_link_hidden then c.website_url end::varchar as website_url,
  c.website_link_status::varchar as website_link_status,
  'discover-uni'::varchar as source,
  c.source_file_id::varchar as source_file_id,
  to_date(sf.ORIGINALMODIFIEDAT) as downloaded_on,
  sf.PUBLISHEDON as published_on
from {{ ref('university_course') }} c
left join {{ ref('local_authority') }} la on la.local_authority_code = c.local_authority_code
{{ source_file_join('sf', 'c.source_file_id') }}
