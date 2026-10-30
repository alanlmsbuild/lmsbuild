-- The starter and exit quiz questions of Oak National Academy's open lessons
-- (decision 56), one row per lesson and question, with the lesson's title,
-- subject and attribution. Questions with images are not here. Built only
-- when a newer Oak file has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with lessons as (
  select lesson_slug, any_value(lesson_title) as lesson_title, any_value(subject_slug) as subject_slug, any_value(subject_title) as subject_title
  from {{ ref('oak_lesson') }}
  where not is_restricted
  group by lesson_slug
)
select
  q.question_key::varchar as question_key,
  q.lesson_slug::varchar as lesson_slug,
  l.lesson_title::varchar as lesson_title,
  l.subject_slug::varchar as subject_slug,
  l.subject_title::varchar as subject_title,
  q.quiz::varchar as quiz,
  q.question_number::number(10,0) as question_number,
  q.question_type::varchar as question_type,
  q.question::varchar as question,
  q.answer_count::number(10,0) as answer_count,
  {{ oak_lesson_url('q.lesson_slug') }}::varchar as oak_url,
  {{ oak_attribution('l.subject_slug', 'l.subject_title') }}::varchar as attribution,
  {{ oak_licence_url() }}::varchar as licence_url,
  {{ oak_stamp() }}::varchar as built_from
from {{ ref('oak_quiz_question') }} q
join lessons l on l.lesson_slug = q.lesson_slug
{% endif %}
