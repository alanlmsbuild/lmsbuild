-- Meadow: tags the personal data on the CRM's employer contacts (Alan,
-- 16 October 2026), following sql/crm_02_record_view_tags.sql:
-- CRM_DB.CRM.CONTACT's NAME, EMAIL and PHONE get
-- SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal'. The table itself gets no
-- SENSITIVITY tag (contacts are adults at employers, not minors). No grants
-- change.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. Then the check at the end, and
-- npm run check:tags -- --crm.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE CRM_DB.CRM.CONTACT MODIFY
  COLUMN NAME SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN EMAIL SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal',
  COLUMN PHONE SET TAG SHARED_DB.GOVERNANCE.SENSITIVITY = 'personal';

-- Check. Expected: 3 rows, NAME, EMAIL and PHONE, each personal.
SELECT OBJECT_NAME, COLUMN_NAME, TAG_VALUE
FROM TABLE(CRM_DB.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('CRM_DB.CRM.CONTACT', 'table'))
WHERE TAG_NAME = 'SENSITIVITY' AND LEVEL = 'COLUMN'
ORDER BY COLUMN_NAME;
