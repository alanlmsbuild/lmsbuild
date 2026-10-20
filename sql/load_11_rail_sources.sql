-- Travel times, phase B: rail in the South Yorkshire journey times (decision
-- 19). The Network Rail sources the rail timetable is built from, the rail
-- GTFS we build from them, and the computed run's new columns, in
-- SHARED_DB.RAW. Loaded by npm run load:data steps 44 (rail sources) and 42
-- (computed times, as now), as DATA_LOAD_USER, logged in OPS.JOB_RUN.
--
-- Licence: the Network Rail Infrastructure Limited Data Feeds Licence,
-- reviewed 15 October 2026 (decision 19): LICENCE tag 'nr-open', added to
-- the tag's allowed values here.
--
--   NR_SCHEDULE_EXTRACT  the SCHEDULE full extract (CIF), one row per file:
--                        its header record (extract date, the dates it
--                        covers). The file itself stays in the stage.
--   NR_CORPUS            CORPUS: every location's TIPLOC, STANOX, CRS
--                        (3ALPHA), NLC and name, one row per location.
--   NR_GTFS_*            the rail timetable for the run's date that
--                        scripts/travel/cif_to_gtfs.py builds from the
--                        extract: passenger trains calling at stations in
--                        South Yorkshire and the 5 km buffer, each station
--                        matched to NaPTAN by TIPLOC (ATCO 9100 + TIPLOC).
--                        One table per file (agency, stops, routes, trips,
--                        stop_times, calendar_dates, feed_info).
--   TRAVEL_TIME_LSOA_RUN gains bus-only and train-only minutes, the modes
--                        each journey used (estimated: within 2 minutes of
--                        the train-only or bus-only time), and the rail
--                        feed's version and SOURCE_FILE row. Existing rows
--                        keep them empty.
--
-- The original files (the CIF extract, CORPUS) go into the
-- SHARED_DB.RAW.DOWNLOADS stage beside their rows, as every load's do
-- (decision 15): nothing new is needed for that.
--
-- Typed tables: columns named exactly as in each file's header, all text;
-- plus SOURCEFILEID and FILEROWNUMBER. Add-only. DATA_LOAD_ROLE gets SELECT
-- and INSERT; TRANSFORM_ROLE gets SELECT (dbt reads them). Nothing else.
-- Each new table gets its bronze tags here. The travel tables are refreshed
-- monthly from now on (the travel-monthly job), so their REFRESH tag becomes
-- monthly; the computed run's attribution adds Network Rail's line.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The LICENCE tag's new value (only added if it isn't there yet)
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
  has_it BOOLEAN;
BEGIN
  SELECT ARRAY_CONTAINS('nr-open'::VARIANT, PARSE_JSON(SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE'))) INTO :has_it;
  IF (NOT has_it) THEN
    ALTER TAG SHARED_DB.GOVERNANCE.LICENCE ADD ALLOWED_VALUES 'nr-open';
    RETURN 'nr-open added';
  END IF;
  RETURN 'nr-open already allowed';
END;
$$;

-- ---------------------------------------------------------------------------
-- The new tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_SCHEDULE_EXTRACT (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the CIF extract (the file itself is in the stage).',
  NAME         VARCHAR(200) NOT NULL COMMENT 'The file name, e.g. toc-full.CIF.gz.',
  HEADER       VARIANT      NOT NULL COMMENT 'Its HD record as the file states it: file mainframe identity, date and time of extract, current and last file references, update indicator, user start and end dates (the dates it covers).'
)
COMMENT = 'Travel times. Network Rail SCHEDULE full extract (CIF), one row per file: its header. Network Rail Infrastructure Limited Data Feeds Licence. Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_CORPUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its place in the file''s TIPLOCDATA list, counting from 1.',
  "NLC" VARCHAR,
  "STANOX" VARCHAR,
  "TIPLOC" VARCHAR,
  "3ALPHA" VARCHAR,
  "UIC" VARCHAR,
  "NLCDESC" VARCHAR,
  "NLCDESC16" VARCHAR
)
COMMENT = 'Travel times. Network Rail CORPUS (Codes for Operations, Retail and Planning: a Unified Solution): every location''s codes and name. Network Rail Infrastructure Limited Data Feeds Licence. Source: CORPUSExtract.json.gz. Fields named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_AGENCY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "agency_id" VARCHAR,
  "agency_name" VARCHAR,
  "agency_url" VARCHAR,
  "agency_timezone" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract (scripts/travel/cif_to_gtfs.py): agency.txt, one row per train operator (ATOC code). Network Rail Infrastructure Limited Data Feeds Licence. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_STOPS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "stop_id" VARCHAR,
  "stop_code" VARCHAR,
  "stop_name" VARCHAR,
  "stop_lat" VARCHAR,
  "stop_lon" VARCHAR,
  "location_type" VARCHAR,
  "tiploc" VARCHAR,
  "stanox" VARCHAR,
  "naptan_atco" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract: stops.txt, one row per station (stop_code the CRS code; tiploc and stanox from CORPUS; naptan_atco the NaPTAN stop it was matched to, whose position it takes). Network Rail Infrastructure Limited Data Feeds Licence; positions from NaPTAN (OGL v3.0). Columns named exactly as in the file, all text. Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_ROUTES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "route_id" VARCHAR,
  "agency_id" VARCHAR,
  "route_short_name" VARCHAR,
  "route_long_name" VARCHAR,
  "route_type" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract: routes.txt (route_type 2, rail). Network Rail Infrastructure Limited Data Feeds Licence. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_TRIPS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "route_id" VARCHAR,
  "service_id" VARCHAR,
  "trip_id" VARCHAR,
  "trip_headsign" VARCHAR,
  "train_uid" VARCHAR,
  "stp_indicator" VARCHAR,
  "train_category" VARCHAR,
  "headcode" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract: trips.txt, one row per passenger train running on the run''s date (train_uid, stp_indicator, train_category and headcode as in the schedule record that applies that day). Network Rail Infrastructure Limited Data Feeds Licence. Columns named exactly as in the file, all text. Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_STOP_TIMES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "trip_id" VARCHAR,
  "arrival_time" VARCHAR,
  "departure_time" VARCHAR,
  "stop_id" VARCHAR,
  "stop_sequence" VARCHAR,
  "pickup_type" VARCHAR,
  "drop_off_type" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract: stop_times.txt, the public calls each train makes at stations in South Yorkshire and the 5 km buffer. Network Rail Infrastructure Limited Data Feeds Licence. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_CALENDAR_DATES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "service_id" VARCHAR,
  "date" VARCHAR,
  "exception_type" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract: calendar_dates.txt (the feed covers the run''s date only). Network Rail Infrastructure Limited Data Feeds Licence. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NR_GTFS_FEED_INFO (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "feed_publisher_name" VARCHAR,
  "feed_publisher_url" VARCHAR,
  "feed_lang" VARCHAR,
  "feed_start_date" VARCHAR,
  "feed_end_date" VARCHAR,
  "feed_version" VARCHAR
)
COMMENT = 'Travel times. Rail GTFS built by Rarebit from the Network Rail SCHEDULE extract: feed_info.txt (feed_version the extract''s date and time). Network Rail Infrastructure Limited Data Feeds Licence. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- ---------------------------------------------------------------------------
-- The computed run's new columns (existing rows keep them empty)
-- ---------------------------------------------------------------------------
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "bus_minutes_p25" VARCHAR COMMENT 'Walk, bus and tram only (no train): minutes at the 25th percentile over the departure window; empty over the cap.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "bus_minutes_p50" VARCHAR COMMENT 'Walk, bus and tram only (no train): the median minutes over the departure window; empty over the cap.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "bus_minutes_p75" VARCHAR COMMENT 'Walk, bus and tram only (no train): minutes at the 75th percentile over the departure window; empty over the cap.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "rail_minutes_p25" VARCHAR COMMENT 'Walk and train only: minutes at the 25th percentile over the departure window; empty over the cap.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "rail_minutes_p50" VARCHAR COMMENT 'Walk and train only: the median minutes over the departure window; empty over the cap.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "rail_minutes_p75" VARCHAR COMMENT 'Walk and train only: minutes at the 75th percentile over the departure window; empty over the cap.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "modes_used" VARCHAR COMMENT 'The modes the journey used, estimated from the medians: train when the all-modes time is within 2 minutes of the train-only time, bus (and tram) when within 2 minutes of the bus-only time, train and bus when faster than both, walk when only walking is in time.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "rail_feed_version" VARCHAR COMMENT 'The rail GTFS feed_version (the Network Rail extract''s date and time) the run used.';
ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN ADD COLUMN IF NOT EXISTS "rail_source_file_id" VARCHAR COMMENT 'The SOURCE_FILE row of the rail GTFS the run used.';

ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN SET COMMENT = 'Travel times. Journey times between LSOA population-weighted centroids that Rarebit computes with r5py (scripts/travel/compute.py): minutes at the 25th, 50th and 75th percentile over the departure window by walk, bus, tram and (from phase B) train together, by bus and tram only, and by train only, the modes used (estimated), and walking-only minutes, empty over the cap. One row per origin and destination per run. Derived from OpenStreetMap (ODbL), BODS timetables, ONS centroids (OGL v3.0) and Network Rail timetables (Network Rail Infrastructure Limited Data Feeds Licence). Columns named as in the file, all text. Add-only.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_SCHEDULE_EXTRACT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_CORPUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_AGENCY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_STOPS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_ROUTES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_TRIPS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_STOP_TIMES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_CALENDAR_DATES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NR_GTFS_FEED_INFO TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_SCHEDULE_EXTRACT TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_CORPUS TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_AGENCY TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_STOPS TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_ROUTES TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_TRIPS TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_STOP_TIMES TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_CALENDAR_DATES TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.NR_GTFS_FEED_INFO TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Bronze tags (decision 21): the new tables, and the travel tables' REFRESH
-- now that the travel-monthly job refreshes them
-- ---------------------------------------------------------------------------
ALTER TABLE SHARED_DB.RAW.NR_SCHEDULE_EXTRACT SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_CORPUS SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-corpus', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_AGENCY SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_STOPS SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the Network Rail Infrastructure Limited Data Feeds Licence. Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_ROUTES SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_TRIPS SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_STOP_TIMES SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_CALENDAR_DATES SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.NR_GTFS_FEED_INFO SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule', SHARED_DB.GOVERNANCE.LICENCE = 'nr-open', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains information of Network Rail Infrastructure Limited licensed under the following licence: https://www.networkrail.co.uk/who-we-are/transparency-and-ethics/transparency/open-data-feeds/network-rail-infrastructure-limited-data-feeds-licence/', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

ALTER TABLE SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN SET TAG SHARED_DB.GOVERNANCE.ATTRIBUTION = '© OpenStreetMap contributors (ODbL). Contains information of Network Rail Infrastructure Limited licensed under the Network Rail Infrastructure Limited Data Feeds Licence.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_AGENCY SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_STOPS SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_ROUTES SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_TRIPS SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_CALENDAR SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_CALENDAR_DATES SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.BODS_GTFS_FEED_INFO SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';
ALTER TABLE SHARED_DB.RAW.OSM_EXTRACT SET TAG SHARED_DB.GOVERNANCE.REFRESH = 'monthly';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The LICENCE tag's allowed values. Expected: one row, the list including
--    nr-open (ogl-3, cc-by-4, cc0, odbl, mit, neso-odl, test-data, nr-open).
SELECT SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE') AS LICENCE_VALUES;

-- 2. The new tables, and the computed run. Expected: 10 rows, ROW_COUNT 0
--    except TRAVEL_TIME_LSOA_RUN (739,600, phase A's run), COLUMNS_ as listed:
--      SHARED_DB.RAW.NR_CORPUS 9
--      SHARED_DB.RAW.NR_GTFS_AGENCY 6
--      SHARED_DB.RAW.NR_GTFS_CALENDAR_DATES 5
--      SHARED_DB.RAW.NR_GTFS_FEED_INFO 8
--      SHARED_DB.RAW.NR_GTFS_ROUTES 7
--      SHARED_DB.RAW.NR_GTFS_STOPS 11
--      SHARED_DB.RAW.NR_GTFS_STOP_TIMES 9
--      SHARED_DB.RAW.NR_GTFS_TRIPS 10
--      SHARED_DB.RAW.NR_SCHEDULE_EXTRACT 3
--      SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN 29
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND (STARTSWITH(TABLE_NAME, 'NR_') OR TABLE_NAME = 'TRAVEL_TIME_LSOA_RUN')
ORDER BY 1;

-- 3. Who has rights on the new tables. Expected: 3 rows, each on 9 tables:
--    INSERT DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND STARTSWITH(TABLE_NAME, 'NR_') AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 4. The computed run's existing rows are untouched. Expected: one row,
--    ROWS_ 739600, WITH_BUS_ 0, WITH_MODES_ 0.
SELECT COUNT(*) AS ROWS_, COUNT("bus_minutes_p50") AS WITH_BUS_, COUNT("modes_used") AS WITH_MODES_
FROM SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN;

-- 5. A sample of the tags. Expected: 4 rows, as listed (every table is
--    checked afterwards by npm run check:tags -- --bronze):
--      NR_CORPUS: bronze, network-rail-corpus, nr-open, monthly, public
--      NR_GTFS_STOP_TIMES: bronze, network-rail-schedule, nr-open, monthly, public
--      TRAVEL_TIME_LSOA_RUN: bronze, rarebit-travel-time, odbl, monthly, public
--      BODS_GTFS_STOPS: bronze, bods-gtfs, ogl-3, monthly, public
SELECT 'NR_CORPUS' AS TABLE_, SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.NR_CORPUS', 'table') AS LAYER, SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.NR_CORPUS', 'table') AS SOURCE, SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.NR_CORPUS', 'table') AS LICENCE, SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.NR_CORPUS', 'table') AS REFRESH, SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.NR_CORPUS', 'table') AS SENSITIVITY
UNION ALL SELECT 'NR_GTFS_STOP_TIMES', SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.NR_GTFS_STOP_TIMES', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.NR_GTFS_STOP_TIMES', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.NR_GTFS_STOP_TIMES', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.NR_GTFS_STOP_TIMES', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.NR_GTFS_STOP_TIMES', 'table')
UNION ALL SELECT 'TRAVEL_TIME_LSOA_RUN', SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN', 'table')
UNION ALL SELECT 'BODS_GTFS_STOPS', SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.BODS_GTFS_STOPS', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.BODS_GTFS_STOPS', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.BODS_GTFS_STOPS', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.BODS_GTFS_STOPS', 'table'), SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.BODS_GTFS_STOPS', 'table');
