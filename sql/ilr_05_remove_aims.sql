-- ILR capture screens, removing aims entered in error: the same "removed"
-- columns the 8 ILR record tables got in sql/ilr_04_capture.sql, on
-- ILR.LEARNING_DELIVERY. A removed aim stays in the table (who, when and
-- why), and the app and the ILR return leave it out. The app never deletes.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, AFTER
-- sql/test_reset_01_baseline.sql has been run once. Safe to run twice.
--
-- The test snapshot's copy, CAPTURE_DB.TEST_BASELINE.LEARNING_DELIVERY,
-- gets the same columns in the same order, because the reset
-- (sql/test_reset_02_reset.sql) copies rows back with SELECT *. Check 2
-- below confirms the two tables have the same columns in the same order.
--
-- Permissions: none needed. ILR_APP_ROLE already has UPDATE on
-- ILR.LEARNING_DELIVERY (it marks an aim removed with an update), and still
-- has no DELETE (npm run check:grants).

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes an aim entered in error. The row is kept, and the app and the ILR return leave it out.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.TEST_BASELINE.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ;
ALTER TABLE CAPTURE_DB.TEST_BASELINE.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40);
ALTER TABLE CAPTURE_DB.TEST_BASELINE.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500);

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. Expected: 3 rows for ILR and 3 for TEST_BASELINE.
SELECT TABLE_SCHEMA, COLUMN_NAME, DATA_TYPE
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'LEARNING_DELIVERY' AND COLUMN_NAME IN ('REMOVEDAT', 'REMOVEDBY', 'REMOVEDREASON')
ORDER BY TABLE_SCHEMA, COLUMN_NAME;

-- 2. The live table and the snapshot have the same columns in the same
--    order, so the reset can copy rows back. Expected: SAME = TRUE, and 27
--    columns in each.
SELECT
  (SELECT LISTAGG(COLUMN_NAME, ',') WITHIN GROUP (ORDER BY ORDINAL_POSITION) FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'LEARNING_DELIVERY')
  = (SELECT LISTAGG(COLUMN_NAME, ',') WITHIN GROUP (ORDER BY ORDINAL_POSITION) FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME = 'LEARNING_DELIVERY') AS SAME,
  (SELECT COUNT(*) FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'LEARNING_DELIVERY') AS LIVE_COLUMNS,
  (SELECT COUNT(*) FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME = 'LEARNING_DELIVERY') AS SNAPSHOT_COLUMNS;

-- 3. No aim is marked removed yet. Expected: 0.
SELECT COUNT_IF(REMOVEDAT IS NOT NULL) AS REMOVED_AIMS FROM CAPTURE_DB.ILR.LEARNING_DELIVERY;
