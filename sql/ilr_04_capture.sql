-- ILR capture screens (part 7 step 4), file 1 of 1: what Warren needs before
-- managers can add, correct and remove a learner's ILR records (steps 4d
-- to 4g). Nothing in the app writes these yet.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. Safe to run twice:
-- columns and tables are only added if missing, and grants and revokes can
-- be repeated. Then run sql/test_reset_01_baseline.sql (the snapshot the
-- test learners can be reset to).
--
-- The decisions it carries out (28 September 2026):
--   Genuine changes (a new employment status, a price change) are new
--   records, as the ILR expects. A manager can also correct a record entered
--   in error, which keeps the old values alongside who and when, or remove
--   one, which marks it as removed (who, when and why) and never deletes it.
--
-- What it adds:
--   1. UPDATEDAT and UPDATEDBY (the last correction) and REMOVEDAT,
--      REMOVEDBY and REMOVEDREASON (removal) on each of the 8 ILR record
--      tables, and UPDATEDAT and UPDATEDBY on ILR.LEARNER and
--      ILR.LEARNING_DELIVERY, which are corrected but never removed. A
--      removed record stays in its table and the app and the ILR return
--      leave it out.
--   2. ILR.RECORD_CHANGE: one row for every record the app adds, corrects
--      or removes, with the old and new values. Add-only: the app's role can
--      read it and add to it, never change or delete it.
--   3. Permissions for ILR_APP_ROLE, the app's role, and no other:
--      SELECT, INSERT and UPDATE on the 8 record tables (UPDATE is how a
--      correction or a removal is recorded), SELECT and INSERT only on
--      RECORD_CHANGE. It never gets DELETE on any of them.
--
-- About the permissions: CAPTURE_DB.ILR already has a future grant that
-- gives ILR_APP_ROLE SELECT, INSERT and UPDATE on every new table in the
-- schema (SHOW FUTURE GRANTS IN SCHEMA CAPTURE_DB.ILR). That is why the app
-- can already write to the 8 tables, although sql/ilr_01_tables.sql says it
-- only granted SELECT. The grants below say it explicitly, and the revoke
-- takes UPDATE back off RECORD_CHANGE, which the future grant would
-- otherwise give it.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- 1. Who corrected or removed a record, and when
-- ---------------------------------------------------------------------------

ALTER TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.LEARNER_FAM ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.LEARNER_FAM ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.LEARNER_FAM ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.LEARNER_FAM ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.LEARNER_FAM ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.APP_FIN_RECORD ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE. A price change is a new record, not a correction.';
ALTER TABLE CAPTURE_DB.ILR.APP_FIN_RECORD ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.APP_FIN_RECORD ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.APP_FIN_RECORD ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.APP_FIN_RECORD ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.HOURS_RECORD ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected this record. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.HOURS_RECORD ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected it.';
ALTER TABLE CAPTURE_DB.ILR.HOURS_RECORD ADD COLUMN IF NOT EXISTS REMOVEDAT TIMESTAMP_LTZ COMMENT 'Set when a manager removes a record entered in error. The row is kept, and the ILR return leaves it out.';
ALTER TABLE CAPTURE_DB.ILR.HOURS_RECORD ADD COLUMN IF NOT EXISTS REMOVEDBY VARCHAR(40) COMMENT 'USERID of whoever removed it.';
ALTER TABLE CAPTURE_DB.ILR.HOURS_RECORD ADD COLUMN IF NOT EXISTS REMOVEDREASON VARCHAR(500) COMMENT 'Why it was removed.';

ALTER TABLE CAPTURE_DB.ILR.LEARNER ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last corrected the learner''s details. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.LEARNER ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected them.';

ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ COMMENT 'When a manager last changed this aim. The values before are in ILR.RECORD_CHANGE.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last changed it.';

-- ---------------------------------------------------------------------------
-- 2. The history of every change
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.RECORD_CHANGE (
  CHANGEID        VARCHAR(36) DEFAULT UUID_STRING() NOT NULL,
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  TABLENAME       VARCHAR(40) NOT NULL COMMENT 'The table changed, e.g. EMPLOYMENT_STATUS.',
  RECORDKEY       VARIANT NOT NULL COMMENT 'Which record, by its key columns, e.g. {"DATEEMPSTATAPP": "2025-08-01"}.',
  CHANGETYPE      VARCHAR(10) NOT NULL COMMENT 'added | corrected | removed',
  OLDVALUES       VARIANT COMMENT 'The record''s values before (corrected and removed).',
  NEWVALUES       VARIANT COMMENT 'The record''s values after (added and corrected).',
  REASON          VARCHAR(500) COMMENT 'Why. Required when a record is removed.',
  CHANGEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CHANGEDBY       VARCHAR(40) NOT NULL COMMENT 'USERID of the manager.',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CONSTRAINT PK_RECORD_CHANGE PRIMARY KEY (CHANGEID),
  CONSTRAINT FK_RECORD_CHANGE_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'Every change the app makes to a learner''s ILR records (added, corrected or removed), with the values before and after. Add-only.';

-- ---------------------------------------------------------------------------
-- 3. Permissions, for the app's role only
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.LEARNER_FAM TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.APP_FIN_RECORD TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.HOURS_RECORD TO ROLE ILR_APP_ROLE;

GRANT SELECT, INSERT ON TABLE CAPTURE_DB.ILR.RECORD_CHANGE TO ROLE ILR_APP_ROLE;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE CAPTURE_DB.ILR.RECORD_CHANGE FROM ROLE ILR_APP_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new columns. Expected: 44 rows (5 on each of the 8 record tables,
--    2 on LEARNER and 2 on LEARNING_DELIVERY).
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'ILR'
  AND COLUMN_NAME IN ('UPDATEDAT', 'UPDATEDBY', 'REMOVEDAT', 'REMOVEDBY', 'REMOVEDREASON')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 2. What ILR_APP_ROLE can do to these tables. Expected: SELECT, INSERT and
--    UPDATE on each of the 8 record tables, SELECT and INSERT only on
--    RECORD_CHANGE, and no DELETE or TRUNCATE anywhere.
SHOW GRANTS TO ROLE ILR_APP_ROLE;
SELECT "name" AS TABLE_NAME, LISTAGG("privilege", ', ') WITHIN GROUP (ORDER BY "privilege") AS PRIVILEGES
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
WHERE "granted_on" = 'TABLE'
  AND "name" IN ('CAPTURE_DB.ILR.PRIOR_ATTAINMENT', 'CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM', 'CAPTURE_DB.ILR.LEARNER_FAM',
                 'CAPTURE_DB.ILR.EMPLOYMENT_STATUS', 'CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING',
                 'CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM', 'CAPTURE_DB.ILR.APP_FIN_RECORD', 'CAPTURE_DB.ILR.HOURS_RECORD',
                 'CAPTURE_DB.ILR.RECORD_CHANGE')
GROUP BY 1
ORDER BY 1;

-- 3. No record is marked as removed or corrected yet, and the history is
--    empty. Expected: 0 in every column.
SELECT
  (SELECT COUNT_IF(REMOVEDAT IS NOT NULL OR UPDATEDAT IS NOT NULL) FROM CAPTURE_DB.ILR.EMPLOYMENT_STATUS) AS EMPLOYMENT_STATUS,
  (SELECT COUNT_IF(REMOVEDAT IS NOT NULL OR UPDATEDAT IS NOT NULL) FROM CAPTURE_DB.ILR.APP_FIN_RECORD) AS APP_FIN_RECORD,
  (SELECT COUNT_IF(REMOVEDAT IS NOT NULL OR UPDATEDAT IS NOT NULL) FROM CAPTURE_DB.ILR.HOURS_RECORD) AS HOURS_RECORD,
  (SELECT COUNT(*) FROM CAPTURE_DB.ILR.RECORD_CHANGE) AS RECORD_CHANGES;
