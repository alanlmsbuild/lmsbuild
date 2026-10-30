-- Oak National Academy's secondary lessons (decision 56), one row per lesson in
-- a unit of a sequence and exam board. A restricted lesson (Oak's own check says
-- so, or its flag does) has its title, unit and exam board only; its link is the
-- address Oak's website gives every lesson. key_stages and years come from the
-- units it sits in (a lesson can sit in units of more than one year; one with no
-- single exam board takes them from all the boards' units). The
-- transcript is not carried into silver. Built only when a newer Oak file has
-- been loaded (oak_reusable, dbt/macros/oak.sql).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with l as (
  select
    SEQUENCE_SLUG as sequence_slug,
    LESSON_SLUG as lesson_slug,
    UNIT_SLUG as unit_slug,
    nullif(EXAM_BOARD_SLUG, '') as exam_board_slug,
    RESTRICTED as is_restricted,
    ITEM as i
  from {{ source('options_raw', 'oak_lesson') }}
  where SOURCEFILEID in {{ oak_files() }}
),
where_taught as (
  select
    sequence_slug, unit_slug, exam_board_slug,
    listagg(distinct key_stage, ', ') within group (order by key_stage) as key_stages,
    listagg(distinct to_varchar(year), ', ') within group (order by to_varchar(year)) as years,
    min(exam_board) as exam_board
  from {{ ref('oak_unit') }}
  group by all
),
where_taught_any as (
  select
    sequence_slug, unit_slug,
    listagg(distinct key_stage, ', ') within group (order by key_stage) as key_stages,
    listagg(distinct to_varchar(year), ', ') within group (order by to_varchar(year)) as years
  from {{ ref('oak_unit') }}
  group by all
)
select
  md5(concat_ws('|', l.sequence_slug, l.unit_slug, l.lesson_slug, coalesce(l.exam_board_slug, '')))::varchar as lesson_key,
  l.lesson_slug::varchar as lesson_slug,
  l.i:lessonTitle::varchar as lesson_title,
  l.sequence_slug::varchar as sequence_slug,
  replace(l.sequence_slug, '-secondary', '')::varchar as subject_slug,
  {{ oak_subject_title("replace(l.sequence_slug, '-secondary', '')") }}::varchar as subject_title,
  l.unit_slug::varchar as unit_slug,
  l.i:unitTitle::varchar as unit_title,
  coalesce(w.key_stages, a.key_stages)::varchar as key_stages,
  coalesce(w.years, a.years)::varchar as years,
  l.exam_board_slug::varchar as exam_board_slug,
  coalesce(w.exam_board, case when l.exam_board_slug is not null then upper(l.exam_board_slug) end)::varchar as exam_board,
  l.is_restricted::boolean as is_restricted,
  {{ oak_lesson_url('l.lesson_slug') }}::varchar as oak_url,
  nullif(trim(l.i:pupilLessonOutcome::varchar), '')::varchar as pupil_lesson_outcome,
  l.i:lessonKeywords::variant as keywords,
  l.i:keyLearningPoints::variant as key_learning_points,
  l.i:misconceptionsAndCommonMistakes::variant as misconceptions,
  l.i:teacherTips::variant as teacher_tips,
  l.i:contentGuidance::variant as content_guidance,
  l.i:supervisionLevel::varchar as supervision_level,
  l.i:downloadsavailable::boolean as downloads_available,
  {{ oak_stamp() }}::varchar as built_from
from l
left join where_taught w
  on w.sequence_slug = l.sequence_slug and w.unit_slug = l.unit_slug
  and l.exam_board_slug is not null and w.exam_board_slug = l.exam_board_slug
left join where_taught_any a
  on a.sequence_slug = l.sequence_slug and a.unit_slug = l.unit_slug
{% endif %}
