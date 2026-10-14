-- Every course in Discover Uni, one row per publishing provider, course ID
-- and mode of study, with its provider's name and place and its subjects.
-- Its outcomes (continuation, salary, earnings) are in
-- UNIVERSITY_COURSE_OUTCOME, one row per course, measure and subject, so a
-- joint course's figures are never shown as one subject's.
with courses as (
  select * from {{ source('options_raw', 'du_kiscourse') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_KISCOURSE', 'options') }}
),
institutions as (
  select PUBUKPRN, UKPRN, coalesce(nullif(FIRST_TRADING_NAME, ''), LEGAL_NAME) as name, COUNTRY,
         regexp_substr(upper(PROVADDRESS), '[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}') as postcode
  from {{ source('options_raw', 'du_institution') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_INSTITUTION', 'options') }}
),
aims as (
  select KISAIMCODE, KISAIMLABEL from {{ source('options_raw', 'du_kisaim') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_KISAIM', 'options') }}
),
cah3 as (
  select "CAH3_code" as code, max("CAH3_subject") as name
  from {{ source('options_raw', 'leo_grad_cah3_subject') }}
  where SOURCEFILEID = {{ latest_file('leo-grad-cah3-subject', 'LEO_GRAD_CAH3_SUBJECT', 'options') }}
  group by 1
),
subjects as (
  select PUBUKPRN, KISCOURSEID, KISMODE,
         min_by(SBJ, FILEROWNUMBER) as main_subject,
         count(*) as subject_count,
         listagg(SBJ, ',') within group (order by FILEROWNUMBER) as subjects
  from {{ source('options_raw', 'du_sbj') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_SBJ', 'options') }}
  group by 1, 2, 3
)
select
  (c.PUBUKPRN || '|' || c.KISCOURSEID || '|' || c.KISMODE)::varchar as course_key,
  c.PUBUKPRN::varchar as publishing_ukprn,
  c.UKPRN::varchar as teaching_ukprn,
  c.KISCOURSEID::varchar as course_id,
  c.KISMODE::varchar as mode_code,
  case c.KISMODE when '01' then 'full-time' when '02' then 'part-time' when '03' then 'full-time or part-time' end::varchar as mode,
  c.TITLE::varchar as title,
  nullif(c.TITLEW, '')::varchar as title_welsh,
  a.KISAIMLABEL::varchar as qualification,
  c.KISLEVEL::varchar as level_code,
  (c.HONOURS = '1') as honours,
  case c.FOUNDATION when '0' then 'no' when '1' then 'optional' when '2' then 'compulsory' end::varchar as foundation_year,
  case c.SANDWICH when '0' then 'no' when '1' then 'optional' when '2' then 'compulsory' end::varchar as placement_year,
  case c.YEARABROAD when '0' then 'no' when '1' then 'optional' when '2' then 'compulsory' end::varchar as year_abroad,
  case c.DISTANCE when '0' then 'no' when '1' then 'distance only' when '2' then 'optional' end::varchar as distance_learning,
  {{ num('c.NUMSTAGE') }}::number(38,0) as years,
  nullif(c.UCASPROGID, '')::varchar as ucas_programme_code,
  {{ website_url('c.CRSEURL') }}::varchar as website_url,
  i.name::varchar as provider_name,
  i.COUNTRY::varchar as provider_country_code,
  i.postcode::varchar as provider_postcode,
  p.local_authority_code::varchar as local_authority_code,
  p.lsoa21_code::varchar as lsoa21_code,
  s.main_subject::varchar as main_subject_code,
  cah3.name::varchar as main_subject_name,
  coalesce(s.subject_count, 0)::number(38,0) as subject_count,
  s.subjects::varchar as subject_codes,
  c.SOURCEFILEID::varchar as source_file_id
from courses c
left join institutions i on i.PUBUKPRN = c.PUBUKPRN and i.UKPRN = c.UKPRN
left join aims a on a.KISAIMCODE = c.KISAIMCODE
left join subjects s on s.PUBUKPRN = c.PUBUKPRN and s.KISCOURSEID = c.KISCOURSEID and s.KISMODE = c.KISMODE
left join cah3 on cah3.code = s.main_subject
left join {{ ref('postcode') }} p on p.postcode_compact = {{ compact_postcode('i.postcode') }}
