-- Decision 26: every website a source publishes reaches silver. A school,
-- college or course whose source gives a link but whose WEBSITE_URL is
-- empty means the cleaning rule (macros/url.sql) rejected it: look at it
-- and widen the rule rather than lose the link.
with gias as (
  select "URN" as urn, "SchoolWebsite" as published from {{ source('options_raw', 'gias_establishment') }}
  where SOURCEFILEID = {{ latest_file('gias', 'GIAS_ESTABLISHMENT', 'options') }} and trim("SchoolWebsite") <> ''
)
select 'school' as model, s.urn as key_, g.published from {{ ref('school') }} s join gias g on g.urn = s.urn where s.website_url is null
union all
select 'college_16_18', c.urn, g.published from {{ ref('college_16_18') }} c join gias g on g.urn = c.urn where c.website_url is null
union all
select 'university_course', u.course_key, k.CRSEURL from {{ ref('university_course') }} u
join {{ source('options_raw', 'du_kiscourse') }} k on k.SOURCEFILEID = u.source_file_id and (k.PUBUKPRN || '|' || k.KISCOURSEID || '|' || k.KISMODE) = u.course_key
where trim(k.CRSEURL) <> '' and u.website_url is null
