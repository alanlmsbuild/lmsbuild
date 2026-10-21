-- Every fare product in the latest BODS bus fares files for South Yorkshire's
-- operators (decision 19, phase C), one row per product in each NeTEx file: its
-- name as the operator published it, its type (single, day return, period
-- or day pass), who it is priced for (the user profile as published), and
-- its prices where the file prices it in a fare table: the lowest, highest
-- and how many different prices (a flat young person's pass has one; a
-- zone-to-zone fare triangle keeps its prices elsewhere in the file and
-- has none here). Each dataset's rows are from its latest load. AS_AT is
-- when BODS says the dataset was last modified.
with latest_netex as (
  select n.DATASET_ID, n.SOURCEFILEID
  from (select distinct DATASET_ID, SOURCEFILEID from {{ source('shared_raw', 'bods_fares_netex') }}) n
  join {{ source('shared_raw', 'source_file') }} sf on sf.SOURCEFILEID = n.SOURCEFILEID
  qualify row_number() over (partition by n.DATASET_ID order by sf.LOADEDAT desc, n.SOURCEFILEID) = 1
),
latest_listing as (
  select d.DATASET_ID, d.OPERATOR_NAME, d.NOCS, d.RECORD:modified::string as MODIFIED
  from {{ source('shared_raw', 'bods_fares_dataset') }} d
  join {{ source('shared_raw', 'source_file') }} sf on sf.SOURCEFILEID = d.SOURCEFILEID
  qualify row_number() over (partition by d.DATASET_ID order by sf.LOADEDAT desc, d.SOURCEFILEID) = 1
),
frames as (
  select n.DATASET_ID, n.FILE_NAME, n.SOURCEFILEID, f.value as FRAME
  from {{ source('shared_raw', 'bods_fares_netex') }} n
  join latest_netex l on l.DATASET_ID = n.DATASET_ID and l.SOURCEFILEID = n.SOURCEFILEID,
  lateral flatten(input => {{ xml_children("xmlget(xmlget(xmlget(n.XML, 'dataObjects'), 'CompositeFrame'), 'frames')") }}) f
  where get(f.value, '@')::string = 'FareFrame'
),
parts as (
  select DATASET_ID, FILE_NAME, SOURCEFILEID, get(fp.value, '@')::string as part, fp.value as v
  from frames, lateral flatten(input => {{ xml_children('FRAME') }}) fp
  where get(fp.value, '@')::string in ('fareProducts', 'fareTables')
),
products as (
  select DATASET_ID, FILE_NAME, SOURCEFILEID, p.value:"@id"::string as product_id,
         xmlget(p.value, 'Name'):"$"::string as product_name,
         split_part(xmlget(p.value, 'TypeOfFareProductRef'):"@ref"::string, '@', -1) as product_type
  from parts, lateral flatten(input => {{ xml_children('v') }}) p
  where part = 'fareProducts' and get(p.value, '@')::string = 'PreassignedFareProduct'
),
tables as (
  select DATASET_ID, FILE_NAME, t.value as tbl
  from parts, lateral flatten(input => {{ xml_children('v') }}) t
  where part = 'fareTables' and get(t.value, '@')::string = 'FareTable'
),
priced as (
  select DATASET_ID, FILE_NAME,
         xmlget(xmlget(tbl, 'pricesFor'), 'PreassignedFareProductRef'):"@ref"::string as product_id,
         xmlget(xmlget(tbl, 'pricesFor'), 'UserProfileRef'):"@ref"::string as user_ref,
         regexp_substr_all(to_varchar(tbl), '<Amount>([0-9.]+)</Amount>', 1, 1, 'e') as amounts
  from tables
),
amounts as (
  select DATASET_ID, FILE_NAME, product_id, any_value(user_ref) as user_ref,
         min(try_to_decimal(a.value::string, 10, 2)) as price_min,
         max(try_to_decimal(a.value::string, 10, 2)) as price_max,
         count(distinct try_to_decimal(a.value::string, 10, 2)) as price_points
  from priced, lateral flatten(input => amounts, outer => true) a
  group by 1, 2, 3
)
select
  p.DATASET_ID::varchar as dataset_id,
  l.OPERATOR_NAME::varchar as operator_name,
  l.NOCS::varchar as nocs,
  p.FILE_NAME::varchar as file_name,
  p.product_id::varchar as product_id,
  p.product_name::varchar as product_name,
  p.product_type::varchar as product_type,
  a.user_ref::varchar as user_ref,
  a.price_min::number(10,2) as price_min,
  a.price_max::number(10,2) as price_max,
  coalesce(a.price_points, 0)::number(38,0) as price_points,
  try_to_date(left(l.MODIFIED, 10))::date as as_at,
  p.SOURCEFILEID::varchar as source_file_id
from products p
join latest_listing l on l.DATASET_ID = p.DATASET_ID
left join amounts a on a.DATASET_ID = p.DATASET_ID and a.FILE_NAME = p.FILE_NAME and a.product_id = p.product_id
