-- Loading everything, step 7: when each file was published, as its
-- publisher states it (honesty: gold has carried the date we downloaded a
-- file, DOWNLOADED_ON; this adds the publication date beside it).
--
--   PUBLISHEDON      The date the publisher states for the file, or for
--                    the release it belongs to, read at load from its
--                    page or API: GOV.UK (the content API's published or
--                    updated date), Explore education statistics (the data
--                    set's or release's published date), ONS (the release
--                    date), Nomis (the data set's last-updated date: Nomis
--                    states no other). Empty where the source doesn't state
--                    one. Never guessed.
--   PUBLISHEDONFROM  Where it was read: the address and the field, so the
--                    date can be checked.
--
-- In all three SOURCE_FILE tables: SHARED_DB.RAW, OPTIONS_DB.RAW and the
-- test files' CAPTURE_DB.TEST_BASELINE (which stays empty: test data has
-- no publisher). New loads fill them (scripts/load/loader.js); DATA_LOAD_ROLE
-- already has INSERT on these tables, which covers new columns.
--
-- The rows already loaded stay add-only for the loaders (no UPDATE): their
-- dates are found by a script and written by one more ACCOUNTADMIN file,
-- sql/load_07b_published_on_backfill.sql, shown before it is run.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE SHARED_DB.RAW.SOURCE_FILE ADD COLUMN IF NOT EXISTS PUBLISHEDON DATE
  COMMENT 'When the publisher says this file (or its release) was published, read from its page or API at load; empty where it does not say. Never guessed.';
ALTER TABLE SHARED_DB.RAW.SOURCE_FILE ADD COLUMN IF NOT EXISTS PUBLISHEDONFROM VARCHAR(500)
  COMMENT 'Where PUBLISHEDON was read: the address and the field (e.g. the GOV.UK content API, public_updated_at).';

ALTER TABLE OPTIONS_DB.RAW.SOURCE_FILE ADD COLUMN IF NOT EXISTS PUBLISHEDON DATE
  COMMENT 'When the publisher says this file (or its release) was published, read from its page or API at load; empty where it does not say. Never guessed.';
ALTER TABLE OPTIONS_DB.RAW.SOURCE_FILE ADD COLUMN IF NOT EXISTS PUBLISHEDONFROM VARCHAR(500)
  COMMENT 'Where PUBLISHEDON was read: the address and the field (e.g. the Explore education statistics API, latestVersion.published).';

ALTER TABLE CAPTURE_DB.TEST_BASELINE.SOURCE_FILE ADD COLUMN IF NOT EXISTS PUBLISHEDON DATE
  COMMENT 'Always empty: test data has no publisher.';
ALTER TABLE CAPTURE_DB.TEST_BASELINE.SOURCE_FILE ADD COLUMN IF NOT EXISTS PUBLISHEDONFROM VARCHAR(500)
  COMMENT 'Always empty: test data has no publisher.';

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------

-- 1. The new columns. Expected: 6 rows, PUBLISHEDON (DATE) and
--    PUBLISHEDONFROM (TEXT) in each of the three SOURCE_FILE tables.
SELECT 'SHARED_DB.RAW' AS WHERE_, COLUMN_NAME, DATA_TYPE FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'SOURCE_FILE' AND COLUMN_NAME LIKE 'PUBLISHEDON%'
UNION ALL
SELECT 'OPTIONS_DB.RAW', COLUMN_NAME, DATA_TYPE FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'SOURCE_FILE' AND COLUMN_NAME LIKE 'PUBLISHEDON%'
UNION ALL
SELECT 'CAPTURE_DB.TEST_BASELINE', COLUMN_NAME, DATA_TYPE FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME = 'SOURCE_FILE' AND COLUMN_NAME LIKE 'PUBLISHEDON%'
ORDER BY 1, 2;
