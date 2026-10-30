-- The Oak silver tables have one row per row of the latest files: units,
-- lessons, and one question per question in the quizzes (decision 56).
select table_name, silver, bronze from (
  select 'oak_unit' as table_name,
         (select count(*) from {{ ref('oak_unit') }}) as silver,
         (select count(*) from {{ source('options_raw', 'oak_unit') }} where SOURCEFILEID in {{ oak_files() }}) as bronze
  union all
  select 'oak_lesson',
         (select count(*) from {{ ref('oak_lesson') }}),
         (select count(*) from {{ source('options_raw', 'oak_lesson') }} where SOURCEFILEID in {{ oak_files() }})
  union all
  select 'oak_quiz_question',
         (select count(*) from {{ ref('oak_quiz_question') }}),
         (select sum(array_size(ITEM:starterQuiz) + array_size(ITEM:exitQuiz)) from {{ source('options_raw', 'oak_quiz') }} where SOURCEFILEID in {{ oak_files() }})
) where silver <> bronze
