-- The changes of local authority codes (ONS Code History Database), for lining
-- figures published under an old code up under today's councils. One row per
-- change: the old and new code and name, the order and date, the kind of change
-- and whether the new code is the same authority continuing (line_up), with
-- today's code at the end of the chain (current_code) where it lines up, and the
-- date of the latest boundary change on the way. Where a merge or a split took
-- place there is no current code: those figures stay under the code they were
-- published with. Every row says where it came from.
select
  h.old_code::varchar as old_code,
  h.old_name::varchar as old_name,
  h.new_code::varchar as new_code,
  h.new_name::varchar as new_name,
  h.order_id::varchar as order_id,
  h.order_title::varchar as order_title,
  h.change_date::date as change_date,
  h.relationship::varchar as relationship,
  h.line_up::boolean as line_up,
  c.current_code::varchar as current_code,
  c.current_name::varchar as current_name,
  c.boundary_changed_on::date as boundary_changed_on,
  'https://geoportal.statistics.gov.uk/search?q=Code%20History%20Database'::varchar as source_url,
  'Contains public sector information licensed under the Open Government Licence v3.0. Source: Office for National Statistics, licensed under the Open Government Licence v3.0.'::varchar as attribution
from {{ ref('local_authority_code_change') }} h
left join {{ ref('local_authority_code_current') }} c on c.old_code = h.old_code
