-- Takes the awarding organisations' contact details out of Snowflake.
--
-- The Ofqual register's organisation records carry a contact email, a phone
-- number and a postal address (22 October 2026). The OGL doesn't cover
-- personal data and Rarebit loads none (CLAUDE.md), so the fetch now drops
-- them (scripts/load/ofqual.js) and this removes what was loaded on 13 and 21
-- October 2026, in three places:
--
--   1. SHARED_DB.RAW.OFQUAL_ORGANISATION, ITEM: the 8 keys (748 rows, two
--      loads of 374).
--   2. Four files in the load stage @SHARED_DB.RAW.DOWNLOADS/ofqual-register/
--      that hold them: the two originals and the two compressed copies COPY
--      read. The qualifications files there have none and are left alone.
--   3. The two SOURCE_FILE rows, so they say the original is not in the stage
--      and which columns were left out. (STAGEDPATH still names the copy that
--      was removed; it is a record of where it was.)
--
-- Time Travel: the table keeps its old versions for DATA_RETENTION_TIME_IN_DAYS
-- (1 day here). Step 1 sets it to 0 while the update runs, so the old copy
-- isn't kept for that day, and step 3 puts it back to the default. What
-- remains is Fail-safe, which every permanent table has for 7 days after Time
-- Travel: Snowflake's own recovery copy, which we can't query or restore. So
-- the old values are gone from everything we can reach at once, and from
-- Snowflake altogether about 7 days later. Stage files have neither.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show the result.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- Step 1: no Time Travel for the table while it is updated.
ALTER TABLE SHARED_DB.RAW.OFQUAL_ORGANISATION SET DATA_RETENTION_TIME_IN_DAYS = 0;

-- Step 2: the update.
UPDATE SHARED_DB.RAW.OFQUAL_ORGANISATION
SET ITEM = OBJECT_DELETE(ITEM, 'contactEmail', 'phoneNumber', 'addressLine1', 'addressLine2', 'addressCity', 'addressCounty', 'addressCountry', 'addressPostCode')
WHERE ITEM:contactEmail IS NOT NULL OR ITEM:phoneNumber IS NOT NULL OR ITEM:addressLine1 IS NOT NULL OR ITEM:addressLine2 IS NOT NULL
   OR ITEM:addressCity IS NOT NULL OR ITEM:addressCounty IS NOT NULL OR ITEM:addressCountry IS NOT NULL OR ITEM:addressPostCode IS NOT NULL;

-- Step 3: back to the default retention (1 day, from the account).
ALTER TABLE SHARED_DB.RAW.OFQUAL_ORGANISATION UNSET DATA_RETENTION_TIME_IN_DAYS;

-- Step 4: the four stage files.
REMOVE @SHARED_DB.RAW.DOWNLOADS/ofqual-register/2026-10-13-022ceb65fc2d/ofqual_organisations_2026-10-13.jsonl;
REMOVE @SHARED_DB.RAW.DOWNLOADS/ofqual-register/2026-10-13-db296c5a99ed/ofqual-register-OFQUAL_ORGANISATION-f708106f.jsonl.gz;
REMOVE @SHARED_DB.RAW.DOWNLOADS/ofqual-register/2026-10-21-f274fc49badd/ofqual_organisations_2026-10-21.jsonl;
REMOVE @SHARED_DB.RAW.DOWNLOADS/ofqual-register/2026-10-21-b6065e7db4af/ofqual-register-OFQUAL_ORGANISATION-87bf408e.jsonl.gz;

-- Step 5: say so in SOURCE_FILE.
UPDATE SHARED_DB.RAW.SOURCE_FILE
SET ORIGINALSTAGED = FALSE,
    COPYKIND = 'columns-removed',
    REMOVEDCOLUMNS = PARSE_JSON('["contactEmail","phoneNumber","addressLine1","addressLine2","addressCity","addressCounty","addressCountry","addressPostCode"]')
WHERE SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. Rows still holding any of the 8 keys. Expected: ROWS_ 748, STILL_HOLDING 0.
SELECT COUNT(*) AS ROWS_,
       COUNT_IF(ITEM:contactEmail IS NOT NULL OR ITEM:phoneNumber IS NOT NULL OR ITEM:addressLine1 IS NOT NULL OR ITEM:addressLine2 IS NOT NULL
             OR ITEM:addressCity IS NOT NULL OR ITEM:addressCounty IS NOT NULL OR ITEM:addressCountry IS NOT NULL OR ITEM:addressPostCode IS NOT NULL) AS STILL_HOLDING
FROM SHARED_DB.RAW.OFQUAL_ORGANISATION;

-- 2. The keys that are left. Expected: 18 rows: acronym, canonicalUrl,
--    cceaOrganisationStatus, cceaRecognisedOn, cceaRecognisedTo,
--    cceaSurrenderedOn, cceaWithdrawnOn, feesUrl, lastUpdatedDate, legalName,
--    name, ofqualOrganisationStatus, ofqualRecognisedOn, ofqualRecognisedTo,
--    ofqualSurrenderedOn, ofqualWithdrawnOn, recognitionNumber, website.
SELECT f.KEY, COUNT(*) AS ROWS_
FROM SHARED_DB.RAW.OFQUAL_ORGANISATION, LATERAL FLATTEN(INPUT => ITEM) f
GROUP BY f.KEY ORDER BY f.KEY;

-- 3. The stage. Expected: 4 rows, all for qualifications (the two originals,
--    ofqual_qualifications_*.jsonl, and the two copies, ...OFQUAL_QUALIFICATION-*.jsonl.gz);
--    none for organisations.
LIST @SHARED_DB.RAW.DOWNLOADS/ofqual-register/;

-- 4. SOURCE_FILE. Expected: 2 rows, ORIGINALSTAGED false, COPYKIND columns-removed,
--    REMOVEDCOLUMNS the 8 names.
SELECT SOURCEFILEID, ORIGINALNAME, ORIGINALSTAGED, COPYKIND, REMOVEDCOLUMNS
FROM SHARED_DB.RAW.SOURCE_FILE
WHERE SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION' ORDER BY LOADEDAT;

-- 5. The table's Time Travel is back to the default. Expected: retention_time 1.
SHOW TABLES LIKE 'OFQUAL_ORGANISATION' IN SCHEMA SHARED_DB.RAW;
SELECT "name", "retention_time", "rows" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- 6. The old copy can't be reached. Expected: an error (time travel data is not
--    available for table OFQUAL_ORGANISATION). If it returns rows, the old
--    version is still there, and its contact details with it.
SELECT COUNT(*) FROM SHARED_DB.RAW.OFQUAL_ORGANISATION AT(OFFSET => -300);
