-- The Foreign Office's travel advice (decision 57, "An Honest Guide to the
-- World"): the two bronze tables, their grants and their governance tags.
-- Loaded by npm run load:data -- 51 (scripts/load/travel-advice.js), run by
-- the official-travel-advice job once a day.
--
--   SHARED_DB.RAW.FCDO_TRAVEL_ADVICE        a country's page from the GOV.UK
--     Content API, as published, one row per country per change (add-only:
--     a page that changes is added again, so the history stays). Email
--     addresses and phone numbers in the text are taken out before the
--     file is written and again when it is loaded.
--   SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX  the index's entry for each
--     country (its dates and latest change note), added whenever the list
--     or any date in it changes.
--
-- Crown copyright, Open Government Licence v3.0. The map image and PDF each
-- page links to are links only: nothing is downloaded until FCDO confirms
-- their licence in writing.
--
-- DATA_LOAD_ROLE gets SELECT and INSERT on both: no UPDATE, DELETE,
-- TRUNCATE or CREATE. The app roles get nothing. SHARED_DB.RAW.JSON_LINES
-- already exists (sql/load_05_official_tables.sql).
--
-- Run it in Snowsight, in one go, as ACCOUNTADMIN. Safe to run again.
USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.FCDO_TRAVEL_ADVICE (
  SOURCEFILEID      VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER        NUMBER(38,0) NOT NULL COMMENT 'Its line in the fetched file.',
  CONTENT_ID        VARCHAR COMMENT 'The page''s GOV.UK content_id: one per country, the same across versions.',
  COUNTRY_SLUG      VARCHAR COMMENT 'The country''s name as used in its address, e.g. laos.',
  PUBLIC_UPDATED_AT TIMESTAMP_TZ COMMENT 'When this version of the advice was made public (public_updated_at).',
  ITEM              VARIANT      NOT NULL COMMENT 'The page as the Content API gives it: alert_status, change_description, change_history, parts and the rest, with email addresses and phone numbers in the text taken out. Image and PDF are links only.'
)
COMMENT = 'Foreign travel advice (decision 57). The FCDO''s advice for each country, from the GOV.UK Content API, one JSON record per row, added each time a country''s page changes. Crown copyright, Open Government Licence v3.0. Email addresses and phone numbers in the text are not kept. Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX (
  SOURCEFILEID      VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER        NUMBER(38,0) NOT NULL COMMENT 'Its line in the fetched file.',
  CONTENT_ID        VARCHAR COMMENT 'The country page''s GOV.UK content_id.',
  COUNTRY_SLUG      VARCHAR COMMENT 'The country''s name as used in its address, e.g. laos.',
  PUBLIC_UPDATED_AT TIMESTAMP_TZ COMMENT 'When the country''s advice was last made public, as the index says.',
  ITEM              VARIANT      NOT NULL COMMENT 'The index entry as the Content API gives it: the country, its change_description, withdrawn flag and links.'
)
COMMENT = 'Foreign travel advice (decision 57). The index of countries (links.children of /api/content/foreign-travel-advice), one row per country, added whenever the list or any date in it changes: shows when a country is added or dropped. Crown copyright, Open Government Licence v3.0. Add-only.';

GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.FCDO_TRAVEL_ADVICE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX TO ROLE DATA_LOAD_ROLE;

ALTER TABLE SHARED_DB.RAW.FCDO_TRAVEL_ADVICE SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'fcdo-travel-advice', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'daily', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'fcdo-travel-advice', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'daily', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The two tables. Expected: 2 rows, ROW_COUNT 0, COLUMNS_ 6 and 6.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('FCDO_TRAVEL_ADVICE', 'FCDO_TRAVEL_ADVICE_INDEX')
ORDER BY 1;

-- 2. Who has rights on them. Expected: 2 rows, DATA_LOAD_ROLE with INSERT
--    and with SELECT, each on 2 tables; nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('FCDO_TRAVEL_ADVICE', 'FCDO_TRAVEL_ADVICE_INDEX') AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. The tags. Expected: 14 rows, 7 for each table, with the values set above.
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(SHARED_DB.INFORMATION_SCHEMA.TAG_REFERENCES('SHARED_DB.RAW.FCDO_TRAVEL_ADVICE', 'TABLE'))
UNION ALL
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(SHARED_DB.INFORMATION_SCHEMA.TAG_REFERENCES('SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX', 'TABLE'))
ORDER BY 1, 2;
