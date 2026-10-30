-- Most course runs have a learning aim reference that is in LARS (89% of
-- distinct references on 30 October 2026). Fewer than 75% means the LARS file
-- or the join has gone wrong.
select matched_share from (
  select avg(case when lars_matched then 1 else 0 end) as matched_share
  from {{ ref('ncs_course') }}
  where learn_aim_ref is not null
) where matched_share < 0.75
