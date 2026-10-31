-- Which NEET and participation file silver and gold are built from: the latest
-- load of SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS, the date the
-- publication states it was published (the release's published date), the page
-- it came from, and the stamp every NEET model stores in built_from
-- (macros/ncs.sql). One row.
with c as (
  select * from {{ source('shared_raw', 'source_file') }}
  where SOURCEFILEID in {{ neet_files() }}
)
select
  SOURCEFILEID::varchar as source_file_id,
  PUBLISHEDON::date as published_on,
  PAGEURL::varchar as source_url,
  to_date(ORIGINALMODIFIEDAT)::date as downloaded_on,
  LOADEDAT::timestamp_ltz as loaded_at,
  (md5(SOURCEFILEID) || '|v2')::varchar as built_from
from c
