-- Loading everything, step 0 checks: run these one at a time, as
-- ACCOUNTADMIN, straight after sql/load_00_setup.sql.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- 1. The load warehouse. Expected: X-Small, AUTO_SUSPEND 60,
--    AUTO_RESUME true, state SUSPENDED (nothing has used it yet).
SHOW WAREHOUSES LIKE 'LOAD_WH'
  ->> SELECT "name", "size", "auto_suspend", "auto_resume", "state", "owner" FROM $1;

-- 2. The loader's user. Expected: type SERVICE, default role DATA_LOAD_ROLE,
--    default warehouse LOAD_WH, has_password false, has_rsa_public_key true,
--    disabled false.
SHOW USERS LIKE 'DATA_LOAD_USER'
  ->> SELECT "name", "type", "default_role", "default_warehouse", "has_password", "has_rsa_public_key", "disabled" FROM $1;

-- 3. Its key is the one made on 9 October 2026. Expected: RSA_PUBLIC_KEY_FP
--    SHA256:fOtOCCbhdJ4t7JljRHqPIfhii0TVMSa29ZqYcils/Vs=
DESC USER DATA_LOAD_USER
  ->> SELECT "property", "value" FROM $1 WHERE "property" = 'RSA_PUBLIC_KEY_FP';

-- 4. Who has DATA_LOAD_ROLE. Expected: exactly 1 row, granted_to USER,
--    grantee_name DATA_LOAD_USER (so not ILR_APP_USER, and no other role).
SHOW GRANTS OF ROLE DATA_LOAD_ROLE
  ->> SELECT "granted_to", "grantee_name" FROM $1;

-- 5. What DATA_LOAD_ROLE can do. Expected: TOTAL 31 (WAREHOUSE 1,
--    OPTIONS 11, SHARED 11, CAPTURE 8), and 0 in every other column.
SHOW GRANTS TO ROLE DATA_LOAD_ROLE
  ->> SELECT
        COUNT(*) AS TOTAL,
        COUNT_IF("granted_on" = 'WAREHOUSE') AS WAREHOUSE,
        COUNT_IF(SPLIT_PART("name", '.', 1) = 'OPTIONS_DB') AS OPTIONS,
        COUNT_IF(SPLIT_PART("name", '.', 1) = 'SHARED_DB') AS SHARED,
        COUNT_IF(SPLIT_PART("name", '.', 1) = 'CAPTURE_DB') AS CAPTURE,
        COUNT_IF(REGEXP_LIKE("name", '^SHARED_DB\\.ACCESS(\\..*)?$')) AS ON_ACCESS,
        COUNT_IF(REGEXP_LIKE("name", '^CAPTURE_DB\\.ILR(\\..*)?$')) AS ON_ILR,
        COUNT_IF(REGEXP_LIKE("name", '^CAPTURE_DB\\.TEST_BASELINE\\..*$')
                 AND SPLIT_PART("name", '.', 3) NOT IN ('DOWNLOADS', 'CSV_UTF8', 'XML_FILE', 'SOURCE_FILE')) AS ON_SNAPSHOT,
        COUNT_IF(REGEXP_LIKE("name", '^SHARED_DB\\.(REF|SKILLS|EXT)(\\..*)?$')) AS ON_OTHER_SHARED,
        COUNT_IF("privilege" IN ('DELETE', 'TRUNCATE', 'OWNERSHIP') OR "privilege" LIKE 'CREATE%') AS DELETE_OWN_CREATE
      FROM $1;

-- 6. The app's role got nothing new. Expected: 0 in every column.
SHOW GRANTS TO ROLE ILR_APP_ROLE
  ->> SELECT
        COUNT_IF(SPLIT_PART("name", '.', 1) = 'OPTIONS_DB') AS ON_OPTIONS_DB,
        COUNT_IF("name" = 'LOAD_WH') AS ON_LOAD_WH,
        COUNT_IF("granted_on" = 'ROLE' AND "name" = 'DATA_LOAD_ROLE') AS HAS_LOAD_ROLE,
        COUNT_IF("name" IN ('SHARED_DB.RAW.DOWNLOADS', 'SHARED_DB.RAW.CSV_UTF8', 'SHARED_DB.RAW.SOURCE_FILE')) AS ON_NEW_SHARED,
        COUNT_IF(REGEXP_LIKE("name", '^CAPTURE_DB\\.TEST_BASELINE(\\..*)?$')) AS ON_TEST_BASELINE
      FROM $1;

-- 7. OPTIONS_DB's schemas, all owned by ACCOUNTADMIN. Expected: CLEAN,
--    CONTENT, PUBLIC (Snowflake makes it with every database; unused) and
--    RAW, owner ACCOUNTADMIN on each.
SHOW SCHEMAS IN DATABASE OPTIONS_DB
  ->> SELECT "name", "owner" FROM $1 WHERE "name" <> 'INFORMATION_SCHEMA' ORDER BY 1;

-- 8. The three stages and six file formats, owned by ACCOUNTADMIN.
--    Expected: 9 rows: DOWNLOADS in OPTIONS_DB.RAW, SHARED_DB.RAW and
--    CAPTURE_DB.TEST_BASELINE; formats CSV_UTF8, CSV_WINDOWS1252, JSON_LINES
--    (OPTIONS_DB.RAW), CSV_UTF8 (SHARED_DB.RAW), CSV_UTF8, XML_FILE
--    (CAPTURE_DB.TEST_BASELINE); owner ACCOUNTADMIN on all.
SHOW STAGES IN ACCOUNT
  ->> SELECT 'stage' AS KIND, "database_name", "schema_name", "name", "owner" FROM $1 WHERE "name" = 'DOWNLOADS';
SHOW FILE FORMATS IN ACCOUNT
  ->> SELECT 'format' AS KIND, "database_name", "schema_name", "name", "owner" FROM $1
      WHERE "schema_name" IN ('RAW', 'TEST_BASELINE') ORDER BY 2, 3, 4;

-- 9. The three SOURCE_FILE tables: empty, same columns, test copy marked.
--    Expected: OPTIONS_DB 22 columns, SHARED_DB 22, CAPTURE_DB 23 (with
--    ISTESTDATA); ROWS_NOW 0 on all three.
SELECT 'OPTIONS_DB' AS DB, (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'SOURCE_FILE') AS COLUMNS,
       (SELECT COUNT(*) FROM OPTIONS_DB.RAW.SOURCE_FILE) AS ROWS_NOW
UNION ALL
SELECT 'SHARED_DB', (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'SOURCE_FILE'),
       (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE)
UNION ALL
SELECT 'CAPTURE_DB', (SELECT COUNT(*) FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME = 'SOURCE_FILE'),
       (SELECT COUNT(*) FROM CAPTURE_DB.TEST_BASELINE.SOURCE_FILE);

-- 10. Warren's future reader role: made, granted to nobody. Expected:
--     0 rows.
SHOW GRANTS OF DATABASE ROLE OPTIONS_DB.CLEAN_READER;

-- 11. ...and what it can read so far. Expected: USAGE on schema
--     OPTIONS_DB.CLEAN (Snowflake may also list USAGE on the database
--     OPTIONS_DB); no tables yet.
SHOW GRANTS TO DATABASE ROLE OPTIONS_DB.CLEAN_READER
  ->> SELECT "privilege", "granted_on", "name" FROM $1;
