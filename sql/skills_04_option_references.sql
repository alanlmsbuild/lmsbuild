-- Skills England, file 4: number options O1, O2... instead of keying them by
-- Skills England's option ID.
--
-- ST0363 1.0 lists two different options under one ID ("Compliance" and
-- "Compliance and risk (for smaller organisations)"). Keyed by ID, the first
-- import stored both under one key (Snowflake doesn't enforce primary
-- keys) and the next run stopped. Numbered by the order the version lists
-- them, like duties (D1...), both are kept, with the ID as an ordinary
-- column.
--
-- What it does:
--   1. STANDARD_OPTION: adds OPTION_REFERENCE, fills it from SORT_ORDER
--      (O1 is SORT_ORDER 1, as the import numbers them), and makes it the
--      primary key in place of OPTION_ID.
--   2. STANDARD_DUTY_OPTION: adds OPTION_REFERENCE, fills it from the
--      option with that ID (only IDs listed once in their version: today
--      no duty links to the repeated one), and makes it part of the primary
--      key in place of OPTION_ID.
--   3. SKILLS_IMPORT_RUN: adds OPTION_LINK_PROBLEMS, for duty-to-option
--      links the import leaves out: an ID the version doesn't list (8 today,
--      ST0515 1.0) or lists more than once.
-- The app's role keeps SELECT, INSERT and UPDATE on all three tables, which
-- covers new columns: no grant changes.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. If step 2's SET NOT NULL fails, a duty
-- link couldn't be filled: stop and tell Claude. The checks are in
-- sql/skills_04_checks.sql, to run one at a time afterwards.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- 1. Options.
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_OPTION ADD COLUMN IF NOT EXISTS OPTION_REFERENCE VARCHAR(10)
  COMMENT 'O1, O2...: by the order the version lists its options. Skills England''s optionId is in OPTION_ID (not always unique within a version).';
UPDATE CAPTURE_DB.SKILLS.STANDARD_OPTION SET OPTION_REFERENCE = 'O' || SORT_ORDER WHERE OPTION_REFERENCE IS NULL;
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_OPTION ALTER COLUMN OPTION_REFERENCE SET NOT NULL;
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_OPTION DROP PRIMARY KEY;
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_OPTION ADD CONSTRAINT PK_STANDARD_OPTION PRIMARY KEY (ST_REFERENCE, VERSION, OPTION_REFERENCE);

-- 2. Which duties are in which option.
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION ADD COLUMN IF NOT EXISTS OPTION_REFERENCE VARCHAR(10)
  COMMENT 'The option (STANDARD_OPTION.OPTION_REFERENCE). OPTION_ID is the ID the duty names.';
UPDATE CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION d
SET OPTION_REFERENCE = o.OPTION_REFERENCE
FROM (
  SELECT ST_REFERENCE, VERSION, OPTION_ID, ANY_VALUE(OPTION_REFERENCE) AS OPTION_REFERENCE
  FROM CAPTURE_DB.SKILLS.STANDARD_OPTION
  GROUP BY ST_REFERENCE, VERSION, OPTION_ID
  HAVING COUNT(*) = 1
) o
WHERE d.ST_REFERENCE = o.ST_REFERENCE AND d.VERSION = o.VERSION AND d.OPTION_ID = o.OPTION_ID
  AND d.OPTION_REFERENCE IS NULL;
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION ALTER COLUMN OPTION_REFERENCE SET NOT NULL;
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION DROP PRIMARY KEY;
ALTER TABLE CAPTURE_DB.SKILLS.STANDARD_DUTY_OPTION ADD CONSTRAINT PK_STANDARD_DUTY_OPTION PRIMARY KEY (ST_REFERENCE, VERSION, DUTY_REFERENCE, OPTION_REFERENCE);

-- 3. The run records links it leaves out.
ALTER TABLE CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN ADD COLUMN IF NOT EXISTS OPTION_LINK_PROBLEMS VARIANT
  COMMENT 'Duty-to-option links left out: [{st_reference, version, duty_reference, duty_id, option_id, problem: no such option | option ID repeated, options}]';
