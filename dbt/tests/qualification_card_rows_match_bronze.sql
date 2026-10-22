-- qualification_card holds one row per QAN that is, in the latest record of
-- that QAN, offered in England and "Available to learners" (counted here
-- from bronze, independently of the model): about 16,400, not the 53,000 in
-- the register.
with latest as (
  select r.ITEM as item
  from {{ source('shared_raw', 'ofqual_qualification') }} r
  join {{ source('shared_raw', 'source_file') }} f
    on f.SOURCEFILEID = r.SOURCEFILEID
   and f.SOURCE = 'ofqual-register' and f.TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_QUALIFICATION'
  qualify row_number() over (partition by r.QUALIFICATIONNUMBER order by f.LOADEDAT desc, r.SOURCEFILEID desc) = 1
)
select silver, bronze_count from (
  select (select count(*) from {{ ref('qualification_card') }}) as silver,
         (select count(*) from latest where item:offeredInEngland::boolean and item:status::varchar = 'Available to learners') as bronze_count
) where silver <> bronze_count or silver not between 10000 and 25000
