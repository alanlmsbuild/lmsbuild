-- The 1 April 2025 recode: Barnsley E08000016 to E08000038 and Sheffield E08000019 to
-- E08000039, each with a boundary change, and Barnsley's old code never lined up with
-- Sheffield's.
select 'missing' as problem from (select 1) where
  (select count(*) from {{ ref('local_authority_code_current') }}
   where (old_code, current_code) in (('E08000016', 'E08000038'), ('E08000019', 'E08000039'))
     and boundary_changed_on = '2025-04-01') <> 2
