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
-- Time Travel (corrected 26 October 2026): the table keeps its old versions
-- for DATA_RETENTION_TIME_IN_DAYS (1 day here), and nothing we can do makes
-- that shorter after the fact. On 22 October 2026 retention was set to 0
-- before the update and kept there for about 3 hours: the old version was
-- still reachable (check 6 with AT(TIMESTAMP => a time before the update)),
-- and when retention was UNSET it came back under the 1-day retention. So
-- setting retention to 0 does NOT purge the old version, and this file no
-- longer does it. The rule: make the change, leave retention as it is, and
-- expect the old version to stay reachable until the retention period ends
-- (1 day here); confirm with check 6, which must error. After that, a
-- permanent table has Fail-safe for 7 days: Snowflake's own recovery copy,
-- which we can't query or restore. So the old values are gone from
-- everything we can reach one day after the change, and from Snowflake
-- altogether about 8 days after it. Stage files have neither: REMOVE is
-- immediate.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show the result.
-- Then, a day after the change, run check 6 on its own: it must error.
-- Convention for any clean-up that removes data: docs/decisions.md,
-- decision 21.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- Before: how many SOURCE_FILE rows there are for the organisations, and a
-- fingerprint of every other row, kept in session variables for the checks.
SET ofqual_org_rows_before = (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION');
SET other_rows_before = (SELECT COUNT(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE NOT (SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION'));
SET other_rows_fingerprint_before = (SELECT HASH_AGG(*) FROM SHARED_DB.RAW.SOURCE_FILE WHERE NOT (SOURCE = 'ofqual-register' AND TARGETTABLE = 'SHARED_DB.RAW.OFQUAL_ORGANISATION'));
-- Expected: 2 rows for the organisations (435 others at 22 October 2026).
SELECT $ofqual_org_rows_before AS ORGANISATION_ROWS_BEFORE, $other_rows_before AS OTHER_ROWS_BEFORE;

-- Step 1: note the time before the change (check 6 reads the table as it was
-- then). Write the result down: a session variable doesn't last a day.
SELECT CURRENT_TIMESTAMP() AS TIME_BEFORE_THE_CHANGE;

-- Step 2: the update.
UPDATE SHARED_DB.RAW.OFQUAL_ORGANISATION
SET ITEM = OBJECT_DELETE(ITEM, 'contactEmail', 'phoneNumber', 'addressLine1', 'addressLine2', 'addressCity', 'addressCounty', 'addressCountry', 'addressPostCode')
WHERE ITEM:contactEmail IS NOT NULL OR ITEM:phoneNumber IS NOT NULL OR ITEM:addressLine1 IS NOT NULL OR ITEM:addressLine2 IS NOT NULL
   OR ITEM:addressCity IS NOT NULL OR ITEM:addressCounty IS NOT NULL OR ITEM:addressCountry IS NOT NULL OR ITEM:addressPostCode IS NOT NULL;

-- (Step 3 was a retention change; it is not part of the rule: see the note at
-- the top.)

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

-- 5. The table's Time Travel. Expected: retention_time 1 (the default). If it
--    was set to 0 by hand (22 October 2026), put it back:
--    ALTER TABLE SHARED_DB.RAW.OFQUAL_ORGANISATION UNSET DATA_RETENTION_TIME_IN_DAYS;
SHOW TABLES LIKE 'OFQUAL_ORGANISATION' IN SCHEMA SHARED_DB.RAW;
SELECT "name", "retention_time", "rows" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- 6. The old copy can't be reached. Run it on its own, a day after the change
--    (the retention period), with the time from step 1 in place of the one
--    below. Expected: an error (time travel data is not available for table
--    OFQUAL_ORGANISATION). Before then it returns the old rows (748), contact
--    details and all: that is expected, and nothing shortens it.
SELECT COUNT(*) FROM SHARED_DB.RAW.OFQUAL_ORGANISATION AT(TIMESTAMP => '2026-10-22 12:00:00 +0100'::TIMESTAMP_LTZ);
