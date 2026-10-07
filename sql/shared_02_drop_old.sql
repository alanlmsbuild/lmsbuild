-- Shared database, file 2: drop the old copies of the shared schemas from
-- CAPTURE_DB.
--
-- Run only when all of these are true:
--   - sql/shared_01_clone.sql has run and its checks 1 to 6 matched;
--   - the code that uses SHARED_DB is merged to main, and check 7 (nothing
--     written to the originals since the copy) said 0 just before;
--   - the Windows task "Rarebit jobs" is enabled again and has run a tick
--     that succeeded (npm run check:jobs: all ok).
-- Check A first; then paste the rest and Run All, as ACCOUNTADMIN. Check B
-- after. Safe to run twice. A dropped schema can be brought back with
-- UNDROP SCHEMA for as long as Snowflake's Time Travel keeps it.

-- A. BEFORE: nothing has been written to the originals since the copy
--    (the same as check 7 of sql/shared_01_checks.sql). Expected: 0.
SELECT COUNT(*) AS CHANGED_SINCE_COPY
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS')
  AND LAST_ALTERED > (SELECT MIN(CREATED) FROM SHARED_DB.INFORMATION_SCHEMA.SCHEMATA
                      WHERE SCHEMA_NAME IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS'));

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

DROP SCHEMA IF EXISTS CAPTURE_DB.REF;
DROP SCHEMA IF EXISTS CAPTURE_DB.SKILLS;
DROP SCHEMA IF EXISTS CAPTURE_DB.EXT;
DROP SCHEMA IF EXISTS CAPTURE_DB.RAW;
DROP SCHEMA IF EXISTS CAPTURE_DB.ACCESS;
DROP SCHEMA IF EXISTS CAPTURE_DB.OPS;

-- B. AFTER: the six schemas are only in SHARED_DB. Expected: CAPTURE_DB 0,
--    SHARED_DB 6.
SELECT
  (SELECT COUNT(*) FROM CAPTURE_DB.INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS')) AS CAPTURE_DB,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS')) AS SHARED_DB;
