-- NEET and activity-not-known rates for 16 and 17 year olds by local authority
-- and year (the Department for Education's local authority management
-- information, Explore education statistics), with the region and England rows
-- to compare with. All young people, not a group: by age 16, age 17 and both.
-- Every row says when the release was published and where it came from. The
-- honesty rules apply: a rate based on fewer than 10 young people is hidden,
-- and one the publisher withheld says so. Rates are percentages of the cohort
-- tracked; "not known" young people are counted in the NEET-or-not-known rate,
-- not the NEET rate, so a high not-known share means the NEET rate may be
-- understated. Built only when a newer file has been loaded (neet_reusable).
{% set reuse = neet_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with n as (
  select p.*,
    {{ figure_status('p.neet_percent_published', 'p.cohort_published') }} as neet_s,
    {{ figure_status('p.not_known_percent_published', 'p.cohort_published') }} as nk_s,
    {{ figure_status('p.neet_or_not_known_percent_published', 'p.cohort_published') }} as nnk_s,
    {{ figure_status('p.neet_count_published', 'p.cohort_published') }} as neet_c
  from {{ ref('neet_participation') }} p
  where p.characteristic_grouping = 'Total' and p.characteristic = 'Total'
)
select
  n.neet_key::varchar as neet_key,
  n.year::number(4,0) as year,
  n.geographic_level::varchar as geographic_level,
  coalesce(n.la_code, n.region_code, n.country_code)::varchar as area_code,
  coalesce(n.la_name, n.region_name, 'England')::varchar as area_name,
  n.region_name::varchar as region_name,
  n.age::varchar as age,
  case when n.neet_c = 'shown' then n.cohort end::float as cohort,
  case when n.neet_c = 'shown' then n.neet_count end::float as neet_count,
  case when n.neet_s = 'shown' then n.neet_percent end::float as neet_percent,
  n.neet_s::varchar as neet_status,
  case when n.nk_s = 'shown' then n.not_known_percent end::float as not_known_percent,
  n.nk_s::varchar as not_known_status,
  case when n.nnk_s = 'shown' then n.neet_or_not_known_percent end::float as neet_or_not_known_percent,
  n.nnk_s::varchar as neet_or_not_known_status,
  case when n.nnk_s = 'shown' then n.annual_change_points end::float as annual_change_points,
  'Local authority management information: authorities differ in how well they track 16 and 17 year olds, and a high activity-not-known share can change the NEET rate. NEET figures are an average of the December, January and February returns.'::varchar as caution,
  f.published_on::date as published_on,
  f.source_url::varchar as source_url,
  'Contains public sector information licensed under the Open Government Licence v3.0. Department for Education.'::varchar as attribution,
  {{ neet_stamp() }}::varchar as built_from
from n
cross join {{ ref('neet_feed') }} f
where n.age in ('16', '17', '16 to 17')
{% endif %}
