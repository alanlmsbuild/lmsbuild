-- Every course in Discover Uni, one row per publishing provider, course ID
-- and mode of study, with its provider's name and place, its subjects, and
-- its headline outcomes: continuation, salary 15 months after (Graduate
-- Outcomes) and earnings 3 years after (LEO).
--
-- A joint course has outcome rows for each of its subjects: the figures
-- here are from the first row the file gives for the course, and
-- OUTCOMES_SUBJECT says which subject they are for.
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
),
continuation as (
  select * from {{ source('options_raw', 'du_continuation') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_CONTINUATION', 'options') }}
  qualify row_number() over (partition by PUBUKPRN, KISCOURSEID, KISMODE order by FILEROWNUMBER) = 1
),
salary as (
  select * from {{ source('options_raw', 'du_gosalary') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_GOSALARY', 'options') }}
  qualify row_number() over (partition by PUBUKPRN, KISCOURSEID, KISMODE order by FILEROWNUMBER) = 1
),
leo3 as (
  select * from {{ source('options_raw', 'du_leo3') }}
  where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_LEO3', 'options') }}
  qualify row_number() over (partition by PUBUKPRN, KISCOURSEID, KISMODE order by FILEROWNUMBER) = 1
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
  nullif(c.CRSEURL, '')::varchar as course_url,
  i.name::varchar as provider_name,
  i.COUNTRY::varchar as provider_country_code,
  i.postcode::varchar as provider_postcode,
  p.local_authority_code::varchar as local_authority_code,
  p.lsoa21_code::varchar as lsoa21_code,
  s.main_subject::varchar as main_subject_code,
  cah3.name::varchar as main_subject_name,
  coalesce(s.subject_count, 0)::number(38,0) as subject_count,
  s.subjects::varchar as subject_codes,
  nullif(co.CONTSBJ, '')::varchar as outcomes_subject,
  {{ num('co.CONTPOP') }}::number(38,0) as continuation_students,
  {{ num('co.UCONT') }}::number(38,0) as continuation_percent,
  {{ num('sa.GOSALPOP') }}::number(38,0) as salary_respondents,
  {{ num('sa.GOINSTMED') }}::number(38,0) as salary_median_15_months,
  {{ num('sa.GOINSTLQ') }}::number(38,0) as salary_lower_quartile_15_months,
  {{ num('sa.GOINSTUQ') }}::number(38,0) as salary_upper_quartile_15_months,
  {{ num('l.LEO3POP') }}::number(38,0) as earnings_graduates_3_years,
  {{ num('l.LEO3INSTMED') }}::number(38,0) as earnings_median_3_years,
  c.SOURCEFILEID::varchar as source_file_id
from courses c
left join institutions i on i.PUBUKPRN = c.PUBUKPRN and i.UKPRN = c.UKPRN
left join aims a on a.KISAIMCODE = c.KISAIMCODE
left join subjects s on s.PUBUKPRN = c.PUBUKPRN and s.KISCOURSEID = c.KISCOURSEID and s.KISMODE = c.KISMODE
left join cah3 on cah3.code = s.main_subject
left join continuation co on co.PUBUKPRN = c.PUBUKPRN and co.KISCOURSEID = c.KISCOURSEID and co.KISMODE = c.KISMODE
left join salary sa on sa.PUBUKPRN = c.PUBUKPRN and sa.KISCOURSEID = c.KISCOURSEID and sa.KISMODE = c.KISMODE
left join leo3 l on l.PUBUKPRN = c.PUBUKPRN and l.KISCOURSEID = c.KISCOURSEID and l.KISMODE = c.KISMODE
left join {{ ref('postcode') }} p on p.postcode_compact = {{ compact_postcode('i.postcode') }}
