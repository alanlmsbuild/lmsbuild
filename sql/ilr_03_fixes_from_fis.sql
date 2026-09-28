-- ILR return, file 3: TEST DATA ONLY. Fixes the two problems DfE's FIS tool
-- (2627.2, reference data version 8) found in the test ILR file.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, after
-- ilr_02_test_data.sql. Safe to run twice: each change only applies while
-- the old value is still there.
--
-- 1. EmpId_02: the test employers' reference numbers (999000001, 2, 3, 5
--    and 6) fail the employer identifier check digit (derived data DD05:
--    weight the first 8 digits 9, 8, ... 2, then 11 minus the remainder
--    after dividing by 11, where 11 means 0 and 10 is never valid). Each
--    gets a number that passes, still starting 999 so it's plainly a test
--    value. The employment status records that copied them follow.
--      999000001 -> 999000012  (Testco Retail Ltd, in both organisations)
--      999000002 -> 999000020  (Example Care Homes Ltd)
--      999000003 -> 999000039  (Sample Logistics Ltd)
--      999000005 -> 999000055  (Placeholder Foods Ltd)
--      999000006 -> 999000063  (Sample Care Group Ltd)
--    999999999 (employer not on the Employer Data Service) is left alone:
--    it's always allowed.
--
-- 2. LearnDelFAMDateFrom_01: learning support funding (LSF) needs a date
--    from AND a date to (ILR 2026 to 2027, LSF and LearnDelFAMDateTo). The
--    provider support manual ("Completing the Learning Delivery funding and
--    monitoring"): when support is needed for the whole aim, the date to is
--    the aim's learning planned end date, updated later if that changes.
--    The 9 test LSF records (7 in ORG-T001, 2 in ORG-T002) had no date to, and
--    they get their programme aim's planned end date.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;


-- ---------------------------------------------------------------------------
-- 1. Employer reference numbers that pass the check digit
-- ---------------------------------------------------------------------------
UPDATE CAPTURE_DB.ILR.EMPLOYER t
SET EMPLOYERREF = s.NEWREF
FROM (SELECT * FROM (VALUES
    (999000001, 999000012),
    (999000002, 999000020),
    (999000003, 999000039),
    (999000005, 999000055),
    (999000006, 999000063)) AS v (OLDREF, NEWREF)) s
WHERE t.EMPLOYERREF = s.OLDREF AND t.ISTESTDATA;

UPDATE CAPTURE_DB.ILR.EMPLOYMENT_STATUS t
SET EMPID = s.NEWREF
FROM (SELECT * FROM (VALUES
    (999000001, 999000012),
    (999000002, 999000020),
    (999000003, 999000039),
    (999000005, 999000055),
    (999000006, 999000063)) AS v (OLDREF, NEWREF)) s
WHERE t.EMPID = s.OLDREF AND t.ISTESTDATA;


-- ---------------------------------------------------------------------------
-- 2. Learning support funding: date to = the aim's planned end date
-- ---------------------------------------------------------------------------
UPDATE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM f
SET DATETO = ld.LEARNPLANENDDATE
FROM CAPTURE_DB.ILR.LEARNING_DELIVERY ld
WHERE ld.LEARNREFNUMBER = f.LEARNREFNUMBER AND ld.AIMSEQNUMBER = f.AIMSEQNUMBER
  AND f.LEARNDELFAMTYPE = 'LSF' AND f.DATETO IS NULL AND f.ISTESTDATA;


-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
-- 1. Expected: EMP-T001 999000012, EMP-T002 999000020, EMP-T003 999000039,
--    EMP-T004 999000012, EMP-T005 999000055, EMP-T006 999000063, and
--    PASSES_CHECK_DIGIT TRUE on every row.
SELECT EMPLOYERID, ORGANISATIONID, NAME, EMPLOYERREF,
       EMPLOYERREF = 999999999 OR (
         LENGTH(TO_VARCHAR(EMPLOYERREF)) = 9
         AND MOD(11 - MOD(9 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 1, 1)::INT + 8 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 2, 1)::INT
                  + 7 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 3, 1)::INT + 6 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 4, 1)::INT
                  + 5 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 5, 1)::INT + 4 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 6, 1)::INT
                  + 3 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 7, 1)::INT + 2 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 8, 1)::INT, 11), 11)
             = SUBSTR(TO_VARCHAR(EMPLOYERREF), 9, 1)::INT
         AND 11 - MOD(9 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 1, 1)::INT + 8 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 2, 1)::INT
                  + 7 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 3, 1)::INT + 6 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 4, 1)::INT
                  + 5 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 5, 1)::INT + 4 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 6, 1)::INT
                  + 3 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 7, 1)::INT + 2 * SUBSTR(TO_VARCHAR(EMPLOYERREF), 8, 1)::INT, 11) <> 10
       ) AS PASSES_CHECK_DIGIT
FROM CAPTURE_DB.ILR.EMPLOYER
ORDER BY 1;

-- 2. Employer IDs on employment status records. Expected (116 in all):
--    999000012 31, 999000020 28, 999000039 18, 999000055 16, 999000063 4,
--    999999999 19. No 99900000x values left.
SELECT EMPID, COUNT(*) AS RECORDS
FROM CAPTURE_DB.ILR.EMPLOYMENT_STATUS
GROUP BY 1
ORDER BY 1;

-- 3. Expected: 9 rows, each with DATETO equal to LEARNPLANENDDATE:
--    TESTL0004 2027-06-30, TESTL0010 2026-12-18, TESTL0028 2027-03-29,
--    TESTL0032 2026-01-16, TESTL0036 2027-05-06, TESTL0056 2026-04-10,
--    TESTL0059 2026-11-20, TESTL0068 2027-04-12, TESTL0092 2026-11-16.
SELECT f.LEARNREFNUMBER, f.LEARNDELFAMTYPE, f.DATEFROM, f.DATETO, ld.LEARNPLANENDDATE
FROM CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM f
JOIN CAPTURE_DB.ILR.LEARNING_DELIVERY ld ON ld.LEARNREFNUMBER = f.LEARNREFNUMBER AND ld.AIMSEQNUMBER = f.AIMSEQNUMBER
WHERE f.LEARNDELFAMTYPE IN ('LSF', 'ALB')
ORDER BY 1;
