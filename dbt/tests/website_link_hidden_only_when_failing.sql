-- Decision 26: a link is hidden only while its last check failed (broken or
-- unreachable, after two failures in a row), and a hidden link is never
-- one silver has no link for.
select 'school' as model, urn as key_, website_link_status from {{ ref('school') }} where website_link_hidden and coalesce(website_link_status, '') not in ('broken', 'unreachable', 'blocked')
union all
select 'college_16_18', urn, website_link_status from {{ ref('college_16_18') }} where website_link_hidden and coalesce(website_link_status, '') not in ('broken', 'unreachable', 'blocked')
union all
select 'provider', ukprn, website_link_status from {{ ref('provider') }} where website_link_hidden and coalesce(website_link_status, '') not in ('broken', 'unreachable', 'blocked')
union all
select 'university_course', course_key, website_link_status from {{ ref('university_course') }} where website_link_hidden and coalesce(website_link_status, '') not in ('broken', 'unreachable', 'blocked')
