-- The honesty rules hold on every gold figure (the gold plan): nothing is
-- shown that is based on fewer than 10 people; small_group is set exactly
-- when shown and based on 10 to 29; a shown figure has a value and a base,
-- a hidden one neither, and says why; every figure has its source, file
-- and date.
with figures as (
  select 'institution_result' as model, result_key as key_, status, value_text, value_number, base, small_group, hidden_reason, source, source_file_id, retrieved_on from {{ ref('institution_result') }}
  union all
  select 'institution_achievement', achievement_key, status, value_text, value_number, base, small_group, hidden_reason, source, source_file_id, retrieved_on from {{ ref('institution_achievement') }}
)
select model, key_, status, base, small_group, hidden_reason from figures
where (status = 'shown' and (base is null or base < {{ var('honesty_hide_below') }}))
   or (status = 'shown' and small_group <> (base < {{ var('honesty_care_below') }}))
   or (status = 'shown' and value_text is null and value_number is null)
   or (status = 'shown' and hidden_reason is not null)
   or (status <> 'shown' and (value_text is not null or value_number is not null or base is not null or small_group or hidden_reason is null))
   or source is null or source_file_id is null or retrieved_on is null
