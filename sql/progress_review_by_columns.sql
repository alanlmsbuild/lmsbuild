-- Who recorded each progress review, and who last corrected it.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, before using the
-- app after this change: saving a progress review writes CREATEDBY, and
-- fails until the column exists. Safe to run twice: ADD COLUMN IF NOT
-- EXISTS does nothing when the column is already there.
--
-- Both hold the signed-in user's USERID (ACCESS.APP_USER), like STARTEDBY
-- and ENDEDBY on ILR.OFFICER_ASSIGNMENT. They're empty on reviews recorded
-- before this change, so they can't be NOT NULL.
--
-- Also updates the column comments on the Burrow tables, whose *_BY
-- columns now hold the signed-in user's USERID too (rows saved before this
-- change hold the learner reference). SIGNED_OFF_BY and DECIDED_BY stay
-- officer references: the IQA rule compares them with the IQA's own.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

ALTER TABLE CAPTURE_DB.ILR.PROGRESS_REVIEW ADD COLUMN IF NOT EXISTS
  CREATEDBY VARCHAR(40) COMMENT 'USERID of whoever recorded the review. Empty on reviews recorded before this column was added.';
ALTER TABLE CAPTURE_DB.ILR.PROGRESS_REVIEW ADD COLUMN IF NOT EXISTS
  UPDATEDBY VARCHAR(40) COMMENT 'USERID of whoever last corrected the review, if anyone.';

COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE.CREATED_BY IS 'USERID of whoever added it. Rows saved before USERIDs were recorded hold the learner reference.';
COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE.UPDATED_BY IS 'USERID of whoever last changed it. Rows saved before USERIDs were recorded hold the learner reference.';
COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE_FILE.UPLOADED_BY IS 'USERID of whoever uploaded it. Rows saved before USERIDs were recorded hold the learner reference.';
COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE_FILE.REMOVED_BY IS 'USERID of whoever took it off. Rows saved before USERIDs were recorded hold the learner reference.';
COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE_KSB.CLAIMED_BY IS 'USERID of whoever claimed it. Rows saved before USERIDs were recorded hold the learner reference.';
COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE_KSB.UNCLAIMED_BY IS 'USERID of whoever took the claim off. Rows saved before USERIDs were recorded hold the learner reference.';

-- Check: CREATEDBY and UPDATEDBY should be listed, both TEXT and nullable.
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COMMENT
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'ILR' AND TABLE_NAME = 'PROGRESS_REVIEW' AND COLUMN_NAME IN ('CREATEDBY', 'UPDATEDBY');
