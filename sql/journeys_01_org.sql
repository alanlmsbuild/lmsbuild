-- Test journeys, file 1 of 3: TEST DATA ONLY. A third test organisation for
-- the generated journeys (scripts/generate-journeys.js, day 2 of the trial
-- plan, approved 11 October 2026), its test staff, and its CRM defaults.
--
--   ORG-T003 Rarebit Journey Provider, test UKPRN 99999997 (not on UKRLP;
--   only ever in test files, never submitted). Kept apart from ORG-T001 and
--   ORG-T002 so the existing tests and their 116 learners are untouched.
--   Staff (officer and user numbered alike, emails @example.com):
--     Managers   OFF3001 Grace Testmanager04, OFF3002 Owen Testmanager05
--     Tutors     OFF3003 Faye Testtutor05, OFF3004 Hugo Testtutor06
--     Assessors  OFF3005 Ruth Testassessor05, OFF3006 Seth Testassessor06
--     IQA        OFF3007 Iris Testiqa02
--   Users USR-T3001 to USR-T3007. The candidates and learners themselves
--   come later: a candidate's sign-in is made by hand-over (flow F6,
--   sql/flow_01_f6_f7_f8.sql), with the CANDIDATE role.
--
-- CANDIDATE is a new value of SHARED_DB.ACCESS.USER_ROLE.ROLE (roles are
-- values, not a table): a person handed over from the CRM for stage 2, who
-- can't sign in yet (signing in waits for real sign-in). F6 grants it; on
-- enrolment F7 adds LEARNER beside it.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, before
-- sql/flow_01_f6_f7_f8.sql. Safe to run twice: every row has a fixed ID and
-- is only added if it isn't there already.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

MERGE INTO SHARED_DB.ACCESS.ORGANISATION t
USING (SELECT 'ORG-T003' AS ORGANISATIONID, 'Rarebit Journey Provider' AS NAME, 99999997 AS UKPRN) s
  ON t.ORGANISATIONID = s.ORGANISATIONID
WHEN NOT MATCHED THEN INSERT (ORGANISATIONID, NAME, UKPRN, ISTESTDATA) VALUES (s.ORGANISATIONID, s.NAME, s.UKPRN, TRUE);

MERGE INTO CAPTURE_DB.ILR.OFFICER t
USING (SELECT * FROM VALUES
    ('OFF3001', 'Grace Testmanager04', 'MANAGER', 'grace.testmanager04@example.com'),
    ('OFF3002', 'Owen Testmanager05', 'MANAGER', 'owen.testmanager05@example.com'),
    ('OFF3003', 'Faye Testtutor05', 'TUTOR', 'faye.testtutor05@example.com'),
    ('OFF3004', 'Hugo Testtutor06', 'TUTOR', 'hugo.testtutor06@example.com'),
    ('OFF3005', 'Ruth Testassessor05', 'ASSESSOR', 'ruth.testassessor05@example.com'),
    ('OFF3006', 'Seth Testassessor06', 'ASSESSOR', 'seth.testassessor06@example.com'),
    ('OFF3007', 'Iris Testiqa02', 'IQA', 'iris.testiqa02@example.com')
  AS v (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL)) s
  ON t.OFFICERREFNUMBER = s.OFFICERREFNUMBER
WHEN NOT MATCHED THEN INSERT (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL, ORGANISATIONID, ISTESTDATA)
  VALUES (s.OFFICERREFNUMBER, s.OFFICERNAME, s.OFFICERTYPE, s.EMAIL, 'ORG-T003', TRUE);

MERGE INTO SHARED_DB.ACCESS.APP_USER t
USING (SELECT * FROM VALUES
    ('USR-T3001', 'Grace Testmanager04', 'grace.testmanager04@example.com', 'OFF3001'),
    ('USR-T3002', 'Owen Testmanager05', 'owen.testmanager05@example.com', 'OFF3002'),
    ('USR-T3003', 'Faye Testtutor05', 'faye.testtutor05@example.com', 'OFF3003'),
    ('USR-T3004', 'Hugo Testtutor06', 'hugo.testtutor06@example.com', 'OFF3004'),
    ('USR-T3005', 'Ruth Testassessor05', 'ruth.testassessor05@example.com', 'OFF3005'),
    ('USR-T3006', 'Seth Testassessor06', 'seth.testassessor06@example.com', 'OFF3006'),
    ('USR-T3007', 'Iris Testiqa02', 'iris.testiqa02@example.com', 'OFF3007')
  AS v (USERID, DISPLAYNAME, EMAIL, OFFICERREFNUMBER)) s
  ON t.USERID = s.USERID
WHEN NOT MATCHED THEN INSERT (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, OFFICERREFNUMBER, ISTESTDATA, CREATEDBY)
  VALUES (s.USERID, 'ORG-T003', s.DISPLAYNAME, s.EMAIL, s.OFFICERREFNUMBER, TRUE, 'journeys_01_org.sql');

MERGE INTO SHARED_DB.ACCESS.USER_ROLE t
USING (SELECT * FROM VALUES
    ('RG-USR-T3001-MANAGER', 'USR-T3001', 'MANAGER'),
    ('RG-USR-T3002-MANAGER', 'USR-T3002', 'MANAGER'),
    ('RG-USR-T3003-TUTOR', 'USR-T3003', 'TUTOR'),
    ('RG-USR-T3004-TUTOR', 'USR-T3004', 'TUTOR'),
    ('RG-USR-T3005-ASSESSOR', 'USR-T3005', 'ASSESSOR'),
    ('RG-USR-T3006-ASSESSOR', 'USR-T3006', 'ASSESSOR'),
    ('RG-USR-T3007-IQA', 'USR-T3007', 'IQA')
  AS v (ROLEGRANTID, USERID, ROLE)) s
  ON t.ROLEGRANTID = s.ROLEGRANTID
WHEN NOT MATCHED THEN INSERT (ROLEGRANTID, USERID, ROLE, GRANTEDBY, ISTESTDATA)
  VALUES (s.ROLEGRANTID, s.USERID, s.ROLE, 'journeys_01_org.sql', TRUE);

-- The CRM's default pipelines, stages and close reasons for ORG-T003 (the
-- same statements as sql/crm_01_database.sql, which made them for every
-- organisation there was then; an organisation already done is skipped).
INSERT INTO CRM_DB.CRM.PIPELINE (PIPELINEID, ORGANISATIONID, KIND, NAME, CREATEDBY, ISTESTDATA)
SELECT 'PL-' || o.ORGANISATIONID || '-' || UPPER(k.KIND), o.ORGANISATIONID, k.KIND, k.NAME, 'setup', o.ISTESTDATA
FROM SHARED_DB.ACCESS.ORGANISATION o
CROSS JOIN (SELECT 'candidate' AS KIND, 'Candidates' AS NAME UNION ALL SELECT 'employer', 'Employers') k
WHERE 'PL-' || o.ORGANISATIONID || '-' || UPPER(k.KIND) NOT IN (SELECT PIPELINEID FROM CRM_DB.CRM.PIPELINE);

INSERT INTO CRM_DB.CRM.PIPELINE_STAGE (STAGEID, PIPELINEID, ORGANISATIONID, NAME, SORTORDER, CATEGORY, SYSTEMKEY, CREATEDBY, ISTESTDATA)
SELECT 'ST-' || o.ORGANISATIONID || '-' || UPPER(s.KIND) || '-' || s.STAGEKEY, 'PL-' || o.ORGANISATIONID || '-' || UPPER(s.KIND),
       o.ORGANISATIONID, s.NAME, s.SORTORDER, s.CATEGORY, s.SYSTEMKEY, 'setup', o.ISTESTDATA
FROM SHARED_DB.ACCESS.ORGANISATION o
CROSS JOIN (SELECT * FROM VALUES
  ('candidate', 'NEW', 'New', 1, 'open', 'NEW'),
  ('candidate', 'CONFIRMED', 'Confirmed', 2, 'open', 'CONFIRMED'),
  ('candidate', 'CONTACTED', 'Contacted', 3, 'open', NULL),
  ('candidate', 'MATCHED', 'Matched', 4, 'open', NULL),
  ('candidate', 'INTERVIEWING', 'Interviewing', 5, 'open', NULL),
  ('candidate', 'OFFERED', 'Offered', 6, 'open', NULL),
  ('candidate', 'ASSESSMENT', 'Initial assessment', 7, 'open', 'ASSESSMENT'),
  ('candidate', 'ENROLLED', 'Enrolled', 8, 'won', 'ENROLLED'),
  ('candidate', 'LOST', 'Not proceeding', 9, 'lost', 'LOST'),
  ('employer', 'PROSPECT', 'Prospect', 1, 'open', 'PROSPECT'),
  ('employer', 'CONTACTED', 'Contacted', 2, 'open', NULL),
  ('employer', 'MEETING', 'Meeting', 3, 'open', NULL),
  ('employer', 'AGREED', 'Vacancy agreed', 4, 'open', NULL),
  ('employer', 'PLACED', 'Apprentice placed', 5, 'won', 'PLACED'),
  ('employer', 'LOST', 'Not proceeding', 6, 'lost', 'LOST')
  AS x (KIND, STAGEKEY, NAME, SORTORDER, CATEGORY, SYSTEMKEY)) s
WHERE 'ST-' || o.ORGANISATIONID || '-' || UPPER(s.KIND) || '-' || s.STAGEKEY NOT IN (SELECT STAGEID FROM CRM_DB.CRM.PIPELINE_STAGE);

INSERT INTO CRM_DB.CRM.CLOSE_REASON (REASONID, PIPELINEID, ORGANISATIONID, LABEL, SORTORDER, CREATEDBY, ISTESTDATA)
SELECT 'CR-' || o.ORGANISATIONID || '-' || UPPER(r.KIND) || '-' || r.REASONKEY, 'PL-' || o.ORGANISATIONID || '-' || UPPER(r.KIND),
       o.ORGANISATIONID, r.LABEL, r.SORTORDER, 'setup', o.ISTESTDATA
FROM SHARED_DB.ACCESS.ORGANISATION o
CROSS JOIN (SELECT * FROM VALUES
  ('candidate', 'COLLEGE', 'Chose college or sixth form', 1),
  ('candidate', 'OTHER_JOB', 'Found other work', 2),
  ('candidate', 'NOT_ELIGIBLE', 'Not eligible', 3),
  ('candidate', 'NO_RESPONSE', 'No response', 4),
  ('candidate', 'CHANGED_MIND', 'Changed their mind', 5),
  ('employer', 'NOT_NOW', 'Not the right time', 6),
  ('employer', 'OTHER_PROVIDER', 'Chose another provider', 7),
  ('employer', 'NO_ROLE', 'No suitable role', 8),
  ('employer', 'NO_RESPONSE', 'No response', 9)
  AS x (KIND, REASONKEY, LABEL, SORTORDER)) r
WHERE 'CR-' || o.ORGANISATIONID || '-' || UPPER(r.KIND) || '-' || r.REASONKEY NOT IN (SELECT REASONID FROM CRM_DB.CRM.CLOSE_REASON);
