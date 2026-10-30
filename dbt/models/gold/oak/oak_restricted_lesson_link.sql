-- Oak National Academy's restricted lessons as link-only rows (decision 56): a
-- lesson with third-party material, of which Rarebit keeps and shows only the
-- title, unit, exam board and a link to the lesson on Oak's website (Oak
-- confirmed on 27 October 2026 that those are not restricted). This is how the
-- subjects with no open lesson (art, English, French, geography, German,
-- music, religious education, Spanish) are still seen. Built only when a
-- newer Oak file has been loaded (oak_reusable).
{% set reuse = oak_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
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
  'This lesson includes material from other owners, so Oak does not license it for reuse. Open it on Oak''s website.'::varchar as note,
  {{ oak_attribution('l.subject_slug', 'l.subject_title') }}::varchar as attribution,
  {{ oak_licence_url() }}::varchar as licence_url,
  to_date(f.loaded_at)::date as downloaded_on,
  {{ oak_stamp() }}::varchar as built_from
from {{ ref('oak_lesson') }} l
cross join {{ ref('oak_feed') }} f
where l.is_restricted
{% endif %}
