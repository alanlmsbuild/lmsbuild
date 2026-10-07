-- Scheduling, file 2: the app's Snowflake sessions in UK time.
--
-- Snowflake's default session time zone is America/Los_Angeles, so until
-- now current_date() and every timestamp the app's SQL turned into a date
-- (advert decisions; advert posted, closing and start dates) used Los
-- Angeles time: between midnight and 08:00 UK time, "today" was still
-- yesterday. Europe/London follows the clocks changing (25 October, 29
-- March); it's never a fixed offset.
--
-- Only ILR_APP_USER (the app, the jobs and the tests) changes. Stored
-- timestamps don't change: all but one are TIMESTAMP_LTZ (absolute
-- instants), and the one TIMESTAMP_NTZ column
-- (SKILLS.OCCUPATION_PROFILE.STATUS_LAST_UPDATED) is copied from Skills
-- England as given and never shown.
--
-- New sessions pick it up: restart the dev server (3001) afterwards, so its
-- pooled sessions are replaced.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. Then the check below.

USE ROLE ACCOUNTADMIN;

ALTER USER ILR_APP_USER SET TIMEZONE = 'Europe/London';

-- Check (run on its own). Expected: Europe/London, level USER.
-- SHOW PARAMETERS LIKE 'TIMEZONE' IN USER ILR_APP_USER
--   ->> SELECT "key", "value", "level" FROM $1;
