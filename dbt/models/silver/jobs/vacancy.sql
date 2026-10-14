-- Every apprenticeship advert the vacancy import has seen (Find an
-- apprenticeship, with NHS Jobs and Civil Service Jobs), one row per
-- advert, live or gone, with its place (by postcode) and its current SOC
-- 2020 codes. A copy of SHARED_DB.EXT.VACANCY at build time: an advert
-- that closes keeps its row with GONE_AT set; one that comes back has
-- GONE_AT cleared on the same row (the import's rule). Long texts
-- (descriptions, addresses) stay in EXT.
with v as (
  select * from {{ source('shared_ext', 'vacancy') }}
),
-- The codes that apply now (GONEAT empty). A gone advert keeps the codes it
-- had when it went (the coder's rule).
codes as (
  select VACANCYREFERENCE, listagg(SOC2020, ',') within group (order by SOC2020) as soc_codes,
         count(*) as soc_count, min(METHOD) as method, min(FLAG) as flag
  from {{ source('shared_ext', 'vacancy_soc') }}
  where GONEAT is null
  group by 1
)
select
  v.VACANCYREFERENCE::varchar as vacancy_reference,
  v.SOURCE::varchar as source,
  v.TITLE::varchar as title,
  v.EMPLOYERNAME::varchar as employer_name,
  v.PROVIDERNAME::varchar as provider_name,
  v.UKPRN::varchar as ukprn,
  v.NUMBEROFPOSITIONS::number(38,0) as positions,
  v.POSTEDDATE::timestamp_ltz as posted_at,
  v.CLOSINGDATE::timestamp_ltz as closing_at,
  v.STARTDATE::timestamp_ltz as starts_at,
  v.WAGETYPE::varchar as wage_type,
  v.WAGEUNIT::varchar as wage_unit,
  v.WAGETEXT::varchar as wage_text,
  v.HOURSPERWEEK::number(6,2) as hours_per_week,
  v.EXPECTEDDURATION::varchar as expected_duration,
  v.APPRENTICESHIPLEVEL::varchar as apprenticeship_level,
  v.LARSCODE::number(38,0) as lars_code,
  v.COURSETITLE::varchar as course_title,
  v.COURSELEVEL::number(38,0) as course_level,
  v.ROUTE::varchar as route,
  v.ISDISABILITYCONFIDENT::boolean as is_disability_confident,
  v.ISNATIONALVACANCY::boolean as is_national,
  v.POSTCODE::varchar as postcode,
  p.postcode::varchar as matched_postcode,
  p.local_authority_code::varchar as local_authority_code,
  p.lsoa21_code::varchar as lsoa21_code,
  v.LATITUDE::float as latitude,
  v.LONGITUDE::float as longitude,
  c.soc_codes::varchar as soc_codes,
  coalesce(c.soc_count, 0)::number(38,0) as soc_count,
  c.method::varchar as soc_method,
  c.flag::varchar as soc_flag,
  v.VACANCYURL::varchar as vacancy_url,
  v.FIRSTSEENAT::timestamp_ltz as first_seen_at,
  v.LASTSEENAT::timestamp_ltz as last_seen_at,
  v.GONEAT::timestamp_ltz as gone_at,
  (v.GONEAT is null) as is_live,
  v.LASTCHANGEDAT::timestamp_ltz as last_changed_at
from v
left join codes c on c.VACANCYREFERENCE = v.VACANCYREFERENCE
left join {{ ref('postcode') }} p on p.postcode_compact = {{ compact_postcode('v.POSTCODE') }}
