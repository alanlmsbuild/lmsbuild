-- Shared database, file 1: SHARED_DB, with copies of the six shared schemas.
--
-- The CRM design (doc "CRM design", 7 October 2026) puts data that Warren,
-- Burrow and the CRM all need in its own database, so the CRM's app role
-- never needs rights inside CAPTURE_DB (the learning database):
--
--   REF      SOC 2020, SIC lists, postcodes, interest words (npm run import:ref)
--   SKILLS   Skills England standards, KSBs, occupations (npm run import:skills)
--   EXT      adverts and Companies House, cleaned
--   RAW      responses as returned, add-only
--   ACCESS   sign-ins, roles, organisations, site assignments
--   OPS      background job runs
--
-- This file COPIES them (zero-copy clones). CAPTURE_DB keeps the
-- originals, so the dev server (3001, on main) carries on working while the
-- code moves to SHARED_DB on a branch and is tested on 3002. After the
-- merge, sql/shared_02_drop_old.sql drops the originals.
--
-- THE ORDER (each step labelled with where it's done):
--   1. PowerShell: Disable-ScheduledTask -TaskName 'Rarebit jobs'
--      PowerShell: Get-ScheduledTask -TaskName 'Rarebit jobs' | Select-Object TaskName, State
--        (State must say Disabled.)
--      WSL terminal: ls ~/my-react-app/logs/jobs/tick.lock
--        ("No such file" = no tick is still running; if it exists, wait.)
--   2. Snowflake: check 0 in sql/shared_01_checks.sql (before this file).
--   3. Snowflake: this file, Run All, as ACCOUNTADMIN. Then checks 1 to 6.
--   4. Claude switches the code to SHARED_DB on the branch and runs every
--      test on 3002. Until the merge, don't add employers on 3001.
--   5. Snowflake: check 7 (nothing written to the originals since the
--      copy). Expected 0; then the merge.
--   6. PowerShell, after the merge: Enable-ScheduledTask -TaskName 'Rarebit jobs'
--      (and Start-ScheduledTask -TaskName 'Rarebit jobs' to run a tick now).
--
-- Ownership: every table, schema and file format in SHARED_DB is owned by
-- ACCOUNTADMIN; the app's role gets explicit grants only, never DELETE,
-- never ownership, and no CREATE in any SHARED_DB schema. The REF tables
-- were the app's own (npm run import:ref created and replaced them), so:
--   - ACCOUNTADMIN takes the originals over first (so it can copy them),
--     keeping the app's grants and adding SELECT so 3001 can still read them;
--   - the REF copies get LASTSEENAT and GONEAT, and the import changes to
--     MERGE from the staged file (named file format below), marking rows a
--     source no longer has as gone instead of deleting them, like SKILLS.
-- Every copy's grants are cleared and set again here, so they are exactly
-- what this file says, whatever a clone keeps.
--
-- Safe to run twice (a second run copies nothing new).

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE DATABASE IF NOT EXISTS SHARED_DB
  COMMENT = 'Data Warren, Burrow and the CRM all use: reference data, Skills England, adverts and Companies House, sign-ins, job runs. Owned by ACCOUNTADMIN; app roles get explicit grants only.';

-- REF originals: ACCOUNTADMIN takes them over (so it can copy them),
-- keeping the app's grants and adding SELECT so 3001 can still read them.
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA CAPTURE_DB.REF TO ROLE ACCOUNTADMIN COPY CURRENT GRANTS;
GRANT SELECT ON ALL TABLES IN SCHEMA CAPTURE_DB.REF TO ROLE ILR_APP_ROLE;

-- The copies.
CREATE SCHEMA IF NOT EXISTS SHARED_DB.REF    CLONE CAPTURE_DB.REF;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.SKILLS CLONE CAPTURE_DB.SKILLS;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.EXT    CLONE CAPTURE_DB.EXT;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.RAW    CLONE CAPTURE_DB.RAW;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.ACCESS CLONE CAPTURE_DB.ACCESS;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.OPS    CLONE CAPTURE_DB.OPS;

-- Every copied table owned by ACCOUNTADMIN, with whatever grants the clone
-- kept cleared (they're set again below).
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.REF    TO ROLE ACCOUNTADMIN REVOKE CURRENT GRANTS;
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.SKILLS TO ROLE ACCOUNTADMIN REVOKE CURRENT GRANTS;
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.EXT    TO ROLE ACCOUNTADMIN REVOKE CURRENT GRANTS;
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.RAW    TO ROLE ACCOUNTADMIN REVOKE CURRENT GRANTS;
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.ACCESS TO ROLE ACCOUNTADMIN REVOKE CURRENT GRANTS;
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.OPS    TO ROLE ACCOUNTADMIN REVOKE CURRENT GRANTS;

-- REF: soft delete, like SKILLS. A row the source no longer has gets GONEAT;
-- a row that comes back has it cleared. Readers leave gone rows out.
ALTER TABLE SHARED_DB.REF.INTEREST_WORD          ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.INTEREST_WORD          ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';
ALTER TABLE SHARED_DB.REF.POSTCODE               ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.POSTCODE               ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';
ALTER TABLE SHARED_DB.REF.SIC2007                ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.SIC2007                ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';
ALTER TABLE SHARED_DB.REF.SIC2007_TO_SIC2026     ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.SIC2007_TO_SIC2026     ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';
ALTER TABLE SHARED_DB.REF.SOC2020_INDEX          ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.SOC2020_INDEX          ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';
ALTER TABLE SHARED_DB.REF.SOC2020_SUB_UNIT_GROUP ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.SOC2020_SUB_UNIT_GROUP ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';
ALTER TABLE SHARED_DB.REF.SOC2020_UNIT_GROUP     ADD COLUMN IF NOT EXISTS LASTSEENAT TIMESTAMP_LTZ COMMENT 'When the last successful import saw it.';
ALTER TABLE SHARED_DB.REF.SOC2020_UNIT_GROUP     ADD COLUMN IF NOT EXISTS GONEAT TIMESTAMP_LTZ COMMENT 'When a successful import no longer had it. Readers leave gone rows out.';

-- The format the REF import reads its staged files with (it MERGEs straight
-- from the file in its user stage, so it needs no tables of its own).
CREATE FILE FORMAT IF NOT EXISTS SHARED_DB.REF.REF_IMPORT_CSV
  TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' NULL_IF = ('\\N') ENCODING = 'UTF8' COMPRESSION = GZIP
  COMMENT = 'The gzipped CSV files npm run import:ref stages in its user stage.';

-- ---------------------------------------------------------------------------
-- The app's role on SHARED_DB: explicit grants only
-- ---------------------------------------------------------------------------
GRANT USAGE ON DATABASE SHARED_DB TO ROLE ILR_APP_ROLE;

-- USAGE only on every schema: no CREATE anywhere in SHARED_DB.
GRANT USAGE ON SCHEMA SHARED_DB.REF TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.SKILLS TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.EXT TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.RAW TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.ACCESS TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.OPS TO ROLE ILR_APP_ROLE;

-- REF: the import merges (no DELETE); the file format to read staged files.
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.IMPORT_RUN TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.INTEREST_WORD TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.POSTCODE TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.SIC2007 TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.SIC2007_TO_SIC2026 TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.SOC2020_INDEX TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.SOC2020_SUB_UNIT_GROUP TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.REF.SOC2020_UNIT_GROUP TO ROLE ILR_APP_ROLE;
GRANT USAGE ON FILE FORMAT SHARED_DB.REF.REF_IMPORT_CSV TO ROLE ILR_APP_ROLE;

-- ACCESS: read only.
GRANT SELECT ON TABLE SHARED_DB.ACCESS.APP_USER TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.APP_USER_SITE TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.ORGANISATION TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.USER_ROLE TO ROLE ILR_APP_ROLE;

-- EXT.
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.COMPANY TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.EXT.COMPANY_CHANGE TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY_IMPORT_RUN TO ROLE ILR_APP_ROLE;

-- OPS.
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.OPS.JOB_RUN TO ROLE ILR_APP_ROLE;

-- RAW: add-only.
GRANT INSERT ON TABLE SHARED_DB.RAW.CH_COMPANY_PROFILE TO ROLE ILR_APP_ROLE;
GRANT INSERT ON TABLE SHARED_DB.RAW.FAA_VACANCY_PAGE TO ROLE ILR_APP_ROLE;
GRANT INSERT ON TABLE SHARED_DB.RAW.SE_OCCUPATION TO ROLE ILR_APP_ROLE;
GRANT INSERT ON TABLE SHARED_DB.RAW.SE_STANDARD_VERSION TO ROLE ILR_APP_ROLE;

-- SKILLS.
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.OCCUPATION_PROFILE TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.OCCUPATION_SOC TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.OCCUPATION_TERM TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.SKILLS_IMPORT_RUN TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.STANDARD_DUTY TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.STANDARD_DUTY_KSB TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.STANDARD_DUTY_OPTION TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.STANDARD_KSB TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.STANDARD_OPTION TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.SKILLS.STANDARD_VERSION TO ROLE ILR_APP_ROLE;
