-- The silver layer, step 2: staging schemas for the daily transform job
-- (transform-silver, scripts/transform-silver.js).
--
-- dbt replaces a table before it tests it, so a failing test would leave a
-- bad table in SILVER. Instead the job builds everything into
-- SILVER_STAGING, runs every test and check:tags there, and only if all
-- pass swaps each table into SILVER (ALTER TABLE ... SWAP WITH, which
-- TRANSFORM_ROLE may do on tables it owns; tested 14 October 2026 across
-- SHARED_DB.SILVER and OPTIONS_DB.SILVER: data, comments and tags move
-- with the table). A new model is cloned into SILVER the first time
-- (managed access refuses a RENAME across schemas; a clone keeps its tags).
-- If anything fails, SILVER is not touched and SILVER_STAGING keeps the
-- failed build to look at. After a swap, SILVER_STAGING holds the previous
-- version until the next run.
--
--   SHARED_DB.SILVER_STAGING, OPTIONS_DB.SILVER_STAGING
--                   Like SILVER: managed access, Time Travel 1 day, tagged
--                   layer silver. TRANSFORM_ROLE may make tables and views
--                   there, nothing else. Nobody else gets anything.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE SCHEMA IF NOT EXISTS SHARED_DB.SILVER_STAGING WITH MANAGED ACCESS
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Where the daily transform job builds and tests SHARED_DB.SILVER before swapping each table in (sql/silver_02_staging.sql). After a good run it holds the previous version; after a failed one, the failed build. Never read by the app.';
CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.SILVER_STAGING WITH MANAGED ACCESS
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Where the daily transform job builds and tests OPTIONS_DB.SILVER before swapping each table in (sql/silver_02_staging.sql). After a good run it holds the previous version; after a failed one, the failed build. Never read by the app.';

ALTER SCHEMA SHARED_DB.SILVER_STAGING SET TAG SHARED_DB.GOVERNANCE.LAYER = 'silver', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';
ALTER SCHEMA OPTIONS_DB.SILVER_STAGING SET TAG SHARED_DB.GOVERNANCE.LAYER = 'silver', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';

GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA SHARED_DB.SILVER_STAGING TO ROLE TRANSFORM_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA OPTIONS_DB.SILVER_STAGING TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The two schemas. Expected: 2 rows, options MANAGED ACCESS, retention 1.
--    (SHOW SCHEMAS has no is_managed_access column: managed access shows
--    in "options".)
SHOW SCHEMAS LIKE 'SILVER_STAGING' IN ACCOUNT;
SELECT "database_name", "name", "options", "retention_time" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- 2. TRANSFORM_ROLE's grants on them. Expected: 6 rows, USAGE, CREATE
--    TABLE and CREATE VIEW on each.
SHOW GRANTS TO ROLE TRANSFORM_ROLE;
SELECT "privilege", "granted_on", "name" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE "name" LIKE '%.SILVER_STAGING' ORDER BY 3, 1;
