-- DUMMY WITNESS STATEMENTS FOR TESTING THE EMPLOYER SCREEN IN BURROW.
--
-- TEST DATA ONLY. The KSBs aren't loaded yet, so learners can't send
-- evidence for review in Burrow (it needs at least one KSB). This adds
-- witness statements already sent, so employers have something to confirm:
--   EVT-WIT-0001  TESTL0001 Alex    submitted  Erin (EMP-T001) confirms or declines
--   EVT-WIT-0002  TESTL0004 Taylor  submitted  Erin (EMP-T001) confirms or declines
--   EVT-WIT-0003  TESTL0002 Sam     submitted  Cole (EMP-T002) confirms or declines
--   EVT-WIT-0004  TESTL0014 Nova    submitted  Tess (EMP-T004), the other organisation
--   EVT-WIT-0005  TESTL0007 Riley   draft      nobody: not sent yet
-- Erin should see 0001 and 0002 only, Cole 0003 only, Tess 0004 only.
--
-- Marked like the IQA test data: EVIDENCE_IDs start EVT-, on TESTL
-- learners, and every title starts TEST. Answers recorded in the app are in
-- BURROW.WITNESS_CONFIRMATION with EVIDENCE_ID LIKE 'EVT-WIT-%'. They claim
-- no KSBs and have no files. CREATED_BY is the learner's USERID, as the app
-- now records it.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. Safe to run twice:
-- every row has a fixed id and is only added if it isn't there already.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

MERGE INTO CAPTURE_DB.BURROW.EVIDENCE t
USING (
  SELECT v.EVIDENCE_ID, v.LEARNREFNUMBER, ld.STDCODE, s.REFERENCE AS ST_REFERENCE, v.TITLE,
         v.OCCURRED_ON::DATE AS OCCURRED_ON, v.REFLECTION, v.STATUS,
         IFF(v.STATUS = 'submitted', 1, 0) AS SUBMISSION_COUNT,
         v.CREATED_AT::TIMESTAMP_LTZ AS CREATED_AT,
         IFF(v.STATUS = 'submitted', v.CREATED_AT::TIMESTAMP_LTZ, NULL) AS SUBMITTED_AT,
         u.USERID
  FROM (VALUES
      ('EVT-WIT-0001', 'TESTL0001', 'TEST Witness: serving a queue of customers at the till', '2026-09-14',
       'TEST statement: My supervisor watched me serve a queue of twelve customers at the till on Saturday, and I kept each one informed about the wait.',
       'submitted', '2026-09-18 10:00:00'),
      ('EVT-WIT-0002', 'TESTL0004', 'TEST Witness: handling a refund', '2026-09-15',
       'TEST statement: My manager saw me process a refund for a faulty kettle, check the receipt, and explain the returns policy.',
       'submitted', '2026-09-19 10:00:00'),
      ('EVT-WIT-0003', 'TESTL0002', 'TEST Witness: helping a resident at mealtime', '2026-09-16',
       'TEST statement: The senior carer watched me help a resident choose their lunch and record what they ate.',
       'submitted', '2026-09-20 10:00:00'),
      ('EVT-WIT-0004', 'TESTL0014', 'TEST Witness: closing the store', '2026-09-17',
       'TEST statement: The duty manager watched me cash up and lock up at the end of the day.',
       'submitted', '2026-09-21 10:00:00'),
      ('EVT-WIT-0005', 'TESTL0007', 'TEST Witness: restocking shelves (draft)', '2026-09-18',
       'TEST statement: Not sent yet.',
       'draft', '2026-09-22 10:00:00')
    ) AS v (EVIDENCE_ID, LEARNREFNUMBER, TITLE, OCCURRED_ON, REFLECTION, STATUS, CREATED_AT)
  JOIN CAPTURE_DB.ILR.LEARNING_DELIVERY ld
    ON ld.LEARNREFNUMBER = v.LEARNREFNUMBER AND ld.LEARNAIMREF = 'ZPROG001' AND ld.AIMSEQNUMBER = 1
  JOIN CAPTURE_DB.LARS.STANDARD s
    ON s.STANDARD_CODE = ld.STDCODE
  JOIN CAPTURE_DB.ACCESS.APP_USER u
    ON u.LEARNREFNUMBER = v.LEARNREFNUMBER
) s
  ON t.EVIDENCE_ID = s.EVIDENCE_ID
WHEN NOT MATCHED THEN INSERT (EVIDENCE_ID, LEARNREFNUMBER, STDCODE, ST_REFERENCE, TITLE, EVIDENCE_TYPE, OCCURRED_ON,
                              REFLECTION, STATUS, SUBMISSION_COUNT, CREATED_AT, CREATED_BY, UPDATED_AT, UPDATED_BY,
                              SUBMITTED_AT)
  VALUES (s.EVIDENCE_ID, s.LEARNREFNUMBER, s.STDCODE, s.ST_REFERENCE, s.TITLE, 'witness_statement', s.OCCURRED_ON,
          s.REFLECTION, s.STATUS, s.SUBMISSION_COUNT, s.CREATED_AT, s.USERID, s.CREATED_AT, s.USERID,
          s.SUBMITTED_AT);


-- ---------------------------------------------------------------------------
-- Checks. Each is one line, so it runs on its own.
-- ---------------------------------------------------------------------------
-- 1. Expected five rows: 0001 to 0004 submitted, 0005 draft.
SELECT e.EVIDENCE_ID, e.LEARNREFNUMBER, l.ORGANISATIONID, e.STATUS, e.SUBMISSION_COUNT, e.CREATED_BY, e.TITLE FROM CAPTURE_DB.BURROW.EVIDENCE e JOIN CAPTURE_DB.ILR.LEARNER l ON l.LEARNREFNUMBER = e.LEARNREFNUMBER WHERE e.EVIDENCE_ID LIKE 'EVT-WIT-%' ORDER BY e.EVIDENCE_ID;

-- 2. Employers' answers recorded in the app so far.
SELECT c.EVIDENCE_ID, c.SUBMISSION_NUMBER, c.EMPLOYERID, c.CONFIRMED_BY, c.CONFIRMER_NAME, c.OUTCOME, c.COMMENT_TEXT, c.CONFIRMED_AT FROM CAPTURE_DB.BURROW.WITNESS_CONFIRMATION c WHERE c.EVIDENCE_ID LIKE 'EVT-WIT-%' ORDER BY c.CONFIRMED_AT;
