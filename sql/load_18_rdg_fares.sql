-- Train fares (decision 19, phase C): the National Rail Data Portal's fares
-- feed (the Rail Delivery Group's RJIS fares data), in SHARED_DB.RAW, kept as
-- published. Under the National Rail Enquiries (NRE) information feeds'
-- Terms & Conditions v3.0 (docs/licences/nre-terms-v3.0.md): the content must
-- not be amended, so bronze holds every line of every file of the feed
-- exactly as it is, and silver (dbt) reads the fixed-width fields out. Run
-- sql/load_17_nre_licence_tag.sql FIRST (it adds the LICENCE tag value
-- nre-feeds-v3 this file uses). Loaded by npm run load:data -- 50, as
-- DATA_LOAD_USER, logged in OPS.JOB_RUN; nothing from it is shown publicly
-- until the Rail Delivery Group has confirmed the attribution.
--
--   RDG_FARES_LINE  one line per row, from each file of the feed's zip
--                   (RJFAFnnn.FFL flows and fares, .FSC station clusters, .TTY
--                   ticket types, .DIS discounts, .RLC and .RCM railcards, .LOC
--                   locations, .RST restrictions and the rest): "file_type"
--                   (the file's extension, FFL, LOC ...), "line" (the whole
--                   line, including the /!! header and trailer lines), and
--                   FILEROWNUMBER, its place in the file. About 9.8 million
--                   lines per feed (the FFL file is 8.5 million of them).
--
-- Add-only. DATA_LOAD_ROLE gets SELECT and INSERT; TRANSFORM_ROLE gets SELECT.
-- Nothing else. Bronze tags (decision 21) are set here.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.RDG_FARES_LINE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the feed file this row came from (one per file in the zip).',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its line number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "file_type" VARCHAR COMMENT 'The file''s extension: FFL (flows and fares), FSC (station clusters), TTY (ticket types), DIS (discounts), RLC and RCM (railcards), LOC (locations), RST (restrictions) and so on.',
  "line" VARCHAR COMMENT 'The whole line exactly as published (fixed-width fields), header and trailer lines included.'
)
COMMENT = 'Train fares. The National Rail Data Portal fares feed (Rail Delivery Group, RJIS), every line of every file as published, one per row. National Rail Enquiries Terms & Conditions v3.0: content not to be amended, NRE acknowledged as the source (Powered by National Rail Enquiries), no suggestion of endorsement. Add-only: each load adds its rows under a new SOURCEFILEID.';

GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.RDG_FARES_LINE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.RDG_FARES_LINE TO ROLE TRANSFORM_ROLE;

ALTER TABLE SHARED_DB.RAW.RDG_FARES_LINE SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'rdg-fares', SHARED_DB.GOVERNANCE.LICENCE = 'nre-feeds-v3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Powered by National Rail Enquiries (https://www.nationalrail.co.uk/). Contains information from the National Rail Data Portal under the NRE information feeds Terms and Conditions v3.0. Attribution wording to be confirmed with NRE.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new table. Expected: one row, SHARED_DB.RAW.RDG_FARES_LINE,
--    ROW_COUNT 0, COLUMNS_ 4.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'RDG_FARES_LINE';

-- 2. Who has rights on it. Expected: 3 rows, each on 1 table: INSERT
--    DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'RDG_FARES_LINE' AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. Its tags. Expected: one row: bronze, rdg-fares, nre-feeds-v3, monthly,
--    public (every table is checked afterwards by npm run check:tags --
--    --bronze).
SELECT SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.RDG_FARES_LINE', 'table') AS LAYER,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.RDG_FARES_LINE', 'table') AS SOURCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.RDG_FARES_LINE', 'table') AS LICENCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.RDG_FARES_LINE', 'table') AS REFRESH,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.RDG_FARES_LINE', 'table') AS SENSITIVITY;
