-- Each local authority's live postcodes are all in one country, one region
-- and one county (LOCAL_AUTHORITY takes the most common of each).
select local_authority_code,
       count(distinct country_code) as countries,
       count(distinct region_code) as regions,
       count(distinct county_code) as counties
from {{ ref('postcode') }}
where is_live and local_authority_code is not null
group by 1
having count(distinct country_code) > 1 or count(distinct region_code) > 1 or count(distinct county_code) > 1
