-- Which NEET figures answer for each local authority. The Department for
-- Education publishes NEET for upper-tier councils: unitary authorities and
-- county councils, not for the districts inside a county. A district has no
-- figure of its own, so it is pointed at its county council's (ONS Local
-- Authority District to County and Unitary Authority lookup), with a sentence
-- saying so. The county's figure is shown as published: it is never shared out
-- to the district or estimated for it. basis is own (the authority has its
-- own rows), county (its county's rows answer) or none (no NEET rows: outside
-- England, or a county with none in this release).
with england as (
  select local_authority_code, name
  from {{ ref('local_authority') }}
  where country_code = 'E92000001'
),
outside as (
  select local_authority_code, name
  from {{ ref('local_authority') }}
  where country_code <> 'E92000001'
),
neet_areas as (
  select area_code as code, area_name as name from {{ ref('neet_la_year') }} where geographic_level = 'Local authority'
  union
  select current_area_code, area_name from {{ ref('neet_la_year') }} where geographic_level = 'Local authority'
),
neet_names as (select code, min(name) as name from neet_areas group by 1),
pick as (
  select
    e.local_authority_code, e.name, true as in_england,
    k.county_code, k.county_name, k.two_tier,
    case
      when own.code is not null then 'own'
      when k.two_tier and cty.code is not null then 'county'
      else 'none'
    end as basis,
    case
      when own.code is not null then own.code
      when k.two_tier and cty.code is not null then cty.code
    end as neet_code
  from england e
  left join {{ ref('local_authority_county') }} k on k.local_authority_code = e.local_authority_code
  left join neet_names own on own.code = e.local_authority_code
  left join neet_names cty on cty.code = k.county_code
  union all
  select o.local_authority_code, o.name, false, null, null, null, 'none', null from outside o
)
select
  p.local_authority_code::varchar as local_authority_code,
  p.name::varchar as local_authority_name,
  p.basis::varchar as basis,
  p.neet_code::varchar as neet_area_code,
  n.name::varchar as neet_area_name,
  case
    when p.basis = 'county' then 'This figure is for ' || p.county_name || ' County Council. NEET figures aren''t published for ' || p.name || ' on its own.'
    when p.basis = 'none' and p.two_tier then 'NEET figures aren''t published for ' || p.name || ' on its own, or for ' || p.county_name || ' County Council in this release.'
    when p.basis = 'none' and p.in_england then 'NEET figures aren''t published for ' || p.name || '.'
    when p.basis = 'none' then 'NEET figures from the Department for Education cover England only.'
  end::varchar as figure_note,
  'https://geoportal.statistics.gov.uk/search?q=Local%20Authority%20District%20to%20County'::varchar as source_url,
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Office for National Statistics, licensed under the Open Government Licence v3.0.'::varchar as attribution
from pick p
left join neet_names n on n.code = p.neet_code
