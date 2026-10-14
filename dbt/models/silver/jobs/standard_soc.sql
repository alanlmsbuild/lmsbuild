-- The SOC 2020 unit groups of every apprenticeship standard, one row per
-- standard and unit group, from Skills England's latest import run: the
-- standard's own occupation and its options' occupations, each
-- occupation's SOC 2020 sub-unit groups (cut to the unit group), else its
-- single SOC 2020 code. The same rule the SOC coder uses for an advert's
-- standard (scripts/import-skills.js, scripts/vacancy-soc.js).
with version_run as (
  select RUNID from {{ source('shared_raw', 'se_standard_version') }}
  qualify row_number() over (order by FETCHEDAT desc) = 1
),
occupation_run as (
  select RUNID from {{ source('shared_raw', 'se_occupation') }}
  qualify row_number() over (order by FETCHEDAT desc) = 1
),
versions as (
  select ST_REFERENCE, VERSION, nullif(BODY:larsCode::number, 0) as lars_code, BODY:title::string as title,
         nullif(BODY:occupationCode::string, '') as occupation_code, BODY:options as options
  from {{ source('shared_raw', 'se_standard_version') }}
  where RUNID = (select RUNID from version_run)
),
links as (
  select ST_REFERENCE, lars_code, title, occupation_code, 'standard' as via from versions where occupation_code is not null
  union
  select v.ST_REFERENCE, v.lars_code, v.title, nullif(o.value:occupationCode::string, ''), 'option'
  from versions v, lateral flatten(input => v.options) o
  where o.value:optionId is not null and nullif(o.value:occupationCode::string, '') is not null
),
occupations as (
  select OCCUPATION_CODE, BODY from {{ source('shared_raw', 'se_occupation') }}
  where RUNID = (select RUNID from occupation_run) and HTTPSTATUS::string = '200' and BODY is not null
),
subs as (
  select o.OCCUPATION_CODE, left(g.value:code::string, 4) as unit_group, g.value:isPrimary::boolean as is_primary
  from occupations o, lateral flatten(input => o.BODY:soc:soc2020SubUnitGroups) g
  where regexp_like(g.value:code::string, '[0-9]{4}(/[0-9]{2})?')
),
occupation_soc as (
  select * from subs
  union all
  select o.OCCUPATION_CODE, o.BODY:soc:soc2020Code::string, true
  from occupations o
  where regexp_like(o.BODY:soc:soc2020Code::string, '[0-9]{4}')
    and not exists (select 1 from subs s where s.OCCUPATION_CODE = o.OCCUPATION_CODE and s.unit_group = o.BODY:soc:soc2020Code::string)
)

select
  (l.ST_REFERENCE || '|' || s.unit_group)::varchar as standard_soc_key,
  l.ST_REFERENCE::varchar as st_reference,
  max(l.lars_code)::number(38,0) as lars_code,
  max(l.title)::varchar as standard_title,
  s.unit_group::varchar as soc2020,
  max(u.title)::varchar as soc_title,
  case when count(distinct l.via) = 2 then 'both' else max(l.via) end::varchar as via,
  listagg(distinct l.occupation_code, ',') within group (order by l.occupation_code)::varchar as occupation_codes,
  boolor_agg(coalesce(s.is_primary, false)) as is_primary
from links l
join occupation_soc s on s.OCCUPATION_CODE = l.occupation_code
left join {{ soc_unit_groups() }} u on u.code = s.unit_group
group by l.ST_REFERENCE, s.unit_group
