-- Withdrawn aims get OUTCOME 3 (no achievement).
--
-- The ILR expects an outcome once an aim has an actual end date, and a
-- withdrawn aim's outcome is 3. Until now the app's Withdraw button left
-- OUTCOME empty, and test_learners_more.sql did the same to match. The
-- button now writes 3; this fills in the aims withdrawn before that.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. Safe to run twice:
-- it only fills an empty OUTCOME on a withdrawn aim, so a second run
-- changes nothing. It doesn't change the QAR: outcome 3 isn't an achiever,
-- the same as an empty outcome.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

UPDATE CAPTURE_DB.ILR.LEARNING_DELIVERY
SET OUTCOME = 3
WHERE COMPSTATUS = 3 AND OUTCOME IS NULL;


-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
-- Expected: one row, COMPSTATUS 3, OUTCOME 3, AIMS 13 (as of 28 September
-- 2026: 13 withdrawn aims, all test data), and no row with an empty OUTCOME.
SELECT COMPSTATUS, OUTCOME, COUNT(*) AS AIMS
FROM CAPTURE_DB.ILR.LEARNING_DELIVERY
WHERE COMPSTATUS = 3
GROUP BY 1, 2
ORDER BY 1, 2;
