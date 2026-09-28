-- ILR return, file 1 of 2: the tables and columns Warren needs to produce a
-- 2026 to 2027 ILR file for apprentices.
--
-- Checked against the ILR Specification 2026 to 2027 (Version 1, 30 January
-- 2026), the schema ILR-2026-27-schemafile-January.xsd and the validation
-- rules 2026 to 2027 (Version 4, 9 September 2026), all from
-- https://guidance.submit-learner-data.service.gov.uk/26-27/
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, then run
-- ilr_02_test_data.sql. Safe to run twice: tables and columns are only added
-- if missing, and the backfill only fills empty values.
--
-- What it adds:
--   ILR.LEARNING_DELIVERY gets EPAORGID, ORIGLEARNSTARTDATE,
--     PRIORLEARNFUNDADJ, OTHERFUNDADJ, SWSUPAIMID and OUTGRADE. Every
--     existing aim gets a SWSUPAIMID (a GUID that identifies the aim across
--     returns). The table already allows several aims per learner, so
--     component aims (AIMTYPE 3: the standard's own aim and English and maths)
--     are rows next to the programme aim (ZPROG001, AIMSEQNUMBER 1).
--   New tables, one row per ILR record, each with ISTESTDATA:
--     ILR.PRIOR_ATTAINMENT              PriorAttain
--     ILR.LLDD_HEALTH_PROBLEM           LLDDandHealthProblem
--     ILR.LEARNER_FAM                   LearnerFAM
--     ILR.EMPLOYMENT_STATUS             LearnerEmploymentStatus
--     ILR.EMPLOYMENT_STATUS_MONITORING  EmploymentStatusMonitoring
--     ILR.LEARNING_DELIVERY_FAM         LearningDeliveryFAM (not SOF or ACT,
--                                       which the export works out)
--     ILR.APP_FIN_RECORD                AppFinRecord (prices and payments)
--     ILR.HOURS_RECORD                  HRSRecord (off-the-job hours)
--   ACCESS.ORGANISATION already has UKPRN, and ilr_02 fills it for the test
--   organisations.
--
-- ILR_APP_ROLE gets SELECT on the new tables, for the export. Correction
-- (28 September 2026): it also gets INSERT and UPDATE on them, from a
-- future grant on the ILR schema that this file doesn't show. See
-- sql/ilr_04_capture.sql, which states the permissions explicitly.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;


-- ---------------------------------------------------------------------------
-- 1. New columns on the learning aim
-- ---------------------------------------------------------------------------
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS EPAORGID VARCHAR(8)
  COMMENT 'End-point assessment organisation ID (EPAOrgID), from the register of apprentice assessment organisations. Returned once known; required with a TNP 2 price.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS ORIGLEARNSTARTDATE DATE
  COMMENT 'Original learning start date (OrigLearnStartDate), for an aim restarted after a break in learning.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS PRIORLEARNFUNDADJ NUMBER(2)
  COMMENT 'Funding adjustment for prior learning (PriorLearnFundAdj): the percentage of the aim still to be delivered. Only when it applies.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS OTHERFUNDADJ NUMBER(3)
  COMMENT 'Other funding adjustment (OtherFundAdj). Only when it applies.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS SWSUPAIMID VARCHAR(36)
  COMMENT 'Software supplier aim identifier (SWSupAimId): a GUID that stays with the aim in every return.';
ALTER TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY ADD COLUMN IF NOT EXISTS OUTGRADE VARCHAR(6)
  COMMENT 'Outcome grade (OutGrade).';

UPDATE CAPTURE_DB.ILR.LEARNING_DELIVERY SET SWSUPAIMID = UUID_STRING() WHERE SWSUPAIMID IS NULL;


-- ---------------------------------------------------------------------------
-- 2. Learner records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.PRIOR_ATTAINMENT (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  PRIORLEVEL      NUMBER(2) NOT NULL COMMENT 'PriorLevel: 1 Entry, 2 Level 1, 3 Level 2, 4 Full level 2, 5 Level 3, 6 Full level 3, 7 Level 4, 8 Level 5, 9 Level 6, 10 Level 7+, 97 other (level not known), 98 not known, 99 no qualifications.',
  DATELEVELAPP    DATE NOT NULL COMMENT 'DateLevelApp: when the level was recorded - the start of the learning agreement (on or before the earliest start, rule R_131).',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_PRIOR_ATTAINMENT PRIMARY KEY (LEARNREFNUMBER, DATELEVELAPP),
  CONSTRAINT FK_PRIOR_ATTAINMENT_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'ILR PriorAttain: the learner''s prior attainment at the start of each learning agreement. Required for apprentices (R_131).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  LLDDCAT         NUMBER(2) NOT NULL COMMENT 'LLDDCat, e.g. 4 vision, 5 hearing, 6 mobility, 9 mental health, 12 dyslexia, 14 autism spectrum, 95 other medical condition. 15 ended 31 July 2025.',
  PRIMARYLLDD     BOOLEAN DEFAULT FALSE NOT NULL COMMENT 'PrimaryLLDD: TRUE on exactly one record per learner.',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_LLDD_HEALTH_PROBLEM PRIMARY KEY (LEARNREFNUMBER, LLDDCAT),
  CONSTRAINT FK_LLDD_HEALTH_PROBLEM_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'ILR LLDDandHealthProblem: the categories for a learner with LLDDHEALTHPROB = 1 (LLDDHealthProb_06, PrimaryLLDD_01).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.LEARNER_FAM (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  LEARNFAMTYPE    VARCHAR(3) NOT NULL COMMENT 'LearnFAMType, e.g. EHC (education, health and care plan).',
  LEARNFAMCODE    NUMBER(3) NOT NULL,
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_LEARNER_FAM PRIMARY KEY (LEARNREFNUMBER, LEARNFAMTYPE, LEARNFAMCODE),
  CONSTRAINT FK_LEARNER_FAM_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'ILR LearnerFAM: learner funding and monitoring.';


-- ---------------------------------------------------------------------------
-- 3. Employment status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.EMPLOYMENT_STATUS (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  DATEEMPSTATAPP  DATE NOT NULL COMMENT 'DateEmpStatApp: the date this status applies from. An apprentice needs one before the start date (EmpStat_09).',
  EMPSTAT         NUMBER(2) NOT NULL COMMENT 'EmpStat: 10 in paid employment, 11 not employed and looking, 12 not employed and not looking, 98 not known.',
  EMPID           NUMBER(9) COMMENT 'EmpId: the employer''s ERN from the Employer Data Service, or 999999999 when the employer is not on it. Required when employed (EmpId_10).',
  AGREEMID        VARCHAR(7) COMMENT 'AgreemId: the agreement ID from the Apprenticeship Service for the employer funding the apprenticeship.',
  EMPLOYERID      VARCHAR(20) COMMENT 'The employer in Warren (ILR.EMPLOYER), when there is one. Not returned on the ILR.',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_EMPLOYMENT_STATUS PRIMARY KEY (LEARNREFNUMBER, DATEEMPSTATAPP),
  CONSTRAINT FK_EMPLOYMENT_STATUS_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER),
  CONSTRAINT FK_EMPLOYMENT_STATUS_EMPLOYER FOREIGN KEY (EMPLOYERID) REFERENCES CAPTURE_DB.ILR.EMPLOYER (EMPLOYERID)
)
COMMENT = 'ILR LearnerEmploymentStatus: the learner''s employment status over time. A new record when it changes; never updated in place.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  DATEEMPSTATAPP  DATE NOT NULL,
  ESMTYPE         VARCHAR(3) NOT NULL COMMENT 'ESMType: EII employment intensity (required when employed, ESMType_02), LOE length of employment (required for apprentices, ESMType_09), SEM small employer (starts up to 31 March 2024 only), SEI, LOU, BSI, PEI, OET.',
  ESMCODE         NUMBER(2) NOT NULL COMMENT 'ESMCode, e.g. EII 5 = 0-10, 6 = 11-20, 7 = 21-30, 8 = 31+ hours a week; LOE 1 = up to 3 months, 2 = 4-6, 3 = 7-12, 4 = more than 12.',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_EMPLOYMENT_STATUS_MONITORING PRIMARY KEY (LEARNREFNUMBER, DATEEMPSTATAPP, ESMTYPE, ESMCODE),
  CONSTRAINT FK_ESM_EMPLOYMENT_STATUS FOREIGN KEY (LEARNREFNUMBER, DATEEMPSTATAPP) REFERENCES CAPTURE_DB.ILR.EMPLOYMENT_STATUS (LEARNREFNUMBER, DATEEMPSTATAPP)
)
COMMENT = 'ILR EmploymentStatusMonitoring: monitoring codes on an employment status record.';


-- ---------------------------------------------------------------------------
-- 4. Learning aim records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM (
  FAMID            VARCHAR(40) DEFAULT UUID_STRING() NOT NULL,
  LEARNREFNUMBER   VARCHAR(12) NOT NULL,
  AIMSEQNUMBER     NUMBER(2) NOT NULL COMMENT 'The aim this belongs to (LEARNING_DELIVERY.AIMSEQNUMBER).',
  LEARNDELFAMTYPE  VARCHAR(3) NOT NULL COMMENT 'LearnDelFAMType, e.g. LSF learning support, EEF enhanced funding, RES restart, LDM monitoring. SOF (always 105) and ACT (always 1 on programme aims starting from 1 April 2021) are worked out by the export, not stored.',
  LEARNDELFAMCODE  VARCHAR(5) NOT NULL,
  DATEFROM         DATE COMMENT 'LearnDelFAMDateFrom: only for LSF, ACT, ALB and EVI.',
  DATETO           DATE COMMENT 'LearnDelFAMDateTo: only for LSF, ACT and ALB.',
  ISTESTDATA       BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT        TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY        VARCHAR(40) NOT NULL,
  CONSTRAINT PK_LEARNING_DELIVERY_FAM PRIMARY KEY (FAMID),
  CONSTRAINT FK_LEARNING_DELIVERY_FAM_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'ILR LearningDeliveryFAM: funding and monitoring on an aim.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.APP_FIN_RECORD (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  AIMSEQNUMBER    NUMBER(2) NOT NULL COMMENT 'Always the programme aim.',
  AFINTYPE        VARCHAR(3) NOT NULL COMMENT 'AFinType: TNP total negotiated price, PMR payment record, RIP price reduction for prior learning.',
  AFINCODE        NUMBER(2) NOT NULL COMMENT 'AFinCode: TNP 1 training price, 2 assessment price, 3 residual training, 4 residual assessment; PMR 1 training payment, 2 assessment payment, 3 refund; RIP 1.',
  AFINDATE        DATE NOT NULL COMMENT 'AFinDate: when the price applies from (TNP 1 and 2 from the start date, AFinType_13), or the payment date.',
  AFINAMOUNT      NUMBER(6) NOT NULL COMMENT 'AFinAmount: whole pounds, excluding VAT.',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_APP_FIN_RECORD PRIMARY KEY (LEARNREFNUMBER, AIMSEQNUMBER, AFINTYPE, AFINCODE, AFINDATE),
  CONSTRAINT FK_APP_FIN_RECORD_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'ILR AppFinRecord: the agreed prices and the employer''s payments for an apprenticeship programme aim. Price changes are new records, never edits.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.HOURS_RECORD (
  LEARNREFNUMBER  VARCHAR(12) NOT NULL,
  AIMSEQNUMBER    NUMBER(2) NOT NULL COMMENT 'Always the programme aim for apprenticeship hours.',
  HRSTYPE         VARCHAR(3) DEFAULT 'HRS' NOT NULL,
  HRSCODE         NUMBER(2) NOT NULL COMMENT 'HRSCode: 1 planned off-the-job hours (required, at least 187 for starts from 1 August 2025), 3 actual off-the-job hours (required on completion or withdrawal), 4 planned hours removed for prior learning.',
  HRSAMOUNT       NUMBER(4) NOT NULL COMMENT 'Whole hours.',
  ISTESTDATA      BOOLEAN DEFAULT FALSE NOT NULL,
  CREATEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY       VARCHAR(40) NOT NULL,
  CONSTRAINT PK_HOURS_RECORD PRIMARY KEY (LEARNREFNUMBER, AIMSEQNUMBER, HRSTYPE, HRSCODE),
  CONSTRAINT FK_HOURS_RECORD_LEARNER FOREIGN KEY (LEARNREFNUMBER) REFERENCES CAPTURE_DB.ILR.LEARNER (LEARNREFNUMBER)
)
COMMENT = 'ILR HRSRecord: planned and actual off-the-job training hours on an apprenticeship programme aim.';


-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE CAPTURE_DB.ILR.PRIOR_ATTAINMENT TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.LLDD_HEALTH_PROBLEM TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.LEARNER_FAM TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.EMPLOYMENT_STATUS_MONITORING TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.LEARNING_DELIVERY_FAM TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.APP_FIN_RECORD TO ROLE ILR_APP_ROLE;
GRANT SELECT ON TABLE CAPTURE_DB.ILR.HOURS_RECORD TO ROLE ILR_APP_ROLE;


-- ---------------------------------------------------------------------------
-- Check. Expected: every row TRUE.
-- ---------------------------------------------------------------------------
SELECT 'LEARNING_DELIVERY has the new columns' AS CHECK_NAME,
       COUNT(*) = 6 AS OK
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'LEARNING_DELIVERY'
  AND COLUMN_NAME IN ('EPAORGID', 'ORIGLEARNSTARTDATE', 'PRIORLEARNFUNDADJ', 'OTHERFUNDADJ', 'SWSUPAIMID', 'OUTGRADE')
UNION ALL
SELECT 'Every aim has a SWSUPAIMID', COUNT_IF(SWSUPAIMID IS NULL) = 0 FROM CAPTURE_DB.ILR.LEARNING_DELIVERY
UNION ALL
SELECT 'The 8 new tables exist', COUNT(*) = 8
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME IN ('PRIOR_ATTAINMENT', 'LLDD_HEALTH_PROBLEM', 'LEARNER_FAM', 'EMPLOYMENT_STATUS',
  'EMPLOYMENT_STATUS_MONITORING', 'LEARNING_DELIVERY_FAM', 'APP_FIN_RECORD', 'HOURS_RECORD');
