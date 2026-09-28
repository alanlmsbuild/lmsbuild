-- Reference data, file 1 of 2: the REF schema for published reference data
-- (SOC 2020 coding index, interest words, SIC lists, postcodes).
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, then load the data
-- with `npm run import:ref` (see sql/ref_02_checks.sql for what to expect).
-- Set up like the LARS and SKILLS schemas: ACCOUNTADMIN owns the schema, and
-- ILR_APP_ROLE can use it and create the tables the import script defines.
-- Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE SCHEMA IF NOT EXISTS CAPTURE_DB.REF
  COMMENT = 'Published reference data loaded by scripts/import-ref.js: ONS SOC 2020 coding index, our interest words, SIC 2007 lists and the ONS Postcode Directory.';

GRANT USAGE ON SCHEMA CAPTURE_DB.REF TO ROLE ILR_APP_ROLE;
GRANT CREATE TABLE ON SCHEMA CAPTURE_DB.REF TO ROLE ILR_APP_ROLE;

-- Check. Expected: OWNERSHIP for ACCOUNTADMIN, and CREATE TABLE and USAGE
-- for ILR_APP_ROLE (the same as CAPTURE_DB.SKILLS).
SHOW GRANTS ON SCHEMA CAPTURE_DB.REF;
