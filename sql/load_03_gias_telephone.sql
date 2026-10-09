-- Loading everything, batch 2 follow-up: GIAS leaves out TelephoneNum too.
--
-- Checked 9 October 2026 before loading: of GIAS's columns after the five
-- personal ones, none holds a person's name or an email address, but
-- TelephoneNum gives a mobile (07...) for 157 establishments, mostly small
-- independent and independent special schools, which may be a person's own
-- phone. The school leavers app doesn't use phone numbers. So, like the five,
-- the loader removes it before staging and it never reaches Snowflake.
--
-- OPTIONS_DB.RAW.GIAS_ESTABLISHMENT is still empty (nothing loaded yet), so
-- dropping the column loses nothing. Paste into a Snowflake worksheet and
-- Run All, as ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE OPTIONS_DB.RAW.GIAS_ESTABLISHMENT DROP COLUMN IF EXISTS "TelephoneNum";

ALTER TABLE OPTIONS_DB.RAW.GIAS_ESTABLISHMENT SET
  COMMENT = 'Batch 2. Get Information about Schools, all establishments (edubasealldata<date>.csv from extract.zip), Department for Education. WITHOUT six columns that hold or may hold personal data: HeadTitle (name), HeadFirstName, HeadLastName, HeadPreferredJobTitle, PropsName and TelephoneNum (a mobile for 157 establishments). The loader removes them before staging, and the original zip never reaches Snowflake. Windows-1252. Identified by URN; gives UKPRN. Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- Check: expected COLUMNS 131 (SOURCEFILEID, FILEROWNUMBER and 129 from the
-- file), PERSONAL 0, ROWS_NOW 0.
SELECT COUNT(*) AS COLUMNS,
       COUNT_IF(COLUMN_NAME IN ('HeadTitle (name)', 'HeadFirstName', 'HeadLastName', 'HeadPreferredJobTitle', 'PropsName', 'TelephoneNum')) AS PERSONAL,
       (SELECT COUNT(*) FROM OPTIONS_DB.RAW.GIAS_ESTABLISHMENT) AS ROWS_NOW
FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'GIAS_ESTABLISHMENT';
