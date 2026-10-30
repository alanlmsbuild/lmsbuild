-- Oak National Academy's secondary units (decision 56), one row per unit as a
-- pathway, tier, exam board and year teach it, with how many of its lessons
-- are open and how many link-only. A unit's description and why-this-why-now
-- text are there only when it has an open lesson. Built only when a newer Oak
-- file has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with open_slugs as (
  select distinct lesson_slug from {{ ref('oak_lesson') }} where not is_restricted
),
unit_lesson as (
  select u.unit_key, f.value::varchar as lesson_slug
  from {{ ref('oak_unit') }} u, lateral flatten(input => u.lesson_slugs) f
),
per_unit as (
  select ul.unit_key,
    count(*) as lessons,
    count_if(o.lesson_slug is not null) as open_lessons
  from unit_lesson ul
  left join open_slugs o on o.lesson_slug = ul.lesson_slug
  group by ul.unit_key
)
select
  u.unit_key::varchar as unit_key,
  u.subject_slug::varchar as subject_slug,
  u.subject_title::varchar as subject_title,
  u.child_subject::varchar as child_subject,
  u.unit_slug::varchar as unit_slug,
  u.unit_title::varchar as unit_title,
  u.key_stage::varchar as key_stage,
  u.year::number(2,0) as year,
  u.pathway::varchar as pathway,
  u.tier::varchar as tier,
  u.exam_board_slug::varchar as exam_board_slug,
  u.exam_board::varchar as exam_board,
  u.description::varchar as description,
  u.why_this_why_now::varchar as why_this_why_now,
  coalesce(p.lessons, 0)::number(10,0) as lessons,
  coalesce(p.open_lessons, 0)::number(10,0) as open_lessons,
  (coalesce(p.lessons, 0) - coalesce(p.open_lessons, 0))::number(10,0) as link_only_lessons,
  u.oak_url::varchar as oak_url,
  {{ oak_attribution('u.subject_slug', 'u.subject_title') }}::varchar as attribution,
  {{ oak_licence_url() }}::varchar as licence_url,
  to_date(f.loaded_at)::date as downloaded_on,
  {{ oak_stamp() }}::varchar as built_from
from {{ ref('oak_unit') }} u
left join per_unit p on p.unit_key = u.unit_key
cross join {{ ref('oak_feed') }} f
{% endif %}
