-- How long it takes to get from one LSOA to another (decision 19; phase A,
-- South Yorkshire), for Warren, Meadow and the school leavers site: one row
-- per origin and destination, between their population-weighted centroids.
-- Postcodes, providers, colleges and vacancies find theirs through their
-- LSOA (postcode_area).
--   By walk, bus, coach or tram, leaving any minute from the window's start
--   on the day stated (a typical term-time Tuesday): the median with the
--   25th and 75th percentile, so "about 30 minutes, 25 to 40 depending on
--   when you leave". Walking only, separately. Nothing over the cap.
--   SUMMARY says it in words: the median, or walking when that is no
--   slower, rounded to the nearest 5 minutes from 10 minutes up (Rarebit's
--   own rounding), always as "about".
--   NOTES says, in plain words, what the times are and what they leave out
--   (where people live, walking and waiting included; no trains yet; some
--   bus routes missing from the national timetable data).
-- Derived from OpenStreetMap, so under the ODbL: shown as results ("about
-- 25 minutes by bus, weekday morning") with "© OpenStreetMap contributors",
-- never handed over as a table (decision 19).
with t as (select * from {{ ref('travel_time_lsoa') }}),
lsoa as (select lsoa21_code, name, local_authority_code, local_authority_name from {{ ref('lsoa') }}),
feed as (select * from {{ ref('gtfs_feed') }}),
shown as (
  select t.*,
    case when walk_minutes is not null and (transit_minutes_p50 is null or walk_minutes <= transit_minutes_p50) then 'walk'
         when transit_minutes_p50 is not null then 'transit' end as summary_mode,
    case when walk_minutes is not null and (transit_minutes_p50 is null or walk_minutes <= transit_minutes_p50) then walk_minutes
         else transit_minutes_p50 end as summary_minutes
  from t
)
select
  s.travel_key::varchar as travel_key,
  s.origin_lsoa21::varchar as origin_lsoa21,
  o.name::varchar as origin_name,
  o.local_authority_code::varchar as origin_local_authority_code,
  o.local_authority_name::varchar as origin_local_authority_name,
  s.destination_lsoa21::varchar as destination_lsoa21,
  d.name::varchar as destination_name,
  d.local_authority_code::varchar as destination_local_authority_code,
  d.local_authority_name::varchar as destination_local_authority_name,
  s.transit_minutes_p25::number(38,0) as transit_minutes_p25,
  s.transit_minutes_p50::number(38,0) as transit_minutes_median,
  s.transit_minutes_p75::number(38,0) as transit_minutes_p75,
  s.walk_minutes::number(38,0) as walk_minutes,
  case
    when s.summary_mode is null then 'more than ' || s.max_minutes || ' minutes by bus or on foot'
    else 'about ' || case when s.summary_minutes < 10 then s.summary_minutes else round(s.summary_minutes / 5) * 5 end || ' minutes '
         || case s.summary_mode when 'walk' then 'on foot' else 'by bus or tram, weekday morning' end
  end::varchar as summary,
  s.summary_mode::varchar as summary_mode,
  ('Times are from where people live in each area to where people live in the other, including walking to and from stops and waiting, for a weekday morning. '
   || 'Bus and tram only for now; trains are not yet included, so some journeys (for example Sheffield to Barnsley) will be quicker in real life. '
   || 'Some bus routes are missing from the national timetable data, so some times may be longer than in real life.')::varchar as notes,
  s.departure_date::date as departure_date,
  (s.window_start || ' to ' || to_char(dateadd(minute, s.window_minutes, to_time(s.window_start)), 'HH24:MI'))::varchar as departure_window,
  s.max_minutes::number(38,0) as max_minutes,
  s.modes::varchar as modes,
  s.gtfs_feed_version::varchar as gtfs_feed_version,
  f.published_on::date as published_on,
  s.osm_data_date::date as osm_data_date,
  'rarebit-travel-time,bods-gtfs,geofabrik-osm,ons-lsoa-pwc'::varchar as source,
  s.source_file_id::varchar as source_file_id,
  to_date(s.computed_at) as computed_on,
  current_timestamp()::timestamp_ltz as as_of
from shown s
left join lsoa o on o.lsoa21_code = s.origin_lsoa21
left join lsoa d on d.lsoa21_code = s.destination_lsoa21
left join feed f on f.feed_version = s.gtfs_feed_version
