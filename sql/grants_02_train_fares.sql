-- Takes Warren's and Meadow's read access off the train fares tables. Train
-- fares are for the school leavers site only (the National Rail terms v3.0), so
-- SHARED_DB.GOLD_SITE is the only reader. check:grants fails until this is run.
--
-- Why they have it: TRAIN_FARE and TRAIN_DISCOUNT were first built when their
-- readers still included GOLD_WARREN and GOLD_MEADOW. Later the readers were cut
-- to the site only, but the build only ever added grants, and the models keep
-- the grants of the table they replace (copy_grants), so the old ones stayed on
-- the live tables and on the GOLD_STAGING copies (a swap would bring them back).
-- The dbt macro apply_reader_grants now revokes any reader the model does not
-- name, so this is needed once.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The check at the end shows the result.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

REVOKE SELECT ON TABLE SHARED_DB.GOLD.TRAIN_FARE FROM DATABASE ROLE SHARED_DB.GOLD_WARREN;
REVOKE SELECT ON TABLE SHARED_DB.GOLD.TRAIN_FARE FROM DATABASE ROLE SHARED_DB.GOLD_MEADOW;
REVOKE SELECT ON TABLE SHARED_DB.GOLD.TRAIN_DISCOUNT FROM DATABASE ROLE SHARED_DB.GOLD_WARREN;
REVOKE SELECT ON TABLE SHARED_DB.GOLD.TRAIN_DISCOUNT FROM DATABASE ROLE SHARED_DB.GOLD_MEADOW;
REVOKE SELECT ON TABLE SHARED_DB.GOLD_STAGING.TRAIN_FARE FROM DATABASE ROLE SHARED_DB.GOLD_WARREN;
REVOKE SELECT ON TABLE SHARED_DB.GOLD_STAGING.TRAIN_FARE FROM DATABASE ROLE SHARED_DB.GOLD_MEADOW;
REVOKE SELECT ON TABLE SHARED_DB.GOLD_STAGING.TRAIN_DISCOUNT FROM DATABASE ROLE SHARED_DB.GOLD_WARREN;
REVOKE SELECT ON TABLE SHARED_DB.GOLD_STAGING.TRAIN_DISCOUNT FROM DATABASE ROLE SHARED_DB.GOLD_MEADOW;

-- Checks

-- 1. Who can read the live train fares table. Expected: 2 rows, GOLD_SITE
--    (SELECT) and TRANSFORM_ROLE (OWNERSHIP).
SHOW GRANTS ON TABLE SHARED_DB.GOLD.TRAIN_FARE;
SELECT "grantee_name", "privilege"
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
ORDER BY "grantee_name";

-- 2. The same for the discounts table. Expected: the same 2 rows.
SHOW GRANTS ON TABLE SHARED_DB.GOLD.TRAIN_DISCOUNT;
SELECT "grantee_name", "privilege"
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
ORDER BY "grantee_name";

-- 3. The staging copies, which a swap brings back. Expected: the same 2 rows
--    for each.
SHOW GRANTS ON TABLE SHARED_DB.GOLD_STAGING.TRAIN_FARE;
SELECT "grantee_name", "privilege"
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
ORDER BY "grantee_name";

SHOW GRANTS ON TABLE SHARED_DB.GOLD_STAGING.TRAIN_DISCOUNT;
SELECT "grantee_name", "privilege"
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
ORDER BY "grantee_name";

-- 4. Then run npm run check:grants. Expected: no FAIL lines.
