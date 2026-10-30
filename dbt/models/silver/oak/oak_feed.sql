-- Which Oak National Academy files silver and gold are built from (decision
-- 56): how many, when the newest was loaded, and the stamp every Oak model
-- stores in built_from (macros/oak.sql). One row.
select
  count(*)::number(10,0) as files,
  max(LOADEDAT)::timestamp_ltz as loaded_at,
  (md5(listagg(SOURCEFILEID, ',') within group (order by SOURCEFILEID)) || '|v2')::varchar as built_from
from {{ source('options_raw', 'source_file') }}
where SOURCEFILEID in {{ oak_files() }}
