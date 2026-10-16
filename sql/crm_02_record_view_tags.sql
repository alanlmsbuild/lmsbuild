-- Meadow's person record (the approved "Person record" mock-up): the log of
-- who opened which record, and governance tags on the CRM's personal data
-- (decision 21). Alan's decisions, 16 October 2026:
--   1. Every view of a person's record is logged in an add-only table,
--      CRM_DB.CRM.RECORD_VIEW (who, which lead, when). CRM_APP_ROLE may only
--      add to it: no SELECT, UPDATE or DELETE, so the app can't read, change
--      or remove the log. Reading it is for ACCOUNTADMIN (checks below, and
--      a report later).
--   2. The CRM's personal fields are tagged with SHARED_DB.GOVERNANCE.SENSITIVITY:
--      CRM.LEAD as a whole 'minor' (many leads are under 18), and on it
--      GIVENNAMES, FAMILYNAME, EMAIL, MOBILE, DATEOFBIRTH and POSTCODE
--      'personal'; CRM.EMAIL_MESSAGE.TOADDRESS and CRM.ACTIVITY.BODY
--      'personal'. check:tags --crm reads them back as CRM_APP_USER, so
--      CRM_APP_ROLE gets USAGE on SHARED_DB.GOVERNANCE (it can then see tag
--      values; it gets no APPLY, so it can't set or change one).
--
-- RECORD_VIEW holds test rows (views of test leads) with ISTESTDATA = TRUE,
-- copied from the lead. The test reset (sql/test_reset_02_reset.sql) empties
-- them and puts nothing back, as it does for ILR.RECORD_CHANGE, so there's
-- no snapshot table for it.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. Then the checks in
-- sql/crm_02_checks.sql.

USE ROLE ACCOUNTADMIN;

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.RECORD_VIEW (
  VIEWID         VARCHAR(40)   NOT NULL COMMENT 'A new ID for each view.',
  ORGANISATIONID VARCHAR(20)   NOT NULL COMMENT 'The organisation of the record and of the person who opened it.',
  RECORDTYPE     VARCHAR(20)   NOT NULL COMMENT 'Which kind of record: lead (the person record). Others may follow.',
  RECORDID       VARCHAR(40)   NOT NULL COMMENT 'The record opened, e.g. a CRM.LEAD.',
  VIEWEDBY       VARCHAR(20)   NOT NULL COMMENT 'Who opened it (SHARED_DB.ACCESS.APP_USER).',
  VIEWEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL COMMENT 'When it was opened.',
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for views of test data (copied from the lead), so the test reset can remove them.',
  CONSTRAINT PK_RECORD_VIEW PRIMARY KEY (VIEWID)
)
COMMENT = 'Who opened which person record, and when: one row per view. Add-only: the app can add rows but not read, change or remove them.';

GRANT INSERT ON TABLE CRM_DB.CRM.RECORD_VIEW TO ROLE CRM_APP_ROLE;

-- The tags. Columns without a tag of their own take their table's
-- SENSITIVITY.
ALTER TABLE CRM_DB.CRM.LEAD SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'minor';
ALTER TABLE CRM_DB.CRM.LEAD MODIFY
  COLUMN GIVENNAMES SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN FAMILYNAME SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN EMAIL SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN MOBILE SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN DATEOFBIRTH SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN POSTCODE SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal';
ALTER TABLE CRM_DB.CRM.EMAIL_MESSAGE MODIFY COLUMN TOADDRESS SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal';
ALTER TABLE CRM_DB.CRM.ACTIVITY MODIFY COLUMN BODY SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal';

-- So check:tags --crm can read the tag values as CRM_APP_USER.
GRANT USAGE ON SCHEMA SHARED_DB.GOVERNANCE TO ROLE CRM_APP_ROLE;
