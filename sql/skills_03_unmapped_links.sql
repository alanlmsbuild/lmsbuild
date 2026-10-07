-- Skills England, file 3: record duty-to-KSB links that can't be linked.
--
-- A duty can name a KSB its version doesn't list (the first import found
-- six: ST0414 duty D19, versions 1.3 to 1.8, one skill ID). The import
-- leaves each such link out; this column records them on the run, like
-- LABEL_MISMATCHES. The app's role already has SELECT, INSERT and UPDATE on
-- the table, which covers a new column: no grant changes.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks are in
-- sql/skills_03_checks.sql, to run one at a time afterwards.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN ADD COLUMN IF NOT EXISTS UNMAPPED_LINKS VARIANT
  COMMENT 'Duty-to-KSB links left out because the duty names a KSB its version does not list: [{st_reference, version, duty_reference, duty_id, list, ksb_id}]';
