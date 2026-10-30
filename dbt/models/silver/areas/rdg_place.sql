-- The codes a flow can name for each seed station (RSPS5045 4.1.2, 4.2.2 and
-- 4.19.2): the station's own code, its fare group (a location the station is
-- part of for fares: Manchester Piccadilly's is 0438), and every station
-- cluster either belongs to now (a flow set for a cluster applies to all its
-- stations). One row per station and code.
with own as (
  select crs, nlc as station_nlc, nlc as place, true as is_station from {{ ref('rdg_station') }}
  union
  select crs, nlc, fare_group, false from {{ ref('rdg_station') }} where fare_group <> nlc
)
select crs, station_nlc, place, is_station from own
union
select o.crs, o.station_nlc, substr(c.line, 2, 4), false
from own o
join {{ rdg_lines('FSC') }} c on substr(c.line, 6, 4) = o.place
where current_date() between {{ rdg_date(18, 'c.line') }} and {{ rdg_date(10, 'c.line') }}
