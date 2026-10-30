-- A lesson is open or restricted, never both (Oak's check decides per lesson
-- slug), and a restricted lesson is not in the open lesson card or the quiz
-- tables (decision 56).
select lesson_slug from {{ ref('oak_lesson') }}
group by lesson_slug
having max(is_restricted::int) <> min(is_restricted::int)
union all
select c.lesson_slug from {{ ref('oak_lesson_card') }} c
join {{ ref('oak_lesson') }} r on r.lesson_slug = c.lesson_slug and r.is_restricted
union all
select q.lesson_slug from {{ ref('oak_quiz_question') }} q
join {{ ref('oak_lesson') }} r on r.lesson_slug = q.lesson_slug and r.is_restricted
