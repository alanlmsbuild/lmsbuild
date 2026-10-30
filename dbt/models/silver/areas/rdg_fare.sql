-- The fares for the ticket kinds the panel shows (train_ticket_kind) on those
-- flows, from the flow file's fare records (RSPS5045 4.1.3): the adult fare
-- in pence, exactly as published, with the dates of its flow. One row per
-- journey, flow and ticket.
-- It is parsed only when the feed (or the seeds it reads) has changed:
-- otherwise the live table is copied (rdg_reusable, dbt/macros/rdg.sql).
{% set reuse = rdg_reusable() %}
{% if reuse %}
select * from {{ reuse }}
{% else %}
select
  fl.journey_key::varchar as journey_key,
  fl.flow_id::varchar as flow_id,
  fl.route_code::varchar as route_code,
  substr(t.line, 10, 3)::varchar as ticket_code,
  try_to_number(substr(t.line, 13, 8))::number(10,0) as fare_pence,
  nullif(trim(substr(t.line, 21, 2)), '')::varchar as restriction_code,
  fl.start_date::date as start_date,
  fl.end_date::date as end_date,
  {{ rdg_stamp() }}::varchar as built_from
from {{ rdg_lines('FFL') }} t
join {{ ref('rdg_flow') }} fl on fl.flow_id = substr(t.line, 3, 7)
where substr(t.line, 2, 1) = 'T'
  and substr(t.line, 10, 3) in (select ticket_code from {{ ref('train_ticket_kind') }})
{% endif %}
