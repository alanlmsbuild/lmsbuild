-- Reach map (Options app build brief, milestone 1): the shading under the
-- travel times. The ONS Lower layer Super Output Areas (December 2021)
-- boundaries for England and Wales, generalised to 20 m and clipped to the
-- coast (BGC, V5), in SHARED_DB.RAW. The same 2021 LSOAs as GOLD.TRAVEL_TIME
-- (its centroids are the ONS December 2021 population-weighted centroids,
-- V4), checked on 22 October 2026: all 860 South Yorkshire LSOAs the times
-- cover have a boundary (scripts/reach/fetch-boundaries.js). Loaded by
-- npm run load:data (a new step, written after this file has run), as
-- DATA_LOAD_USER, logged in OPS.JOB_RUN.
--
--   ONS_LSOA_BOUNDARY  one LSOA per row, 35,672 in all: PROPERTIES (LSOA21CD,
--                      LSOA21NM, LSOA21NMW, BNG_E, BNG_N, LAT, LONG) and
--                      GEOMETRY (GeoJSON, WGS84 longitude and latitude to 6
--                      decimals, as the ONS service gives it). About 55 MB
--                      as a file, held as VARIANT like the electricity
--                      regions (NESO_DNO_AREA).
--
-- The original file goes into the SHARED_DB.RAW.DOWNLOADS stage beside its
-- rows, as every load's does (decision 15): nothing new is needed for that.
--
-- Licence: ONS boundaries are published under the Open Government Licence
-- v3.0 with OS data, Crown copyright and database right, so the existing
-- 'ogl-3' LICENCE value. The data.gov.uk record for this file says "No
-- Licence Provided", so the ONS Open Geography Portal page is to be
-- confirmed before the reach map goes public (docs/decisions.md, decision
-- 19). Add-only. DATA_LOAD_ROLE gets SELECT and INSERT; TRANSFORM_ROLE gets
-- SELECT (dbt and the export read it). Nothing else.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The new table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ONS_LSOA_BOUNDARY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the GeoJSON file.',
  FEATURENUMBER NUMBER(38,0) NOT NULL COMMENT 'Its place among the file''s features, from 1.',
  PROPERTIES    VARIANT      COMMENT 'The LSOA: LSOA21CD (code), LSOA21NM (name), LSOA21NMW (Welsh name), BNG_E and BNG_N (British National Grid easting and northing), LAT and LONG.',
  GEOMETRY      VARIANT      COMMENT 'Its boundary as GeoJSON (Polygon or MultiPolygon), longitude and latitude (WGS84) to 6 decimals, as the ONS service gives it.'
)
COMMENT = 'Reach map. Lower layer Super Output Areas (December 2021) Boundaries EW BGC (V5): England and Wales, generalised to 20 m and clipped to the coastline at mean high water; boundaries as at 21 March 2021. Office for National Statistics, Open Government Licence v3.0; contains OS data, Crown copyright and database right. One LSOA per row. Add-only.';

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ONS_LSOA_BOUNDARY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.ONS_LSOA_BOUNDARY TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Bronze tags (decision 21)
-- ---------------------------------------------------------------------------
ALTER TABLE SHARED_DB.RAW.ONS_LSOA_BOUNDARY SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'ons-lsoa-boundaries', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.', SHARED_DB.GOVERNANCE.REFRESH = 'by-hand', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new table. Expected: one row, SHARED_DB.RAW.ONS_LSOA_BOUNDARY,
--    ROW_COUNT 0, COLUMNS_ 4.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'ONS_LSOA_BOUNDARY';

-- 2. Who has rights on it. Expected: 3 rows, each on 1 table: INSERT
--    DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'ONS_LSOA_BOUNDARY' AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. Its tags. Expected: one row: bronze, ons-lsoa-boundaries, ogl-3,
--    by-hand, public (every table is checked afterwards by npm run
--    check:tags -- --bronze).
SELECT SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', 'table') AS LAYER,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', 'table') AS SOURCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', 'table') AS LICENCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', 'table') AS REFRESH,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', 'table') AS SENSITIVITY;
