-- Loading everything into Snowflake, step 0: the setup the loaders need.
--
-- Rarebit's standing rule (9 October 2026): every data set we import or
-- work with is loaded into Snowflake. This file makes the places and the
-- loader's own identity; each later step adds its own tables and grants,
-- table by table.
--
--   LOAD_WH         X-Small, suspends after 60 seconds. Loads only, so their
--                   credits show separately from the app's (CAPTURE_WH).
--   DATA_LOAD_ROLE  What the loaders and load jobs run as. Never granted to
--                   ILR_APP_USER: the live app's key can't write to
--                   OPTIONS_DB. Nothing on ACCESS or the ILR tables.
--   DATA_LOAD_USER  A service user (key pair only, no password) used only by
--                   the loaders. Private key: ~/.snowflake/data_load_key.p8
--                   (made 9 October 2026, never committed); public key below.
--   OPTIONS_DB      The school leavers app's data, kept apart from the
--                   provider products: RAW (files as downloaded, add-only),
--                   CLEAN (typed tables), CONTENT (a copy of the knowledge
--                   bank). Warren may later read CLEAN only, through the
--                   database role OPTIONS_DB.CLEAN_READER (made here, granted
--                   to nobody yet).
--   SHARED_DB.RAW   Gets a stage and SOURCE_FILE for the rest of LARS (and,
--                   once its licence is checked, the FIS reference data).
--   CAPTURE_DB.TEST_BASELINE
--                   Gets a stage and SOURCE_FILE for the test ILR exports
--                   and FIS reports. TEST DATA ONLY. The app's role still
--                   has no access to this schema.
--
-- How a load works (each step): the loader works out the file's sha256 and
-- skips it if SOURCE_FILE already has it; otherwise it PUTs the file into
-- the stage untouched (zips and spreadsheets: plus an extracted or converted
-- CSV beside it, because COPY can't read .zip or .ods), COPYs INTO the RAW
-- table, then adds one SOURCE_FILE row with both checksums and the counts,
-- and logs the run in SHARED_DB.OPS.JOB_RUN. The files on disk are only read.
-- GIAS is the exception: its original zip never reaches Snowflake (head
-- teacher and proprietor names); a copy without those columns is staged,
-- and SOURCE_FILE records the original zip's checksum next to the copy's.
--
-- Everything here is owned by ACCOUNTADMIN, like SHARED_DB; roles get
-- explicit grants only (no future grants, no CREATE).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks are in
-- sql/load_00_checks.sql, to run one at a time afterwards.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The warehouse, role and user
-- ---------------------------------------------------------------------------
CREATE WAREHOUSE IF NOT EXISTS LOAD_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Data loads only (DATA_LOAD_ROLE). X-Small, suspends after 60 seconds.';
-- Creating a warehouse makes it the current one: go back to CAPTURE_WH, so
-- this file never wakes LOAD_WH.
USE WAREHOUSE capture_wh;

CREATE ROLE IF NOT EXISTS DATA_LOAD_ROLE
  COMMENT = 'The loaders and load jobs: PUT to the load stages, COPY INTO RAW, rebuild CLEAN, log job runs. Granted only to DATA_LOAD_USER. Nothing on ACCESS or the ILR tables.';

CREATE USER IF NOT EXISTS DATA_LOAD_USER
  TYPE = SERVICE
  DEFAULT_ROLE = DATA_LOAD_ROLE
  DEFAULT_WAREHOUSE = LOAD_WH
  RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlWN3bDa9Eovxq6iLd0rbPbJSjpKuZnVdG7XbN64LiQ3UDiE6Ne6TH3EJPa8d5SBh5Jm6AnI5ZHZD8TLHmwyd4VlhgcA1x3hc1K82qeP5b3Q2o8vI5iToWF8OQujvny61HaFFK4YNsT54OC4bM5CmD4N7ZVV8zt1AZf2rsgoZ0YwDWIL3j8RqyHY7eZHbeUZIlVyWpwl0PS6o0iX616CzDlVmdW+JiNO1kVeE/YV3+RVWmdA42PD7rh4jZsi5fURj/2wfH187H/c9vLnSmZ6N5oct1jKVlufsfgetKqaVuhVkSexPdctzB0QaAB/ddA5Ym7JSbNZWumCs55BslkyXgQIDAQAB'
  COMMENT = 'Service user for the data loaders and load jobs only. Key pair, no password. Not the app.';

GRANT ROLE DATA_LOAD_ROLE TO USER DATA_LOAD_USER;
GRANT USAGE ON WAREHOUSE LOAD_WH TO ROLE DATA_LOAD_ROLE;

-- ---------------------------------------------------------------------------
-- OPTIONS_DB
-- ---------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS OPTIONS_DB
  COMMENT = 'The school leavers app (working name): official data about schools, colleges, universities and providers, and a copy of the knowledge bank. Kept apart from the provider products. Owned by ACCOUNTADMIN; roles get explicit grants only.';

CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.RAW
  COMMENT = 'Files exactly as downloaded (stage DOWNLOADS) and one text-only table per file, add-only. No personal data: GIAS head teacher and proprietor columns are removed before staging.';
CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.CLEAN
  COMMENT = 'Typed tables keyed by URN or UKPRN, rebuilt from RAW by the loader. Faithful to the source: hiding small numbers is the app''s job, not done here.';
CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.CONTENT
  COMMENT = 'A COPY of the knowledge bank (entries, questions, topics, glossary, synonyms, jobs). The source of truth is the repo files (school-leavers-app/content). Reloaded by a command after commits; never edit it here.';

CREATE STAGE IF NOT EXISTS OPTIONS_DB.RAW.DOWNLOADS
  COMMENT = 'Downloaded files, untouched, under <source>/<date>/<name>, with any extracted or converted CSV beside them. Never GIAS''s original zip.';

-- Text exactly as in the file: no trimming, empty stays empty, a wrong
-- column count or a bad character stops the load.
CREATE FILE FORMAT IF NOT EXISTS OPTIONS_DB.RAW.CSV_UTF8
  TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"' ENCODING = 'UTF8' COMPRESSION = AUTO
  EMPTY_FIELD_AS_NULL = FALSE NULL_IF = () TRIM_SPACE = FALSE ERROR_ON_COLUMN_COUNT_MISMATCH = TRUE
  COMMENT = 'Downloaded CSVs (and CSVs converted from .ods), UTF-8, header row skipped.';
CREATE FILE FORMAT IF NOT EXISTS OPTIONS_DB.RAW.CSV_WINDOWS1252
  TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"' ENCODING = 'WINDOWS1252' COMPRESSION = AUTO
  EMPTY_FIELD_AS_NULL = FALSE NULL_IF = () TRIM_SPACE = FALSE ERROR_ON_COLUMN_COUNT_MISMATCH = TRUE
  COMMENT = 'CSVs published in Windows-1252 (GIAS).';
CREATE FILE FORMAT IF NOT EXISTS OPTIONS_DB.RAW.JSON_LINES
  TYPE = JSON COMPRESSION = AUTO
  COMMENT = 'One JSON object per line (the knowledge bank, converted from the repo''s YAML and Markdown).';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.SOURCE_FILE (
  SOURCEFILEID       VARCHAR(36)    NOT NULL,
  SOURCE             VARCHAR(60)    NOT NULL COMMENT 'Which data set, e.g. gias, ofsted-fe, achievement-et.',
  TITLE              VARCHAR(300)   COMMENT 'The publisher''s title for it.',
  PUBLISHER          VARCHAR(100)   COMMENT 'e.g. Department for Education, Ofsted, HESA.',
  PAGEURL            VARCHAR(500)   COMMENT 'Where it was downloaded from.',
  LICENCE            VARCHAR(100)   NOT NULL COMMENT 'e.g. Open Government Licence v3.0, CC BY 4.0.',
  ORIGINALNAME       VARCHAR(500)   NOT NULL COMMENT 'The file as downloaded.',
  ORIGINALSHA256     VARCHAR(64)    NOT NULL COMMENT 'Checksum of the file as downloaded. A file with a checksum already here is skipped.',
  ORIGINALBYTES      NUMBER(38,0)   NOT NULL,
  ORIGINALMODIFIEDAT TIMESTAMP_LTZ  COMMENT 'The file''s date on disk: when it was downloaded.',
  ORIGINALSTAGED     BOOLEAN        NOT NULL COMMENT 'FALSE when the original is deliberately not in the stage (GIAS: personal data).',
  MEMBER             VARCHAR(500)   COMMENT 'The zip entry or spreadsheet sheet the loaded copy came from.',
  COPYKIND           VARCHAR(20)    NOT NULL COMMENT 'What COPY read: as-downloaded, extracted (from a zip), converted (from a spreadsheet) or columns-removed.',
  REMOVEDCOLUMNS     ARRAY          COMMENT 'Columns left out of the copy, and so out of Snowflake.',
  STAGEDPATH         VARCHAR(1000)  NOT NULL COMMENT 'The file COPY read, in the stage.',
  STAGEDSHA256       VARCHAR(64)    NOT NULL COMMENT 'Checksum of that file (before gzip). Same as ORIGINALSHA256 when it is the original.',
  STAGEDBYTES        NUMBER(38,0)   NOT NULL,
  TARGETTABLE        VARCHAR(200)   NOT NULL COMMENT 'The RAW table it was loaded into.',
  ROWSREAD           NUMBER(38,0)   NOT NULL COMMENT 'Data rows in the file.',
  ROWSLOADED         NUMBER(38,0)   NOT NULL COMMENT 'Rows COPY loaded. Differs from ROWSREAD only if something is wrong.',
  JOBRUNID           VARCHAR(36)    COMMENT 'The SHARED_DB.OPS.JOB_RUN row of the run that loaded it.',
  LOADEDAT           TIMESTAMP_LTZ  DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CONSTRAINT PK_SOURCE_FILE PRIMARY KEY (SOURCEFILEID)
)
COMMENT = 'One row per file loaded into OPTIONS_DB.RAW: what it is, where from, its licence, checksums and counts. Add-only.';

-- For Warren later: read CLEAN only. Each CLEAN table is granted to it
-- table by table when it's made; the role is granted to ILR_APP_ROLE only
-- when a Warren screen first uses it (and check:grants is updated then).
CREATE DATABASE ROLE IF NOT EXISTS OPTIONS_DB.CLEAN_READER
  COMMENT = 'Read CLEAN only (Warren, later). Granted to nobody until a screen needs it.';
GRANT USAGE ON SCHEMA OPTIONS_DB.CLEAN TO DATABASE ROLE OPTIONS_DB.CLEAN_READER;

-- ---------------------------------------------------------------------------
-- SHARED_DB.RAW: the rest of LARS, later the FIS reference data
-- ---------------------------------------------------------------------------
CREATE STAGE IF NOT EXISTS SHARED_DB.RAW.DOWNLOADS
  COMMENT = 'Downloaded reference files (LARS), untouched, under <source>/<date>/<name>, with any extracted CSV beside them.';

CREATE FILE FORMAT IF NOT EXISTS SHARED_DB.RAW.CSV_UTF8
  TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"' ENCODING = 'UTF8' COMPRESSION = AUTO
  EMPTY_FIELD_AS_NULL = FALSE NULL_IF = () TRIM_SPACE = FALSE ERROR_ON_COLUMN_COUNT_MISMATCH = TRUE
  COMMENT = 'Downloaded CSVs, UTF-8, header row skipped.';

-- The same table as OPTIONS_DB.RAW.SOURCE_FILE (a clone of it while it's
-- still empty: same columns, comments and key; no grants).
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SOURCE_FILE CLONE OPTIONS_DB.RAW.SOURCE_FILE;
ALTER TABLE SHARED_DB.RAW.SOURCE_FILE SET
  COMMENT = 'One row per file loaded into SHARED_DB.RAW by the loaders: what it is, where from, its licence, checksums and counts. Add-only.';

-- ---------------------------------------------------------------------------
-- CAPTURE_DB.TEST_BASELINE: test ILR exports and FIS reports (TEST DATA)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS CAPTURE_DB.TEST_BASELINE
  COMMENT = 'TEST DATA ONLY: a snapshot of the test learners, for sql/test_reset_02_reset.sql. No access for the app.';

CREATE STAGE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.DOWNLOADS
  COMMENT = 'TEST DATA ONLY: ILR files exported from the test learners and the FIS reports run on them, untouched.';

CREATE FILE FORMAT IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.CSV_UTF8
  TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"' ENCODING = 'UTF8' COMPRESSION = AUTO
  EMPTY_FIELD_AS_NULL = FALSE NULL_IF = () TRIM_SPACE = FALSE ERROR_ON_COLUMN_COUNT_MISMATCH = TRUE
  COMMENT = 'TEST DATA ONLY: FIS report CSVs (and CSVs converted from its .xlsx reports).';
CREATE FILE FORMAT IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.XML_FILE
  TYPE = XML COMPRESSION = AUTO
  COMMENT = 'TEST DATA ONLY: ILR XML files exported from the test learners.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.SOURCE_FILE CLONE OPTIONS_DB.RAW.SOURCE_FILE;
ALTER TABLE CAPTURE_DB.TEST_BASELINE.SOURCE_FILE ADD COLUMN IF NOT EXISTS ISTESTDATA BOOLEAN DEFAULT TRUE NOT NULL COMMENT 'Always TRUE: everything loaded here is test data.';
ALTER TABLE CAPTURE_DB.TEST_BASELINE.SOURCE_FILE SET
  COMMENT = 'TEST DATA ONLY: one row per test file loaded into TEST_BASELINE (ILR exports, FIS reports). Add-only.';

-- ---------------------------------------------------------------------------
-- DATA_LOAD_ROLE: explicit grants only
-- ---------------------------------------------------------------------------
-- OPTIONS_DB: USAGE on the schemas (no CREATE), the stage, the formats,
-- SOURCE_FILE add-only. Each step grants its own RAW, CLEAN, CONTENT tables.
GRANT USAGE ON DATABASE OPTIONS_DB TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA OPTIONS_DB.RAW TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA OPTIONS_DB.CLEAN TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA OPTIONS_DB.CONTENT TO ROLE DATA_LOAD_ROLE;
GRANT READ, WRITE ON STAGE OPTIONS_DB.RAW.DOWNLOADS TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT OPTIONS_DB.RAW.CSV_UTF8 TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT OPTIONS_DB.RAW.CSV_WINDOWS1252 TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT OPTIONS_DB.RAW.JSON_LINES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.SOURCE_FILE TO ROLE DATA_LOAD_ROLE;

-- SHARED_DB: RAW (stage, format, SOURCE_FILE) and the job-run log. No
-- ACCESS, REF, SKILLS or EXT.
GRANT USAGE ON DATABASE SHARED_DB TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.RAW TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.OPS TO ROLE DATA_LOAD_ROLE;
GRANT READ, WRITE ON STAGE SHARED_DB.RAW.DOWNLOADS TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT SHARED_DB.RAW.CSV_UTF8 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SOURCE_FILE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.OPS.JOB_RUN TO ROLE DATA_LOAD_ROLE;

-- CAPTURE_DB: TEST_BASELINE's stage, formats and SOURCE_FILE only. Nothing
-- on ILR, BURROW, LARS, or the test learner snapshot tables.
GRANT USAGE ON DATABASE CAPTURE_DB TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA CAPTURE_DB.TEST_BASELINE TO ROLE DATA_LOAD_ROLE;
GRANT READ, WRITE ON STAGE CAPTURE_DB.TEST_BASELINE.DOWNLOADS TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT CAPTURE_DB.TEST_BASELINE.CSV_UTF8 TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT CAPTURE_DB.TEST_BASELINE.XML_FILE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.SOURCE_FILE TO ROLE DATA_LOAD_ROLE;
