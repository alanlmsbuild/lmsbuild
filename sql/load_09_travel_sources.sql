-- Travel times, phase A: South Yorkshire (decision 19). The sources the
-- journey times are built from, and the computed times themselves, in
-- SHARED_DB.RAW. Loaded by npm run load:data steps 41 and 42
-- (scripts/load-data.js), as DATA_LOAD_USER, logged in OPS.JOB_RUN.
--
--   BODS_GTFS_*            bus and tram timetables: the Bus Open Data
--                          Service GTFS feed for Yorkshire (OGL v3.0,
--                          supplemented by TNDS), its small files one table
--                          each (agency, stops, routes, trips, calendar,
--                          calendar_dates, feed_info). stop_times and shapes
--                          (1.7 GB between them) stay in the zip.
--   ONS_LSOA_PWC           ONS population-weighted centroids of the 2021
--                          LSOAs, England and Wales (OGL v3.0; contains OS
--                          data, Crown copyright and database right).
--   OSM_EXTRACT            the OpenStreetMap extract for South Yorkshire
--                          (Geofabrik, ODbL), one row per file: its header
--                          (bounding box, the OpenStreetMap data's date).
--   TRAVEL_TIME_LSOA_RUN   the journey times we compute from them (r5py,
--                          scripts/travel/compute.py): one row per origin
--                          and destination LSOA per run. Derived from
--                          OpenStreetMap, so under the ODbL.
--
-- The original files themselves (the GTFS zip, the .osm.pbf and the
-- centroids CSV) go into the SHARED_DB.RAW.DOWNLOADS stage beside their
-- rows, as every load's do (decision 15): nothing new is needed for that.
--
-- Typed tables: columns named exactly as in each file's header, all text;
-- plus SOURCEFILEID and FILEROWNUMBER. Add-only. DATA_LOAD_ROLE gets SELECT
-- and INSERT; TRANSFORM_ROLE gets SELECT (dbt reads them). Nothing else.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_AGENCY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "agency_id" VARCHAR,
  "agency_name" VARCHAR,
  "agency_url" VARCHAR,
  "agency_timezone" VARCHAR,
  "agency_lang" VARCHAR,
  "agency_phone" VARCHAR,
  "agency_noc" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: agency.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_STOPS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "stop_id" VARCHAR,
  "stop_code" VARCHAR,
  "stop_name" VARCHAR,
  "stop_lat" VARCHAR,
  "stop_lon" VARCHAR,
  "wheelchair_boarding" VARCHAR,
  "location_type" VARCHAR,
  "parent_station" VARCHAR,
  "platform_code" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: stops.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_ROUTES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "route_id" VARCHAR,
  "agency_id" VARCHAR,
  "route_short_name" VARCHAR,
  "route_long_name" VARCHAR,
  "route_type" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: routes.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_TRIPS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "route_id" VARCHAR,
  "service_id" VARCHAR,
  "trip_id" VARCHAR,
  "trip_headsign" VARCHAR,
  "direction_id" VARCHAR,
  "block_id" VARCHAR,
  "shape_id" VARCHAR,
  "wheelchair_accessible" VARCHAR,
  "vehicle_journey_code" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: trips.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_CALENDAR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "service_id" VARCHAR,
  "monday" VARCHAR,
  "tuesday" VARCHAR,
  "wednesday" VARCHAR,
  "thursday" VARCHAR,
  "friday" VARCHAR,
  "saturday" VARCHAR,
  "sunday" VARCHAR,
  "start_date" VARCHAR,
  "end_date" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: calendar.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_CALENDAR_DATES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "service_id" VARCHAR,
  "date" VARCHAR,
  "exception_type" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: calendar_dates.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_GTFS_FEED_INFO (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "feed_publisher_name" VARCHAR,
  "feed_publisher_url" VARCHAR,
  "feed_lang" VARCHAR,
  "feed_start_date" VARCHAR,
  "feed_end_date" VARCHAR,
  "feed_version" VARCHAR
)
COMMENT = 'Travel times. Bus Open Data Service GTFS, Yorkshire: feed_info.txt. Department for Transport. Open Government Licence v3.0. Source: itm_yorkshire_gtfs.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ONS_LSOA_PWC (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FID" VARCHAR,
  "LSOA21CD" VARCHAR,
  "GlobalID" VARCHAR,
  "GlobalID_2" VARCHAR,
  "x" VARCHAR,
  "y" VARCHAR
)
COMMENT = 'Travel times. Lower layer Super Output Areas (December 2021) EW Population Weighted Centroids (V4): x and y in British National Grid metres. Office for National Statistics. Open Government Licence v3.0; contains OS data, Crown copyright and database right. Columns named exactly as in the file, all text. Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.OSM_EXTRACT (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the .osm.pbf file (the file itself is in the stage).',
  NAME         VARCHAR(200) NOT NULL COMMENT 'The file name, e.g. south-yorkshire-latest.osm.pbf.',
  HEADER       VARIANT      NOT NULL COMMENT 'Its header as the file states it: bounding box, required features, writing program, and the OpenStreetMap replication timestamp and sequence (the data''s date).'
)
COMMENT = 'Travel times. OpenStreetMap extracts (Geofabrik), one row per file. © OpenStreetMap contributors, Open Database Licence (ODbL). Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "run_id" VARCHAR,
  "origin_lsoa21" VARCHAR,
  "destination_lsoa21" VARCHAR,
  "transit_minutes_p25" VARCHAR,
  "transit_minutes_p50" VARCHAR,
  "transit_minutes_p75" VARCHAR,
  "walk_minutes" VARCHAR,
  "departure_date" VARCHAR,
  "window_start" VARCHAR,
  "window_minutes" VARCHAR,
  "max_minutes" VARCHAR,
  "modes" VARCHAR,
  "gtfs_feed_version" VARCHAR,
  "gtfs_source_file_id" VARCHAR,
  "osm_source_file_id" VARCHAR,
  "centroid_source_file_id" VARCHAR,
  "r5py_version" VARCHAR,
  "computed_at" VARCHAR
)
COMMENT = 'Travel times. Journey times between LSOA population-weighted centroids that Rarebit computes with r5py (scripts/travel/compute.py): walk, bus and tram minutes at the 25th, 50th and 75th percentile over the departure window, and walking-only minutes, empty over the cap. One row per origin and destination per run. Derived from OpenStreetMap (ODbL), BODS timetables and ONS centroids (OGL v3.0). Columns named as in the file, all text. Add-only.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_AGENCY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_STOPS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_ROUTES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_TRIPS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_CALENDAR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_CALENDAR_DATES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_GTFS_FEED_INFO TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ONS_LSOA_PWC TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.OSM_EXTRACT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_AGENCY TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_STOPS TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_ROUTES TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_TRIPS TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_CALENDAR TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_CALENDAR_DATES TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_GTFS_FEED_INFO TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.ONS_LSOA_PWC TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.OSM_EXTRACT TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: 10 rows, ROW_COUNT 0, COLUMNS_ as listed:
--      SHARED_DB.RAW.BODS_GTFS_AGENCY 9
--      SHARED_DB.RAW.BODS_GTFS_CALENDAR 12
--      SHARED_DB.RAW.BODS_GTFS_CALENDAR_DATES 5
--      SHARED_DB.RAW.BODS_GTFS_FEED_INFO 8
--      SHARED_DB.RAW.BODS_GTFS_ROUTES 7
--      SHARED_DB.RAW.BODS_GTFS_STOPS 11
--      SHARED_DB.RAW.BODS_GTFS_TRIPS 11
--      SHARED_DB.RAW.ONS_LSOA_PWC 8
--      SHARED_DB.RAW.OSM_EXTRACT 3
--      SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN 20
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Travel times.%'
ORDER BY 1;

-- 2. Who has rights on them. Expected: 3 rows, each on 10 tables:
--    INSERT DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('BODS_GTFS_AGENCY', 'BODS_GTFS_STOPS', 'BODS_GTFS_ROUTES', 'BODS_GTFS_TRIPS', 'BODS_GTFS_CALENDAR', 'BODS_GTFS_CALENDAR_DATES', 'BODS_GTFS_FEED_INFO', 'ONS_LSOA_PWC', 'OSM_EXTRACT', 'TRAVEL_TIME_LSOA_RUN')
  AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;
