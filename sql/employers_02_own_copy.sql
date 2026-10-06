-- Employers via Companies House, file 2: each organisation's own copy.
--
-- EXT.COMPANY is shared: one row per company, written by whichever
-- organisation fetched it last. If the screens read it, a manager could tell
-- that another organisation already has a company (details fresher than
-- their own check, a "last checked" they didn't do, changes from before they
-- added it). So each employer keeps its own copy of what this organisation
-- was shown from Companies House, and the screens read only that, through
-- ORG_EMPLOYER. EXT stays as the shared, cleaned store for the nightly
-- refresh and reporting, and the app never shows it.
--
-- Also: the test employers go into the test snapshot, so the reset
-- (sql/test_reset_02_reset.sql, updated to match) removes employers added
-- while testing and undoes changes to the test employers.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, AFTER
-- sql/employers_01_companies_house.sql. Safe to run twice. No new grants:
-- the app's role already has SELECT, INSERT and UPDATE on ILR.EMPLOYER.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- ILR.EMPLOYER: this organisation's copy of the Companies House details
-- ---------------------------------------------------------------------------
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS COMPANYDETAILS VARIANT COMMENT 'This organisation''s copy of the company''s details, as last fetched by it: the EXT.COMPANY columns as an object. The registered office is shown to managers only.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS COMPANYCHECKEDAT TIMESTAMP_LTZ COMMENT 'When this organisation last fetched the company from Companies House.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS COMPANYRESPONSEID VARCHAR(36) COMMENT 'The RAW.CH_COMPANY_PROFILE response COMPANYDETAILS came from.';

-- ---------------------------------------------------------------------------
-- The test employers in the test snapshot
-- ---------------------------------------------------------------------------
-- Taken now, with the new columns, so the reset can copy the rows back.
CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.EMPLOYER AS
  SELECT * FROM CAPTURE_DB.ILR.EMPLOYER WHERE ISTESTDATA = TRUE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new columns. Expected: 3 rows (COMPANYCHECKEDAT, COMPANYDETAILS,
--    COMPANYRESPONSEID).
SELECT COLUMN_NAME, DATA_TYPE
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'EMPLOYER'
  AND COLUMN_NAME IN ('COMPANYDETAILS', 'COMPANYCHECKEDAT', 'COMPANYRESPONSEID')
ORDER BY COLUMN_NAME;

-- 2. The snapshot. Expected: 6 employers, 0 not test data, 0 with a
--    company number, and 0 columns different from ILR.EMPLOYER's.
SELECT COUNT(*) AS EMPLOYERS, COUNT_IF(NOT ISTESTDATA) AS NOT_TEST, COUNT(COMPANYNUMBER) AS WITH_COMPANY_NUMBER,
  (SELECT COUNT(*) FROM (
     SELECT COLUMN_NAME, DATA_TYPE FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'EMPLOYER'
     MINUS
     SELECT COLUMN_NAME, DATA_TYPE FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME = 'EMPLOYER')) AS COLUMNS_DIFFERENT
FROM CAPTURE_DB.TEST_BASELINE.EMPLOYER;

-- 3. The app's role still can't see the snapshot. Expected: 0.
SHOW GRANTS ON SCHEMA CAPTURE_DB.TEST_BASELINE
  ->> SELECT COUNT(*) AS APP_ROLE_GRANTS FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';
