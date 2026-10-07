-- Skills England, file 1: the new SKILLS tables (bronze in RAW, silver in
-- SKILLS), for npm run import:skills.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks are in
-- sql/skills_01_checks.sql, to run one at a time afterwards.
--
-- What it does:
--   1. Renames the old tables to *_OLD (KSB, DUTY, DUTY_KSB, OCCUPATION,
--      SKILLS_IMPORT_RUN, STANDARD_VERSION, STANDARD_IMPORT_RUN), taking
--      them over from the app's role first. Nothing is dropped:
--      sql/skills_02_drop_old.sql does that, once the first import has run
--      cleanly and the off-the-job minimum and KSB pages work.
--   2. Takes CREATE TABLE on SKILLS away from the app's role: from now on it
--      only reads SKILLS and the import writes it (SELECT, INSERT, UPDATE;
--      never DELETE). The tables are owned by ACCOUNTADMIN.
--   3. Creates the new tables:
--        RAW.SE_STANDARD_VERSION   each standard version record from the
--                                  standards API, as returned (add-only)
--        RAW.SE_OCCUPATION         each occupational maps API response,
--                                  as returned (add-only)
--        SKILLS.SKILLS_IMPORT_RUN  one row per run, with any KSB label
--                                  mismatches found
--        SKILLS.STANDARD_VERSION   every version of every standard (same
--                                  columns as before, and more)
--        SKILLS.STANDARD_KSB       each version's knowledge, skills and
--                                  behaviours (K1, S1, B1...)
--        SKILLS.STANDARD_DUTY, STANDARD_DUTY_KSB, STANDARD_OPTION,
--        STANDARD_DUTY_OPTION      each version's duties, the KSBs each maps
--                                  to, its options and which duties are in
--                                  which option
--        SKILLS.OCCUPATION_PROFILE, OCCUPATION_SOC, OCCUPATION_TERM
--                                  each occupation from the maps API: its
--                                  SOC codes, job titles and keywords
--   4. Copies the 2,020 old STANDARD_VERSION rows into the new table, so
--      the off-the-job minimum keeps working before the first import.
--   5. Keeps SKILLS.KSB and SKILLS.OCCUPATION as views over the (empty) old
--      tables, so today's code keeps working until it moves to the new
--      tables. The drop file removes them.
--
-- Nothing is ever deleted by the app: a version, KSB, duty or occupation
-- no longer published gets GONEAT (set by a complete run, cleared if it
-- comes back), and screens leave it out.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- 1. The old tables become *_OLD (skipped for any already renamed)
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
  old_tables ARRAY DEFAULT ARRAY_CONSTRUCT('KSB', 'DUTY', 'DUTY_KSB', 'OCCUPATION', 'SKILLS_IMPORT_RUN',
                                           'STANDARD_VERSION', 'STANDARD_IMPORT_RUN');
  last_index INTEGER DEFAULT 6;
  tname VARCHAR;
  found_table INTEGER;
  found_old INTEGER;
  renamed VARCHAR DEFAULT '';
BEGIN
  FOR i IN 0 TO last_index DO
    tname := GET(old_tables, i)::VARCHAR;
    SELECT COUNT(*) INTO :found_old FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'SKILLS' AND TABLE_NAME = :tname || '_OLD';
    SELECT COUNT(*) INTO :found_table FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'SKILLS' AND TABLE_NAME = :tname AND TABLE_TYPE = 'BASE TABLE';
    IF (found_old = 0 AND found_table = 1) THEN
      EXECUTE IMMEDIATE 'GRANT OWNERSHIP ON TABLE CAPTURE_DB.SKILLS.' || tname || ' TO ROLE ACCOUNTADMIN COPY CURRENT GRANTS';
      EXECUTE IMMEDIATE 'ALTER TABLE CAPTURE_DB.SKILLS.' || tname || ' RENAME TO CAPTURE_DB.SKILLS.' || tname || '_OLD';
      renamed := renamed || tname || ' ';
    END IF;
  END FOR;
  RETURN 'Renamed to _OLD: ' || IFF(renamed = '', 'nothing (already done)', renamed);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The app's role can't create tables in SKILLS any more
-- ---------------------------------------------------------------------------
REVOKE CREATE TABLE ON SCHEMA CAPTURE_DB.SKILLS FROM ROLE ILR_APP_ROLE;

-- ---------------------------------------------------------------------------
-- 3a. RAW: responses as returned (bronze, add-only)
-- ---------------------------------------------------------------------------
-- The standards file is one response of about 75 MB, over Snowflake's 16 MB
-- limit for one VARIANT, so each version record is kept as its own row,
-- with the whole file's SHA-256 to tie them together.
CREATE TABLE IF NOT EXISTS CAPTURE_DB.RAW.SE_STANDARD_VERSION (
  RESPONSEID    VARCHAR(36)   NOT NULL COMMENT 'Made by the import, so SKILLS can record where each row came from without reading RAW.',
  RUNID         VARCHAR(36)   NOT NULL COMMENT 'The import run (SKILLS.SKILLS_IMPORT_RUN).',
  SOURCEURL     VARCHAR(500)  NOT NULL COMMENT 'https://skillsengland.education.gov.uk/api/apprenticeshipstandards',
  FILESHA256    VARCHAR(64)   NOT NULL COMMENT 'SHA-256 of the whole response the record came from.',
  ST_REFERENCE  VARCHAR(10),
  VERSION       VARCHAR(20),
  BODY          VARIANT       COMMENT 'The version record, exactly as returned.',
  FETCHEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CONSTRAINT PK_SE_STANDARD_VERSION PRIMARY KEY (RESPONSEID)
)
COMMENT = 'Every apprenticeship standard version record from Skills England''s standards API, as returned. Add-only.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.RAW.SE_OCCUPATION (
  RESPONSEID       VARCHAR(36)   NOT NULL,
  RUNID            VARCHAR(36)   NOT NULL,
  OCCUPATION_CODE  VARCHAR(20)   NOT NULL COMMENT 'The occupation asked for, e.g. OCC0072.',
  ENDPOINT         VARCHAR(500)  NOT NULL COMMENT 'The occupational maps API path called.',
  HTTPSTATUS       NUMBER(3)     NOT NULL,
  BODY             VARIANT       COMMENT 'The JSON response, exactly as returned.',
  FETCHEDAT        TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CONSTRAINT PK_SE_OCCUPATION PRIMARY KEY (RESPONSEID)
)
COMMENT = 'Every Skills England occupational maps API response, as returned. Add-only.';

-- ---------------------------------------------------------------------------
-- 3b. SKILLS: the data the app reads (silver)
-- ---------------------------------------------------------------------------
-- Every table below (but the run table) has the same last five columns:
--   FIRSTSEENAT, LASTSEENAT  when an import first and last returned it
--   GONEAT                   set by a complete run that no longer returned
--                            it; cleared if it comes back; screens leave
--                            these rows out
--   LASTCHANGEDAT            when its content last changed
--   SOURCERESPONSEID         the RAW response it last came from
CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN (
  RUNID             VARCHAR(36)   NOT NULL,
  STARTEDAT         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  FINISHEDAT        TIMESTAMP_LTZ COMMENT 'Null while running, or if it stopped. A run won''t start while another is open (started in the last 3 hours).',
  COMPLETE          BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE when every version and occupation was fetched: only then is anything marked gone.',
  REQUESTS          NUMBER(6)     DEFAULT 0 NOT NULL,
  FILESHA256        VARCHAR(64)   COMMENT 'SHA-256 of the standards file this run read.',
  VERSIONS          NUMBER(6)     DEFAULT 0 NOT NULL,
  KSBS              NUMBER(8)     DEFAULT 0 NOT NULL,
  OCCUPATIONS       NUMBER(6)     DEFAULT 0 NOT NULL,
  ADDED             NUMBER(8)     DEFAULT 0 NOT NULL,
  CHANGED           NUMBER(8)     DEFAULT 0 NOT NULL,
  GONE              NUMBER(8)     DEFAULT 0 NOT NULL,
  LABEL_MISMATCHES  VARIANT       COMMENT 'Where a KSB label worked out from the order (K1, K2...) differs from the occupational maps API''s own: [{st_reference, version, ksb_type, ours, theirs, detail}]. The run carries on with ours.',
  ERROR             VARCHAR(1000) COMMENT 'Why it stopped, if it did.',
  CONSTRAINT PK_SKILLS_IMPORT_RUN PRIMARY KEY (RUNID)
)
COMMENT = 'One row per Skills England import run (npm run import:skills).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.STANDARD_VERSION (
  ST_REFERENCE             VARCHAR       NOT NULL COMMENT 'e.g. ST0072.',
  VERSION                  VARCHAR       NOT NULL COMMENT 'e.g. 1.1.',
  LARS_CODE                NUMBER(5,0)   COMMENT 'The LARS standard code (LARS.STANDARD, a learner''s aim STDCODE).',
  TITLE                    VARCHAR,
  LEVEL                    NUMBER(2,0),
  STATUS                   VARCHAR       COMMENT 'e.g. Approved for delivery, Retired, Withdrawn. All are kept: apprentices on retired versions still need them.',
  EARLIEST_START_DATE      DATE          COMMENT 'With LATEST_START_DATE: the starts this version is for, which picks a learner''s version.',
  LATEST_START_DATE        DATE,
  LATEST_END_DATE          DATE,
  TYPICAL_DURATION_MONTHS  NUMBER(3,0),
  MIN_OTJ_HOURS            NUMBER(4,0)   COMMENT 'The published minimum off-the-job hours ("minimum hours for compliance").',
  MAX_FUNDING              NUMBER(8,0),
  STANDARD_PAGE_URL        VARCHAR,
  OCCUPATION_CODE          VARCHAR(20)   COMMENT 'The occupation (OCCUPATION_PROFILE), e.g. OCC0072.',
  ROUTE                    VARCHAR(200),
  APPROVED_FOR_DELIVERY    DATE,
  CORE_AND_OPTIONS         BOOLEAN       COMMENT 'TRUE when the standard has options (STANDARD_OPTION).',
  FIRSTSEENAT              TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT               TIMESTAMP_LTZ,
  GONEAT                   TIMESTAMP_LTZ,
  LASTCHANGEDAT            TIMESTAMP_LTZ,
  SOURCERESPONSEID         VARCHAR(36),
  CONSTRAINT PK_STANDARD_VERSION PRIMARY KEY (ST_REFERENCE, VERSION)
)
COMMENT = 'Every version of every apprenticeship standard (Skills England standards API). Written with MERGE on ST_REFERENCE and VERSION.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.STANDARD_KSB (
  ST_REFERENCE      VARCHAR(10)   NOT NULL,
  VERSION           VARCHAR(20)   NOT NULL,
  KSB_TYPE          VARCHAR(1)    NOT NULL COMMENT 'K, S or B.',
  KSB_REFERENCE     VARCHAR(10)   NOT NULL COMMENT 'K1, S3, B2...: by the order the version lists them (checked against the occupational maps API; differences in SKILLS_IMPORT_RUN.LABEL_MISMATCHES). Evidence claims use ST reference + this.',
  SOURCE_ID         VARCHAR(36)   COMMENT 'Skills England''s ID for it (knowledgeId, skillId, behaviourId).',
  DETAIL            VARCHAR       NOT NULL,
  SORT_ORDER        NUMBER(5,0)   NOT NULL,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_STANDARD_KSB PRIMARY KEY (ST_REFERENCE, VERSION, KSB_TYPE, KSB_REFERENCE)
)
COMMENT = 'Each standard version''s knowledge, skills and behaviours. © Skills England, Open Government Licence: shown with their logo and attribution (SkillsEnglandCredit).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.STANDARD_DUTY (
  ST_REFERENCE      VARCHAR(10)   NOT NULL,
  VERSION           VARCHAR(20)   NOT NULL,
  DUTY_REFERENCE    VARCHAR(10)   NOT NULL COMMENT 'D1, D2...: by the order the version lists them.',
  SOURCE_ID         VARCHAR(36)   COMMENT 'Skills England''s dutyID.',
  DETAIL            VARCHAR       NOT NULL,
  IS_CORE           BOOLEAN,
  CRITERIA          VARCHAR       COMMENT 'Criteria for measuring performance.',
  SORT_ORDER        NUMBER(5,0)   NOT NULL,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_STANDARD_DUTY PRIMARY KEY (ST_REFERENCE, VERSION, DUTY_REFERENCE)
)
COMMENT = 'Each standard version''s duties, for the versions that publish them.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.STANDARD_DUTY_KSB (
  ST_REFERENCE      VARCHAR(10)   NOT NULL,
  VERSION           VARCHAR(20)   NOT NULL,
  DUTY_REFERENCE    VARCHAR(10)   NOT NULL,
  KSB_TYPE          VARCHAR(1)    NOT NULL,
  KSB_REFERENCE     VARCHAR(10)   NOT NULL,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_STANDARD_DUTY_KSB PRIMARY KEY (ST_REFERENCE, VERSION, DUTY_REFERENCE, KSB_TYPE, KSB_REFERENCE)
)
COMMENT = 'Which KSBs each duty maps to.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.STANDARD_OPTION (
  ST_REFERENCE      VARCHAR(10)   NOT NULL,
  VERSION           VARCHAR(20)   NOT NULL,
  OPTION_ID         VARCHAR(36)   NOT NULL COMMENT 'Skills England''s optionId.',
  TITLE             VARCHAR(500)  NOT NULL,
  OCCUPATION_CODE   VARCHAR(20)   COMMENT 'The option''s own occupation, e.g. OCC1312A.',
  SORT_ORDER        NUMBER(5,0)   NOT NULL,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_STANDARD_OPTION PRIMARY KEY (ST_REFERENCE, VERSION, OPTION_ID)
)
COMMENT = 'Each core-and-options standard version''s options.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION (
  ST_REFERENCE      VARCHAR(10)   NOT NULL,
  VERSION           VARCHAR(20)   NOT NULL,
  DUTY_REFERENCE    VARCHAR(10)   NOT NULL,
  OPTION_ID         VARCHAR(36)   NOT NULL,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_STANDARD_DUTY_OPTION PRIMARY KEY (ST_REFERENCE, VERSION, DUTY_REFERENCE, OPTION_ID)
)
COMMENT = 'Which duties belong to which option (core duties belong to all). An option''s KSBs are those of its duties and the core ones.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.OCCUPATION_PROFILE (
  OCCUPATION_CODE      VARCHAR(20)   NOT NULL COMMENT 'e.g. OCC0072.',
  TITLE                VARCHAR(500),
  LEVEL                NUMBER(2,0),
  VERSION              VARCHAR(20)   COMMENT 'The current version, the only one this API gives.',
  STATUS               NUMBER(3,0),
  STATUS_NAME          VARCHAR(100),
  ROUTE                VARCHAR(200),
  PATHWAY              VARCHAR(200),
  SOC_2020_CODE        NUMBER(4,0)   COMMENT 'The primary SOC 2020 unit group.',
  STATUS_LAST_UPDATED  TIMESTAMP_NTZ,
  FIRSTSEENAT          TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT           TIMESTAMP_LTZ,
  GONEAT               TIMESTAMP_LTZ,
  LASTCHANGEDAT        TIMESTAMP_LTZ,
  SOURCERESPONSEID     VARCHAR(36),
  CONSTRAINT PK_OCCUPATION_PROFILE PRIMARY KEY (OCCUPATION_CODE)
)
COMMENT = 'Each occupation from the Skills England occupational maps API (current version).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.OCCUPATION_SOC (
  OCCUPATION_CODE   VARCHAR(20)   NOT NULL,
  SOC_VERSION       VARCHAR(7)    NOT NULL COMMENT 'SOC2020 or SOC2010.',
  SOC_KEY           VARCHAR(7)    NOT NULL COMMENT 'The most specific code: the sub-unit group if there is one, else the unit group.',
  UNIT_GROUP        VARCHAR(4)    NOT NULL,
  SUB_UNIT_GROUP    VARCHAR(7)    COMMENT 'Extended SOC 2020 sub-unit group, e.g. 3432/03.',
  IS_PRIMARY        BOOLEAN       DEFAULT FALSE NOT NULL,
  DESCRIPTION       VARCHAR,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_OCCUPATION_SOC PRIMARY KEY (OCCUPATION_CODE, SOC_VERSION, SOC_KEY)
)
COMMENT = 'Each occupation''s SOC codes: an interest coded to SOC 2020 (REF.SOC2020_INDEX) leads to occupations, and so to standards and adverts.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.SKILLS.OCCUPATION_TERM (
  OCCUPATION_CODE   VARCHAR(20)   NOT NULL,
  KIND              VARCHAR(20)   NOT NULL COMMENT 'job title (typical job titles) or keyword.',
  TERM              VARCHAR(300)  NOT NULL,
  FIRSTSEENAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTSEENAT        TIMESTAMP_LTZ,
  GONEAT            TIMESTAMP_LTZ,
  LASTCHANGEDAT     TIMESTAMP_LTZ,
  SOURCERESPONSEID  VARCHAR(36),
  CONSTRAINT PK_OCCUPATION_TERM PRIMARY KEY (OCCUPATION_CODE, KIND, TERM)
)
COMMENT = 'Each occupation''s typical job titles and keywords.';

-- ---------------------------------------------------------------------------
-- 4. The old versions in the new table, so the off-the-job minimum keeps
--    working before the first import (which then updates them)
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.SKILLS.STANDARD_VERSION t
USING (
  SELECT ST_REFERENCE, VERSION, LARS_CODE, TITLE, LEVEL, STATUS, EARLIEST_START_DATE, LATEST_START_DATE,
         LATEST_END_DATE, TYPICAL_DURATION_MONTHS, MIN_OTJ_HOURS, MAX_FUNDING, STANDARD_PAGE_URL
  FROM CAPTURE_DB.SKILLS.STANDARD_VERSION_OLD
) s
  ON t.ST_REFERENCE = s.ST_REFERENCE AND t.VERSION = s.VERSION
WHEN NOT MATCHED THEN INSERT (ST_REFERENCE, VERSION, LARS_CODE, TITLE, LEVEL, STATUS, EARLIEST_START_DATE,
    LATEST_START_DATE, LATEST_END_DATE, TYPICAL_DURATION_MONTHS, MIN_OTJ_HOURS, MAX_FUNDING, STANDARD_PAGE_URL)
  VALUES (s.ST_REFERENCE, s.VERSION, s.LARS_CODE, s.TITLE, s.LEVEL, s.STATUS, s.EARLIEST_START_DATE,
    s.LATEST_START_DATE, s.LATEST_END_DATE, s.TYPICAL_DURATION_MONTHS, s.MIN_OTJ_HOURS, s.MAX_FUNDING, s.STANDARD_PAGE_URL);

-- ---------------------------------------------------------------------------
-- 5. Today's code reads SKILLS.KSB and SKILLS.OCCUPATION: keep those names
--    as views over the old (empty) tables until the code moves to
--    STANDARD_KSB. sql/skills_02_drop_old.sql drops them.
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS CAPTURE_DB.SKILLS.KSB AS SELECT * FROM CAPTURE_DB.SKILLS.KSB_OLD;
CREATE VIEW IF NOT EXISTS CAPTURE_DB.SKILLS.OCCUPATION AS SELECT * FROM CAPTURE_DB.SKILLS.OCCUPATION_OLD;

-- ---------------------------------------------------------------------------
-- Grants to the app's role: read SKILLS, and (for the import) add and
-- update; RAW insert-only; never DELETE. Nothing on the *_OLD tables.
-- ---------------------------------------------------------------------------
GRANT INSERT ON TABLE CAPTURE_DB.RAW.SE_STANDARD_VERSION TO ROLE ILR_APP_ROLE;
GRANT INSERT ON TABLE CAPTURE_DB.RAW.SE_OCCUPATION TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.STANDARD_VERSION TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.STANDARD_KSB TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY_KSB TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.STANDARD_OPTION TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.OCCUPATION_PROFILE TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.OCCUPATION_SOC TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.SKILLS.OCCUPATION_TERM TO ROLE ILR_APP_ROLE;
GRANT SELECT ON VIEW CAPTURE_DB.SKILLS.KSB TO ROLE ILR_APP_ROLE;
GRANT SELECT ON VIEW CAPTURE_DB.SKILLS.OCCUPATION TO ROLE ILR_APP_ROLE;
