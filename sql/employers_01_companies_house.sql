-- Employers via Companies House, file 1: where the data goes.
--
--   RAW (bronze)  every Companies House response, exactly as returned, add-only
--   EXT (silver)  the cleaned, typed company details the app reads
--   ILR.EMPLOYER  gains the company number and who added or changed it
--
-- Company details are public and shared across organisations: the app reads
-- EXT only joined through the organisation's own employers (ORG_EMPLOYER),
-- never lists or searches it directly (npm run check:scoping). Name searches
-- go live to Companies House and aren't stored.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. Safe to run twice.
-- Grants are table by table to ILR_APP_ROLE (no future grants), and never
-- DELETE. ILR.EMPLOYER isn't in the test snapshot (TEST_BASELINE), so the
-- test reset doesn't change.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- RAW: responses as returned (bronze)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS CAPTURE_DB.RAW
  COMMENT = 'Bronze layer: responses from outside services exactly as returned, add-only. Rebuild the cleaned EXT tables from here.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.RAW.CH_COMPANY_PROFILE (
  RESPONSEID    VARCHAR(36)   DEFAULT UUID_STRING() NOT NULL,
  COMPANYNUMBER VARCHAR(8)    NOT NULL COMMENT 'The company number asked for.',
  ENDPOINT      VARCHAR(200)  NOT NULL COMMENT 'The Companies House path called, e.g. /company/01234567.',
  HTTPSTATUS    NUMBER(3)     NOT NULL,
  ETAG          VARCHAR(100)  COMMENT 'The profile''s ETag, when returned.',
  BODY          VARIANT       COMMENT 'The JSON response, exactly as returned.',
  FETCHEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  FETCHEDBY     VARCHAR(40)   NOT NULL COMMENT 'USERID of the manager, or REFRESH for the nightly refresh.',
  CONSTRAINT PK_CH_COMPANY_PROFILE PRIMARY KEY (RESPONSEID)
)
COMMENT = 'Every Companies House company profile fetched (GET /company/{number}), as returned. Add-only.';

-- ---------------------------------------------------------------------------
-- EXT: cleaned external data (silver)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS CAPTURE_DB.EXT
  COMMENT = 'Silver layer: cleaned, typed data from outside services, built from RAW. Shared across organisations: read only through the organisation''s own records.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.EXT.COMPANY (
  COMPANYNUMBER         VARCHAR(8)    NOT NULL,
  COMPANYNAME           VARCHAR(160)  NOT NULL COMMENT 'The registered name.',
  PREVIOUSNAMES         VARIANT       COMMENT 'Earlier names: [{name, effective_from, ceased_on}].',
  COMPANYSTATUS         VARCHAR(40)   COMMENT 'e.g. active, dissolved, liquidation, administration.',
  COMPANYSTATUSDETAIL   VARCHAR(60)   COMMENT 'e.g. active-proposal-to-strike-off.',
  COMPANYTYPE           VARCHAR(60)   COMMENT 'e.g. ltd, plc, llp.',
  COMPANYSUBTYPE        VARCHAR(60),
  JURISDICTION          VARCHAR(30),
  DATEOFCREATION        DATE,
  DATEOFCESSATION       DATE          COMMENT 'When it was dissolved, closed or converted.',
  ADDRESSPREMISES       VARCHAR(100)  COMMENT 'Registered office (managers only in the app).',
  ADDRESSLINE1          VARCHAR(100),
  ADDRESSLINE2          VARCHAR(100),
  ADDRESSLOCALITY       VARCHAR(100),
  ADDRESSREGION         VARCHAR(100),
  ADDRESSPOSTCODE       VARCHAR(10),
  ADDRESSCOUNTRY        VARCHAR(50),
  ADDRESSPOBOX          VARCHAR(20),
  ADDRESSCAREOF         VARCHAR(100),
  OFFICEINDISPUTE       BOOLEAN,
  OFFICEUNDELIVERABLE   BOOLEAN,
  SICCODES              ARRAY         COMMENT 'SIC 2007 codes (REF.SIC2007 has their descriptions).',
  ACCOUNTSNEXTDUE       DATE,
  ACCOUNTSOVERDUE       BOOLEAN,
  CONFIRMATIONNEXTDUE   DATE,
  CONFIRMATIONOVERDUE   BOOLEAN,
  HASINSOLVENCYHISTORY  BOOLEAN,
  ETAG                  VARCHAR(100),
  LASTCHECKEDAT         TIMESTAMP_LTZ NOT NULL COMMENT 'When Companies House was last asked.',
  LASTCHANGEDAT         TIMESTAMP_LTZ NOT NULL COMMENT 'When the details last changed.',
  SOURCERESPONSEID      VARCHAR(36)   NOT NULL COMMENT 'The RAW.CH_COMPANY_PROFILE response these details came from.',
  CONSTRAINT PK_COMPANY PRIMARY KEY (COMPANYNUMBER)
)
COMMENT = 'One row per company linked to an employer: the latest Companies House details.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.EXT.COMPANY_CHANGE (
  CHANGEID      VARCHAR(36)   DEFAULT UUID_STRING() NOT NULL,
  COMPANYNUMBER VARCHAR(8)    NOT NULL,
  FIELDNAME     VARCHAR(40)   NOT NULL COMMENT 'The EXT.COMPANY column that changed, e.g. COMPANYSTATUS.',
  OLDVALUE      VARCHAR(400),
  NEWVALUE      VARCHAR(400),
  DETECTEDAT    TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  RESPONSEID    VARCHAR(36)   NOT NULL COMMENT 'The RAW.CH_COMPANY_PROFILE response that showed it.',
  CONSTRAINT PK_COMPANY_CHANGE PRIMARY KEY (CHANGEID)
)
COMMENT = 'Changes found when a company is refreshed (status, name, address...), for flagging to managers. Add-only.';

-- ---------------------------------------------------------------------------
-- ILR.EMPLOYER: the link to Companies House, and who changed it
-- ---------------------------------------------------------------------------
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS COMPANYNUMBER VARCHAR(8) COMMENT 'The Companies House number, or null if not on Companies House. One employer per company in each organisation.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS NOTONCOMPANIESHOUSE VARCHAR(200) COMMENT 'Why there is no company number, e.g. sole trader or public body.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS ISACTIVE BOOLEAN DEFAULT TRUE COMMENT 'FALSE once no longer used. Never deleted.';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS CREATEDBY VARCHAR(40) COMMENT 'USERID of whoever added it (null for the seeded test employers).';
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS UPDATEDAT TIMESTAMP_LTZ;
ALTER TABLE CAPTURE_DB.ILR.EMPLOYER ADD COLUMN IF NOT EXISTS UPDATEDBY VARCHAR(40);

-- ---------------------------------------------------------------------------
-- Grants to the app's role: table by table, never DELETE
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA CAPTURE_DB.RAW TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.RAW.CH_COMPANY_PROFILE TO ROLE ILR_APP_ROLE;

GRANT USAGE ON SCHEMA CAPTURE_DB.EXT TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.EXT.COMPANY TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.EXT.COMPANY_CHANGE TO ROLE ILR_APP_ROLE;
-- ILR.EMPLOYER: the existing ILR grants already give SELECT, INSERT and UPDATE.

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The app's role on the new tables. Expected: RAW.CH_COMPANY_PROFILE
--    INSERT and SELECT; EXT.COMPANY INSERT, SELECT and UPDATE;
--    EXT.COMPANY_CHANGE INSERT and SELECT. No DELETE anywhere.
SELECT TABLE_SCHEMA, TABLE_NAME, LISTAGG(PRIVILEGE_TYPE, ', ') WITHIN GROUP (ORDER BY PRIVILEGE_TYPE) AS PRIVILEGES
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE GRANTEE = 'ILR_APP_ROLE' AND TABLE_SCHEMA IN ('RAW', 'EXT')
GROUP BY TABLE_SCHEMA, TABLE_NAME
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- 2. The new columns on ILR.EMPLOYER. Expected: 6 rows (COMPANYNUMBER,
--    CREATEDBY, ISACTIVE, NOTONCOMPANIESHOUSE, UPDATEDAT, UPDATEDBY).
SELECT COLUMN_NAME, DATA_TYPE
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'EMPLOYER'
  AND COLUMN_NAME IN ('COMPANYNUMBER', 'NOTONCOMPANIESHOUSE', 'ISACTIVE', 'CREATEDBY', 'UPDATEDAT', 'UPDATEDBY')
ORDER BY COLUMN_NAME;

-- 3. The existing employers are unchanged and still in use. Expected: 6
--    employers, 6 active, 0 with a company number.
SELECT COUNT(*) AS EMPLOYERS, COUNT_IF(ISACTIVE) AS ACTIVE, COUNT(COMPANYNUMBER) AS WITH_COMPANY_NUMBER
FROM CAPTURE_DB.ILR.EMPLOYER;
