-- Nearly every open Oak lesson has quiz questions: the ones that do not are
-- those whose questions all have images (22 on 30 October 2026, mostly
-- maths). More than 40 means the quiz fetch missed lessons (decision 56).
select count(*) as open_lessons_without_questions from (
  select distinct lesson_slug from {{ ref('oak_lesson') }} where not is_restricted
  minus
  select distinct lesson_slug from {{ ref('oak_quiz_question') }}
) having count(*) > 40
