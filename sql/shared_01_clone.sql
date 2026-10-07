-- Shared database, file 1: SHARED_DB, with copies of the six shared schemas.
--
-- The CRM design (doc "CRM design", 7 October 2026) puts data that Warren,
-- Burrow and the CRM all need in its own database, so the CRM's app role
-- never needs rights inside CAPTURE_DB (the learning database):
--
--   REF      SOC 2020, SIC lists, postcodes, interest words (npm run import:ref)
--   SKILLS   Skills England standards, KSBs, occupations (npm run import:skills)
--   EXT      adverts and Companies House, cleaned (the vacancy import, Companies House)
--   RAW      responses as returned, add-only
--   ACCESS   sign-ins, roles, organisations, site assignments
--   OPS      background job runs
--
-- This file COPIES them (zero-copy clones: instant, no data duplicated
-- until either side changes). CAPTURE_DB keeps the originals, so the dev
-- server (3001, on main) carries on working while the code moves to
-- SHARED_DB on a branch and is tested on 3002. Once that's merged,
-- sql/shared_02_drop_old.sql drops the originals.
--
-- Before running: disable the Windows task "Rarebit jobs" (Task Scheduler:
-- right-click, Disable) and don't add employers on 3001 until the merge, so
-- nothing is written to the originals after the copy. Re-enable the task
-- after the merge.
--
-- Ownership: everything stays as it is, owned by ACCOUNTADMIN, except the
-- REF tables, which the app's role owns (npm run import:ref creates and
-- replaces them). To copy those, ACCOUNTADMIN takes ownership of the
-- originals first, keeping the app's grants and adding SELECT so 3001 can
-- still read them; the copies are then given back to the app's role.
--
-- Grants: the app's role gets USAGE on SHARED_DB and, on the copies,
-- exactly the 67 grants it holds on the originals today (re-applied here,
-- since Snowflake's documentation doesn't say what a clone keeps). Never
-- DELETE.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice (a second run copies nothing new). The
-- checks are in sql/shared_01_checks.sql: run check 0 BEFORE this file.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE DATABASE IF NOT EXISTS SHARED_DB
  COMMENT = 'Data Warren, Burrow and the CRM all use: reference data, Skills England, adverts and Companies House, sign-ins, job runs. Each app role reads it; only the import jobs and flow procedures write it.';

-- REF: take the originals over from the app's role, keeping its grants and
-- adding SELECT, so the copy can be made and 3001 can still read them.
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA CAPTURE_DB.REF TO ROLE ACCOUNTADMIN COPY CURRENT GRANTS;
GRANT SELECT ON ALL TABLES IN SCHEMA CAPTURE_DB.REF TO ROLE ILR_APP_ROLE;

-- The copies.
CREATE SCHEMA IF NOT EXISTS SHARED_DB.REF    CLONE CAPTURE_DB.REF;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.SKILLS CLONE CAPTURE_DB.SKILLS;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.EXT    CLONE CAPTURE_DB.EXT;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.RAW    CLONE CAPTURE_DB.RAW;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.ACCESS CLONE CAPTURE_DB.ACCESS;
CREATE SCHEMA IF NOT EXISTS SHARED_DB.OPS    CLONE CAPTURE_DB.OPS;

-- The REF copies go back to the app's role, as the originals were.
GRANT OWNERSHIP ON ALL TABLES IN SCHEMA SHARED_DB.REF TO ROLE ILR_APP_ROLE COPY CURRENT GRANTS;

-- ---------------------------------------------------------------------------
-- The app's role on SHARED_DB: the same grants it has on the originals
-- ---------------------------------------------------------------------------
GRANT USAGE ON DATABASE SHARED_DB TO ROLE ILR_APP_ROLE;

GRANT USAGE ON SCHEMA SHARED_DB.REF TO ROLE ILR_APP_ROLE;
GRANT CREATE TABLE ON SCHEMA SHARED_DB.REF TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.SKILLS TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.EXT TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.RAW TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.ACCESS TO ROLE ILR_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.OPS TO ROLE ILR_APP_ROLE;

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
