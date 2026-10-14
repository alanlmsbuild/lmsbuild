-- The silver layer, step 3: data metric functions (decision 21: quality
-- measured with dbt tests plus data metric functions, results logged).
--
-- TRANSFORM_ROLE owns the silver tables, so with this one privilege it can
-- attach Snowflake's system data metric functions (SNOWFLAKE.CORE.ROW_COUNT,
-- NULL_COUNT, DUPLICATE_COUNT, FRESHNESS; every role already has USAGE on
-- them) and set their schedules. It reads the results through
-- SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS(), which every role may
-- call for tables it owns (the LOOKUP application role, held by PUBLIC):
-- no application role is granted here. You see the results in Snowsight
-- (each table's Data Quality tab) as ACCOUNTADMIN.
--
-- The transform job (scripts/transform-silver.js) attaches them after each
-- day's swap; the scheduled runs are serverless and billed to the account,
-- not to TRANSFORM_WH (a few seconds of compute per table per day).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

GRANT EXECUTE DATA METRIC FUNCTION ON ACCOUNT TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------

-- 1. Expected: 1 row, EXECUTE DATA METRIC FUNCTION on ACCOUNT.
SHOW GRANTS TO ROLE TRANSFORM_ROLE;
SELECT "privilege", "granted_on", "name" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) WHERE "granted_on" = 'ACCOUNT';
