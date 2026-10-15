-- Achievement rates for 16 to 18 year olds at the institutions the app
-- shows (by their UKPRN), one row per institution, kind (education or
-- apprenticeships) and year, with the honesty rules applied, beside the
-- typical rate: our own middle figure of the published rates for the same
-- provider type, kind and year (rates shown and based on 30 or more), and
-- labelled as ours.
with kept as ({{ school_leavers_kept() }}),
inst as (select urn, ukprn from {{ ref('college_16_18') }} where urn in (select urn from kept) and ukprn is not null),
rates as (
  select a.*, {{ figure_status('a.rate_published', 'a.leavers_published') }} as rate_s, {{ reading_number('a.rate_published') }} as rate_n,
         {{ reading_number('a.leavers_published') }} as leavers_n
  from {{ ref('achievement_rate') }} a
),
typical as (
  select kind, provider_type, academic_year, round(median(rate_n) * 10) / 10 as typical, count(*) as providers
  from rates where rate_s = 'shown' and leavers_n >= {{ var('honesty_care_below') }}
  group by 1, 2, 3
),
words as ({{ provider_type_words() }})
select
  (i.urn || '|' || a.kind || '|' || a.academic_year)::varchar as achievement_key,
  i.urn::varchar as urn,
  i.ukprn::varchar as ukprn,
  a.kind::varchar as kind,
  a.academic_year::varchar as academic_year,
  a.provider_type::varchar as provider_type,
  coalesce(w.words, a.provider_type)::varchar as provider_type_words,
  {{ figure_columns('a.rate_published', 'a.leavers_published') }},
  t.typical::float as typical_rate,
  t.providers::number(38,0) as typical_providers,
  ('achievement-' || case a.kind when 'education' then 'et' else 'app' end)::varchar as source,
  a.source_file_id::varchar as source_file_id,
  to_date(sf.ORIGINALMODIFIEDAT) as downloaded_on
from inst i
join rates a on a.ukprn = i.ukprn
{{ source_file_join('sf', 'a.source_file_id') }}
left join typical t on t.kind = a.kind and t.provider_type = a.provider_type and t.academic_year = a.academic_year
left join words w on w.provider_type = a.provider_type
