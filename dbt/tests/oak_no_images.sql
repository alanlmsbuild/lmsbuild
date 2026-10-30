-- No Oak image address, and no question with an image, is in the quiz tables
-- or the lesson card (decision 56): the options app never calls Oak's servers.
select question_key as key from {{ ref('oak_quiz_question_card') }}
where question rlike '.*(cloudinary|thenational\\.academy/[^ ]*\\.(png|jpe?g|gif|svg|webp)).*'
union all
select answer_key from {{ ref('oak_quiz_answer_result') }}
where answer_text rlike '.*(cloudinary|\\.(png|jpe?g|gif|svg|webp)).*' or match_text rlike '.*(cloudinary|\\.(png|jpe?g|gif|svg|webp)).*'
union all
select lesson_key from {{ ref('oak_lesson_card') }}
where to_varchar(keywords) || to_varchar(key_learning_points) || to_varchar(misconceptions) || to_varchar(teacher_tips) rlike '.*cloudinary.*'
