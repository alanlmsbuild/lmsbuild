-- Test data tidy-up: gives the test assessor "Curl Test Officer" (OFF0003,
-- user USR-T0003) a proper test name, Cara Testassessor02, like the other
-- test officers. It was made on 22 September by a curl test of "add officer"
-- and has since become a real part of the test data: it's the current
-- assessor for 12 test learners, which stay assigned to it.
--
-- Only the name and the two email addresses change. The reference number,
-- user id, role and assignments stay the same, so nothing that points at
-- OFF0003 or USR-T0003 is affected. Neither table is in the test snapshot
-- (TEST_BASELINE), so the test reset won't bring the old name back.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet (ACCESS is read-only
-- for the app's role). Safe to run twice. Test data only: each update also
-- requires ISTESTDATA = TRUE.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

UPDATE CAPTURE_DB.ILR.OFFICER
SET OFFICERNAME = 'Cara Testassessor02', EMAIL = 'cara.testassessor02@example.com'
WHERE OFFICERREFNUMBER = 'OFF0003' AND ISTESTDATA = TRUE;

UPDATE CAPTURE_DB.ACCESS.APP_USER
SET DISPLAYNAME = 'Cara Testassessor02', EMAIL = 'cara.testassessor02@example.com'
WHERE USERID = 'USR-T0003' AND OFFICERREFNUMBER = 'OFF0003' AND ISTESTDATA = TRUE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The officer and their user have the new name. Expected: 1 row, both
--    names Cara Testassessor02, both emails cara.testassessor02@example.com,
--    ROLE ASSESSOR, IS_ACTIVE TRUE.
SELECT o.OFFICERREFNUMBER, o.OFFICERNAME, o.EMAIL, u.USERID, u.DISPLAYNAME, u.EMAIL AS USER_EMAIL, r.ROLE, u.ISACTIVE AS IS_ACTIVE
FROM CAPTURE_DB.ILR.OFFICER o
JOIN CAPTURE_DB.ACCESS.APP_USER u ON u.OFFICERREFNUMBER = o.OFFICERREFNUMBER
JOIN CAPTURE_DB.ACCESS.USER_ROLE r ON r.USERID = u.USERID AND r.REVOKEDAT IS NULL
WHERE o.OFFICERREFNUMBER = 'OFF0003';

-- 2. Nothing is called "curl" any more. Expected: 0.
SELECT (SELECT COUNT(*) FROM CAPTURE_DB.ILR.OFFICER WHERE OFFICERNAME ILIKE '%curl%' OR EMAIL ILIKE '%curl%')
     + (SELECT COUNT(*) FROM CAPTURE_DB.ACCESS.APP_USER WHERE DISPLAYNAME ILIKE '%curl%' OR EMAIL ILIKE '%curl%') AS CURL_LEFT;

-- 3. Its learners are unchanged. Expected: 12.
SELECT COUNT(*) AS CURRENT_LEARNERS
FROM CAPTURE_DB.ILR.OFFICER_ASSIGNMENT
WHERE OFFICERREFNUMBER = 'OFF0003' AND ASSIGNMENTROLE = 'ASSESSOR' AND ENDEDAT IS NULL;
