-- PROVIDER has one row per distinct UKPRN across its sources (counted here
-- from bronze, independently of the model), every one a UKPRN or one of
-- Discover Uni's 9xxxxxxx codes for joint schools.
with gias as (
  select * from {{ source('options_raw', 'gias_establishment') }} where SOURCEFILEID = {{ latest_file('gias', 'GIAS_ESTABLISHMENT', 'options') }}
),
perf as (
  select distinct "school_urn" as urn from {{ source('options_raw', 'performance_16_18') }}
  where SOURCEFILEID = {{ latest_file('performance-16-18', 'PERFORMANCE_16_18_INSTITUTION', 'options') }}
    and "time_period" = (select max("time_period") from {{ source('options_raw', 'performance_16_18') }} where SOURCEFILEID = {{ latest_file('performance-16-18', 'PERFORMANCE_16_18_INSTITUTION', 'options') }})
),
bronze as (
  select "UKPRN" as ukprn from gias where "EstablishmentStatus (name)" like 'Open%'
  union select g."UKPRN" from gias g join perf p on p.urn = g."URN"
  union select "Ukprn" from {{ source('shared_raw', 'apar_provider') }} where SOURCEFILEID = {{ latest_file('apar', 'APAR_PROVIDER') }}
  union select "Provider UKPRN" from {{ source('options_raw', 'ofsted_fe_provider_list') }} where SOURCEFILEID = {{ latest_file('ofsted-fe', 'OFSTED_FE_D4_PROVIDER_LIST', 'options') }}
  union select "provider_ukprn" from {{ source('options_raw', 'achievement_et') }} where SOURCEFILEID = {{ latest_file('achievement-et', 'ACHIEVEMENT_ET_PROVIDER_SUMMARY', 'options') }} and "age_band" = 'Under 19' and "sector_subject_area_t1" = 'Total'
  union select "provider_ukprn" from {{ source('options_raw', 'achievement_app') }} where "ssa_tier_1" = 'Total' and "level" = 'Total' and "std_fwk_name_stcode" = 'Total' and "age_youth_adult" = '16-18' and "age_group" = 'Total'
  union select UKPRN from {{ source('options_raw', 'du_institution') }} where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_INSTITUTION', 'options') }}
  union select PUBUKPRN from {{ source('options_raw', 'du_institution') }} where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_INSTITUTION', 'options') }}
  union select UKPRN from {{ source('options_raw', 'du_kiscourse') }} where SOURCEFILEID = {{ latest_file('discover-uni', 'DISCOVERUNI_KISCOURSE', 'options') }}
)
select silver, bronze_count, bad_ukprns from (
  select (select count(*) from {{ ref('provider') }}) as silver,
         (select count(*) from bronze where ukprn is not null and ukprn <> '') as bronze_count,
         (select count(*) from {{ ref('provider') }} where not regexp_like(ukprn, '[19][0-9]{7}')) as bad_ukprns
) where silver <> bronze_count or bad_ukprns > 0
