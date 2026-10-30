-- Which National Rail fares feed silver and gold are built from (decision 19,
-- phase C): the latest RJFAF zip loaded, with the date its file was made on
-- the National Rail Data Portal. One row. Gold says "fares as published on
-- <date>" from it.
select
  regexp_substr(ORIGINALNAME, 'RJFAF[0-9]+')::varchar as feed,
  ORIGINALMODIFIEDAT::date as published_on,
  LOADEDAT::timestamp_ltz as loaded_at
from {{ source('shared_raw', 'source_file') }}
where SOURCE = 'rdg-fares' and TARGETTABLE = 'SHARED_DB.RAW.RDG_FARES_LINE' and MEMBER like '%.FFL'
qualify row_number() over (order by LOADEDAT desc, SOURCEFILEID) = 1
