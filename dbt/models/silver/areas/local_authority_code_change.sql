-- Every change of a local authority's code in the ONS Code History Database
-- (England, Wales, Scotland and Northern Ireland, since the codes were
-- reissued in 2009): the code it had, the code it has, the order that made
-- the change and its date, and what kind of change it was.
--   recoded          one old code to one new code (a new code for the same area)
--   boundary_change  the order moved a boundary, so the area is not quite the
--                    same on either side (Barnsley and Sheffield, 1 April 2025)
--   merged           several areas became one (Bournemouth, Christchurch and Poole)
--   split            one area became several
-- line_up is true only where the new code is the same authority continuing
-- (same name, recoded or boundary_change); a merge or a split never lines up,
-- because the figures of the parts cannot be added up or shared out.
with f as {{ chd_files() }},
c as (
  select distinct
    GEOGCD_P::varchar as old_code,
    GEOGNM_P::varchar as old_name,
    GEOGCD::varchar as new_code,
    GEOGNM::varchar as new_name,
    ENTITYCD::varchar as area_kind,
    SI_ID::varchar as order_id,
    SI_TITLE::varchar as order_title,
    try_to_date(left(OPER_DATE, 10), 'DD/MM/YYYY') as change_date,
    SOURCEFILEID::varchar as source_file_id
  from {{ source('shared_raw', 'ons_code_change') }}
  where SOURCEFILEID in (select SOURCEFILEID from f)
    and ENTITYCD in ('E06', 'E07', 'E08', 'E09', 'W06', 'S12', 'N09')
    and regexp_like(GEOGCD, '^[EWSN][0-9]{8}$')
    and regexp_like(GEOGCD_P, '^[EWSN][0-9]{8}$')
    and GEOGCD <> GEOGCD_P
),
n as (
  select c.*,
    count(distinct new_code) over (partition by old_code, order_id) as successors,
    count(distinct old_code) over (partition by new_code, order_id) as predecessors
  from c
),
k as (
  select n.*,
    case when order_title ilike '%boundar%' then 'boundary_change'
         when predecessors > 1 and successors = 1 then 'merged'
         when successors > 1 then 'split'
         else 'recoded' end as relationship
  from n
)
select
  old_code, old_name, new_code, new_name, area_kind, order_id, order_title,
  change_date::date as change_date,
  relationship::varchar as relationship,
  (relationship in ('recoded', 'boundary_change') and new_name = old_name)::boolean as line_up,
  successors::number as successors,
  predecessors::number as predecessors,
  source_file_id
from k
