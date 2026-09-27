-- Update the description of BURROW.EVIDENCE.EVIDENCE_TYPE to match the
-- evidence types the Burrow screens offer.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. It changes only
-- the column's description - no data, no column type, no permissions - so
-- it is safe to run more than once.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

COMMENT ON COLUMN CAPTURE_DB.BURROW.EVIDENCE.EVIDENCE_TYPE IS 'photo | video | document | witness_statement | reflection';

-- Check afterwards: the comment column for EVIDENCE_TYPE should show the new list.
DESCRIBE TABLE CAPTURE_DB.BURROW.EVIDENCE;
