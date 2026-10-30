-- Oak National Academy's open lessons (decision 56), one row per lesson in a
-- unit of a sequence and exam board: what a student or adviser sees behind a
-- subject, with Oak's attribution line and the link to the licence, and how
-- many quiz questions it has. Restricted lessons are in oak_restricted_lesson_link.
-- Built only when a newer Oak file has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with counts as (
  select lesson_slug,
    count_if(quiz = 'starter')::number(10,0) as starter_questions,
    count_if(quiz = 'exit')::number(10,0) as exit_questions
  from {{ ref('oak_quiz_question') }}
  group by lesson_slug
)
select
  l.lesson_key::varchar as lesson_key,
  l.lesson_slug::varchar as lesson_slug,
  l.lesson_title::varchar as lesson_title,
  l.subject_slug::varchar as subject_slug,
  l.subject_title::varchar as subject_title,
  l.unit_slug::varchar as unit_slug,
  l.unit_title::varchar as unit_title,
  l.key_stages::varchar as key_stages,
  l.years::varchar as years,
  l.exam_board_slug::varchar as exam_board_slug,
  l.exam_board::varchar as exam_board,
  l.oak_url::varchar as oak_url,
  l.pupil_lesson_outcome::varchar as pupil_lesson_outcome,
  l.keywords::variant as keywords,
  l.key_learning_points::variant as key_learning_points,
  l.misconceptions::variant as misconceptions,
  l.teacher_tips::variant as teacher_tips,
  l.content_guidance::variant as content_guidance,
  l.supervision_level::varchar as supervision_level,
  l.downloads_available::boolean as downloads_available,
  coalesce(c.starter_questions, 0)::number(10,0) as starter_questions,
  coalesce(c.exit_questions, 0)::number(10,0) as exit_questions,
  {{ oak_attribution('l.subject_slug', 'l.subject_title') }}::varchar as attribution,
  {{ oak_licence_url() }}::varchar as licence_url,
  to_date(f.loaded_at)::date as downloaded_on,
  {{ oak_stamp() }}::varchar as built_from
from {{ ref('oak_lesson') }} l
left join counts c on c.lesson_slug = l.lesson_slug
cross join {{ ref('oak_feed') }} f
where not l.is_restricted
{% endif %}
