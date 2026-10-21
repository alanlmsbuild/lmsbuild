-- Lets the postcode comparison (npm run check:postcodes, gap 6 of
-- docs/data-journey.md) read the apps' postcode list. TRANSFORM_ROLE (dbt, as
-- TRANSFORM_USER) reads silver's POSTCODE already; this adds read-only access
-- to the one table it is compared with, SHARED_DB.REF.POSTCODE, and nothing
-- else in REF. No write, no other REF table.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

GRANT USAGE ON SCHEMA SHARED_DB.REF TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.POSTCODE TO ROLE TRANSFORM_ROLE;

-- Checks

-- 1. What TRANSFORM_ROLE has in REF. Expected: 2 rows, SCHEMA USAGE on
--    SHARED_DB.REF and TABLE SELECT on SHARED_DB.REF.POSTCODE.
SHOW GRANTS TO ROLE TRANSFORM_ROLE;
SELECT "privilege", "granted_on", "name"
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
WHERE "name" LIKE 'SHARED_DB.REF%'
ORDER BY "name";

-- 2. The table itself. Expected: one row with a row count in the millions
--    (the ONS Postcode Directory, 2,729,090 at the last import). That the
--    role can read it is not tested here (ACCOUNTADMIN does not hold
--    TRANSFORM_ROLE, so USE ROLE TRANSFORM_ROLE fails); npm run
--    check:postcodes tests it as TRANSFORM_USER, and says so if it can't.
SELECT COUNT(*) AS POSTCODES FROM SHARED_DB.REF.POSTCODE;
