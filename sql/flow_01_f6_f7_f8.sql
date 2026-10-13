-- Test journeys, file 2 of 3, and the first flows of the CRM design: F6
-- hand-over, F7 onboarding status (with F9, the placed apprentice) and F8
-- won employer. Run after sql/journeys_01_org.sql.
--
-- The CRM design doc: https://claude.ai/code/artifact/33499d3d-8002-442b-90cf-5277e78bdf39
-- ("How flows run and are logged"). Decided 11 October 2026 (Alan): build
-- F6, F7 and F8 now; F6 lands in a new CAPTURE_DB.ILR.ONBOARDING table
-- (stage 2 and 3 aren't built yet); candidates get the new CANDIDATE role.
--
-- How every flow works:
--   - A stored procedure in SHARED_DB.FLOW, owned by FLOW_OWNER and run with
--     its owner's rights, so neither app role needs any right on the other
--     side. Each app role gets USAGE on exactly the flows it calls: the CRM
--     (CRM_APP_ROLE) F6 and F8; Warren (ILR_APP_ROLE) F7.
--   - Arguments are record IDs and the signed-in user's ID, never data. The
--     procedure reads what it needs, checks the user is an active manager
--     in the record's organisation, and takes the organisation and the test
--     flag from the records. A test record never moves into a real
--     organisation or the reverse: the user, the organisation and every
--     record must agree on ISTESTDATA.
--   - Every call is logged in SHARED_DB.OPS.FLOW_RUN, refused or not, with
--     IDs and counts only. The writes and the log row are one transaction;
--     a failure rolls the writes back and logs why.
--   - Snowflake grants rights per table, not per column: "only the columns
--     the flow names" is kept by the procedures' own SQL, which names every
--     column it reads or writes. FLOW_OWNER gets only the tables below.
--
-- F6 hand-over (called by the CRM): F6_HANDOVER(placement ID, user ID).
--   The placement must be offered or accepted, its employer already a
--   client (F8 done), the lead's email confirmed and the lead not handed over
--   before. Makes the ILR.ONBOARDING record with the lead's stage 1 answers,
--   the candidate's sign-in (SHARED_DB.ACCESS.APP_USER, refused if the email
--   already has one) with the CANDIDATE role, and marks the lead handed
--   over. Returns the onboarding ID.
-- F7 onboarding status (called by Warren): F7_ONBOARDING_STATUS(onboarding
--   ID, user ID). Warren sets ILR.ONBOARDING.STATUS (stage2, stage3,
--   enrolled, not_proceeding); F7 mirrors it into the CRM: the lead's
--   journey moves to Initial assessment, Enrolled (with the learner
--   reference) or Not proceeding (with the reason), the placement follows,
--   and on enrolment the employer's journey moves to Apprentice placed (F9)
--   and the candidate's sign-in gets the LEARNER role and learner reference.
--   Calling it again changes nothing. A null user ID is the scheduler's
--   nightly reconcile: no user check, so it may only copy the status Warren
--   already holds into the CRM (the lead's journey and its stage history, the
--   placement, the lead's learner reference, the employer's journey) and
--   note what it copied (ONBOARDING.LASTREPORTEDSTATUS, OPS.FLOW_RUN). It
--   never touches sign-ins or roles: those change only when a manager calls
--   it, so a missed enrolment event is put right in the CRM by the reconcile
--   and on the sign-in by the next manager's call.
-- F8 won employer (called by the CRM): F8_WON_EMPLOYER(CRM employer ID,
--   chosen site IDs, chosen contact IDs, user ID). Makes the Warren employer
--   with the chosen sites and contacts, and links them back
--   (CRM.EMPLOYER.WARRENEMPLOYERID, CRM.CONTACT.WARRENCONTACTID). Company
--   details aren't copied: Warren refreshes from Companies House itself.
--   Returns the new employer ID.
--
-- FLOW_OWNER is granted to SYSADMIN (and so ACCOUNTADMIN) only, so this
-- file can replace its procedures when run again; no user holds it.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. Each procedure's COMMENT comes before
-- EXECUTE AS OWNER (Snowflake rejects the other order: "unexpected
-- 'COMMENT'", 13 October 2026), and the procedure bodies hold no comments:
-- what each step does is written above each procedure instead.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- CAPTURE_DB.ILR.ONBOARDING: where hand-over lands
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.ONBOARDING (
  ONBOARDINGID        VARCHAR(20)   NOT NULL COMMENT 'ONB- and 12 characters, made by F6.',
  ORGANISATIONID      VARCHAR(20)   NOT NULL,
  LEADID              VARCHAR(40)   NOT NULL COMMENT 'The CRM lead (CRM_DB.CRM.LEAD), by ID only.',
  PLACEMENTID         VARCHAR(40)   NOT NULL COMMENT 'The CRM placement handed over, by ID only.',
  CANDIDATEUSERID     VARCHAR(20)   COMMENT 'The sign-in F6 made (SHARED_DB.ACCESS.APP_USER).',
  GIVENNAMES          VARCHAR(100)  COMMENT 'Stage 1 answers, as given in the CRM at hand-over: shown pre-filled at stage 2.',
  FAMILYNAME          VARCHAR(100),
  EMAIL               VARCHAR(254),
  MOBILE              VARCHAR(20),
  DATEOFBIRTH         DATE,
  POSTCODE            VARCHAR(8),
  CURRENTSITUATION    VARCHAR(40),
  HASENGLISHLEVEL2    BOOLEAN,
  HASMATHSLEVEL2      BOOLEAN,
  EMPLOYERID          VARCHAR(20)   COMMENT 'The Warren employer (ILR.EMPLOYER), the CRM employer''s client record.',
  VACANCYREFERENCE    VARCHAR(20),
  STANDARDCODE        NUMBER(38,0)  COMMENT 'The apprenticeship standard (LARS).',
  STATUS              VARCHAR(20)   NOT NULL COMMENT 'handed_over, stage2, stage3, enrolled or not_proceeding. Set by Warren; F7 mirrors it to the CRM.',
  STATUSCHANGEDAT     TIMESTAMP_LTZ,
  NOTPROCEEDINGREASON VARCHAR(30)   COMMENT 'For not_proceeding: a candidate close reason key (NOT_ELIGIBLE, CHANGED_MIND, OTHER_JOB, NO_RESPONSE, COLLEGE).',
  LEARNREFNUMBER      VARCHAR(12)   COMMENT 'The learner made at enrolment (ILR.LEARNER).',
  HANDEDOVERAT        TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  HANDEDOVERBY        VARCHAR(20)   NOT NULL COMMENT 'The manager who pressed Start initial assessment.',
  LASTREPORTEDSTATUS  VARCHAR(20)   COMMENT 'The status F7 last mirrored to the CRM.',
  LASTREPORTEDAT      TIMESTAMP_LTZ,
  UPDATEDAT           TIMESTAMP_LTZ,
  UPDATEDBY           VARCHAR(40),
  ISTESTDATA          BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_ONBOARDING PRIMARY KEY (ONBOARDINGID)
)
COMMENT = 'A candidate handed over from the CRM (flow F6), through stage 2 (initial assessment) and stage 3 (documents) to enrolment. Made only by F6; Warren updates its status.';

-- Warren reads it and moves it on; only F6 adds to it. The ILR schema has
-- FUTURE grants that give the app INSERT on every new table
-- (docs/before-real-data.md), so INSERT is taken away here.
GRANT SELECT, UPDATE ON TABLE CAPTURE_DB.ILR.ONBOARDING TO ROLE ILR_APP_ROLE;
REVOKE INSERT ON TABLE CAPTURE_DB.ILR.ONBOARDING FROM ROLE ILR_APP_ROLE;

-- ---------------------------------------------------------------------------
-- FLOW_OWNER: the tables the three flows read and write
-- ---------------------------------------------------------------------------
GRANT ROLE FLOW_OWNER TO ROLE SYSADMIN;

GRANT USAGE ON DATABASE CRM_DB TO ROLE FLOW_OWNER;
GRANT USAGE ON SCHEMA CRM_DB.CRM TO ROLE FLOW_OWNER;
GRANT SELECT ON TABLE CRM_DB.CRM.PIPELINE_STAGE TO ROLE FLOW_OWNER;
GRANT SELECT ON TABLE CRM_DB.CRM.CLOSE_REASON TO ROLE FLOW_OWNER;
GRANT SELECT ON TABLE CRM_DB.CRM.EMPLOYER_SITE TO ROLE FLOW_OWNER;
GRANT SELECT, UPDATE ON TABLE CRM_DB.CRM.LEAD TO ROLE FLOW_OWNER;
GRANT SELECT, UPDATE ON TABLE CRM_DB.CRM.PLACEMENT TO ROLE FLOW_OWNER;
GRANT SELECT, UPDATE ON TABLE CRM_DB.CRM.EMPLOYER TO ROLE FLOW_OWNER;
GRANT SELECT, UPDATE ON TABLE CRM_DB.CRM.CONTACT TO ROLE FLOW_OWNER;
GRANT SELECT, UPDATE ON TABLE CRM_DB.CRM.PIPELINE_ITEM TO ROLE FLOW_OWNER;
GRANT INSERT ON TABLE CRM_DB.CRM.STAGE_CHANGE TO ROLE FLOW_OWNER;

GRANT USAGE ON DATABASE CAPTURE_DB TO ROLE FLOW_OWNER;
GRANT USAGE ON SCHEMA CAPTURE_DB.ILR TO ROLE FLOW_OWNER;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.ONBOARDING TO ROLE FLOW_OWNER;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.LEARNER TO ROLE FLOW_OWNER;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.ILR.EMPLOYER TO ROLE FLOW_OWNER;
GRANT INSERT ON TABLE CAPTURE_DB.ILR.EMPLOYER_SITE TO ROLE FLOW_OWNER;
GRANT INSERT ON TABLE CAPTURE_DB.ILR.EMPLOYER_CONTACT TO ROLE FLOW_OWNER;

GRANT USAGE ON SCHEMA SHARED_DB.ACCESS TO ROLE FLOW_OWNER;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.ORGANISATION TO ROLE FLOW_OWNER;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.ACCESS.APP_USER TO ROLE FLOW_OWNER;
GRANT SELECT, INSERT ON TABLE SHARED_DB.ACCESS.USER_ROLE TO ROLE FLOW_OWNER;

-- ---------------------------------------------------------------------------
-- F6: hand-over (CRM to learning)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE SHARED_DB.FLOW.F6_HANDOVER(PLACEMENTID VARCHAR, USERID VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
COMMENT = 'F6 hand-over: a CRM placement''s candidate becomes an onboarding record in Warren, with a candidate sign-in. Called by the CRM. Logged in OPS.FLOW_RUN.'
EXECUTE AS OWNER
AS
$$
DECLARE
  run_id VARCHAR DEFAULT UUID_STRING();
  started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
  reason VARCHAR;
  err VARCHAR;
  n INTEGER;
  org VARCHAR;
  lead_id VARCHAR;
  crm_emp VARCHAR;
  pl_status VARCHAR;
  test BOOLEAN;
  org_test BOOLEAN;
  lead_n INTEGER;
  lead_test BOOLEAN;
  confirmed TIMESTAMP_LTZ;
  handed TIMESTAMP_LTZ;
  anonymised TIMESTAMP_LTZ;
  email VARCHAR;
  emp_test BOOLEAN;
  warren_emp VARCHAR;
  emp_ok INTEGER;
  manager_ok INTEGER;
  email_taken INTEGER;
  onb_id VARCHAR;
  cand_user VARCHAR;
BEGIN
  SELECT COUNT(*), MAX(ORGANISATIONID), MAX(LEADID), MAX(EMPLOYERID), MAX(STATUS), BOOLOR_AGG(ISTESTDATA)
    INTO :n, :org, :lead_id, :crm_emp, :pl_status, :test
    FROM CRM_DB.CRM.PLACEMENT WHERE PLACEMENTID = :PLACEMENTID;
  SELECT BOOLOR_AGG(ISTESTDATA) INTO :org_test FROM SHARED_DB.ACCESS.ORGANISATION WHERE ORGANISATIONID = :org;
  SELECT COUNT(*), BOOLOR_AGG(ISTESTDATA), MAX(EMAILCONFIRMEDAT), MAX(HANDEDOVERAT), MAX(ANONYMISEDAT), MAX(EMAIL)
    INTO :lead_n, :lead_test, :confirmed, :handed, :anonymised, :email
    FROM CRM_DB.CRM.LEAD WHERE LEADID = :lead_id AND ORGANISATIONID = :org;
  SELECT MAX(WARRENEMPLOYERID), BOOLOR_AGG(ISTESTDATA) INTO :warren_emp, :emp_test
    FROM CRM_DB.CRM.EMPLOYER WHERE EMPLOYERID = :crm_emp AND ORGANISATIONID = :org;
  SELECT COUNT(*) INTO :emp_ok FROM CAPTURE_DB.ILR.EMPLOYER
    WHERE EMPLOYERID = :warren_emp AND ORGANISATIONID = :org AND ISTESTDATA = :test AND COALESCE(ISACTIVE, TRUE);
  SELECT COUNT(*) INTO :manager_ok
    FROM SHARED_DB.ACCESS.APP_USER u JOIN SHARED_DB.ACCESS.USER_ROLE r ON r.USERID = u.USERID AND r.ROLE = 'MANAGER' AND r.REVOKEDAT IS NULL
    WHERE u.USERID = :USERID AND u.ORGANISATIONID = :org AND u.ISACTIVE AND u.ISTESTDATA = :test;
  SELECT COUNT(*) INTO :email_taken FROM SHARED_DB.ACCESS.APP_USER WHERE LOWER(EMAIL) = LOWER(:email) AND ISACTIVE;

  IF (n = 0) THEN reason := 'No such placement.';
  ELSEIF (manager_ok = 0) THEN reason := 'The user is not an active manager in the placement''s organisation (or their test flag differs).';
  ELSEIF (org_test IS DISTINCT FROM test OR lead_test IS DISTINCT FROM test OR emp_test IS DISTINCT FROM test) THEN reason := 'The organisation, lead and employer don''t all have the placement''s test flag.';
  ELSEIF (pl_status NOT IN ('offered', 'accepted')) THEN reason := 'The placement is ' || pl_status || ': only an offered or accepted placement can be handed over.';
  ELSEIF (lead_n = 0) THEN reason := 'The placement''s lead is not in its organisation.';
  ELSEIF (confirmed IS NULL) THEN reason := 'The lead hasn''t confirmed their email.';
  ELSEIF (handed IS NOT NULL) THEN reason := 'The lead has already been handed over.';
  ELSEIF (anonymised IS NOT NULL) THEN reason := 'The lead has been anonymised.';
  ELSEIF (email IS NULL) THEN reason := 'The lead has no email.';
  ELSEIF (email_taken > 0) THEN reason := 'That email already has a sign-in.';
  ELSEIF (warren_emp IS NULL) THEN reason := 'The employer isn''t a client yet: make it one first (F8).';
  ELSEIF (emp_ok = 0) THEN reason := 'The employer''s Warren record is missing, inactive or in another organisation.';
  END IF;

  IF (reason IS NOT NULL) THEN
    INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, ERROR)
      SELECT :run_id, 'F6', 'event', :USERID, :started, CURRENT_TIMESTAMP(), 'refused', OBJECT_CONSTRUCT('placementId', :PLACEMENTID), :reason;
    RETURN OBJECT_CONSTRUCT('outcome', 'refused', 'reason', reason, 'flowRunId', run_id);
  END IF;

  onb_id := 'ONB-' || UPPER(LEFT(REPLACE(UUID_STRING(), '-', ''), 12));
  cand_user := 'USR-' || UPPER(LEFT(REPLACE(UUID_STRING(), '-', ''), 12));
  BEGIN TRANSACTION;
  INSERT INTO CAPTURE_DB.ILR.ONBOARDING (ONBOARDINGID, ORGANISATIONID, LEADID, PLACEMENTID, CANDIDATEUSERID, GIVENNAMES, FAMILYNAME, EMAIL, MOBILE,
      DATEOFBIRTH, POSTCODE, CURRENTSITUATION, HASENGLISHLEVEL2, HASMATHSLEVEL2, EMPLOYERID, VACANCYREFERENCE, STANDARDCODE, STATUS, STATUSCHANGEDAT,
      HANDEDOVERAT, HANDEDOVERBY, ISTESTDATA)
    SELECT :onb_id, l.ORGANISATIONID, l.LEADID, p.PLACEMENTID, :cand_user, l.GIVENNAMES, l.FAMILYNAME, l.EMAIL, l.MOBILE,
      l.DATEOFBIRTH, l.POSTCODE, l.CURRENTSITUATION, l.HASENGLISHLEVEL2, l.HASMATHSLEVEL2, :warren_emp, p.VACANCYREFERENCE, p.STANDARDCODE,
      'handed_over', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), :USERID, l.ISTESTDATA
    FROM CRM_DB.CRM.LEAD l JOIN CRM_DB.CRM.PLACEMENT p ON p.LEADID = l.LEADID
    WHERE p.PLACEMENTID = :PLACEMENTID;
  INSERT INTO SHARED_DB.ACCESS.APP_USER (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, ISTESTDATA, CREATEDBY)
    SELECT :cand_user, ORGANISATIONID, TRIM(COALESCE(GIVENNAMES, '') || ' ' || COALESCE(FAMILYNAME, '')), EMAIL, ISTESTDATA, 'flow:F6'
    FROM CRM_DB.CRM.LEAD WHERE LEADID = :lead_id;
  INSERT INTO SHARED_DB.ACCESS.USER_ROLE (ROLEGRANTID, USERID, ROLE, GRANTEDBY, ISTESTDATA)
    SELECT 'RG-' || :cand_user || '-CANDIDATE', :cand_user, 'CANDIDATE', :USERID, :test;
  UPDATE CRM_DB.CRM.LEAD SET HANDEDOVERAT = CURRENT_TIMESTAMP(), UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F6' WHERE LEADID = :lead_id;
  INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, COUNTS)
    SELECT :run_id, 'F6', 'event', :USERID, :started, CURRENT_TIMESTAMP(), 'succeeded',
      OBJECT_CONSTRUCT('placementId', :PLACEMENTID, 'leadId', :lead_id, 'onboardingId', :onb_id, 'candidateUserId', :cand_user),
      OBJECT_CONSTRUCT('onboarding', 1, 'signIns', 1, 'roles', 1, 'leads', 1);
  COMMIT;
  RETURN OBJECT_CONSTRUCT('outcome', 'succeeded', 'flowRunId', run_id, 'onboardingId', onb_id, 'candidateUserId', cand_user);
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    err := LEFT(SQLERRM, 1000);
    INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, ERROR)
      SELECT :run_id, 'F6', 'event', :USERID, :started, CURRENT_TIMESTAMP(), 'failed', OBJECT_CONSTRUCT('placementId', :PLACEMENTID), :err;
    RETURN OBJECT_CONSTRUCT('outcome', 'failed', 'error', err, 'flowRunId', run_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- F7: onboarding status (learning to CRM), with F9 (the placed apprentice)
-- ---------------------------------------------------------------------------
-- Steps: read the onboarding record, the user's manager role, the lead's
-- open journey (or, if none is open, its latest) and the learner; refuse
-- and log if anything is wrong. Then, in one transaction: move the lead's
-- journey to the stage the status maps to, unless it's already there (or
-- there's nothing to mirror), with a stage history row; on enrolment, set
-- the lead's learner reference, mark the placement enrolled and move the
-- employer's open journey to Apprentice placed (F9), and, only when a
-- manager calls it, give the candidate's sign-in the learner reference and
-- the LEARNER role (the scheduler's reconcile never touches sign-ins or
-- roles); on not proceeding, withdraw the placement with the reason; note
-- the status reported; log the run.
CREATE OR REPLACE PROCEDURE SHARED_DB.FLOW.F7_ONBOARDING_STATUS(ONBOARDINGID VARCHAR, USERID VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
COMMENT = 'F7 onboarding status: mirrors an onboarding record''s status into the CRM (lead journey, placement, the employer''s journey on enrolment, and the candidate''s sign-in). Called by Warren; a null user is the scheduler''s reconcile. Logged in OPS.FLOW_RUN.'
EXECUTE AS OWNER
AS
$$
DECLARE
  run_id VARCHAR DEFAULT UUID_STRING();
  started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
  trig VARCHAR DEFAULT 'event';
  reason VARCHAR;
  err VARCHAR;
  n INTEGER;
  org VARCHAR;
  lead_id VARCHAR;
  placement_id VARCHAR;
  cand_user VARCHAR;
  status VARCHAR;
  reported VARCHAR;
  np_reason VARCHAR;
  learn_ref VARCHAR;
  test BOOLEAN;
  org_test BOOLEAN;
  manager_ok INTEGER;
  learner_ok INTEGER;
  item_id VARCHAR;
  item_stage VARCHAR;
  item_test BOOLEAN;
  target_key VARCHAR;
  target_stage VARCHAR;
  target_category VARCHAR;
  reason_id VARCHAR;
  reason_ok INTEGER;
  crm_emp VARCHAR;
  emp_item VARCHAR;
  emp_stage VARCHAR;
  placed_stage VARCHAR;
  moves INTEGER DEFAULT 0;
BEGIN
  IF (USERID IS NULL) THEN trig := 'schedule'; END IF;
  SELECT COUNT(*), MAX(ORGANISATIONID), MAX(LEADID), MAX(PLACEMENTID), MAX(CANDIDATEUSERID), MAX(STATUS), MAX(LASTREPORTEDSTATUS),
         MAX(NOTPROCEEDINGREASON), MAX(LEARNREFNUMBER), BOOLOR_AGG(ISTESTDATA)
    INTO :n, :org, :lead_id, :placement_id, :cand_user, :status, :reported, :np_reason, :learn_ref, :test
    FROM CAPTURE_DB.ILR.ONBOARDING WHERE ONBOARDINGID = :ONBOARDINGID;
  SELECT BOOLOR_AGG(ISTESTDATA) INTO :org_test FROM SHARED_DB.ACCESS.ORGANISATION WHERE ORGANISATIONID = :org;
  SELECT COUNT(*) INTO :manager_ok
    FROM SHARED_DB.ACCESS.APP_USER u JOIN SHARED_DB.ACCESS.USER_ROLE r ON r.USERID = u.USERID AND r.ROLE = 'MANAGER' AND r.REVOKEDAT IS NULL
    WHERE u.USERID = :USERID AND u.ORGANISATIONID = :org AND u.ISACTIVE AND u.ISTESTDATA = :test;
  SELECT MAX(ITEMID), MAX(STAGEID), BOOLOR_AGG(ISTESTDATA) INTO :item_id, :item_stage, :item_test
    FROM (SELECT ITEMID, STAGEID, ISTESTDATA FROM CRM_DB.CRM.PIPELINE_ITEM
          WHERE RECORDTYPE = 'lead' AND RECORDID = :lead_id AND ORGANISATIONID = :org
          QUALIFY ROW_NUMBER() OVER (ORDER BY (CLOSEDAT IS NULL) DESC, OPENEDAT DESC) = 1);
  SELECT COUNT(*) INTO :learner_ok FROM CAPTURE_DB.ILR.LEARNER
    WHERE LEARNREFNUMBER = :learn_ref AND ORGANISATIONID = :org AND ISTESTDATA = :test;

  target_key := CASE status WHEN 'stage2' THEN 'ASSESSMENT' WHEN 'stage3' THEN 'ASSESSMENT' WHEN 'enrolled' THEN 'ENROLLED'
                            WHEN 'not_proceeding' THEN 'LOST' ELSE NULL END;
  SELECT MAX(STAGEID), MAX(CATEGORY) INTO :target_stage, :target_category FROM CRM_DB.CRM.PIPELINE_STAGE
    WHERE PIPELINEID = 'PL-' || :org || '-CANDIDATE' AND SYSTEMKEY = :target_key AND ISACTIVE;
  reason_id := 'CR-' || org || '-CANDIDATE-' || COALESCE(np_reason, 'NOT_ELIGIBLE');
  SELECT COUNT(*) INTO :reason_ok FROM CRM_DB.CRM.CLOSE_REASON WHERE REASONID = :reason_id AND ISACTIVE;

  IF (n = 0) THEN reason := 'No such onboarding record.';
  ELSEIF (trig = 'event' AND manager_ok = 0) THEN reason := 'The user is not an active manager in the record''s organisation (or their test flag differs).';
  ELSEIF (org_test IS DISTINCT FROM test) THEN reason := 'The organisation''s test flag differs from the record''s.';
  ELSEIF (item_id IS NULL) THEN reason := 'The lead has no journey in the CRM.';
  ELSEIF (item_test IS DISTINCT FROM test) THEN reason := 'The CRM journey''s test flag differs from the record''s.';
  ELSEIF (status = 'enrolled' AND learner_ok = 0) THEN reason := 'Enrolled, but the learner reference is missing or not a learner in this organisation.';
  ELSEIF (status = 'not_proceeding' AND reason_ok = 0) THEN reason := 'Not proceeding, but the reason isn''t one of the organisation''s close reasons.';
  ELSEIF (target_key IS NOT NULL AND target_stage IS NULL) THEN reason := 'The organisation''s candidate pipeline has no ' || target_key || ' stage.';
  END IF;

  IF (reason IS NOT NULL) THEN
    INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, ERROR)
      SELECT :run_id, 'F7', :trig, :USERID, :started, CURRENT_TIMESTAMP(), 'refused', OBJECT_CONSTRUCT('onboardingId', :ONBOARDINGID), :reason;
    RETURN OBJECT_CONSTRUCT('outcome', 'refused', 'reason', reason, 'flowRunId', run_id);
  END IF;

  BEGIN TRANSACTION;
  IF (target_stage IS NOT NULL AND target_stage <> item_stage) THEN
    UPDATE CRM_DB.CRM.PIPELINE_ITEM
      SET STAGEID = :target_stage, STAGECHANGEDAT = CURRENT_TIMESTAMP(),
          CLOSEDAT = IFF(:target_category IN ('won', 'lost'), CURRENT_TIMESTAMP(), NULL),
          CLOSEREASONID = IFF(:target_category = 'lost', :reason_id, NULL),
          UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F7'
      WHERE ITEMID = :item_id;
    INSERT INTO CRM_DB.CRM.STAGE_CHANGE (CHANGEID, ITEMID, ORGANISATIONID, FROMSTAGEID, TOSTAGEID, CHANGEDBY, REASONID, ISTESTDATA)
      SELECT UUID_STRING(), :item_id, :org, :item_stage, :target_stage, 'flow:F7', IFF(:target_category = 'lost', :reason_id, NULL), :test;
    moves := moves + 1;
  END IF;
  IF (status = 'enrolled') THEN
    UPDATE CRM_DB.CRM.LEAD SET LEARNREFNUMBER = :learn_ref, UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F7'
      WHERE LEADID = :lead_id AND LEARNREFNUMBER IS DISTINCT FROM :learn_ref;
    UPDATE CRM_DB.CRM.PLACEMENT SET STATUS = 'enrolled', STATUSCHANGEDAT = CURRENT_TIMESTAMP(), UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F7'
      WHERE PLACEMENTID = :placement_id AND STATUS <> 'enrolled';
    SELECT MAX(EMPLOYERID) INTO :crm_emp FROM CRM_DB.CRM.PLACEMENT WHERE PLACEMENTID = :placement_id;
    SELECT MAX(ITEMID), MAX(STAGEID) INTO :emp_item, :emp_stage FROM CRM_DB.CRM.PIPELINE_ITEM
      WHERE RECORDTYPE = 'employer' AND RECORDID = :crm_emp AND CLOSEDAT IS NULL AND ORGANISATIONID = :org AND ISTESTDATA = :test;
    SELECT MAX(STAGEID) INTO :placed_stage FROM CRM_DB.CRM.PIPELINE_STAGE
      WHERE PIPELINEID = 'PL-' || :org || '-EMPLOYER' AND SYSTEMKEY = 'PLACED' AND ISACTIVE;
    IF (emp_item IS NOT NULL AND placed_stage IS NOT NULL AND emp_stage <> placed_stage) THEN
      UPDATE CRM_DB.CRM.PIPELINE_ITEM SET STAGEID = :placed_stage, STAGECHANGEDAT = CURRENT_TIMESTAMP(), CLOSEDAT = CURRENT_TIMESTAMP(),
          UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F7'
        WHERE ITEMID = :emp_item;
      INSERT INTO CRM_DB.CRM.STAGE_CHANGE (CHANGEID, ITEMID, ORGANISATIONID, FROMSTAGEID, TOSTAGEID, CHANGEDBY, ISTESTDATA)
        SELECT UUID_STRING(), :emp_item, :org, :emp_stage, :placed_stage, 'flow:F7', :test;
      moves := moves + 1;
    END IF;
    IF (trig = 'event') THEN
      UPDATE SHARED_DB.ACCESS.APP_USER SET LEARNREFNUMBER = :learn_ref WHERE USERID = :cand_user AND LEARNREFNUMBER IS DISTINCT FROM :learn_ref;
      INSERT INTO SHARED_DB.ACCESS.USER_ROLE (ROLEGRANTID, USERID, ROLE, GRANTEDBY, ISTESTDATA)
        SELECT 'RG-' || :cand_user || '-LEARNER', :cand_user, 'LEARNER', :USERID, :test
        WHERE :cand_user IS NOT NULL AND 'RG-' || :cand_user || '-LEARNER' NOT IN (SELECT ROLEGRANTID FROM SHARED_DB.ACCESS.USER_ROLE);
    END IF;
  END IF;
  IF (status = 'not_proceeding') THEN
    UPDATE CRM_DB.CRM.PLACEMENT SET STATUS = 'withdrawn', STATUSCHANGEDAT = CURRENT_TIMESTAMP(), OUTCOMEREASONID = :reason_id,
        UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F7'
      WHERE PLACEMENTID = :placement_id AND STATUS NOT IN ('withdrawn', 'declined');
  END IF;
  UPDATE CAPTURE_DB.ILR.ONBOARDING SET LASTREPORTEDSTATUS = :status, LASTREPORTEDAT = CURRENT_TIMESTAMP() WHERE ONBOARDINGID = :ONBOARDINGID;
  INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, COUNTS)
    SELECT :run_id, 'F7', :trig, :USERID, :started, CURRENT_TIMESTAMP(), 'succeeded',
      OBJECT_CONSTRUCT('onboardingId', :ONBOARDINGID, 'leadId', :lead_id, 'itemId', :item_id, 'employerItemId', :emp_item),
      OBJECT_CONSTRUCT('status', :status, 'stageMoves', :moves);
  COMMIT;
  RETURN OBJECT_CONSTRUCT('outcome', 'succeeded', 'flowRunId', run_id, 'status', status, 'stageMoves', moves);
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    err := LEFT(SQLERRM, 1000);
    INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, ERROR)
      SELECT :run_id, 'F7', :trig, :USERID, :started, CURRENT_TIMESTAMP(), 'failed', OBJECT_CONSTRUCT('onboardingId', :ONBOARDINGID), :err;
    RETURN OBJECT_CONSTRUCT('outcome', 'failed', 'error', err, 'flowRunId', run_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- F8: won employer (CRM to learning)
-- ---------------------------------------------------------------------------
-- Steps: read the CRM employer, the user's manager role and the chosen
-- sites and contacts; refuse and log if anything is wrong. Then, in one
-- transaction: make the Warren employer, its sites and contacts; the new
-- site and contact IDs are made from the run and the CRM ID, so the same
-- IDs can be written back to the CRM contacts; link the CRM employer and
-- contacts to them; log the run.
CREATE OR REPLACE PROCEDURE SHARED_DB.FLOW.F8_WON_EMPLOYER(EMPLOYERID VARCHAR, SITEIDS ARRAY, CONTACTIDS ARRAY, USERID VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
COMMENT = 'F8 won employer: a CRM prospect becomes a Warren employer with the chosen sites and contacts, linked back by ID. Called by the CRM. Logged in OPS.FLOW_RUN.'
EXECUTE AS OWNER
AS
$$
DECLARE
  run_id VARCHAR DEFAULT UUID_STRING();
  started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
  reason VARCHAR;
  err VARCHAR;
  n INTEGER;
  org VARCHAR;
  test BOOLEAN;
  org_test BOOLEAN;
  already VARCHAR;
  manager_ok INTEGER;
  sites_asked INTEGER;
  sites_ok INTEGER;
  contacts_asked INTEGER;
  contacts_ok INTEGER;
  warren_emp VARCHAR;
  site_n INTEGER;
  contact_n INTEGER;
BEGIN
  SELECT COUNT(*), MAX(ORGANISATIONID), BOOLOR_AGG(ISTESTDATA), MAX(WARRENEMPLOYERID)
    INTO :n, :org, :test, :already
    FROM CRM_DB.CRM.EMPLOYER WHERE EMPLOYERID = :EMPLOYERID AND ISACTIVE;
  SELECT BOOLOR_AGG(ISTESTDATA) INTO :org_test FROM SHARED_DB.ACCESS.ORGANISATION WHERE ORGANISATIONID = :org;
  SELECT COUNT(*) INTO :manager_ok
    FROM SHARED_DB.ACCESS.APP_USER u JOIN SHARED_DB.ACCESS.USER_ROLE r ON r.USERID = u.USERID AND r.ROLE = 'MANAGER' AND r.REVOKEDAT IS NULL
    WHERE u.USERID = :USERID AND u.ORGANISATIONID = :org AND u.ISACTIVE AND u.ISTESTDATA = :test;
  sites_asked := ARRAY_SIZE(ARRAY_DISTINCT(COALESCE(SITEIDS, ARRAY_CONSTRUCT())));
  contacts_asked := ARRAY_SIZE(ARRAY_DISTINCT(COALESCE(CONTACTIDS, ARRAY_CONSTRUCT())));
  SELECT COUNT(*) INTO :sites_ok FROM CRM_DB.CRM.EMPLOYER_SITE
    WHERE ARRAY_CONTAINS(SITEID::VARIANT, :SITEIDS) AND EMPLOYERID = :EMPLOYERID AND ISACTIVE AND POSTCODE IS NOT NULL AND ISTESTDATA = :test;
  SELECT COUNT(*) INTO :contacts_ok FROM CRM_DB.CRM.CONTACT
    WHERE ARRAY_CONTAINS(CONTACTID::VARIANT, :CONTACTIDS) AND EMPLOYERID = :EMPLOYERID AND ISCURRENT AND ISTESTDATA = :test;

  IF (n = 0) THEN reason := 'No such active CRM employer.';
  ELSEIF (manager_ok = 0) THEN reason := 'The user is not an active manager in the employer''s organisation (or their test flag differs).';
  ELSEIF (org_test IS DISTINCT FROM test) THEN reason := 'The organisation''s test flag differs from the employer''s.';
  ELSEIF (already IS NOT NULL) THEN reason := 'The employer is already a client (' || already || ').';
  ELSEIF (sites_asked = 0) THEN reason := 'Choose at least one site: Warren needs a workplace postcode.';
  ELSEIF (sites_ok <> sites_asked) THEN reason := 'A chosen site isn''t an active site of this employer with a postcode.';
  ELSEIF (contacts_ok <> contacts_asked) THEN reason := 'A chosen contact isn''t a current contact of this employer.';
  END IF;

  IF (reason IS NOT NULL) THEN
    INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, ERROR)
      SELECT :run_id, 'F8', 'event', :USERID, :started, CURRENT_TIMESTAMP(), 'refused',
        OBJECT_CONSTRUCT('employerId', :EMPLOYERID, 'siteIds', :SITEIDS, 'contactIds', :CONTACTIDS), :reason;
    RETURN OBJECT_CONSTRUCT('outcome', 'refused', 'reason', reason, 'flowRunId', run_id);
  END IF;

  warren_emp := 'EMP-' || UPPER(LEFT(REPLACE(UUID_STRING(), '-', ''), 12));
  BEGIN TRANSACTION;
  INSERT INTO CAPTURE_DB.ILR.EMPLOYER (EMPLOYERID, ORGANISATIONID, NAME, COMPANYNUMBER, NOTONCOMPANIESHOUSE, ISACTIVE, CREATEDBY, ISTESTDATA)
    SELECT :warren_emp, ORGANISATIONID, NAME, COMPANYNUMBER, IFF(NOTONCOMPANIESHOUSE, 'Not on Companies House (from the CRM)', NULL), TRUE, 'flow:F8', ISTESTDATA
    FROM CRM_DB.CRM.EMPLOYER WHERE EMPLOYERID = :EMPLOYERID;
  INSERT INTO CAPTURE_DB.ILR.EMPLOYER_SITE (SITEID, EMPLOYERID, NAME, ADDRESSLINE1, ADDRESSLINE2, TOWN, POSTCODE, CREATEDBY, ISTESTDATA)
    SELECT 'SITE-' || UPPER(LEFT(SHA2(:run_id || SITEID), 12)), :warren_emp, NAME, ADDRESSLINE1, ADDRESSLINE2, TOWN, POSTCODE, 'flow:F8', ISTESTDATA
    FROM CRM_DB.CRM.EMPLOYER_SITE WHERE ARRAY_CONTAINS(SITEID::VARIANT, :SITEIDS) AND EMPLOYERID = :EMPLOYERID;
  site_n := SQLROWCOUNT;
  INSERT INTO CAPTURE_DB.ILR.EMPLOYER_CONTACT (CONTACTID, EMPLOYERID, NAME, JOBTITLE, EMAIL, PHONE, CREATEDBY, ISTESTDATA)
    SELECT 'CON-' || UPPER(LEFT(SHA2(:run_id || CONTACTID), 12)), :warren_emp, NAME, JOBTITLE, EMAIL, PHONE, 'flow:F8', ISTESTDATA
    FROM CRM_DB.CRM.CONTACT WHERE ARRAY_CONTAINS(CONTACTID::VARIANT, :CONTACTIDS) AND EMPLOYERID = :EMPLOYERID;
  contact_n := SQLROWCOUNT;
  UPDATE CRM_DB.CRM.CONTACT SET WARRENCONTACTID = 'CON-' || UPPER(LEFT(SHA2(:run_id || CONTACTID), 12)), UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F8'
    WHERE ARRAY_CONTAINS(CONTACTID::VARIANT, :CONTACTIDS) AND EMPLOYERID = :EMPLOYERID;
  UPDATE CRM_DB.CRM.EMPLOYER SET WARRENEMPLOYERID = :warren_emp, BECAMECLIENTAT = CURRENT_TIMESTAMP(), UPDATEDAT = CURRENT_TIMESTAMP(), UPDATEDBY = 'flow:F8'
    WHERE EMPLOYERID = :EMPLOYERID;
  INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, COUNTS)
    SELECT :run_id, 'F8', 'event', :USERID, :started, CURRENT_TIMESTAMP(), 'succeeded',
      OBJECT_CONSTRUCT('employerId', :EMPLOYERID, 'warrenEmployerId', :warren_emp, 'siteIds', :SITEIDS, 'contactIds', :CONTACTIDS),
      OBJECT_CONSTRUCT('employers', 1, 'sites', :site_n, 'contacts', :contact_n);
  COMMIT;
  RETURN OBJECT_CONSTRUCT('outcome', 'succeeded', 'flowRunId', run_id, 'warrenEmployerId', warren_emp, 'sites', site_n, 'contacts', contact_n);
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    err := LEFT(SQLERRM, 1000);
    INSERT INTO SHARED_DB.OPS.FLOW_RUN (FLOWRUNID, FLOW, TRIGGEREDBY, BYUSERID, STARTEDAT, FINISHEDAT, OUTCOME, RECORDIDS, ERROR)
      SELECT :run_id, 'F8', 'event', :USERID, :started, CURRENT_TIMESTAMP(), 'failed', OBJECT_CONSTRUCT('employerId', :EMPLOYERID), :err;
    RETURN OBJECT_CONSTRUCT('outcome', 'failed', 'error', err, 'flowRunId', run_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- The procedures belong to FLOW_OWNER; each app role may call its own.
-- ---------------------------------------------------------------------------
GRANT OWNERSHIP ON PROCEDURE SHARED_DB.FLOW.F6_HANDOVER(VARCHAR, VARCHAR) TO ROLE FLOW_OWNER COPY CURRENT GRANTS;
GRANT OWNERSHIP ON PROCEDURE SHARED_DB.FLOW.F7_ONBOARDING_STATUS(VARCHAR, VARCHAR) TO ROLE FLOW_OWNER COPY CURRENT GRANTS;
GRANT OWNERSHIP ON PROCEDURE SHARED_DB.FLOW.F8_WON_EMPLOYER(VARCHAR, ARRAY, ARRAY, VARCHAR) TO ROLE FLOW_OWNER COPY CURRENT GRANTS;

GRANT USAGE ON SCHEMA SHARED_DB.FLOW TO ROLE CRM_APP_ROLE;
GRANT USAGE ON PROCEDURE SHARED_DB.FLOW.F6_HANDOVER(VARCHAR, VARCHAR) TO ROLE CRM_APP_ROLE;
GRANT USAGE ON PROCEDURE SHARED_DB.FLOW.F8_WON_EMPLOYER(VARCHAR, ARRAY, ARRAY, VARCHAR) TO ROLE CRM_APP_ROLE;

GRANT USAGE ON SCHEMA SHARED_DB.FLOW TO ROLE ILR_APP_ROLE;
GRANT USAGE ON PROCEDURE SHARED_DB.FLOW.F7_ONBOARDING_STATUS(VARCHAR, VARCHAR) TO ROLE ILR_APP_ROLE;
