-- Oak National Academy's secondary units (decision 56), one row per unit as a
-- pathway, tier, exam board and year teach it (a unit slug repeats across
-- them). A unit with no open lesson has no description or why-this-why-now
-- text: the loader removed them. Built only when a newer Oak file has been
-- loaded (oak_reusable, dbt/macros/oak.sql).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with u as (
  select SEQUENCE_SLUG, UNIT_SLUG, ITEM as i
  from {{ source('options_raw', 'oak_unit') }}
  where SOURCEFILEID in {{ oak_files() }}
)
select
  md5(concat_ws('|', sequence_slug, unit_slug, coalesce(pathway_slug, ''), coalesce(tier_slug, ''), coalesce(exam_board_slug, ''), coalesce(year::varchar, '')))::varchar as unit_key,
  sequence_slug::varchar as sequence_slug,
  subject_slug::varchar as subject_slug,
  {{ oak_subject_title('subject_slug') }}::varchar as subject_title,
  child_subject::varchar as child_subject,
  unit_slug::varchar as unit_slug,
  unit_title::varchar as unit_title,
  key_stage::varchar as key_stage,
  year::number(2,0) as year,
  pathway_slug::varchar as pathway,
  tier_slug::varchar as tier,
  exam_board_slug::varchar as exam_board_slug,
  exam_board_title::varchar as exam_board,
  description::varchar as description,
  why_this_why_now::varchar as why_this_why_now,
  has_open_lessons::boolean as has_open_lessons,
  lesson_count::number(10,0) as lesson_count,
  lesson_slugs::variant as lesson_slugs,
  oak_url::varchar as oak_url,
  {{ oak_stamp() }}::varchar as built_from
from (
  select
    SEQUENCE_SLUG as sequence_slug,
    replace(SEQUENCE_SLUG, '-secondary', '') as subject_slug,
    i:programmeFactors:childSubject:title::varchar as child_subject,
    UNIT_SLUG as unit_slug,
    i:unitTitle::varchar as unit_title,
    i:keyStageSlug::varchar as key_stage,
    i:year::number as year,
    nullif(i:programmeFactors:pathway:slug::varchar, '') as pathway_slug,
    nullif(coalesce(i:tier:tierSlug::varchar, i:programmeFactors:tier:slug::varchar), '') as tier_slug,
    nullif(coalesce(i:examBoard:slug::varchar, i:programmeFactors:examBoard:slug::varchar), '') as exam_board_slug,
    nullif(coalesce(i:examBoard:title::varchar, i:programmeFactors:examBoard:title::varchar), '') as exam_board_title,
    nullif(trim(i:description::varchar), '') as description,
    nullif(trim(i:whyThisWhyNow::varchar), '') as why_this_why_now,
    coalesce(i:hasOpenLessons::boolean, false) as has_open_lessons,
    array_size(i:unitLessons) as lesson_count,
    transform(i:unitLessons::array, l -> l:lessonSlug::varchar) as lesson_slugs,
    i:canonicalUrl::varchar as oak_url
  from u
)
{% endif %}
