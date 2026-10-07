-- Shared database, file 1 checks: run these one at a time, as ACCOUNTADMIN.
-- Check 0 BEFORE sql/shared_01_clone.sql; checks 1 to 6 straight after it;
-- check 7 just before the code change is merged.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- 0. BEFORE: nothing in CAPTURE_DB refers to the six schemas by name (a
--    view or procedure would keep pointing at the originals).
--    Expected: 0.
SELECT COUNT(*) AS REFERENCES_FOUND FROM (
  SELECT VIEW_DEFINITION AS BODY FROM CAPTURE_DB.INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
  UNION ALL
  SELECT PROCEDURE_DEFINITION FROM CAPTURE_DB.INFORMATION_SCHEMA.PROCEDURES
) WHERE BODY ILIKE ANY ('%REF.%', '%SKILLS.%', '%EXT.%', '%RAW.%', '%ACCESS.%', '%OPS.%');

-- 1. Every table was copied, with the same number of rows. Expected: 31
--    rows, DIFFERENT 0 on every one.
SELECT o.TABLE_SCHEMA, o.TABLE_NAME, o.ROW_COUNT AS ORIGINAL, c.ROW_COUNT AS COPY, IFF(o.ROW_COUNT = c.ROW_COUNT, 0, 1) AS DIFFERENT
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES o
LEFT JOIN SHARED_DB.INFORMATION_SCHEMA.TABLES c ON c.TABLE_SCHEMA = o.TABLE_SCHEMA AND c.TABLE_NAME = o.TABLE_NAME
WHERE o.TABLE_SCHEMA IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS')
ORDER BY 1, 2;

-- 2. Outside REF, the app's role has exactly the grants on the copies that
--    it has on the originals. Expected: ORIGINALS 57, COPIES 57, MISSING 0,
--    EXTRA 0.
SHOW GRANTS TO ROLE ILR_APP_ROLE
  ->> WITH g AS (
        SELECT REPLACE(REPLACE("name", 'CAPTURE_DB.', ''), 'SHARED_DB.', '') AS OBJ, SPLIT_PART("name", '.', 1) AS DB, "privilege" AS PRIVILEGE FROM $1
        WHERE REGEXP_LIKE("name", '^(CAPTURE|SHARED)_DB\\.(SKILLS|EXT|RAW|ACCESS|OPS)(\\..*)?$'))
      SELECT
        COUNT_IF(DB = 'CAPTURE_DB') AS ORIGINALS,
        COUNT_IF(DB = 'SHARED_DB') AS COPIES,
        (SELECT COUNT(*) FROM (SELECT OBJ, PRIVILEGE FROM g WHERE DB = 'CAPTURE_DB' MINUS SELECT OBJ, PRIVILEGE FROM g WHERE DB = 'SHARED_DB')) AS MISSING,
        (SELECT COUNT(*) FROM (SELECT OBJ, PRIVILEGE FROM g WHERE DB = 'SHARED_DB' MINUS SELECT OBJ, PRIVILEGE FROM g WHERE DB = 'CAPTURE_DB')) AS EXTRA
      FROM g;

-- 3. REF on the copies: USAGE on the schema only, SELECT, INSERT, UPDATE on
--    each of the 8 tables, USAGE on the file format. Expected: SCHEMA
--    USAGE 1 row; TABLE INSERT, SELECT, UPDATE 8 rows; FILE_FORMAT USAGE 1
--    row.
SHOW GRANTS TO ROLE ILR_APP_ROLE
  ->> SELECT "granted_on", PRIVILEGES, COUNT(*) AS OBJECTS FROM (
        SELECT "granted_on", "name", LISTAGG("privilege", ', ') WITHIN GROUP (ORDER BY "privilege") AS PRIVILEGES
        FROM $1 WHERE "name" = 'SHARED_DB.REF' OR STARTSWITH("name", 'SHARED_DB.REF.')
        GROUP BY 1, 2)
      GROUP BY 1, 2 ORDER BY 1;

-- 4. The app's role can use SHARED_DB. Expected: one row, USAGE.
SHOW GRANTS ON DATABASE SHARED_DB
  ->> SELECT "privilege" FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';

-- 5. Owners. Expected: one row per schema, every table owned by
--    ACCOUNTADMIN (ACCESS 4, EXT 4, OPS 1, RAW 4, REF 8, SKILLS 10).
SHOW TABLES IN DATABASE SHARED_DB
  ->> SELECT "schema_name", "owner", COUNT(*) AS TABLES_ FROM $1 GROUP BY 1, 2 ORDER BY 1, 2;

-- 6. The app's role owns nothing in SHARED_DB, can't create anything there,
--    and can't delete or truncate. Expected: 0.
SHOW GRANTS TO ROLE ILR_APP_ROLE
  ->> SELECT COUNT(*) AS NOT_ALLOWED FROM $1
      WHERE (STARTSWITH("name", 'SHARED_DB.') OR "name" = 'SHARED_DB')
        AND ("privilege" IN ('OWNERSHIP', 'DELETE', 'TRUNCATE') OR STARTSWITH("privilege", 'CREATE'));

-- 7. JUST BEFORE THE MERGE: nothing was written to the originals after the
--    copy was made (the scheduler was paused). Expected: 0.
SELECT COUNT(*) AS ORIGINALS_CHANGED_SINCE_COPY
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES o
WHERE o.TABLE_SCHEMA IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS')
  AND o.LAST_ALTERED > (SELECT MIN(CREATED) FROM SHARED_DB.INFORMATION_SCHEMA.SCHEMATA
                        WHERE SCHEMA_NAME IN ('REF', 'SKILLS', 'EXT', 'RAW', 'ACCESS', 'OPS'));
