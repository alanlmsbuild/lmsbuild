-- The BODS feed's stops in South Yorkshire are real stops: at least 98% of
-- them are in NaPTAN (their stop_id is the ATCO code). Area: the
-- OpenStreetMap extract's bounding box.
with box as (select HEADER:bounding_box as b from {{ source('shared_raw', 'osm_extract') }}
             where SOURCEFILEID = {{ latest_file('geofabrik-osm', 'OSM_EXTRACT') }}),
stops as (
  select s."stop_id" as stop_id from {{ source('shared_raw', 'bods_gtfs_stops') }} s, box
  where s.SOURCEFILEID = {{ latest_file('bods-gtfs', 'BODS_GTFS_STOPS') }}
    and try_to_double(s."stop_lat") between box.b:min_lat::float and box.b:max_lat::float
    and try_to_double(s."stop_lon") between box.b:min_lon::float and box.b:max_lon::float
),
naptan as (select distinct "ATCOCode" as atco from {{ source('shared_raw', 'naptan_stop') }}
           where SOURCEFILEID = {{ latest_file('naptan', 'NAPTAN_STOP') }})
select count(*) as stops, count(n.atco) as in_naptan
from stops s left join naptan n on n.atco = s.stop_id
having count(n.atco) < count(*) * 0.98
