-- Vacancies, file 2: the import moves to DATA_LOAD_USER, references unique
-- across sources, and SOC 2020 codes for adverts (docs/plan-vacancy-sources.md,
-- decision 18).
--
--   1. The vacancy import (scripts/import-vacancies.js) writes as
--      DATA_LOAD_USER, like the official data loads, so the app only reads
--      the vacancy tables: DATA_LOAD_ROLE gets what the import and the SOC
--      coding need; ILR_APP_ROLE keeps SELECT and loses INSERT and UPDATE.
--      Nothing in server/ or src/ writes these tables (npm run check:scoping
--      already keeps the import out of the app). Between running this file
--      and the new code reaching main, the import (still the app's on main)
--      can't write, so its runs fail and are retried an hour later: nothing
--      half-written.
--   2. Advert references unique across sources: Find an apprenticeship keeps
--      its own (10 digits); every other source's has the source in front
--      (NHS-A0141-26-0003, CSJ-467350; later ADZUNA-..., REED-...). The 43
--      NHS and Civil Service adverts already stored get theirs now. Nothing
--      else holds their references (14 October 2026: ONBOARDING,
--      EMPLOYER_VACANCY, the CRM's PLACEMENT and LEAD_MATCH all 0); the RAW
--      responses stay as returned.
--   3. EXT.VACANCY_SOC: one row per advert and SOC 2020 unit group. An
--      apprenticeship advert has its standard's codes (LARS code to Skills
--      England occupation, and its options'); its title is coded with the ONS
--      coding index. If the title's code is one of the standard's, that one
--      is kept (METHOD title-confirmed); if not, all of the standard's are
--      kept and the advert flagged (METHOD standard, FLAG why): the standard
--      wins over the title. An advert with no standard (jobs, later) is coded
--      from its title alone (METHOD title), or not at all, never guessed. The
--      coder MERGEs on (VACANCYREFERENCE, SOC2020): a code that applies again
--      has its GONEAT cleared on the same row, never a second row; a code
--      that stops applying is marked GONEAT, never deleted. Nothing writes
--      here until the coder is merged.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- 1. The import writes as DATA_LOAD_USER; the app reads
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA SHARED_DB.EXT TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.REF TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.SKILLS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.FAA_VACANCY_PAGE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY_IMPORT_RUN TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.SOC2020_INDEX TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_VERSION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_OPTION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.OCCUPATION_SOC TO ROLE DATA_LOAD_ROLE;

REVOKE INSERT ON TABLE SHARED_DB.RAW.FAA_VACANCY_PAGE FROM ROLE ILR_APP_ROLE;
REVOKE INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY FROM ROLE ILR_APP_ROLE;
REVOKE INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY_IMPORT_RUN FROM ROLE ILR_APP_ROLE;

-- ---------------------------------------------------------------------------
-- 2. References unique across sources
-- ---------------------------------------------------------------------------

UPDATE SHARED_DB.EXT.VACANCY SET VACANCYREFERENCE = SOURCE || '-' || VACANCYREFERENCE
WHERE SOURCE <> 'FAA' AND NOT STARTSWITH(VACANCYREFERENCE, SOURCE || '-');

-- ---------------------------------------------------------------------------
-- 3. SOC 2020 codes for adverts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS SHARED_DB.EXT.VACANCY_SOC (
  VACANCYREFERENCE VARCHAR(40)   NOT NULL COMMENT 'The advert (EXT.VACANCY), unique across sources.',
  SOC2020          VARCHAR(4)    NOT NULL COMMENT 'A SOC 2020 unit group (REF.SOC2020_UNIT_GROUP).',
  METHOD           VARCHAR(20)   NOT NULL COMMENT 'title-confirmed: the title coded to one of the standard''s codes, the only code kept; standard: one of the standard''s codes, the title not agreeing (see FLAG); title: from the title alone (no standard).',
  FLAG             VARCHAR(20)   COMMENT 'For METHOD standard, why the title didn''t settle it: title-uncoded, title-ambiguous or title-disagrees. Empty otherwise.',
  TITLESOC         VARCHAR(4)    COMMENT 'For title-disagrees: the code the title gave, kept for review, not used.',
  MATCHEDTITLE     VARCHAR(300)  COMMENT 'The coding index title the advert''s title matched, if any.',
  CODERVERSION     VARCHAR(20)   NOT NULL COMMENT 'Which version of the coding rules gave this row.',
  FIRSTSEENAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTCHANGEDAT    TIMESTAMP_LTZ COMMENT 'When METHOD, FLAG, TITLESOC or MATCHEDTITLE last changed, or the code applied again.',
  GONEAT           TIMESTAMP_LTZ COMMENT 'When this code stopped applying to the advert; cleared if it applies again. Never deleted.',
  CONSTRAINT PK_VACANCY_SOC PRIMARY KEY (VACANCYREFERENCE, SOC2020)
)
COMMENT = 'SOC 2020 codes for each advert in EXT.VACANCY, from its standard and its title (sql/vacancies_02_soc.sql has the rules). One row per advert and code. Written by the vacancy import as DATA_LOAD_USER.';

GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY_SOC TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.VACANCY_SOC TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.VACANCY_SOC TO ROLE CRM_APP_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- A. References: every non-FAA advert carries its source in front, FAA's
--    are 10 digits, and none repeats. Expected: 0 on every row.
SELECT 'non-FAA reference without its source in front' AS CHECK_, COUNT(*) AS N
FROM SHARED_DB.EXT.VACANCY WHERE SOURCE <> 'FAA' AND NOT STARTSWITH(VACANCYREFERENCE, SOURCE || '-')
UNION ALL SELECT 'FAA reference that isn''t 10 digits', COUNT(*)
FROM SHARED_DB.EXT.VACANCY WHERE SOURCE = 'FAA' AND NOT REGEXP_LIKE(VACANCYREFERENCE, '[0-9]{10}')
UNION ALL SELECT 'reference used twice', COUNT(*)
FROM (SELECT VACANCYREFERENCE FROM SHARED_DB.EXT.VACANCY GROUP BY 1 HAVING COUNT(*) > 1);

-- B. The codes table, empty until the coder is merged. Expected: ROW_COUNT 0,
--    10 columns.
SELECT TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = 'EXT' AND c.TABLE_NAME = 'VACANCY_SOC') AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'EXT' AND TABLE_NAME = 'VACANCY_SOC';

-- C. Who can write the vacancy tables. Expected: DATA_LOAD_ROLE only (INSERT
--    and UPDATE; on FAA_VACANCY_PAGE INSERT only); ILR_APP_ROLE nothing here.
SELECT TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, GRANTEE, LISTAGG(PRIVILEGE_TYPE, ', ') WITHIN GROUP (ORDER BY PRIVILEGE_TYPE) AS WRITES
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA || '.' || TABLE_NAME IN ('RAW.FAA_VACANCY_PAGE', 'EXT.VACANCY', 'EXT.VACANCY_IMPORT_RUN', 'EXT.VACANCY_SOC')
  AND PRIVILEGE_TYPE IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- D. Afterwards Claude runs npm run check:grants, which checks the same from
--    each role's side, and the vacancy import test (test/db/vacancy-import.mjs).
