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
--      was removed; it is a record of where it was.) Their ORIGINALSHA256 and
--      ORIGINALBYTES become those of the cleaned files now in the data folder
--      (scripts/strip-ofqual-contacts.js), because load step 27 skips a file
--      whose checksum is already in SOURCE_FILE: without this it would load the
--      two cleaned files again, as 748 more rows. Only these two rows change
--      (each UPDATE names its SOURCEFILEID), and a check at the end proves no
--      other row did.
--
-- Time Travel: the table keeps its old versions for DATA_RETENTION_TIME_IN_DAYS
-- (1 day here). Step 1 sets it to 0 before the update. That is NOT enough on
-- its own: the update's old version stays reachable for a short while after
-- the statement (22 October 2026: check 6 returned all 748 rows when the
-- retention was put back straight away). So retention STAYS at 0 until check 6
-- shows the old version is gone, and only then does step 7 put it back (a
-- separate, later step: it is commented out so Run All can't run it).
-- What remains after that is Fail-safe, which every permanent table has for 7
-- days after Time Travel: Snowflake's own recovery copy, which we can't query
-- or restore. So the old values are gone from everything we can reach once
-- check 6 errors, and from Snowflake altogether about 7 days later. Stage
-- files have neither.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show the result.
-- Then run check 6 again every few minutes, on its own, until it errors, and
-- only then step 7 (at the end). Convention for any clean-up that removes
-- data: docs/decisions.md, decision 21.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- Before: how many SOURCE_FILE rows there are for the organisations, and a
-- fingerprint of every other row, kept in session variables for the checks.
SET ofqual_org_rows_before = (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION');
SET other_rows_before = (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE NOT (SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION'));
SET other_rows_fingerprint_before = (SELECT HASH_AGG(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE NOT (SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION'));
-- Expected: 2 rows for the organisations (435 others at 22 October 2026).
SELECT $ofqual_org_rows_before AS ORGANISATION_ROWS_BEFORE, $other_rows_before AS OTHER_ROWS_BEFORE;

-- Step 1: no Time Travel for the table while it is updated.
ALTER TABLE SHARED_DB.RAW.OFQUAL_ORGANISATION SET DATA_RETENTION_TIME_IN_DAYS = 0;

-- Step 2: the update.
UPDATE SHARED_DB.RAW.OFQUAL_ORGANISATION
SET ITEM = OBJECT_DELETE(ITEM, 'contactEmail', 'phoneNumber', 'addressLine1', 'addressLine2', 'addressCity', 'addressCounty', 'addressCountry', 'addressPostCode')
WHERE ITEM:contactEmail IS NOT NULL OR ITEM:phoneNumber IS NOT NULL OR ITEM:addressLine1 IS NOT NULL OR ITEM:addressLine2 IS NOT NULL
   OR ITEM:addressCity IS NOT NULL OR ITEM:addressCounty IS NOT NULL OR ITEM:addressCountry IS NOT NULL OR ITEM:addressPostCode IS NOT NULL;

-- Step 3 is step 7 (the end of this file): retention is put back only once the
-- old version is confirmed gone.

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

-- Step 6: the checksum and size of each cleaned file (sha256sum and the file's
-- size on 22 October 2026), so load step 27 sees them as already loaded.
UPDATE SHARED_DB.RAW.SOURCE_FILE
SET ORIGINALSHA256 = '5bd177ef28da4fb2f262f4ca59ed8c4ca49a2640b92e3c0b10bd03e04bb44f58', ORIGINALBYTES = 242788
WHERE SOURCEFILEID = '8454bc02-c1d8-4bbd-a76e-ab1aa18b520b';
UPDATE SHARED_DB.RAW.SOURCE_FILE
SET ORIGINALSHA256 = '8ca3b798573ecbbe4bedf7d2b6d625f9f775c2058051f4f51fb0c1db83a83c44', ORIGINALBYTES = 242788
WHERE SOURCEFILEID = '10ef0e88-7754-485b-98fe-e5956570ea23';

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
--    REMOVEDCOLUMNS the 8 names, and the new checksums: 13 October
--    5bd177ef…44f58 and 21 October 8ca3b798…83c44, both 242788 bytes.
SELECT SOURCEFILEID, ORIGINALNAME, ORIGINALSTAGED, COPYKIND, REMOVEDCOLUMNS, ORIGINALSHA256, ORIGINALBYTES
FROM SHARED_DB.RAW.SOURCE_FILE
WHERE SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION' ORDER BY LOADEDAT;

-- 4b. The checksums are exactly the two expected, and nothing else changed.
--     Expected: one row, every column TRUE: the organisations still have the
--     same number of SOURCE_FILE rows as before (2); both checksums are in;
--     the other rows are the same number as before (435) and, by their
--     fingerprint, unchanged.
SELECT (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION') = $ofqual_org_rows_before AS ORGANISATION_ROW_COUNT_SAME,
       (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE SOURCEFILEID = '8454bc02-c1d8-4bbd-a76e-ab1aa18b520b'
          AND ORIGINALSHA256 = '5bd177ef28da4fb2f262f4ca59ed8c4ca49a2640b92e3c0b10bd03e04bb44f58' AND ORIGINALBYTES = 242788) = 1 AS CHECKSUM_13_OCT_IN,
       (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE SOURCEFILEID = '10ef0e88-7754-485b-98fe-e5956570ea23'
          AND ORIGINALSHA256 = '8ca3b798573ecbbe4bedf7d2b6d625f9f775c2058051f4f51fb0c1db83a83c44' AND ORIGINALBYTES = 242788) = 1 AS CHECKSUM_21_OCT_IN,
       (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE NOT (SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION')) = $other_rows_before AS OTHER_ROW_COUNT_SAME,
       (SELECT HASH_AGG(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE NOT (SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION')) = $other_rows_fingerprint_before AS OTHER_ROWS_UNCHANGED;

-- 5. The table's Time Travel. Expected: retention_time 0 until step 7 is run,
--    then 1.
SHOW TABLES LIKE 'OFQUAL_ORGANISATION' IN SCHEMA SHARED_DB.RAW;
SELECT "name", "retention_time", "rows" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- 6. The old copy can't be reached. Expected: an error (time travel data is not
--    available for table OFQUAL_ORGANISATION). If it returns rows (22 October
--    2026: 748, straight after the update), the old version is still there, and
--    its contact details with it: leave retention at 0, wait, and run this
--    again on its own. Use an offset that reaches back before the update (the
--    minutes since step 2, with some to spare: -900 is 15 minutes), and run it
--    on its own, not as part of Run All.
SELECT COUNT(*) FROM SHARED_DB.RAW.OFQUAL_ORGANISATION AT(OFFSET => -900);

-- ---------------------------------------------------------------------------
-- Step 7: put the retention back. Run ONLY when check 6 errors, and on its own
-- (the line below is commented out so Run All can't run it; remove the two
-- dashes to run it). Retention 0 until then keeps the old version from being
-- held for the table's default day.
-- ---------------------------------------------------------------------------

-- ALTER TABLE SHARED_DB.RAW.OFQUAL_ORGANISATION UNSET DATA_RETENTION_TIME_IN_DAYS;

-- Then check 5 again. Expected: retention_time 1.
