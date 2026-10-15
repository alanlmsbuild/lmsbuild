-- The adverts a product may show, one row per advert open when gold was
-- built (live, and its closing date still to come): what it is, where,
-- the job's SOC 2020 occupations and its standard. KIND says what it is:
-- an Apprenticeship (every advert from the Find an apprenticeship API,
-- with its NHS Jobs and Civil Service Jobs passes), or a Job, which is
-- never a funded apprenticeship and must be labelled so. Gold is built
-- daily; the adverts change every 2 hours (SHARED_DB.EXT), so AS_OF says
-- when this list was made.
with soc as (
  select s.vacancy_reference,
         listagg(s.soc2020, ',') within group (order by s.soc2020) as soc_codes,
         listagg(s.soc2020 || ' ' || s.soc_title, '; ') within group (order by s.soc2020) as soc_titles
  from {{ ref('vacancy_soc') }} s
  where s.is_current
  group by 1
)
select
  v.vacancy_reference::varchar as vacancy_reference,
  -- Apprenticeship: from the apprenticeship sources. A source of other
  -- jobs (later) gives Job.
  case when v.source in ('FAA', 'NHS', 'CSJ') then 'Apprenticeship' else 'Job' end::varchar as kind,
  case when v.source in ('FAA', 'NHS', 'CSJ') then 'Apprenticeship' else 'Job (not a funded apprenticeship)' end::varchar as kind_words,
  v.title::varchar as title,
  v.employer_name::varchar as employer_name,
  v.provider_name::varchar as provider_name,
  v.ukprn::varchar as ukprn,
  v.positions::number(38,0) as positions,
  v.posted_at::timestamp_ltz as posted_at,
  v.closing_at::timestamp_ltz as closing_at,
  v.starts_at::timestamp_ltz as starts_at,
  v.wage_type::varchar as wage_type,
  v.wage_unit::varchar as wage_unit,
  v.wage_text::varchar as wage_text,
  v.hours_per_week::number(6,2) as hours_per_week,
  v.expected_duration::varchar as expected_duration,
  v.apprenticeship_level::varchar as apprenticeship_level,
  v.lars_code::number(38,0) as lars_code,
  v.course_title::varchar as course_title,
  v.course_level::number(38,0) as course_level,
  v.route::varchar as route,
  v.is_disability_confident::boolean as is_disability_confident,
  v.is_national::boolean as is_national,
  v.postcode::varchar as postcode,
  v.local_authority_code::varchar as local_authority_code,
  la.name::varchar as local_authority_name,
  coalesce(la.region_name, la.country_name)::varchar as region_name,
  v.lsoa21_code::varchar as lsoa21_code,
  v.latitude::float as latitude,
  v.longitude::float as longitude,
  soc.soc_codes::varchar as soc_codes,
  soc.soc_titles::varchar as soc_titles,
  v.soc_method::varchar as soc_method,
  v.vacancy_url::varchar as vacancy_url,
  v.source::varchar as listed_on,
  'faa-vacancies'::varchar as source,
  v.last_seen_at::timestamp_ltz as last_seen_at,
  current_timestamp()::timestamp_ltz as as_of
from {{ ref('vacancy') }} v
left join soc on soc.vacancy_reference = v.vacancy_reference
left join {{ ref('local_authority') }} la on la.local_authority_code = v.local_authority_code
where v.is_live and v.closing_at > current_timestamp()
