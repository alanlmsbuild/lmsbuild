-- Every learning provider (UKPRN) named in the school leavers app's data:
-- schools and colleges in GIAS, the 16 to 18 results, the apprenticeship
-- register (APAR), Ofsted's further education list, achievement rates and
-- Discover Uni. One row per UKPRN, with the figures published per UKPRN:
-- achievement rates for 16 to 18 year olds (education and training, and
-- apprenticeships), the latest Ofsted FE inspection, and APAR status;
-- and its website (decision 26): its GIAS establishment's, else Discover
-- Uni's.
with gias as (
  select * from {{ source('options_raw', 'gias_establishment') }}
  where SOURCEFILEID = {{ latest_file('gias', 'GIAS_ESTABLISHMENT', 'options') }}
),
gias_open as (
  select "UKPRN" as ukprn, count(*) as establishments,
         case when count(*) = 1 then any_value("URN") end as urn,
         any_value("EstablishmentName") as name, any_value("Postcode") as postcode
  from gias where "UKPRN" <> '' and "EstablishmentStatus (name)" like 'Open%'
  group by 1
),
-- Any establishment with the UKPRN, open or closed: the open one, else the
-- one that closed last (for a UKPRN known only from a closed college).
gias_any as (
  select "UKPRN" as ukprn, "EstablishmentName" as name, "Postcode" as postcode, {{ website_url('"SchoolWebsite"') }} as website_url
  from gias where "UKPRN" <> ''
  qualify row_number() over (partition by "UKPRN" order by ("EstablishmentStatus (name)" like 'Open%') desc,
                             {{ dt('"CloseDate"', 'DD-MM-YYYY') }} desc nulls last, "URN" desc) = 1
),
apar as (
  select * from {{ source('shared_raw', 'apar_provider') }}
  where SOURCEFILEID = {{ latest_file('apar', 'APAR_PROVIDER') }}
),
ofsted_fe as (
  select * from {{ source('options_raw', 'ofsted_fe_provider_list') }}
  where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D4_PROVIDER_LIST', 'options') }}
),
ofsted_fe_renewed as (
  select * from {{ source('options_raw', 'ofsted_fe_full_inspections') }}
  where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D1_FULL_INSPECTIONS', 'options') }}
),
-- Education and training: the "Under 19" band, all subject areas, the
-- latest year each provider has.
et as (
  select "provider_ukprn" as ukprn, "provider_name" as name, "provider_type" as provider_type, "time_period" as time_period,
         {{ num('"achievement_rate"', 1) }} as rate, {{ num('"leavers"') }} as leavers
  from {{ source('options_raw', 'achievement_et') }}
  where SOURCEFILEID = {{ latest_file('achievement-et', 'ACHIEVEMENT_ET_PROVIDER_SUMMARY', 'options') }}
    and "age_band" = 'Under 19' and "sector_subject_area_t1" = 'Total'
  qualify row_number() over (partition by "provider_ukprn" order by "time_period" desc) = 1
),
-- Apprenticeships: started aged 16 to 18, all subjects, levels and
-- standards. Two publications overlap on some years; each year comes from
-- the newest publication that has it (the one whose latest year is
-- latest), then the latest year each provider has.
app_files as (
  select SOURCEFILEID, max("time_period") as newest_year
  from {{ source('options_raw', 'achievement_app') }}
  group by 1
),
app_rows as (
  select a.*, f.newest_year
  from {{ source('options_raw', 'achievement_app') }} a
  join app_files f on f.SOURCEFILEID = a.SOURCEFILEID
  where a."ssa_tier_1" = 'Total' and a."level" = 'Total' and a."std_fwk_name_stcode" = 'Total'
    and a."age_youth_adult" = '16-18' and a."age_group" = 'Total'
  qualify dense_rank() over (partition by a."time_period" order by f.newest_year desc, a.SOURCEFILEID) = 1
),
app as (
  select "provider_ukprn" as ukprn, "provider_name" as name, "provider_type" as provider_type, "time_period" as time_period,
         {{ num('"achievement_rate"', 1) }} as rate, {{ num('"leavers"') }} as leavers
  from app_rows
  qualify row_number() over (partition by "provider_ukprn" order by "time_period" desc) = 1
),
-- Discover Uni's institutions, by their own UKPRN and by the UKPRN that
-- publishes for them (a row whose own UKPRN it is wins).
du_institution as (
  select ukprn, name, postcode, website_url from (
    select UKPRN as ukprn, 1 as pref, coalesce(nullif(FIRST_TRADING_NAME, ''), LEGAL_NAME) as name,
           regexp_substr(upper(PROVADDRESS), '[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}') as postcode, {{ website_url('PROVURL') }} as website_url
    from {{ source('options_raw', 'du_institution') }}
    where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_INSTITUTION', 'options') }}
    union all
    select PUBUKPRN, 2, coalesce(nullif(FIRST_TRADING_NAME, ''), LEGAL_NAME),
           regexp_substr(upper(PROVADDRESS), '[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}'), {{ website_url('PROVURL') }}
    from {{ source('options_raw', 'du_institution') }}
    where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_INSTITUTION', 'options') }}
  )
  qualify row_number() over (partition by ukprn order by pref, name) = 1
),
du_courses as (
  select ukprn, count(*) as courses from (
    select UKPRN as ukprn from {{ source('options_raw', 'du_kiscourse') }}
    where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_KISCOURSE', 'options') }}
  ) group by 1
),
ukprns as (
  select ukprn from gias_open
  union select "UKPRN" from gias where "URN" in (select urn from {{ ref('college_16_18') }}) and "UKPRN" <> ''
  union select "Ukprn" from apar
  union select "Provider UKPRN" from ofsted_fe
  union select ukprn from et
  union select ukprn from app
  union select ukprn from du_institution
  union select ukprn from du_courses
)
select
  u.ukprn::varchar as ukprn,
  coalesce(du.name, ga.name, fe."Provider name", et.name, app.name, ap."Name")::varchar as name,
  case when du.name is not null then 'discover-uni' when ga.name is not null then 'gias' when fe."Provider name" is not null then 'ofsted-fe'
       when et.name is not null then 'achievement-et' when app.name is not null then 'achievement-app' else 'apar' end::varchar as name_from,
  coalesce(et.provider_type, app.provider_type)::varchar as provider_type,
  {{ txt('fe."Provider type"') }}::varchar as ofsted_provider_type,
  coalesce(go.establishments, 0)::number(38,0) as open_establishments,
  go.urn::varchar as establishment_urn,
  coalesce(dc.courses, 0)::number(38,0) as university_courses,
  (ap."Ukprn" is not null) as on_apar,
  {{ txt('ap."ApplicationType"') }}::varchar as apar_route,
  {{ txt('ap."Status"') }}::varchar as apar_status,
  (ap."CanDeliverApprenticeships" = 'True') as apar_can_deliver_apprenticeships,
  {{ txt('fe."Provider URN"') }}::varchar as ofsted_fe_urn,
  {{ dt('fr."First day of inspection"', 'DD/MM/YYYY') }} as ofsted_fe_renewed_inspected,
  {{ txt('fe."Latest overall effectiveness before renewed EIF"') }}::varchar as ofsted_fe_previous_overall,
  {{ dt('fe."First day of inspection of latest inspection before renewed EIF"', 'DD/MM/YYYY') }} as ofsted_fe_previous_inspected,
  {{ txt('fe."Web link to Ofsted provider webpage (opens in new window) [link address]"') }}::varchar as ofsted_url,
  (left(et.time_period, 4) || '/' || right(et.time_period, 2))::varchar as et_achievement_year,
  et.rate::number(5,1) as et_achievement_rate_16_18,
  et.leavers::number(38,0) as et_leavers_16_18,
  (left(app.time_period, 4) || '/' || right(app.time_period, 2))::varchar as app_achievement_year,
  app.rate::number(5,1) as app_achievement_rate_16_18,
  app.leavers::number(38,0) as app_leavers_16_18,
  {{ website_link_columns('coalesce(ga.website_url, du.website_url)') }},
  case when ga.website_url is not null then 'gias' when du.website_url is not null then 'discover-uni' end::varchar as website_from,
  coalesce(nullif(ga.postcode, ''), du.postcode)::varchar as postcode,
  p.local_authority_code::varchar as local_authority_code,
  p.lsoa21_code::varchar as lsoa21_code
from ukprns u
left join gias_open go on go.ukprn = u.ukprn
left join gias_any ga on ga.ukprn = u.ukprn
left join du_institution du on du.ukprn = u.ukprn
left join ofsted_fe fe on fe."Provider UKPRN" = u.ukprn
left join ofsted_fe_renewed fr on fr."Provider URN" = fe."Provider URN"
left join et on et.ukprn = u.ukprn
left join app on app.ukprn = u.ukprn
left join apar ap on ap."Ukprn" = u.ukprn
left join du_courses dc on dc.ukprn = u.ukprn
{{ website_link_join('coalesce(ga.website_url, du.website_url)') }}
left join {{ ref('postcode') }} p on p.postcode_compact = {{ compact_postcode("coalesce(nullif(ga.postcode, ''), du.postcode)") }}
where u.ukprn is not null and u.ukprn <> ''
