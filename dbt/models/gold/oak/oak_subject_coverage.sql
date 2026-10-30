-- What Oak National Academy's secondary curriculum covers, one row per subject
-- (decision 56): its units, how many lessons are open and how many are
-- link-only, and the quizzes. A subject with no open lesson (art, English,
-- French, geography, German, music, religious education, Spanish) is link-only
-- throughout: see oak_restricted_lesson_link. Built only when a newer Oak file
-- has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with lessons as (
  select subject_slug, subject_title, lesson_slug, max(is_restricted::int) as restricted_any, min(is_restricted::int) as restricted_all
  from {{ ref('oak_lesson') }}
  group by all
),
by_subject as (
  select subject_slug, subject_title,
    count(*) as lessons,
    count_if(restricted_all = 0) as open_lessons
  from lessons
  group by all
),
units as (
  select subject_slug, count(*) as units from {{ ref('oak_unit') }} group by subject_slug
),
quizzes as (
  select replace(l.sequence_slug, '-secondary', '') as subject_slug,
    count(distinct q.lesson_slug) as lessons_with_quiz,
    count(*) as quiz_questions
  from {{ ref('oak_quiz_question') }} q
  join (select distinct lesson_slug, sequence_slug from {{ ref('oak_lesson') }} where not is_restricted) l on l.lesson_slug = q.lesson_slug
  group by all
)
select
  s.subject_slug::varchar as subject_slug,
  s.subject_title::varchar as subject_title,
  coalesce(u.units, 0)::number(10,0) as units,
  s.lessons::number(10,0) as lessons,
  s.open_lessons::number(10,0) as open_lessons,
  (s.lessons - s.open_lessons)::number(10,0) as link_only_lessons,
  coalesce(q.lessons_with_quiz, 0)::number(10,0) as lessons_with_quiz,
  coalesce(q.quiz_questions, 0)::number(10,0) as quiz_questions,
  (s.open_lessons = 0)::boolean as link_only_subject,
  {{ oak_attribution('s.subject_slug', 's.subject_title') }}::varchar as attribution,
  {{ oak_licence_url() }}::varchar as licence_url,
  to_date(f.loaded_at)::date as downloaded_on,
  {{ oak_stamp() }}::varchar as built_from
from by_subject s
left join units u on u.subject_slug = s.subject_slug
left join quizzes q on q.subject_slug = s.subject_slug
cross join {{ ref('oak_feed') }} f
{% endif %}
