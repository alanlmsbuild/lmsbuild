-- Train fares (decision 19, phase C), the licence first: the National Rail
-- Enquiries (NRE) information feeds' Terms & Conditions version 3.0 (the
-- National Rail Data Portal terms Alan accepted on 16 October 2026; the text
-- is saved in docs/licences/nre-terms-v3.0.md). It is a different licence
-- from Network Rail's (nr-open: the SCHEDULE and CORPUS feeds, a different
-- licensor), so the LICENCE tag gets a new allowed value, 'nre-feeds-v3', for
-- any table from the portal's feeds (fares and the others). Nothing else
-- changes: the tables for the fares come with the fares load, later.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

EXECUTE IMMEDIATE $$
DECLARE
  has_it BOOLEAN;
BEGIN
  SELECT ARRAY_CONTAINS('nre-feeds-v3'::VARIANT, PARSE_JSON(SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE'))) INTO :has_it;
  IF (NOT has_it) THEN
    ALTER TAG SHARED_DB.GOVERNANCE.LICENCE ADD ALLOWED_VALUES 'nre-feeds-v3';
    RETURN 'nre-feeds-v3 added';
  END IF;
  RETURN 'nre-feeds-v3 already allowed';
END;
$$;

-- Check. Expected: one row that includes "nre-feeds-v3".
SELECT SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE') AS LICENCE_VALUES;
