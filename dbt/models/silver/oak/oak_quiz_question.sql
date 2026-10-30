-- The questions of Oak National Academy's starter and exit quizzes (decision
-- 56), one row per question, for the open lessons. Questions with an image on
-- the question or an answer were left out before loading. Built only when a
-- newer Oak file has been loaded (oak_reusable, dbt/macros/oak.sql).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with q as (
  select LESSON_SLUG as lesson_slug, ITEM as i
  from {{ source('options_raw', 'oak_quiz') }}
  where SOURCEFILEID in {{ oak_files() }}
),
flat as (
  select lesson_slug, 'starter' as quiz, f.index + 1 as question_number, f.value as v
  from q, lateral flatten(input => q.i:starterQuiz) f
  union all
  select lesson_slug, 'exit', f.index + 1, f.value
  from q, lateral flatten(input => q.i:exitQuiz) f
)
select
  md5(concat_ws('|', lesson_slug, quiz, question_number::varchar))::varchar as question_key,
  lesson_slug::varchar as lesson_slug,
  quiz::varchar as quiz,
  question_number::number(10,0) as question_number,
  v:questionType::varchar as question_type,
  v:question::varchar as question,
  array_size(v:answers)::number(10,0) as answer_count,
  {{ oak_stamp() }}::varchar as built_from
from flat
{% endif %}
