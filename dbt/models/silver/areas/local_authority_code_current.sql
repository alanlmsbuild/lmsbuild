-- Today's code for every local authority code that has been replaced, so that
-- a figure published under an old code is shown under today's council. Only
-- the changes that line up are followed (local_authority_code_change.line_up),
-- through as many changes as it took (Glasgow City had four codes since 2009).
-- A merged or split authority has no row: its figures are left under the code
-- they were published with. boundary_changed_on is the date of the latest
-- change of boundary on the way, so a caller can say that figures before then
-- are for the old boundary.
with recursive links as (
  select old_code, new_code, new_name, change_date, relationship
  from {{ ref('local_authority_code_change') }}
  where line_up
),
walk (old_code, code, name, hops, last_changed_on, boundary_changed_on) as (
  select old_code, new_code, new_name, 1, change_date, iff(relationship = 'boundary_change', change_date, null)
  from links
  union all
  select w.old_code, l.new_code, l.new_name, w.hops + 1, l.change_date,
    case when l.relationship = 'boundary_change' then l.change_date else w.boundary_changed_on end
  from walk w
  join links l on l.old_code = w.code
  where w.hops < 10
),
last as (
  select * from walk qualify row_number() over (partition by old_code order by hops desc) = 1
)
select
  old_code::varchar as old_code,
  code::varchar as current_code,
  name::varchar as current_name,
  hops::number as changes,
  last_changed_on::date as last_changed_on,
  boundary_changed_on::date as boundary_changed_on
from last
