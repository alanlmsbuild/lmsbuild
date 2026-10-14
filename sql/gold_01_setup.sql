-- The gold layer, step 1: where gold is built and who may read it
-- (decision 16; the gold plan of 14 October 2026). No tables yet: dbt makes
-- them, in GOLD_STAGING, tests them, and the daily transform job swaps each
-- into GOLD, as for silver.
--
--   SHARED_DB.GOLD, SHARED_DB.GOLD_STAGING
--                   Shared gold: vacancy_card, job_outlook, area_profile,
--                   postcode_area, provider_benchmark.
--   OPTIONS_DB.GOLD, OPTIONS_DB.GOLD_STAGING
--                   The school leavers app's gold: institution_card and
--                   _result, national_comparison, university_course_card
--                   and _result.
--
-- Unlike SILVER, the GOLD schemas are NOT managed access. Each product reads
-- only its own gold tables, and future grants can't pick tables, so each
-- gold table is granted by its owner (TRANSFORM_ROLE) to the readers its dbt
-- model names, when it is built in GOLD_STAGING; the swap carries the grant
-- into GOLD. check:grants checks every reader gets exactly its tables.
--
-- The readers are database roles, one per product, granted only USAGE on
-- GOLD (never GOLD_STAGING, so yesterday's tables there can't be read):
--   SHARED_DB.GOLD_WARREN   to ILR_APP_ROLE (Warren and Burrow)
--   SHARED_DB.GOLD_MEADOW   to CRM_APP_ROLE (Meadow, the CRM): vacancy_card,
--                           job_outlook, area_profile
--   SHARED_DB.GOLD_SITE, OPTIONS_DB.GOLD_SITE
--                           the school leavers app; granted to nobody yet
--                           (its build-time user comes with that work)
--
-- TRANSFORM_ROLE may also make data metric functions in SHARED_DB.GOVERNANCE
-- (the custom "rows shown with a base under 10" = 0 metric on gold).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The schemas
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS SHARED_DB.GOLD
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Gold (decision 16): shared tables shaped for the products (Warren and Burrow, Meadow, the school leavers app), with the honesty rules applied (fewer than 10 hidden, 10 to 29 flagged, like-for-like comparisons, every figure with its source and date). Built daily from SILVER by the transform job; each product reads only its own tables (database roles GOLD_*).';
CREATE SCHEMA IF NOT EXISTS SHARED_DB.GOLD_STAGING
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Where the daily transform job builds and tests SHARED_DB.GOLD before swapping each table in (sql/gold_01_setup.sql). Holds the previous version after a good run, the failed build after a bad one. No reader has USAGE here.';
CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.GOLD
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Gold (decision 16): the school leavers app''s tables (institutions, their results and national comparisons, university courses), with the honesty rules applied. Built daily from SILVER by the transform job; read by the app (database role GOLD_SITE).';
CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.GOLD_STAGING
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Where the daily transform job builds and tests OPTIONS_DB.GOLD before swapping each table in (sql/gold_01_setup.sql). No reader has USAGE here.';

ALTER SCHEMA SHARED_DB.GOLD SET TAG SHARED_DB.GOVERNANCE.LAYER = 'gold', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';
ALTER SCHEMA SHARED_DB.GOLD_STAGING SET TAG SHARED_DB.GOVERNANCE.LAYER = 'gold', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';
ALTER SCHEMA OPTIONS_DB.GOLD SET TAG SHARED_DB.GOVERNANCE.LAYER = 'gold', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';
ALTER SCHEMA OPTIONS_DB.GOLD_STAGING SET TAG SHARED_DB.GOVERNANCE.LAYER = 'gold', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';

-- ---------------------------------------------------------------------------
-- The builder: TRANSFORM_ROLE makes and owns gold tables and views
-- ---------------------------------------------------------------------------
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA SHARED_DB.GOLD TO ROLE TRANSFORM_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA SHARED_DB.GOLD_STAGING TO ROLE TRANSFORM_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA OPTIONS_DB.GOLD TO ROLE TRANSFORM_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA OPTIONS_DB.GOLD_STAGING TO ROLE TRANSFORM_ROLE;
GRANT CREATE DATA METRIC FUNCTION ON SCHEMA SHARED_DB.GOVERNANCE TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- The readers: one database role per product, USAGE on GOLD only
-- ---------------------------------------------------------------------------
CREATE DATABASE ROLE IF NOT EXISTS SHARED_DB.GOLD_WARREN
  COMMENT = 'Warren and Burrow''s gold tables (postcode_area, vacancy_card, job_outlook, provider_benchmark), each granted by its dbt model. Held by ILR_APP_ROLE.';
CREATE DATABASE ROLE IF NOT EXISTS SHARED_DB.GOLD_MEADOW
  COMMENT = 'Meadow''s (the CRM''s) gold tables (vacancy_card, job_outlook, area_profile), each granted by its dbt model. Held by CRM_APP_ROLE.';
CREATE DATABASE ROLE IF NOT EXISTS SHARED_DB.GOLD_SITE
  COMMENT = 'The school leavers app''s shared gold tables (vacancy_card, job_outlook, area_profile). Granted to nobody yet: the app''s build-time user comes with that work.';
CREATE DATABASE ROLE IF NOT EXISTS OPTIONS_DB.GOLD_SITE
  COMMENT = 'The school leavers app''s gold tables in OPTIONS_DB. Granted to nobody yet: the app''s build-time user comes with that work.';

GRANT USAGE ON SCHEMA SHARED_DB.GOLD TO DATABASE ROLE SHARED_DB.GOLD_WARREN;
GRANT USAGE ON SCHEMA SHARED_DB.GOLD TO DATABASE ROLE SHARED_DB.GOLD_MEADOW;
GRANT USAGE ON SCHEMA SHARED_DB.GOLD TO DATABASE ROLE SHARED_DB.GOLD_SITE;
GRANT USAGE ON SCHEMA OPTIONS_DB.GOLD TO DATABASE ROLE OPTIONS_DB.GOLD_SITE;

GRANT DATABASE ROLE SHARED_DB.GOLD_WARREN TO ROLE ILR_APP_ROLE;
GRANT DATABASE ROLE SHARED_DB.GOLD_MEADOW TO ROLE CRM_APP_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The four schemas. Expected: 4 rows (GOLD and GOLD_STAGING in SHARED_DB
--    and OPTIONS_DB), options empty (not managed access), retention 1.
SHOW SCHEMAS LIKE 'GOLD%' IN ACCOUNT;
SELECT "database_name", "name", "options", "retention_time" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) ORDER BY 1, 2;

-- 2. TRANSFORM_ROLE's new grants. Expected: 13 rows: USAGE, CREATE TABLE and
--    CREATE VIEW on each of the four schemas, and CREATE DATA METRIC
--    FUNCTION on SHARED_DB.GOVERNANCE.
SHOW GRANTS TO ROLE TRANSFORM_ROLE;
SELECT "privilege", "granted_on", "name" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
WHERE "name" LIKE '%.GOLD' OR "name" LIKE '%.GOLD_STAGING' OR "privilege" = 'CREATE DATA METRIC FUNCTION' ORDER BY 3, 1;

-- 3. The reader roles in SHARED_DB. Expected: 3 rows, GOLD_MEADOW, GOLD_SITE,
--    GOLD_WARREN.
SHOW DATABASE ROLES IN DATABASE SHARED_DB;
SELECT "name", "comment" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE "name" LIKE 'GOLD%' ORDER BY 1;

-- 4. Who may use SHARED_DB.GOLD. Expected: 7 rows: OWNERSHIP to ACCOUNTADMIN;
--    CREATE TABLE, CREATE VIEW and USAGE to TRANSFORM_ROLE; USAGE to the
--    database roles GOLD_MEADOW, GOLD_SITE and GOLD_WARREN.
SHOW GRANTS ON SCHEMA SHARED_DB.GOLD;
SELECT "privilege", "granted_to", "grantee_name" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) ORDER BY 2, 3, 1;

-- 5. Who may use OPTIONS_DB.GOLD. Expected: 5 rows: OWNERSHIP to
--    ACCOUNTADMIN; CREATE TABLE, CREATE VIEW and USAGE to TRANSFORM_ROLE;
--    USAGE to the database role GOLD_SITE.
SHOW GRANTS ON SCHEMA OPTIONS_DB.GOLD;
SELECT "privilege", "granted_to", "grantee_name" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) ORDER BY 2, 3, 1;

-- 6. Nobody reads GOLD_STAGING. Expected: 4 rows: OWNERSHIP to ACCOUNTADMIN;
--    CREATE TABLE, CREATE VIEW and USAGE to TRANSFORM_ROLE. No database role.
SHOW GRANTS ON SCHEMA SHARED_DB.GOLD_STAGING;
SELECT "privilege", "granted_to", "grantee_name" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) ORDER BY 2, 3, 1;

-- 7. Who holds GOLD_WARREN. Expected: 1 row, ROLE ILR_APP_ROLE.
SHOW GRANTS OF DATABASE ROLE SHARED_DB.GOLD_WARREN;

-- 8. Who holds GOLD_MEADOW. Expected: 1 row, ROLE CRM_APP_ROLE.
SHOW GRANTS OF DATABASE ROLE SHARED_DB.GOLD_MEADOW;
