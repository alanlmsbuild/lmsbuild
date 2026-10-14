-- Vacancies, file 2: SOC 2020 codes for adverts (docs/plan-vacancy-sources.md,
-- decision 18). One row per advert and code, so an advert can have several.
--
-- How an advert is coded (scripts/import-vacancies.js, after each import;
-- nothing writes here until that code is merged):
--   An apprenticeship advert has its standard's SOC codes (LARS code to
--   Skills England occupation, and its options' occupations). Its title is
--   coded too, with the ONS coding index (SHARED_DB.REF.SOC2020_INDEX). If the
--   title's code is one of the standard's, that one code is kept
--   (METHOD title-confirmed). If not, every one of the standard's codes is
--   kept and the advert is flagged (METHOD standard, FLAG saying why): the
--   standard wins over the title.
--   An advert with no standard (jobs, later) is coded from its title alone
--   (METHOD title), or not at all if the title can't be coded: never
--   guessed.
-- A code that no longer applies (the advert changed, or the coder did) is
-- marked GONEAT, never deleted, like the adverts themselves.
--
-- Public data, the same for every organisation, like EXT.VACANCY: the app's
-- role keeps it (SELECT, INSERT, UPDATE; no DELETE), the CRM's reads it for
-- matching.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.EXT.VACANCY_SOC (
  VACANCYREFERENCE VARCHAR(40)   NOT NULL COMMENT 'The advert (EXT.VACANCY).',
  SOC2020          VARCHAR(4)    NOT NULL COMMENT 'A SOC 2020 unit group (REF.SOC2020_UNIT_GROUP).',
  METHOD           VARCHAR(20)   NOT NULL COMMENT 'title-confirmed: the title coded to one of the standard''s codes, the only code kept; standard: one of the standard''s codes, the title not agreeing (see FLAG); title: from the title alone (no standard).',
  FLAG             VARCHAR(20)   COMMENT 'For METHOD standard, why the title didn''t settle it: title-uncoded, title-ambiguous or title-disagrees. Empty otherwise.',
  TITLESOC         VARCHAR(4)    COMMENT 'For title-disagrees: the code the title gave, kept for review, not used.',
  MATCHEDTITLE     VARCHAR(300)  COMMENT 'The coding index title the advert''s title matched, if any.',
  CODERVERSION     VARCHAR(20)   NOT NULL COMMENT 'Which version of the coding rules gave this row.',
  FIRSTSEENAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  LASTCHANGEDAT    TIMESTAMP_LTZ COMMENT 'When METHOD, FLAG, TITLESOC or MATCHEDTITLE last changed.',
  GONEAT           TIMESTAMP_LTZ COMMENT 'When this code stopped applying to the advert. Never deleted.',
  CONSTRAINT PK_VACANCY_SOC PRIMARY KEY (VACANCYREFERENCE, SOC2020)
)
COMMENT = 'SOC 2020 codes for each advert in EXT.VACANCY, from its standard and its title (sql/vacancies_02_soc.sql has the rules). One row per advert and code.';

GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.EXT.VACANCY_SOC TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.VACANCY_SOC TO ROLE CRM_APP_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The table, empty until the import's coding is merged. Expected: 1 row,
--    ROW_COUNT 0, 10 columns.
SELECT TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = 'EXT' AND c.TABLE_NAME = 'VACANCY_SOC') AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'EXT' AND TABLE_NAME = 'VACANCY_SOC';

-- 2. Its grants. Expected: ILR_APP_ROLE INSERT, SELECT, UPDATE; CRM_APP_ROLE
--    SELECT; nothing else (OWNERSHIP to ACCOUNTADMIN aside).
SHOW GRANTS ON TABLE SHARED_DB.EXT.VACANCY_SOC;
