-- Vacancies from Find an apprenticeship, file 1: where the data goes.
--
--   RAW.FAA_VACANCY_PAGE      every Display Advert API v2 response, exactly
--                             as returned, add-only (bronze)
--   EXT.VACANCY               one row per advert, cleaned (silver), written
--                             with MERGE on VACANCYREFERENCE
--   EXT.VACANCY_IMPORT_RUN    one row per import run
--   ILR.EMPLOYER_VACANCY      an organisation's own decisions linking an
--                             advert to one of its employers (and a site)
--
-- Adverts are public and the same for every organisation, so EXT.VACANCY
-- can be listed and searched by all staff (unlike EXT.COMPANY). Which
-- adverts belong to your employers is your organisation's own record: a
-- manager confirms every link; nothing is linked automatically.
--
-- Sources: Find an apprenticeship, plus NHS Jobs and Civil Service Jobs
-- adverts (the API's AdditionalDataSources), labelled in SOURCE.
--
-- Open adverts only: an advert counts as open while CLOSINGDATE hasn't
-- passed and the last complete run still returned it (GONEAT is null).
-- Closed adverts are kept 2 years and then cleared, here and in RAW, by an
-- admin job (docs/before-real-data.md): the app's role never deletes.
--
-- Employer contact names, emails and phones that some adverts carry are
-- kept only in RAW (as returned), not in EXT.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. Safe to run twice.
-- Grants are table by table to ILR_APP_ROLE, never DELETE.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- RAW: responses as returned (bronze)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.RAW.FAA_VACANCY_PAGE (
  RESPONSEID    VARCHAR(36)   NOT NULL COMMENT 'Made by the import, so EXT can record where each advert came from without reading RAW.',
  RUNID         VARCHAR(36)   NOT NULL COMMENT 'The import run (EXT.VACANCY_IMPORT_RUN).',
  ENDPOINT      VARCHAR(500)  NOT NULL COMMENT 'The path and query called, e.g. /vacancy?PageNumber=3&PageSize=100&IncludeDetails=true.',
  SOURCES       VARCHAR(40)   COMMENT 'The AdditionalDataSources header sent, e.g. Nhs,Csj.',
  HTTPSTATUS    NUMBER(3)     NOT NULL,
  BODY          VARIANT       COMMENT 'The JSON response, exactly as returned (includes any employer contact details an advert carries).',
  FETCHEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CONSTRAINT PK_FAA_VACANCY_PAGE PRIMARY KEY (RESPONSEID)
)
COMMENT = 'Every Find an apprenticeship Display Advert API (v2) response, as returned. Add-only. Kept 2 years.';

-- ---------------------------------------------------------------------------
-- EXT: adverts (silver)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.EXT.VACANCY_IMPORT_RUN (
  RUNID             VARCHAR(36)   NOT NULL,
  KIND              VARCHAR(10)   NOT NULL COMMENT 'full (every page, nightly) or new (adverts posted in the last day).',
  STARTEDAT         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  FINISHEDAT        TIMESTAMP_LTZ COMMENT 'Null while running, or if it stopped. A run won''t start while another has no FINISHEDAT (and started under an hour ago).',
  COMPLETE          BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE when a full run fetched every page: only then are missing adverts marked gone.',
  REQUESTS          NUMBER(6)     DEFAULT 0 NOT NULL,
  ADVERTS           NUMBER(8)     DEFAULT 0 NOT NULL COMMENT 'Adverts returned.',
  ADDED             NUMBER(8)     DEFAULT 0 NOT NULL,
  CHANGED           NUMBER(8)     DEFAULT 0 NOT NULL,
  GONE              NUMBER(8)     DEFAULT 0 NOT NULL COMMENT 'Adverts no longer returned before their closing date (withdrawn or filled).',
  ERROR             VARCHAR(1000) COMMENT 'Why it stopped, if it did (e.g. Find an apprenticeship busy, HTTP 429).',
  CONSTRAINT PK_VACANCY_IMPORT_RUN PRIMARY KEY (RUNID)
)
COMMENT = 'One row per vacancy import run (npm run import:vacancies).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.EXT.VACANCY (
  VACANCYREFERENCE        VARCHAR(40)   NOT NULL COMMENT 'The advert''s reference: 10 digits for Find an apprenticeship; NHS Jobs and Civil Service Jobs use their own.',
  SOURCE                  VARCHAR(10)   NOT NULL COMMENT 'FAA (Find an apprenticeship), NHS (NHS Jobs) or CSJ (Civil Service Jobs). Shown on every advert.',
  TITLE                   VARCHAR(500)  NOT NULL,
  DESCRIPTION             VARCHAR(16777216) COMMENT 'Short description. Text as returned: may hold HTML, never shown as HTML.',
  NUMBEROFPOSITIONS       NUMBER(6),
  POSTEDDATE              TIMESTAMP_LTZ,
  CLOSINGDATE             TIMESTAMP_LTZ COMMENT 'Open until then (and while still returned: GONEAT).',
  STARTDATE               TIMESTAMP_LTZ,
  WAGETYPE                VARCHAR(60)   COMMENT 'e.g. ApprenticeshipMinimum, NationalMinimum, Custom.',
  WAGEUNIT                VARCHAR(30)   COMMENT 'e.g. Annually, Weekly.',
  WAGETEXT                VARCHAR(1000) COMMENT 'wageAdditionalInformation, e.g. "£16,640 a year".',
  WORKINGWEEK             VARCHAR(2000),
  HOURSPERWEEK            NUMBER(5,2),
  EXPECTEDDURATION        VARCHAR(100),
  APPRENTICESHIPLEVEL     VARCHAR(40)   COMMENT 'e.g. Intermediate, Advanced, Higher, Degree.',
  LARSCODE                NUMBER(6)     COMMENT 'The standard''s LARS code (course.larsCode). Null when the API gives 0 (NHS and Civil Service adverts).',
  COURSETITLE             VARCHAR(500),
  COURSELEVEL             NUMBER(2),
  ROUTE                   VARCHAR(200),
  COURSETYPE              VARCHAR(40),
  EMPLOYERNAME            VARCHAR(500)  NOT NULL COMMENT 'As the advert names it. There''s no employer identifier: links to employers are confirmed by managers (ILR.EMPLOYER_VACANCY).',
  EMPLOYERDESCRIPTION     VARCHAR(16777216),
  EMPLOYERWEBSITEURL      VARCHAR(1000),
  PROVIDERNAME            VARCHAR(500),
  UKPRN                   NUMBER(8)     COMMENT 'The training provider''s UKPRN, when there is one.',
  ISDISABILITYCONFIDENT   BOOLEAN,
  ISNATIONALVACANCY       BOOLEAN,
  NATIONALVACANCYDETAILS  VARCHAR(2000),
  VACANCYURL              VARCHAR(1000) COMMENT 'The advert on Find an apprenticeship: where people apply.',
  APPLICATIONURL          VARCHAR(1000) COMMENT 'An outside application page, when the advert has one.',
  ADDRESSES               VARIANT       COMMENT 'Every address as returned: [{addressLine1..4, postcode, latitude, longitude}]. Kept here, not in its own table, so a changed advert is one MERGE (the app never deletes).',
  POSTCODE                VARCHAR(8)    COMMENT 'The first address''s postcode, for search.',
  LATITUDE                NUMBER(9,6)   COMMENT 'The first address''s latitude, for distance search.',
  LONGITUDE               NUMBER(9,6),
  SKILLS                  ARRAY,
  QUALIFICATIONS          VARIANT,
  TRAININGDESCRIPTION     VARCHAR(16777216),
  OUTCOMEDESCRIPTION      VARCHAR(16777216),
  FULLDESCRIPTION         VARCHAR(16777216),
  THINGSTOCONSIDER        VARCHAR(16777216),
  FIRSTSEENAT             TIMESTAMP_LTZ NOT NULL,
  LASTSEENAT              TIMESTAMP_LTZ NOT NULL COMMENT 'When an import last returned it.',
  GONEAT                  TIMESTAMP_LTZ COMMENT 'Set by a complete full run that no longer returned it before its closing date (withdrawn or filled). Cleared if it comes back.',
  LASTCHANGEDAT           TIMESTAMP_LTZ NOT NULL,
  SOURCERESPONSEID        VARCHAR(36)   NOT NULL COMMENT 'The RAW.FAA_VACANCY_PAGE response it last came from.',
  CONSTRAINT PK_VACANCY PRIMARY KEY (VACANCYREFERENCE)
)
COMMENT = 'Apprenticeship adverts from Find an apprenticeship (with NHS Jobs and Civil Service Jobs), the same for every organisation. Written with MERGE on VACANCYREFERENCE. Closed adverts kept 2 years.';
-- Snowflake doesn't enforce primary keys: the import must write EXT.VACANCY
-- with MERGE ... ON VACANCYREFERENCE (check 4 below).

-- ---------------------------------------------------------------------------
-- ILR.EMPLOYER_VACANCY: an organisation's links from adverts to employers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.EMPLOYER_VACANCY (
  ORGANISATIONID    VARCHAR(20)   NOT NULL,
  VACANCYREFERENCE  VARCHAR(40)   NOT NULL COMMENT 'The advert (EXT.VACANCY).',
  EMPLOYERID        VARCHAR(20)   NOT NULL COMMENT 'One of this organisation''s employers (ILR.EMPLOYER).',
  SITEID            VARCHAR(20)   COMMENT 'One of that employer''s sites (ILR.EMPLOYER_SITE), if known.',
  DECISION          VARCHAR(10)   NOT NULL COMMENT 'confirmed: this advert is this employer''s. rejected: it isn''t (so Warren stops suggesting it). Every link is a manager''s decision.',
  DECIDEDAT         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  DECIDEDBY         VARCHAR(40)   NOT NULL COMMENT 'USERID of the manager.',
  ISTESTDATA        BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_EMPLOYER_VACANCY PRIMARY KEY (ORGANISATIONID, VACANCYREFERENCE, EMPLOYERID)
)
COMMENT = 'A manager''s decisions linking public adverts to the organisation''s own employers. Suggestions are worked out when shown, not stored.';

-- ---------------------------------------------------------------------------
-- Grants to the app's role: table by table, never DELETE
-- ---------------------------------------------------------------------------
GRANT INSERT ON TABLE CAPTURE_DB.RAW.FAA_VACANCY_PAGE TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.EXT.VACANCY TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.EXT.VACANCY_IMPORT_RUN TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.EMPLOYER_VACANCY TO ROLE ILR_APP_ROLE;

-- ---------------------------------------------------------------------------
-- The test snapshot (sql/test_reset_02_reset.sql puts it back)
-- ---------------------------------------------------------------------------
-- No test links yet: the snapshot is empty, so the reset removes links made
-- while testing.
CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.EMPLOYER_VACANCY AS
  SELECT * FROM CAPTURE_DB.ILR.EMPLOYER_VACANCY WHERE ISTESTDATA = TRUE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The app's role on the new tables. Expected: RAW.FAA_VACANCY_PAGE
--    INSERT only; EXT.VACANCY, EXT.VACANCY_IMPORT_RUN and
--    ILR.EMPLOYER_VACANCY INSERT, SELECT, UPDATE. No DELETE.
SELECT TABLE_SCHEMA, TABLE_NAME, LISTAGG(PRIVILEGE_TYPE, ', ') WITHIN GROUP (ORDER BY PRIVILEGE_TYPE) AS PRIVILEGES
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE GRANTEE = 'ILR_APP_ROLE'
  AND TABLE_SCHEMA || '.' || TABLE_NAME IN ('RAW.FAA_VACANCY_PAGE', 'EXT.VACANCY', 'EXT.VACANCY_IMPORT_RUN', 'ILR.EMPLOYER_VACANCY')
GROUP BY TABLE_SCHEMA, TABLE_NAME
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- 2. The tables and their column counts. Expected: RAW.FAA_VACANCY_PAGE 7,
--    EXT.VACANCY 45, EXT.VACANCY_IMPORT_RUN 11, ILR.EMPLOYER_VACANCY 8,
--    TEST_BASELINE.EMPLOYER_VACANCY 8.
SELECT TABLE_SCHEMA, TABLE_NAME, COUNT(*) AS COLUMNS_
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA || '.' || TABLE_NAME IN ('RAW.FAA_VACANCY_PAGE', 'EXT.VACANCY', 'EXT.VACANCY_IMPORT_RUN', 'ILR.EMPLOYER_VACANCY', 'TEST_BASELINE.EMPLOYER_VACANCY')
GROUP BY TABLE_SCHEMA, TABLE_NAME
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- 3. Nothing in them yet. Expected: 0, 0, 0, 0.
SELECT
  (SELECT COUNT(*) FROM CAPTURE_DB.EXT.VACANCY) AS VACANCIES,
  (SELECT COUNT(*) FROM CAPTURE_DB.EXT.VACANCY_IMPORT_RUN) AS RUNS,
  (SELECT COUNT(*) FROM CAPTURE_DB.ILR.EMPLOYER_VACANCY) AS LINKS,
  (SELECT COUNT(*) FROM CAPTURE_DB.TEST_BASELINE.EMPLOYER_VACANCY) AS SNAPSHOT_LINKS;

-- 4. One row per advert (Snowflake doesn't enforce the primary key).
--    Expected: 0 (now, and after every import).
SELECT COUNT(*) AS DUPLICATE_ADVERTS
FROM (SELECT VACANCYREFERENCE FROM CAPTURE_DB.EXT.VACANCY GROUP BY VACANCYREFERENCE HAVING COUNT(*) > 1);

-- 5. The app's role still can't see the snapshot. Expected: 0.
SHOW GRANTS ON SCHEMA CAPTURE_DB.TEST_BASELINE
  ->> SELECT COUNT(*) AS APP_ROLE_GRANTS FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';
