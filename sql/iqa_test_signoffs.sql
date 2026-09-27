-- DUMMY SIGN-OFFS FOR TESTING THE IQA RULE (nobody checks their own sign-off).
--
-- TEST DATA ONLY. Adds three pieces of evidence, each signed off by an
-- assessor, so the IQA screens have something to check:
--   EVT-IQA-0001  TESTL0001, signed off by Kay (OFF0001)    ORG-T001
--   EVT-IQA-0002  TESTL0010, signed off by Ada (OFF0006)    ORG-T001
--   EVT-IQA-0003  TESTL0014, signed off by Asha (OFF0013)   ORG-T002
-- Ada (USR-T0006, assessor and IQA) should see only Kay's, and be refused
-- if she tries to check her own. Ivy (USR-T0007, IQA) should see Kay's and
-- Ada's. Neither sees Asha's, which is in the other organisation.
--
-- The BURROW tables have no ISTESTDATA column, so these rows are marked by
-- their ids instead: every EVIDENCE_ID starts EVT- and every REVIEW_ID
-- starts RVT-, on TESTL learners, and every title starts TEST. IQA checks
-- recorded against them in the app can be found by REVIEW_ID LIKE 'RVT-%'.
--
-- The KSBs aren't loaded yet, so this evidence claims no KSBs, and its
-- review's KSB_DECISIONS is an empty list. It doesn't change any learner's
-- KSB progress.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, after the four
-- roles and permissions files. Safe to run twice: every row has a fixed id
-- and is only added if it isn't there already.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;


-- ---------------------------------------------------------------------------
-- Evidence, already signed off. Standard and ST reference come from each
-- learner's programme aim.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.BURROW.EVIDENCE t
USING (
  SELECT v.EVIDENCE_ID, v.LEARNREFNUMBER, ld.STDCODE, s.REFERENCE AS ST_REFERENCE, v.TITLE,
         v.OCCURRED_ON::DATE AS OCCURRED_ON, v.REFLECTION, v.SUBMITTED_AT::TIMESTAMP_LTZ AS SUBMITTED_AT,
         v.SIGNED_OFF_AT::TIMESTAMP_LTZ AS SIGNED_OFF_AT, v.ASSESSOR
  FROM (VALUES
      ('EVT-IQA-0001', 'TESTL0001', 'TEST Handling a customer complaint', '2026-09-08',
       'TEST reflection: I dealt with a customer complaint about a late delivery and agreed a refund with my manager.',
       '2026-09-10 09:00:00', '2026-09-15 14:00:00', 'OFF0001'),
      ('EVT-IQA-0002', 'TESTL0010', 'TEST Weekly stock check', '2026-09-09',
       'TEST reflection: I ran the weekly stock check on my own for the first time and found two errors in the count.',
       '2026-09-11 09:00:00', '2026-09-16 14:00:00', 'OFF0006'),
      ('EVT-IQA-0003', 'TESTL0014', 'TEST Opening the store', '2026-09-07',
       'TEST reflection: I opened the store with the duty manager and did the safety checks.',
       '2026-09-09 09:00:00', '2026-09-14 14:00:00', 'OFF0013')
    ) AS v (EVIDENCE_ID, LEARNREFNUMBER, TITLE, OCCURRED_ON, REFLECTION, SUBMITTED_AT, SIGNED_OFF_AT, ASSESSOR)
  JOIN CAPTURE_DB.ILR.LEARNING_DELIVERY ld
    ON ld.LEARNREFNUMBER = v.LEARNREFNUMBER AND ld.LEARNAIMREF = 'ZPROG001' AND ld.AIMSEQNUMBER = 1
  JOIN CAPTURE_DB.LARS.STANDARD s
    ON s.STANDARD_CODE = ld.STDCODE
) s
  ON t.EVIDENCE_ID = s.EVIDENCE_ID
WHEN NOT MATCHED THEN INSERT (EVIDENCE_ID, LEARNREFNUMBER, STDCODE, ST_REFERENCE, TITLE, EVIDENCE_TYPE, OCCURRED_ON,
                              REFLECTION, STATUS, SUBMISSION_COUNT, CREATED_AT, CREATED_BY, UPDATED_AT, UPDATED_BY,
                              SUBMITTED_AT, SIGNED_OFF_AT, SIGNED_OFF_BY)
  VALUES (s.EVIDENCE_ID, s.LEARNREFNUMBER, s.STDCODE, s.ST_REFERENCE, s.TITLE, 'reflection', s.OCCURRED_ON,
          s.REFLECTION, 'signed_off', 1, s.SUBMITTED_AT, s.LEARNREFNUMBER, s.SIGNED_OFF_AT, s.ASSESSOR,
          s.SUBMITTED_AT, s.SIGNED_OFF_AT, s.ASSESSOR);


-- ---------------------------------------------------------------------------
-- The assessor's sign-off review of each. Names come from the officer
-- records, as the app will record them.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.BURROW.EVIDENCE_REVIEW t
USING (
  SELECT v.REVIEW_ID, e.EVIDENCE_ID, e.SIGNED_OFF_BY AS OFFICERREFNUMBER, o.OFFICERNAME, e.SIGNED_OFF_AT,
         v.FEEDBACK,
         PARSE_JSON('[]') AS KSB_DECISIONS,
         OBJECT_CONSTRUCT('title', e.TITLE, 'evidence_type', e.EVIDENCE_TYPE, 'occurred_on', e.OCCURRED_ON,
                          'reflection', e.REFLECTION, 'file_ids', ARRAY_CONSTRUCT(), 'ksbs', ARRAY_CONSTRUCT())
           AS EVIDENCE_SNAPSHOT
  FROM (VALUES
      ('RVT-IQA-0001', 'EVT-IQA-0001', 'TEST feedback: Good account of the complaint and how you resolved it.'),
      ('RVT-IQA-0002', 'EVT-IQA-0002', 'TEST feedback: Clear reflection on what went wrong with the count.'),
      ('RVT-IQA-0003', 'EVT-IQA-0003', 'TEST feedback: Well done on the safety checks.')
    ) AS v (REVIEW_ID, EVIDENCE_ID, FEEDBACK)
  JOIN CAPTURE_DB.BURROW.EVIDENCE e ON e.EVIDENCE_ID = v.EVIDENCE_ID
  JOIN CAPTURE_DB.ILR.OFFICER o ON o.OFFICERREFNUMBER = e.SIGNED_OFF_BY
) s
  ON t.REVIEW_ID = s.REVIEW_ID
WHEN NOT MATCHED THEN INSERT (REVIEW_ID, EVIDENCE_ID, SUBMISSION_NUMBER, OFFICERREFNUMBER, OFFICER_NAME, REVIEWED_AT,
                              OUTCOME, FEEDBACK, KSB_DECISIONS, EVIDENCE_SNAPSHOT)
  VALUES (s.REVIEW_ID, s.EVIDENCE_ID, 1, s.OFFICERREFNUMBER, s.OFFICERNAME, s.SIGNED_OFF_AT,
          'signed_off', s.FEEDBACK, s.KSB_DECISIONS, s.EVIDENCE_SNAPSHOT);


-- ---------------------------------------------------------------------------
-- Checks. Each is one line, so it runs on its own: put the cursor on the
-- line (or select the whole line) and run it.
-- ---------------------------------------------------------------------------
-- 1. Expected three rows:
--    RVT-IQA-0001  TESTL0001  OFF0001  Kay Testassessor01   ORG-T001
--    RVT-IQA-0002  TESTL0010  OFF0006  Ada Testassessoriqa  ORG-T001
--    RVT-IQA-0003  TESTL0014  OFF0013  Asha Testassessor04  ORG-T002
SELECT r.REVIEW_ID, e.LEARNREFNUMBER, r.OFFICERREFNUMBER, r.OFFICER_NAME, l.ORGANISATIONID, e.STATUS, r.OUTCOME FROM CAPTURE_DB.BURROW.EVIDENCE_REVIEW r JOIN CAPTURE_DB.BURROW.EVIDENCE e ON e.EVIDENCE_ID = r.EVIDENCE_ID JOIN CAPTURE_DB.ILR.LEARNER l ON l.LEARNREFNUMBER = e.LEARNREFNUMBER WHERE r.REVIEW_ID LIKE 'RVT-%' ORDER BY r.REVIEW_ID;

-- 2. IQA checks recorded against the test sign-offs so far (none until you
--    record some in the app). Expected: CHECKED_OWN_SIGN_OFF is FALSE on
--    every row.
SELECT c.REVIEW_ID, c.ASSESSOR_OFFICERREFNUMBER, c.IQA_OFFICERREFNUMBER, c.IQA_NAME, c.OUTCOME, c.CHECKED_AT, c.ASSESSOR_OFFICERREFNUMBER = c.IQA_OFFICERREFNUMBER AS CHECKED_OWN_SIGN_OFF FROM CAPTURE_DB.BURROW.IQA_CHECK c WHERE c.REVIEW_ID LIKE 'RVT-%' ORDER BY c.CHECKED_AT;
