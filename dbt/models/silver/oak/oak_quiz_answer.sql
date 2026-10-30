-- The answers of Oak National Academy's quiz questions (decision 56), one row
-- per answer, flattened from the question. By question type:
--   multiple-choice  answer_text is a choice; is_correct is false for a distractor
--   short-answer     answer_text is one accepted answer; is_correct is true
--   order            answer_text is an item; answer_order is its place
--   match            answer_text is the item to match; match_text is its match
-- Built only when a newer Oak file has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
with q as (
  select LESSON_SLUG as lesson_slug, ITEM as i
  from {{ source('options_raw', 'oak_quiz') }}
  where SOURCEFILEID in {{ oak_files() }}
),
questions as (
  select lesson_slug, 'starter' as quiz, f.index + 1 as question_number, f.value as v
  from q, lateral flatten(input => q.i:starterQuiz) f
  union all
  select lesson_slug, 'exit', f.index + 1, f.value
  from q, lateral flatten(input => q.i:exitQuiz) f
)
select
  md5(concat_ws('|', lesson_slug, quiz, question_number::varchar, a.index::varchar))::varchar as answer_key,
  md5(concat_ws('|', lesson_slug, quiz, question_number::varchar))::varchar as question_key,
  lesson_slug::varchar as lesson_slug,
  quiz::varchar as quiz,
  question_number::number(10,0) as question_number,
  (a.index + 1)::number(10,0) as answer_number,
  coalesce(a.value:content::varchar, a.value:matchOption:content::varchar) as answer_text,
  a.value:correctChoice:content::varchar as match_text,
  (not coalesce(a.value:distractor::boolean, false))::boolean as is_correct,
  a.value:order::number(10,0) as answer_order,
  {{ oak_stamp() }}::varchar as built_from
from questions, lateral flatten(input => questions.v:answers) a
{% endif %}
