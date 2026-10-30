-- The answers to the quiz questions in oak_quiz_question_card (decision 56), one row
-- per answer, in the shape described in the silver model of the same name.
-- Built only when a newer Oak file has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
select
  a.answer_key::varchar as answer_key,
  a.question_key::varchar as question_key,
  a.lesson_slug::varchar as lesson_slug,
  a.quiz::varchar as quiz,
  a.question_number::number(10,0) as question_number,
  a.answer_number::number(10,0) as answer_number,
  a.answer_text::varchar as answer_text,
  a.match_text::varchar as match_text,
  a.is_correct::boolean as is_correct,
  a.answer_order::number(10,0) as answer_order,
  {{ oak_stamp() }}::varchar as built_from
from {{ ref('oak_quiz_answer') }} a
where a.question_key in (select question_key from {{ ref('oak_quiz_question') }})
{% endif %}
