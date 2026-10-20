-- Travel times, phase B: one tag corrected after sql/load_11_rail_sources.sql.
-- NR_GTFS_STOPS's SOURCE tag named network-rail-schedule,
-- network-rail-corpus,naptan, but its SOURCE_FILE rows say
-- network-rail-schedule (the rail GTFS is one file, built from all three), so
-- npm run check:tags -- --bronze failed on it. load_11 now has the right
-- value for a fresh build.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE SHARED_DB.RAW.NR_GTFS_STOPS SET TAG SHARED_DB.GOVERNANCE.SOURCE = 'network-rail-schedule';

-- Check. Expected: one row, network-rail-schedule.
SELECT SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.NR_GTFS_STOPS', 'table') AS SOURCE;
