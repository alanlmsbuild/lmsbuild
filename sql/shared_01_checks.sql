-- Shared database, file 1 checks: run these one at a time, as ACCOUNTADMIN.
-- Check 0 BEFORE sql/shared_01_clone.sql; the rest after it.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- 0. BEFORE: nothing in CAPTURE_DB refers to the six schemas by name (a
--    view, procedure or task would keep pointing at the originals).
--    Expected: 0.
SELECT COUNT(*) AS REFERENCES_FOUND FROM (
  SELECT VIEW_DEFINITION AS BODY FROM CAPTURE_DB.INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
  UNION ALL
  SELECT PROCEDURE_DEFINITION FROM CAPTURE_DB.INFORMATION_SCHEMA.PROCEDURES
) WHERE BODY ILIKE ANY ('%REF.%', '%SKILLS.%', '%EXT.%', '%RAW.%', '%ACCESS.%', '%OPS.%');

-- 1. Every table was copied, with the same number of rows. Expected: 31
--    rows, DIFFERENT 0 on every one (run straight after the clone, before
--    anything is written to either side).
SELECT o.TABLE_SCHEMA, o.TABLE_NAME, o.ROW_COUNT AS ORIGINAL, c.ROW_COUNT AS COPY, IFF(o.ROW_COUNT = c.ROW_COUNT, 0, 1) AS DIFFERENT
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES o
LEFT JOIN SHARED_DB.INFORMATION_SCHEMA.TABLES c ON c.TABLE_SCHEMA = o.TABLE_SCHEMA AND c.TABLE_NAME = o.TABLE_NAME
WHERE o.TABLE_SCHEMA IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS')
ORDER BY 1, 2;

-- 2. The app's role has the same grants on the copies as on the
--    originals, apart from the REF tables (their owner changes; check 4).
--    Expected: ORIGINALS 59, COPIES 59, MISSING 0.
SHOW GRANTS TO ROLE ILR_APP_ROLE
  ->> WITH g AS (
        SELECT "name" AS NAME, "privilege" AS PRIVILEGE FROM $1
        WHERE REGEXP_LIKE("name", '^(CAPTURE|SHARED)_DB\\.(REF|SKILLS|EXT|RAW|ACCESS|OPS)(\\..*)?$')
          AND NOT REGEXP_LIKE("name", '^(CAPTURE|SHARED)_DB\\.REF\\..+$'))
      SELECT
        COUNT_IF(STARTSWITH(NAME, 'CAPTURE_DB.')) AS ORIGINALS,
        COUNT_IF(STARTSWITH(NAME, 'SHARED_DB.')) AS COPIES,
        COUNT_IF(STARTSWITH(NAME, 'CAPTURE_DB.') AND (REPLACE(NAME, 'CAPTURE_DB.', 'SHARED_DB.'), PRIVILEGE) NOT IN
          (SELECT NAME, PRIVILEGE FROM g WHERE STARTSWITH(NAME, 'SHARED_DB.'))) AS MISSING
      FROM g;

-- 3. The app's role can use SHARED_DB. Expected: one row, USAGE.
SHOW GRANTS ON DATABASE SHARED_DB
  ->> SELECT "privilege" FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';

-- 4. Owners. Expected: the 8 REF tables owned by ILR_APP_ROLE, every other
--    table (23) by ACCOUNTADMIN.
SHOW TABLES IN DATABASE SHARED_DB
  ->> SELECT "schema_name", "owner", COUNT(*) AS TABLES_ FROM $1 GROUP BY 1, 2 ORDER BY 1, 2;

-- 5. No DELETE or TRUNCATE for the app's role anywhere in SHARED_DB.
--    Expected: 0.
SHOW GRANTS TO ROLE ILR_APP_ROLE
  ->> SELECT COUNT(*) AS DELETES FROM $1 WHERE STARTSWITH("name", 'SHARED_DB.') AND "privilege" IN ('DELETE', 'TRUNCATE');
