-- Skills England, file 2: drop the old tables and the stand-in views.
--
-- Run only when all three are true:
--   - the first npm run import:skills has finished complete (SKILLS.
--     SKILLS_IMPORT_RUN has a row with COMPLETE = TRUE, check A below),
--   - the off-the-job minimum works (a learner's Record tab shows the
--     published minimum for their standard), and
--   - the KSB pages work from the new tables (Burrow portfolio, add
--     evidence, an evidence page, the employer's witness statements), with
--     the code moved off SKILLS.KSB and SKILLS.OCCUPATION.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. Check B after.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- The stand-in views first, then the old tables (children before parents).
DROP VIEW IF EXISTS CAPTURE_DB.SKILLS.KSB;
DROP VIEW IF EXISTS CAPTURE_DB.SKILLS.OCCUPATION;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.DUTY_KSB_OLD;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.KSB_OLD;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.DUTY_OLD;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.OCCUPATION_OLD;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN_OLD;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.STANDARD_VERSION_OLD;
DROP TABLE IF EXISTS CAPTURE_DB.SKILLS.STANDARD_IMPORT_RUN_OLD;

-- ---------------------------------------------------------------------------
-- Checks (run one at a time)
-- ---------------------------------------------------------------------------

-- A. Before dropping: a complete import. Expected: at least 1.
--    (Run this one first, before Run All, if you like.)
SELECT COUNT(*) AS COMPLETE_RUNS FROM CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN WHERE COMPLETE;

-- B. After: nothing old is left. Expected: 0.
SHOW OBJECTS IN SCHEMA CAPTURE_DB.SKILLS
  ->> SELECT COUNT(*) AS OLD_LEFT FROM $1 WHERE ENDSWITH("name", '_OLD') OR "name" IN ('KSB', 'OCCUPATION');
