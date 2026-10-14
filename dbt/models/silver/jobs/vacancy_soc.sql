-- The SOC 2020 codes for every advert (scripts/vacancy-soc.js), one row per
-- advert and code, with the occupation's title, kept by the coder's rule: a
-- code that stops applying to a live advert is marked gone (GONE_AT, not
-- current) and never deleted; a code that applies again has GONE_AT cleared
-- on the same row; an advert that goes keeps its codes as they were.
select
  (s.VACANCYREFERENCE || '|' || s.SOC2020)::varchar as vacancy_soc_key,
  s.VACANCYREFERENCE::varchar as vacancy_reference,
  s.SOC2020::varchar as soc2020,
  u.title::varchar as soc_title,
  left(s.SOC2020, 3)::varchar as soc_minor_group,
  s.METHOD::varchar as method,
  s.FLAG::varchar as flag,
  s.TITLESOC::varchar as title_soc,
  s.MATCHEDTITLE::varchar as matched_title,
  s.CODERVERSION::varchar as coder_version,
  (s.GONEAT is null) as is_current,
  s.FIRSTSEENAT::timestamp_ltz as first_seen_at,
  s.LASTCHANGEDAT::timestamp_ltz as last_changed_at,
  s.GONEAT::timestamp_ltz as gone_at
from {{ source('shared_ext', 'vacancy_soc') }} s
left join {{ soc_unit_groups() }} u on u.code = s.SOC2020
