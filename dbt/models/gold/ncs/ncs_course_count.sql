-- How many live courses there are in an area, by level: what "[Number] courses
-- near you" reads (National Careers Service course directory). One row per
-- area and level, and an "All levels" row per area (is_all_levels: do not add
-- these to the level rows). Areas are the local authority a venue's postcode is
-- in; courses with no venue (online, work-based, national) are counted once
-- under ONLINE_NATIONAL, not in any local authority, and venues whose postcode
-- is not in the postcode directory under UNPLACED. A course is counted once in
-- an area however many runs or venues it has there (courses); course_runs
-- counts each run. The level is LARS's (a course with no LARS match is "Not
-- stated"). Built only when a newer directory or LARS file has been loaded
-- (ncs_reusable).
{% set reuse = ncs_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with cards as (
  select
    case
      when venue_postcode is null then 'online_or_national'
      when local_authority_code is null then 'unplaced'
      else 'local_authority'
    end as area_type,
    case
      when venue_postcode is null then 'ONLINE_NATIONAL'
      when local_authority_code is null then 'UNPLACED'
      else local_authority_code
    end as area_code,
    case
      when venue_postcode is null then 'Online, work-based and national courses'
      when local_authority_code is null then 'Venue postcode not in the postcode directory'
      else local_authority_name
    end as area_name,
    coalesce(level, 'Not stated') as level,
    course_id, course_run_id, provider_ukprn
  from {{ ref('ncs_course_card') }}
),
by_level as (
  select area_type, area_code, area_name, level, false as is_all_levels,
    count(distinct course_id) as courses, count(*) as course_runs, count(distinct provider_ukprn) as providers
  from cards group by all
),
all_levels as (
  select area_type, area_code, area_name, 'All levels' as level, true as is_all_levels,
    count(distinct course_id) as courses, count(*) as course_runs, count(distinct provider_ukprn) as providers
  from cards group by area_type, area_code, area_name
)
select
  md5(concat_ws('|', u.area_type, u.area_code, u.level))::varchar as count_key,
  u.area_type::varchar as area_type,
  u.area_code::varchar as area_code,
  u.area_name::varchar as area_name,
  u.level::varchar as level,
  case u.level when 'All levels' then 0 when 'Entry Level' then 1 when 'Level 1' then 2 when 'Level 1/2' then 3 when 'Level 2' then 4
    when 'Level 3' then 5 when 'Level 4' then 6 when 'Level 5' then 7 when 'Level 6' then 8 when 'Level 7' then 9 when 'Level 8' then 10 else 99 end::number(4,0) as level_order,
  u.is_all_levels::boolean as is_all_levels,
  u.courses::number(10,0) as courses,
  u.course_runs::number(10,0) as course_runs,
  u.providers::number(10,0) as providers,
  f.published_on::date as published_on,
  f.source_url::varchar as source_url,
  'Contains public sector information licensed under the Open Government Licence v3.0. National Careers Service course directory, Department for Education.'::varchar as attribution,
  {{ ncs_stamp() }}::varchar as built_from
from (select * from by_level union all select * from all_levels) u
cross join {{ ref('ncs_feed') }} f
{% endif %}
