-- Roles and permissions, file 4 of 4: DUMMY DATA FOR TESTING EVERY ROLE.
--
-- TEST DATA ONLY. Every row this file adds or touches has ISTESTDATA = TRUE,
-- names are obviously fake, and every user's email ends @example.com, so it
-- can all be found and removed before real use. No evidence, reviews or
-- sign-offs - those wait until the KSBs are loaded.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, after files 1 to 3.
-- Safe to run twice: every row has a fixed id and is only added if it isn't
-- there already (MERGE ... WHEN NOT MATCHED), so a second run adds nothing
-- and never overwrites changes made in the app since.
--
-- What it sets up:
--   ORG-T001 Rarebit Test Provider (all the existing dummy data)
--     Tutors     OFF0002 (existing), OFF0004 Tina Testtutor02, OFF0005 Toby Testtutor03
--     Assessors  OFF0001 (existing), OFF0003 (existing), OFF0006 Ada Testassessoriqa (also IQA)
--     IQA        OFF0007 Ivy Testiqa01, plus Ada
--     Managers   OFF0008 Max Testmanager01, OFF0009 Mia Testmanager02
--     Extra test cases: Toby also held Manager, now revoked. OFF0010 Dee
--     Testinactive01 is a tutor whose user is deactivated.
--     Every existing learner gets exactly one tutor and one assessor.
--     Employers: Testco Retail Ltd (4 apprentices), Example Care Homes Ltd
--     (4), Sample Logistics Ltd (1), each with a contact user.
--     TESTL0006, 0009, 0012 and 0013 have no employer.
--   ORG-T002 Second Test Provider
--     OFF0011 Nia Testmanager03 (manager), OFF0012 Theo Testtutor04 (tutor),
--     OFF0013 Asha Testassessor04 (assessor). Learners TESTL0014 to 0016 on
--     ST0072, ST0005 and ST0259, with ILR records (TESTL0016 has completed
--     and achieved). Testco Retail Ltd again as its own employer record here
--     (same employer reference number), with its own contact user and
--     apprentices TESTL0014 and 0015.
--   Users: one per officer (USR-T0001 to USR-T0013, numbered like the
--   officer), one per learner (USR-T0101 to USR-T0116, numbered like the
--   learner) and the four employer contacts (USR-T0201 to USR-T0204).

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;


-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ACCESS.ORGANISATION t
USING (SELECT ORGANISATIONID, NAME FROM (VALUES
    ('ORG-T001', 'Rarebit Test Provider'),
    ('ORG-T002', 'Second Test Provider')) AS v (ORGANISATIONID, NAME)) s
  ON t.ORGANISATIONID = s.ORGANISATIONID
WHEN NOT MATCHED THEN INSERT (ORGANISATIONID, NAME, ISTESTDATA) VALUES (s.ORGANISATIONID, s.NAME, TRUE);

UPDATE CAPTURE_DB.ACCESS.ORGANISATION SET ISTESTDATA = TRUE WHERE ORGANISATIONID IN ('ORG-T001', 'ORG-T002');


-- ---------------------------------------------------------------------------
-- The existing dummy records are test data too.
-- ---------------------------------------------------------------------------
UPDATE CAPTURE_DB.ILR.LEARNER SET ISTESTDATA = TRUE WHERE LEARNREFNUMBER LIKE 'TESTL%';
UPDATE CAPTURE_DB.ILR.LEARNING_DELIVERY SET ISTESTDATA = TRUE WHERE LEARNREFNUMBER LIKE 'TESTL%';
UPDATE CAPTURE_DB.ILR.OFFICER SET ISTESTDATA = TRUE WHERE OFFICERREFNUMBER IN ('OFF0001', 'OFF0002', 'OFF0003');


-- ---------------------------------------------------------------------------
-- Optional: give the three realistic-looking existing records obviously
-- fake details (TESTL0013 Lee Struth, OFF0001 Kay Broughton, OFF0002
-- Richard McKay). Off by default. Change FALSE to TRUE to apply. Their
-- reference numbers stay the same, so links and drafts are unaffected.
-- ---------------------------------------------------------------------------
SET RENAME_REAL_LOOKING_RECORDS = FALSE;

UPDATE CAPTURE_DB.ILR.LEARNER
SET FAMILYNAME = 'Testlearner13', ULN = 9100000131, POSTCODE = 'ZZ1 1AU', POSTCODEPRIOR = 'ZZ1 1AU',
    EMAIL = 'lee.testlearner13@example.com'
WHERE LEARNREFNUMBER = 'TESTL0013' AND $RENAME_REAL_LOOKING_RECORDS;

UPDATE CAPTURE_DB.ILR.OFFICER
SET OFFICERNAME = 'Kay Testassessor01', EMAIL = 'kay.testassessor01@example.com', TELNO = NULL
WHERE OFFICERREFNUMBER = 'OFF0001' AND $RENAME_REAL_LOOKING_RECORDS;

UPDATE CAPTURE_DB.ILR.OFFICER
SET OFFICERNAME = 'Richard Testtutor01', EMAIL = 'richard.testtutor01@example.com', TELNO = NULL
WHERE OFFICERREFNUMBER = 'OFF0002' AND $RENAME_REAL_LOOKING_RECORDS;


-- ---------------------------------------------------------------------------
-- New officers
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.OFFICER t
USING (SELECT * FROM (VALUES
    ('OFF0004', 'Tina Testtutor02', 'TUTOR', 'tina.testtutor02@example.com', 'ORG-T001'),
    ('OFF0005', 'Toby Testtutor03', 'TUTOR', 'toby.testtutor03@example.com', 'ORG-T001'),
    ('OFF0006', 'Ada Testassessoriqa', 'ASSESSOR', 'ada.testassessoriqa@example.com', 'ORG-T001'),
    ('OFF0007', 'Ivy Testiqa01', 'IQA', 'ivy.testiqa01@example.com', 'ORG-T001'),
    ('OFF0008', 'Max Testmanager01', 'MANAGER', 'max.testmanager01@example.com', 'ORG-T001'),
    ('OFF0009', 'Mia Testmanager02', 'MANAGER', 'mia.testmanager02@example.com', 'ORG-T001'),
    ('OFF0010', 'Dee Testinactive01', 'TUTOR', 'dee.testinactive01@example.com', 'ORG-T001'),
    ('OFF0011', 'Nia Testmanager03', 'MANAGER', 'nia.testmanager03@example.com', 'ORG-T002'),
    ('OFF0012', 'Theo Testtutor04', 'TUTOR', 'theo.testtutor04@example.com', 'ORG-T002'),
    ('OFF0013', 'Asha Testassessor04', 'ASSESSOR', 'asha.testassessor04@example.com', 'ORG-T002')) AS v (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL, ORGANISATIONID)) s
  ON t.OFFICERREFNUMBER = s.OFFICERREFNUMBER
WHEN NOT MATCHED THEN INSERT (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL, ORGANISATIONID, ISTESTDATA)
  VALUES (s.OFFICERREFNUMBER, s.OFFICERNAME, s.OFFICERTYPE, s.EMAIL, s.ORGANISATIONID, TRUE);


-- ---------------------------------------------------------------------------
-- Second organisation's learners and their programme aims, in the same
-- pattern as the existing dummy learners.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.LEARNER t
USING (SELECT LEARNREFNUMBER, ULN, GIVENNAMES, FAMILYNAME, DOB::DATE AS DATEOFBIRTH, SEX, ETHNICITY, LLDDHEALTHPROB,
              POSTCODE, POSTCODEPRIOR, EMAIL
       FROM (VALUES
    ('TESTL0014', 9100000014, 'Nova', 'Testlearner14', '2004-02-12', 'F', 31, 2, 'ZZ1 1AR', 'ZZ1 1AR', 'nova.testlearner14@example.com'),
    ('TESTL0015', 9100000015, 'Kit', 'Testlearner15', '1999-06-23', 'M', 42, 2, 'ZZ1 1AS', 'ZZ2 2BC', 'kit.testlearner15@example.com'),
    ('TESTL0016', 9100000016, 'Rowan', 'Testlearner16', '1992-11-08', 'F', 34, 1, 'ZZ1 1AT', 'ZZ1 1AT', 'rowan.testlearner16@example.com')) AS v (LEARNREFNUMBER, ULN, GIVENNAMES, FAMILYNAME, DOB, SEX, ETHNICITY, LLDDHEALTHPROB,
                          POSTCODE, POSTCODEPRIOR, EMAIL)) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER
WHEN NOT MATCHED THEN INSERT (LEARNREFNUMBER, ULN, GIVENNAMES, FAMILYNAME, DATEOFBIRTH, SEX, ETHNICITY, LLDDHEALTHPROB,
                              POSTCODE, POSTCODEPRIOR, EMAIL, ORGANISATIONID, ISTESTDATA)
  VALUES (s.LEARNREFNUMBER, s.ULN, s.GIVENNAMES, s.FAMILYNAME, s.DATEOFBIRTH, s.SEX, s.ETHNICITY, s.LLDDHEALTHPROB,
          s.POSTCODE, s.POSTCODEPRIOR, s.EMAIL, 'ORG-T002', TRUE);

MERGE INTO CAPTURE_DB.ILR.LEARNING_DELIVERY t
USING (SELECT LEARNREFNUMBER, STARTDATE::DATE AS LEARNSTARTDATE, PLANENDDATE::DATE AS LEARNPLANENDDATE, STDCODE,
              COMPSTATUS, ACTENDDATE::DATE AS LEARNACTENDDATE, OUTCOME, ACHIEVED::DATE AS ACHDATE
       FROM (VALUES
    ('TESTL0014', '2025-10-06', '2027-04-30', 122, 1, NULL, NULL, NULL),
    ('TESTL0015', '2026-01-12', '2027-07-30', 119, 1, NULL, NULL, NULL),
    ('TESTL0016', '2024-11-04', '2026-04-30', 111, 2, '2026-04-30', 1, '2026-04-30')) AS v (LEARNREFNUMBER, STARTDATE, PLANENDDATE, STDCODE, COMPSTATUS, ACTENDDATE, OUTCOME, ACHIEVED)) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER AND t.LEARNAIMREF = 'ZPROG001' AND t.AIMSEQNUMBER = 1
WHEN NOT MATCHED THEN INSERT (LEARNREFNUMBER, LEARNAIMREF, AIMTYPE, AIMSEQNUMBER, LEARNSTARTDATE, LEARNPLANENDDATE,
                              FUNDMODEL, PROGTYPE, STDCODE, DELLOCPOSTCODE, COMPSTATUS, LEARNACTENDDATE, OUTCOME, ACHDATE,
                              ISTESTDATA)
  VALUES (s.LEARNREFNUMBER, 'ZPROG001', 1, 1, s.LEARNSTARTDATE, s.LEARNPLANENDDATE,
          36, 25, s.STDCODE, 'ZZ3 3DA', s.COMPSTATUS, s.LEARNACTENDDATE, s.OUTCOME, s.ACHDATE,
          TRUE);


-- ---------------------------------------------------------------------------
-- Employers, and which learners work for them (from each learner's start date)
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.EMPLOYER t
USING (SELECT * FROM (VALUES
    ('EMP-T001', 'ORG-T001', 'Testco Retail Ltd', 999000001),
    ('EMP-T002', 'ORG-T001', 'Example Care Homes Ltd', 999000002),
    ('EMP-T003', 'ORG-T001', 'Sample Logistics Ltd', 999000003),
    ('EMP-T004', 'ORG-T002', 'Testco Retail Ltd', 999000001)) AS v (EMPLOYERID, ORGANISATIONID, NAME, EMPLOYERREF)) s
  ON t.EMPLOYERID = s.EMPLOYERID
WHEN NOT MATCHED THEN INSERT (EMPLOYERID, ORGANISATIONID, NAME, EMPLOYERREF, ISTESTDATA)
  VALUES (s.EMPLOYERID, s.ORGANISATIONID, s.NAME, s.EMPLOYERREF, TRUE);

MERGE INTO CAPTURE_DB.ILR.LEARNER_EMPLOYER t
USING (
  SELECT v.EMPLOYERID, v.LEARNREFNUMBER, ld.LEARNSTARTDATE AS FROMDATE
  FROM (VALUES
      ('EMP-T001', 'TESTL0001'),
      ('EMP-T001', 'TESTL0004'),
      ('EMP-T001', 'TESTL0007'),
      ('EMP-T001', 'TESTL0010'),
      ('EMP-T002', 'TESTL0002'),
      ('EMP-T002', 'TESTL0005'),
      ('EMP-T002', 'TESTL0008'),
      ('EMP-T002', 'TESTL0011'),
      ('EMP-T003', 'TESTL0003'),
      ('EMP-T004', 'TESTL0014'),
      ('EMP-T004', 'TESTL0015')) AS v (EMPLOYERID, LEARNREFNUMBER)
  JOIN CAPTURE_DB.ILR.LEARNING_DELIVERY ld
    ON ld.LEARNREFNUMBER = v.LEARNREFNUMBER AND ld.LEARNAIMREF = 'ZPROG001' AND ld.AIMSEQNUMBER = 1
) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER AND t.EMPLOYERID = s.EMPLOYERID
WHEN NOT MATCHED THEN INSERT (LEARNREFNUMBER, EMPLOYERID, FROMDATE, ISTESTDATA)
  VALUES (s.LEARNREFNUMBER, s.EMPLOYERID, s.FROMDATE, TRUE);


-- ---------------------------------------------------------------------------
-- Caseloads: every learner gets one current tutor and one current assessor.
-- The two links copied in by file 2 (OFF0001 for TESTL0002 and TESTL0013)
-- already match, so they aren't added twice.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.OFFICER_ASSIGNMENT t
USING (SELECT * FROM (VALUES
    ('TESTL0001', 'OFF0002', 'TUTOR'),
    ('TESTL0002', 'OFF0002', 'TUTOR'),
    ('TESTL0003', 'OFF0002', 'TUTOR'),
    ('TESTL0004', 'OFF0002', 'TUTOR'),
    ('TESTL0005', 'OFF0002', 'TUTOR'),
    ('TESTL0006', 'OFF0004', 'TUTOR'),
    ('TESTL0007', 'OFF0004', 'TUTOR'),
    ('TESTL0008', 'OFF0004', 'TUTOR'),
    ('TESTL0009', 'OFF0004', 'TUTOR'),
    ('TESTL0010', 'OFF0005', 'TUTOR'),
    ('TESTL0011', 'OFF0005', 'TUTOR'),
    ('TESTL0012', 'OFF0005', 'TUTOR'),
    ('TESTL0013', 'OFF0005', 'TUTOR'),
    ('TESTL0014', 'OFF0012', 'TUTOR'),
    ('TESTL0015', 'OFF0012', 'TUTOR'),
    ('TESTL0016', 'OFF0012', 'TUTOR'),
    ('TESTL0001', 'OFF0001', 'ASSESSOR'),
    ('TESTL0002', 'OFF0001', 'ASSESSOR'),
    ('TESTL0003', 'OFF0001', 'ASSESSOR'),
    ('TESTL0004', 'OFF0001', 'ASSESSOR'),
    ('TESTL0013', 'OFF0001', 'ASSESSOR'),
    ('TESTL0005', 'OFF0003', 'ASSESSOR'),
    ('TESTL0006', 'OFF0003', 'ASSESSOR'),
    ('TESTL0007', 'OFF0003', 'ASSESSOR'),
    ('TESTL0008', 'OFF0003', 'ASSESSOR'),
    ('TESTL0009', 'OFF0006', 'ASSESSOR'),
    ('TESTL0010', 'OFF0006', 'ASSESSOR'),
    ('TESTL0011', 'OFF0006', 'ASSESSOR'),
    ('TESTL0012', 'OFF0006', 'ASSESSOR'),
    ('TESTL0014', 'OFF0013', 'ASSESSOR'),
    ('TESTL0015', 'OFF0013', 'ASSESSOR'),
    ('TESTL0016', 'OFF0013', 'ASSESSOR')) AS v (LEARNREFNUMBER, OFFICERREFNUMBER, ASSIGNMENTROLE)) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER AND t.OFFICERREFNUMBER = s.OFFICERREFNUMBER
 AND t.ASSIGNMENTROLE = s.ASSIGNMENTROLE AND t.ENDEDAT IS NULL
WHEN NOT MATCHED THEN INSERT (ASSIGNMENTID, LEARNREFNUMBER, OFFICERREFNUMBER, ASSIGNMENTROLE, STARTEDBY, ISTESTDATA)
  VALUES ('ASG-T-' || s.LEARNREFNUMBER || '-' || s.ASSIGNMENTROLE, s.LEARNREFNUMBER, s.OFFICERREFNUMBER,
          s.ASSIGNMENTROLE, 'test-data-seed', TRUE);

UPDATE CAPTURE_DB.ILR.OFFICER_ASSIGNMENT SET ISTESTDATA = TRUE WHERE LEARNREFNUMBER LIKE 'TESTL%';


-- ---------------------------------------------------------------------------
-- Users. Names come from the officer and learner records, so they follow
-- the optional renames above.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ACCESS.APP_USER t
USING (
  SELECT v.USERID, o.ORGANISATIONID, o.OFFICERNAME AS DISPLAYNAME, v.EMAIL,
         o.OFFICERREFNUMBER, NULL AS LEARNREFNUMBER, NULL AS EMPLOYERID, v.ISACTIVE
  FROM (VALUES
      ('USR-T0001', 'OFF0001', 'off0001@example.com', TRUE),
      ('USR-T0002', 'OFF0002', 'off0002@example.com', TRUE),
      ('USR-T0003', 'OFF0003', 'curl.testofficer@example.com', TRUE),
      ('USR-T0004', 'OFF0004', 'tina.testtutor02@example.com', TRUE),
      ('USR-T0005', 'OFF0005', 'toby.testtutor03@example.com', TRUE),
      ('USR-T0006', 'OFF0006', 'ada.testassessoriqa@example.com', TRUE),
      ('USR-T0007', 'OFF0007', 'ivy.testiqa01@example.com', TRUE),
      ('USR-T0008', 'OFF0008', 'max.testmanager01@example.com', TRUE),
      ('USR-T0009', 'OFF0009', 'mia.testmanager02@example.com', TRUE),
      ('USR-T0010', 'OFF0010', 'dee.testinactive01@example.com', FALSE),
      ('USR-T0011', 'OFF0011', 'nia.testmanager03@example.com', TRUE),
      ('USR-T0012', 'OFF0012', 'theo.testtutor04@example.com', TRUE),
      ('USR-T0013', 'OFF0013', 'asha.testassessor04@example.com', TRUE)) AS v (USERID, OFFICERREFNUMBER, EMAIL, ISACTIVE)
  JOIN CAPTURE_DB.ILR.OFFICER o ON o.OFFICERREFNUMBER = v.OFFICERREFNUMBER
  UNION ALL
  SELECT v.USERID, l.ORGANISATIONID, TRIM(COALESCE(l.GIVENNAMES, '') || ' ' || COALESCE(l.FAMILYNAME, '')),
         v.EMAIL, NULL, l.LEARNREFNUMBER, NULL, TRUE
  FROM (VALUES
      ('USR-T0101', 'TESTL0001', 'testl0001@example.com'),
      ('USR-T0102', 'TESTL0002', 'testl0002@example.com'),
      ('USR-T0103', 'TESTL0003', 'testl0003@example.com'),
      ('USR-T0104', 'TESTL0004', 'testl0004@example.com'),
      ('USR-T0105', 'TESTL0005', 'testl0005@example.com'),
      ('USR-T0106', 'TESTL0006', 'testl0006@example.com'),
      ('USR-T0107', 'TESTL0007', 'testl0007@example.com'),
      ('USR-T0108', 'TESTL0008', 'testl0008@example.com'),
      ('USR-T0109', 'TESTL0009', 'testl0009@example.com'),
      ('USR-T0110', 'TESTL0010', 'testl0010@example.com'),
      ('USR-T0111', 'TESTL0011', 'testl0011@example.com'),
      ('USR-T0112', 'TESTL0012', 'testl0012@example.com'),
      ('USR-T0113', 'TESTL0013', 'testl0013@example.com'),
      ('USR-T0114', 'TESTL0014', 'nova.testlearner14@example.com'),
      ('USR-T0115', 'TESTL0015', 'kit.testlearner15@example.com'),
      ('USR-T0116', 'TESTL0016', 'rowan.testlearner16@example.com')) AS v (USERID, LEARNREFNUMBER, EMAIL)
  JOIN CAPTURE_DB.ILR.LEARNER l ON l.LEARNREFNUMBER = v.LEARNREFNUMBER
  UNION ALL
  SELECT USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, NULL, NULL, EMPLOYERID, TRUE
  FROM (VALUES
      ('USR-T0201', 'ORG-T001', 'Erin Testcontact01', 'erin.testcontact01@example.com', 'EMP-T001'),
      ('USR-T0202', 'ORG-T001', 'Cole Testcontact02', 'cole.testcontact02@example.com', 'EMP-T002'),
      ('USR-T0203', 'ORG-T001', 'Sol Testcontact03', 'sol.testcontact03@example.com', 'EMP-T003'),
      ('USR-T0204', 'ORG-T002', 'Tess Testcontact04', 'tess.testcontact04@example.com', 'EMP-T004')) AS v (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, EMPLOYERID)
) s
  ON t.USERID = s.USERID
WHEN NOT MATCHED THEN INSERT (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, OFFICERREFNUMBER, LEARNREFNUMBER, EMPLOYERID,
                              ISACTIVE, DEACTIVATEDAT, DEACTIVATEDBY, ISTESTDATA, CREATEDBY)
  VALUES (s.USERID, s.ORGANISATIONID, s.DISPLAYNAME, s.EMAIL, s.OFFICERREFNUMBER, s.LEARNREFNUMBER, s.EMPLOYERID,
          s.ISACTIVE, IFF(s.ISACTIVE, NULL, CURRENT_TIMESTAMP()), IFF(s.ISACTIVE, NULL, 'test-data-seed'), TRUE,
          'test-data-seed');

-- If the optional renames were applied after the users already existed.
UPDATE CAPTURE_DB.ACCESS.APP_USER u
SET DISPLAYNAME = o.OFFICERNAME
FROM CAPTURE_DB.ILR.OFFICER o
WHERE u.OFFICERREFNUMBER = o.OFFICERREFNUMBER AND u.USERID IN ('USR-T0001', 'USR-T0002')
  AND u.DISPLAYNAME <> o.OFFICERNAME AND $RENAME_REAL_LOOKING_RECORDS;

UPDATE CAPTURE_DB.ACCESS.APP_USER u
SET DISPLAYNAME = TRIM(COALESCE(l.GIVENNAMES, '') || ' ' || COALESCE(l.FAMILYNAME, ''))
FROM CAPTURE_DB.ILR.LEARNER l
WHERE u.LEARNREFNUMBER = l.LEARNREFNUMBER AND u.USERID = 'USR-T0113' AND $RENAME_REAL_LOOKING_RECORDS;


-- ---------------------------------------------------------------------------
-- Roles. Ada (USR-T0006) is both assessor and IQA. Toby's manager role
-- (USR-T0005) is revoked, to prove revoked roles stop working.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ACCESS.USER_ROLE t
USING (SELECT * FROM (VALUES
    ('RG-USR-T0001-ASSESSOR', 'USR-T0001', 'ASSESSOR', FALSE),
    ('RG-USR-T0002-TUTOR', 'USR-T0002', 'TUTOR', FALSE),
    ('RG-USR-T0003-ASSESSOR', 'USR-T0003', 'ASSESSOR', FALSE),
    ('RG-USR-T0004-TUTOR', 'USR-T0004', 'TUTOR', FALSE),
    ('RG-USR-T0005-TUTOR', 'USR-T0005', 'TUTOR', FALSE),
    ('RG-USR-T0005-MANAGER', 'USR-T0005', 'MANAGER', TRUE),
    ('RG-USR-T0006-ASSESSOR', 'USR-T0006', 'ASSESSOR', FALSE),
    ('RG-USR-T0006-IQA', 'USR-T0006', 'IQA', FALSE),
    ('RG-USR-T0007-IQA', 'USR-T0007', 'IQA', FALSE),
    ('RG-USR-T0008-MANAGER', 'USR-T0008', 'MANAGER', FALSE),
    ('RG-USR-T0009-MANAGER', 'USR-T0009', 'MANAGER', FALSE),
    ('RG-USR-T0010-TUTOR', 'USR-T0010', 'TUTOR', FALSE),
    ('RG-USR-T0011-MANAGER', 'USR-T0011', 'MANAGER', FALSE),
    ('RG-USR-T0012-TUTOR', 'USR-T0012', 'TUTOR', FALSE),
    ('RG-USR-T0013-ASSESSOR', 'USR-T0013', 'ASSESSOR', FALSE),
    ('RG-USR-T0101-LEARNER', 'USR-T0101', 'LEARNER', FALSE),
    ('RG-USR-T0102-LEARNER', 'USR-T0102', 'LEARNER', FALSE),
    ('RG-USR-T0103-LEARNER', 'USR-T0103', 'LEARNER', FALSE),
    ('RG-USR-T0104-LEARNER', 'USR-T0104', 'LEARNER', FALSE),
    ('RG-USR-T0105-LEARNER', 'USR-T0105', 'LEARNER', FALSE),
    ('RG-USR-T0106-LEARNER', 'USR-T0106', 'LEARNER', FALSE),
    ('RG-USR-T0107-LEARNER', 'USR-T0107', 'LEARNER', FALSE),
    ('RG-USR-T0108-LEARNER', 'USR-T0108', 'LEARNER', FALSE),
    ('RG-USR-T0109-LEARNER', 'USR-T0109', 'LEARNER', FALSE),
    ('RG-USR-T0110-LEARNER', 'USR-T0110', 'LEARNER', FALSE),
    ('RG-USR-T0111-LEARNER', 'USR-T0111', 'LEARNER', FALSE),
    ('RG-USR-T0112-LEARNER', 'USR-T0112', 'LEARNER', FALSE),
    ('RG-USR-T0113-LEARNER', 'USR-T0113', 'LEARNER', FALSE),
    ('RG-USR-T0114-LEARNER', 'USR-T0114', 'LEARNER', FALSE),
    ('RG-USR-T0115-LEARNER', 'USR-T0115', 'LEARNER', FALSE),
    ('RG-USR-T0116-LEARNER', 'USR-T0116', 'LEARNER', FALSE),
    ('RG-USR-T0201-EMPLOYER', 'USR-T0201', 'EMPLOYER', FALSE),
    ('RG-USR-T0202-EMPLOYER', 'USR-T0202', 'EMPLOYER', FALSE),
    ('RG-USR-T0203-EMPLOYER', 'USR-T0203', 'EMPLOYER', FALSE),
    ('RG-USR-T0204-EMPLOYER', 'USR-T0204', 'EMPLOYER', FALSE)) AS v (ROLEGRANTID, USERID, ROLE, ISREVOKED)) s
  ON t.ROLEGRANTID = s.ROLEGRANTID
WHEN NOT MATCHED THEN INSERT (ROLEGRANTID, USERID, ROLE, GRANTEDBY, REVOKEDAT, REVOKEDBY, ISTESTDATA)
  VALUES (s.ROLEGRANTID, s.USERID, s.ROLE, 'test-data-seed',
          IFF(s.ISREVOKED, CURRENT_TIMESTAMP(), NULL), IFF(s.ISREVOKED, 'test-data-seed', NULL), TRUE);


-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
-- 1. Expected:
--    ORG-T001  13 learners, 10 officers, 3 employers, 26 users, 1 inactive user
--    ORG-T002   3 learners,  3 officers, 1 employer,   7 users, 0 inactive users
WITH learners AS (SELECT ORGANISATIONID, COUNT(*) AS N FROM CAPTURE_DB.ILR.LEARNER GROUP BY 1),
officers AS (SELECT ORGANISATIONID, COUNT(*) AS N FROM CAPTURE_DB.ILR.OFFICER GROUP BY 1),
employers AS (SELECT ORGANISATIONID, COUNT(*) AS N FROM CAPTURE_DB.ILR.EMPLOYER GROUP BY 1),
users AS (SELECT ORGANISATIONID, COUNT(*) AS N, COUNT_IF(NOT ISACTIVE) AS INACTIVE FROM CAPTURE_DB.ACCESS.APP_USER GROUP BY 1)
SELECT o.ORGANISATIONID, o.NAME, o.ISTESTDATA,
  COALESCE(l.N, 0) AS LEARNERS, COALESCE(f.N, 0) AS OFFICERS, COALESCE(e.N, 0) AS EMPLOYERS,
  COALESCE(u.N, 0) AS USERS, COALESCE(u.INACTIVE, 0) AS INACTIVE_USERS
FROM CAPTURE_DB.ACCESS.ORGANISATION o
LEFT JOIN learners l ON l.ORGANISATIONID = o.ORGANISATIONID
LEFT JOIN officers f ON f.ORGANISATIONID = o.ORGANISATIONID
LEFT JOIN employers e ON e.ORGANISATIONID = o.ORGANISATIONID
LEFT JOIN users u ON u.ORGANISATIONID = o.ORGANISATIONID
ORDER BY o.ORGANISATIONID;

-- 2. Active roles held by active users. Expected:
--    ORG-T001  ASSESSOR 3, EMPLOYER 3, IQA 2, LEARNER 13, MANAGER 2, TUTOR 3
--    ORG-T002  ASSESSOR 1, EMPLOYER 1, LEARNER 3, MANAGER 1, TUTOR 1
SELECT u.ORGANISATIONID, r.ROLE, COUNT(*) AS USERS_WITH_ROLE
FROM CAPTURE_DB.ACCESS.USER_ROLE r
JOIN CAPTURE_DB.ACCESS.APP_USER u ON u.USERID = r.USERID
WHERE r.REVOKEDAT IS NULL AND u.ISACTIVE
GROUP BY 1, 2
ORDER BY 1, 2;

-- 3. Expected: no rows. Any learner listed doesn't have exactly one current tutor and one current assessor.
SELECT l.LEARNREFNUMBER,
  COUNT_IF(a.ASSIGNMENTROLE = 'TUTOR') AS TUTORS,
  COUNT_IF(a.ASSIGNMENTROLE = 'ASSESSOR') AS ASSESSORS
FROM CAPTURE_DB.ILR.LEARNER l
LEFT JOIN CAPTURE_DB.ILR.OFFICER_ASSIGNMENT a ON a.LEARNREFNUMBER = l.LEARNREFNUMBER AND a.ENDEDAT IS NULL
GROUP BY 1
HAVING TUTORS <> 1 OR ASSESSORS <> 1;

-- 4. Each employer's current apprentices. Expected:
--    EMP-T001 Testco Retail Ltd       999000001  TESTL0001, TESTL0004, TESTL0007, TESTL0010
--    EMP-T002 Example Care Homes Ltd  999000002  TESTL0002, TESTL0005, TESTL0008, TESTL0011
--    EMP-T003 Sample Logistics Ltd    999000003  TESTL0003
--    EMP-T004 Testco Retail Ltd       999000001  TESTL0014, TESTL0015  (ORG-T002)
SELECT e.ORGANISATIONID, e.EMPLOYERID, e.NAME, e.EMPLOYERREF,
  LISTAGG(le.LEARNREFNUMBER, ', ') WITHIN GROUP (ORDER BY le.LEARNREFNUMBER) AS APPRENTICES
FROM CAPTURE_DB.ILR.EMPLOYER e
LEFT JOIN CAPTURE_DB.ILR.LEARNER_EMPLOYER le ON le.EMPLOYERID = e.EMPLOYERID
  AND (le.TODATE IS NULL OR le.TODATE >= CURRENT_DATE())
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2;

-- 5. Expected: 0. Users whose email doesn't end @example.com.
SELECT COUNT(*) AS USERS_WITHOUT_EXAMPLE_EMAIL
FROM CAPTURE_DB.ACCESS.APP_USER
WHERE ISTESTDATA AND EMAIL NOT LIKE '%@example.com';

-- 6. Everything marked as test data. Expected TEST_ROWS = ALL_ROWS on every line:
--    ORGANISATION 2, APP_USER 33, USER_ROLE 35, LEARNER 16, LEARNING_DELIVERY 16,
--    OFFICER 13, OFFICER_ASSIGNMENT 32, EMPLOYER 4, LEARNER_EMPLOYER 11
SELECT 'ACCESS.ORGANISATION' AS TABLE_NAME, COUNT_IF(ISTESTDATA) AS TEST_ROWS, COUNT(*) AS ALL_ROWS FROM CAPTURE_DB.ACCESS.ORGANISATION
UNION ALL SELECT 'ACCESS.APP_USER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ACCESS.APP_USER
UNION ALL SELECT 'ACCESS.USER_ROLE', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ACCESS.USER_ROLE
UNION ALL SELECT 'ILR.LEARNER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.LEARNER
UNION ALL SELECT 'ILR.LEARNING_DELIVERY', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.LEARNING_DELIVERY
UNION ALL SELECT 'ILR.OFFICER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.OFFICER
UNION ALL SELECT 'ILR.OFFICER_ASSIGNMENT', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.OFFICER_ASSIGNMENT
UNION ALL SELECT 'ILR.EMPLOYER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.EMPLOYER
UNION ALL SELECT 'ILR.LEARNER_EMPLOYER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER;
