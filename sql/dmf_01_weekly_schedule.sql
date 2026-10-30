-- Data metric functions on one weekly schedule (cost cut, proposal A).
--
-- Until now each SILVER and GOLD table ran its data metric functions every
-- 5 minutes while the transform job waited for a first measurement, then
-- moved to TRIGGER_ON_CHANGES, which makes Snowflake keep a hidden dynamic
-- table (and, for our SHOWN_BASE_UNDER_10 metric, a materialized view) per
-- table. From now on the transform job attaches the metrics to the live
-- tables only and sets the schedule below; it no longer waits. Snowflake
-- measures once a week, Mondays at 07:00 UK time (serverless, billed to the account),
-- so a measurement is of whatever table is live then (jobs are off most of
-- the time and nothing changes between builds).
--
-- This file puts the existing 20 live tables on that schedule now, so the
-- hidden objects of TRIGGER_ON_CHANGES go and the next transform run only
-- has to re-attach. A swapped-in table starts with no schedule: the job
-- sets it on each run (scripts/data-quality.js), the same as in this file.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN (it switches to TRANSFORM_ROLE, which owns the tables). Safe to run twice. Then npm run check:dmf.

USE ROLE TRANSFORM_ROLE;
USE WAREHOUSE transform_wh;

ALTER TABLE SHARED_DB.SILVER.POSTCODE SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.SILVER.LSOA SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.SILVER.LOCAL_AUTHORITY SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.SILVER.VACANCY SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.SILVER.VACANCY_SOC SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.SILVER.PROVIDER SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.SILVER.COLLEGE_16_18 SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.GOLD.INSTITUTION_CARD SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.GOLD.INSTITUTION_RESULT SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.GOLD.INSTITUTION_ACHIEVEMENT SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.GOLD.UNIVERSITY_COURSE_CARD SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE OPTIONS_DB.GOLD.UNIVERSITY_COURSE_RESULT SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.VACANCY_CARD SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.JOB_OUTLOOK SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.AREA_PROFILE SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.POSTCODE_AREA SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.PROVIDER_BENCHMARK SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.TRAVEL_TIME SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.BUS_FARE SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';
ALTER TABLE SHARED_DB.GOLD.TRAM_FARE SET DATA_METRIC_SCHEDULE = 'USING CRON 0 7 * * 1 Europe/London';

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------

-- 1. One table as a sample. Expected: every row SCHEDULE = USING CRON 0 7 * * 1 Europe/London.
SELECT METRIC_NAME, SCHEDULE, SCHEDULE_STATUS
  FROM TABLE(SHARED_DB.INFORMATION_SCHEMA.DATA_METRIC_FUNCTION_REFERENCES(REF_ENTITY_NAME => 'SHARED_DB.SILVER.POSTCODE', REF_ENTITY_DOMAIN => 'table'));

-- 2. All 20 tables: npm run check:dmf (every metric attached, on this
--    schedule, none in the _STAGING schemas).
