-- NEET and activity not known, age 16 to 17, from the Department for
-- Education's local authority management information (Explore education
-- statistics), 2019 onwards: one row per area (local authority, region or
-- England), year, age and group (all young people, or by sex, ethnic group or
-- SEND). Counts are averages of the December, January and February returns,
-- so they are not whole numbers. Each figure is kept as published (c: withheld
-- for a group of 5 or fewer; z: does not apply) beside the number. Built only
-- when a newer file has been loaded (neet_reusable, dbt/macros/ncs.sql).
{% set reuse = neet_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with n as (
  select * from {{ source('shared_raw', 'neet_16_17_by_characteristics') }}
  where SOURCEFILEID in {{ neet_files() }}
)
select
  md5(concat_ws('|', "time_period", "geographic_level", coalesce(nullif("new_la_code", ''), nullif("region_code", ''), "country_code"),
    "age", "characteristic_grouping", "characteristic"))::varchar as neet_key,
  try_to_number("time_period", 4, 0)::number(4,0) as year,
  "geographic_level"::varchar as geographic_level,
  {{ txt('"country_code"') }}::varchar as country_code,
  {{ txt('"region_code"') }}::varchar as region_code,
  {{ txt('"region_name"') }}::varchar as region_name,
  {{ txt('"new_la_code"') }}::varchar as la_code,
  {{ txt('"old_la_code"') }}::varchar as old_la_code,
  {{ txt('"la_name"') }}::varchar as la_name,
  "age"::varchar as age,
  "characteristic_grouping"::varchar as characteristic_grouping,
  "characteristic"::varchar as characteristic,
  "avg_cohort_count"::varchar as cohort_published,
  "avg_neet_count"::varchar as neet_count_published,
  "avg_nk_count"::varchar as not_known_count_published,
  "avg_neet_nk_count"::varchar as neet_or_not_known_count_published,
  "neet_percent"::varchar as neet_percent_published,
  "nk_percent"::varchar as not_known_percent_published,
  "neet_nk_percent"::varchar as neet_or_not_known_percent_published,
  "annual_change_neet_nk_percent"::varchar as annual_change_published,
  {{ reading_number('"avg_cohort_count"') }}::float as cohort,
  {{ reading_number('"avg_neet_count"') }}::float as neet_count,
  {{ reading_number('"avg_nk_count"') }}::float as not_known_count,
  {{ reading_number('"avg_neet_nk_count"') }}::float as neet_or_not_known_count,
  {{ reading_number('"neet_percent"') }}::float as neet_percent,
  {{ reading_number('"nk_percent"') }}::float as not_known_percent,
  {{ reading_number('"neet_nk_percent"') }}::float as neet_or_not_known_percent,
  {{ reading_number('"annual_change_neet_nk_percent"') }}::float as annual_change_points,
  {{ neet_stamp() }}::varchar as built_from
from n
{% endif %}
