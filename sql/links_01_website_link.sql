-- Decision 26, the weekly link check: every institution's website link in
-- silver (school, college_16_18, provider, university_course) is checked
-- once a week, a seventh of them each day, by the website-links job
-- (scripts/check-website-links.js), so a dead link can be hidden until it
-- works again.
--
--   SHARED_DB.EXT.WEBSITE_LINK
--                   One row per link, its latest state: when it was last
--                   checked and how it answered, how many checks in a row
--                   have failed, and whether it is hidden (two failed
--                   weekly checks in a row; a later good check shows it
--                   again). Rows are kept when a link leaves silver.
--   SHARED_DB.EXT.WEBSITE_LINK_CHECK
--                   Every check, add-only: the history behind each state.
--
-- DATA_LOAD_ROLE (the jobs' writer, as DATA_LOAD_USER) may read and write
-- WEBSITE_LINK and add to WEBSITE_LINK_CHECK: no DELETE, no TRUNCATE.
-- TRANSFORM_ROLE may read WEBSITE_LINK, so silver can join it. The app
-- gets nothing (it reads the result through silver).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.EXT.WEBSITE_LINK (
  URL                 VARCHAR(2000)  NOT NULL COMMENT 'The link as silver has it (https://, cleaned by dbt/macros/url.sql).',
  HOST                VARCHAR(255)   NOT NULL COMMENT 'Its host, e.g. www.essex.ac.uk: requests to one host are one at a time, 10 seconds apart.',
  SLICE               NUMBER(1,0)    NOT NULL COMMENT 'Which day of the week it is checked on (0 to 6, from a hash of the URL).',
  FIRSTSEENAT         TIMESTAMP_LTZ  DEFAULT CURRENT_TIMESTAMP() NOT NULL COMMENT 'When the job first found it in silver.',
  LASTINSILVERAT      TIMESTAMP_LTZ  COMMENT 'When the job last found it in silver. A link silver no longer has is kept, not checked.',
  LASTCHECKEDAT       TIMESTAMP_LTZ  COMMENT 'When it was last checked; empty until its first check.',
  LASTRESULT          VARCHAR(20)    COMMENT 'ok, http-only (works only without https), broken (404 or 410), unreachable (server error, timeout, no such host) or blocked (403 or 429: the site refused a robot, not a dead link).',
  LASTSTATUS          NUMBER(3,0)    COMMENT 'The HTTP status of the last answer; empty when there was none.',
  FINALURL            VARCHAR(2000)  COMMENT 'Where the link ended up after redirects (at most 5).',
  LASTERROR           VARCHAR(500)   COMMENT 'Why the last check failed, when it did.',
  LASTOKAT            TIMESTAMP_LTZ  COMMENT 'When it last worked.',
  CONSECUTIVEFAILURES NUMBER(5,0)    DEFAULT 0 NOT NULL COMMENT 'Failed checks in a row (broken or unreachable). blocked leaves it as it is; ok sets it to 0.',
  BROKENSINCE         TIMESTAMP_LTZ  COMMENT 'When the current run of failures began.',
  ISHIDDEN            BOOLEAN        DEFAULT FALSE NOT NULL COMMENT 'True after two failed checks in a row: the app hides the link until a check passes.',
  CONSTRAINT PK_WEBSITE_LINK PRIMARY KEY (URL)
)
COMMENT = 'Decision 26: every institution website link in silver and its latest state from the weekly link check (scripts/check-website-links.js). A link is hidden after two failed weekly checks in a row and shown again when one passes.';

CREATE TABLE IF NOT EXISTS SHARED_DB.EXT.WEBSITE_LINK_CHECK (
  CHECKID    VARCHAR(36)    NOT NULL,
  URL        VARCHAR(2000)  NOT NULL COMMENT 'The link checked (WEBSITE_LINK.URL).',
  CHECKEDAT  TIMESTAMP_LTZ  DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  METHOD     VARCHAR(10)    COMMENT 'HEAD, or GET when the site would not answer HEAD (only the headers are read).',
  STATUS     NUMBER(3,0)    COMMENT 'The HTTP status; empty when there was no answer.',
  RESULT     VARCHAR(20)    NOT NULL COMMENT 'ok, http-only, broken, unreachable or blocked.',
  FINALURL   VARCHAR(2000)  COMMENT 'Where it ended up after redirects.',
  ELAPSEDMS  NUMBER(10,0)   COMMENT 'How long the check took.',
  ERROR      VARCHAR(500)   COMMENT 'Why it failed, when it did.',
  JOBRUNID   VARCHAR(36)    COMMENT 'The SHARED_DB.OPS.JOB_RUN row of the run.',
  CONSTRAINT PK_WEBSITE_LINK_CHECK PRIMARY KEY (CHECKID)
)
COMMENT = 'Decision 26: every check of every website link, add-only (scripts/check-website-links.js).';

GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.WEBSITE_LINK TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.EXT.WEBSITE_LINK_CHECK TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.WEBSITE_LINK TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The two tables, empty. Expected: 2 rows, WEBSITE_LINK 14 columns and
--    WEBSITE_LINK_CHECK 10, both ROW_COUNT 0.
SELECT TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = 'EXT' AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'EXT' AND TABLE_NAME IN ('WEBSITE_LINK', 'WEBSITE_LINK_CHECK') ORDER BY 1;

-- 2. Who has rights on them. Expected: 6 rows: DATA_LOAD_ROLE INSERT,
--    SELECT and UPDATE on WEBSITE_LINK and INSERT and SELECT on
--    WEBSITE_LINK_CHECK; TRANSFORM_ROLE SELECT on WEBSITE_LINK.
SELECT TABLE_NAME, GRANTEE, PRIVILEGE_TYPE
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'EXT' AND TABLE_NAME IN ('WEBSITE_LINK', 'WEBSITE_LINK_CHECK') AND GRANTEE <> 'ACCOUNTADMIN'
ORDER BY 1, 2, 3;
