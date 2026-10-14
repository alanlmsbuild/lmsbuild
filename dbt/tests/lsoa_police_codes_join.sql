-- Every LSOA code police.uk gives (2021 codes) is in LSOA, so crimes join
-- to it directly on the code.
select "LSOA code" as lsoa_code, count(*) as crimes
from {{ source('shared_raw', 'police_street_crime') }}
where "LSOA code" <> '' and "LSOA code" not in (select lsoa21_code from {{ ref('lsoa') }})
group by 1
