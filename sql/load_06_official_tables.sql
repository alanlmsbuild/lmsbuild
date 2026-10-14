-- Loading everything, batch 6: the official data sets of the plan of 14
-- October 2026 (decision 15), their RAW tables and grants to DATA_LOAD_ROLE.
-- Loaded by npm run load:data steps 32 to 39 (scripts/load/official3.js).
--
--   SHARED_DB.RAW: the ONS Postcode Directory in full (all 55 columns:
--     ward, LSOA, MSOA, built-up area, deprivation rank and the rest; its
--     code-to-name lookups go to PUBLISHED_CELL); population by LSOA and by
--     local authority (Nomis, for rates per 1,000 people); the apprenticeship
--     provider and assessment register; police.uk street crimes and outcomes,
--     the latest 3 years (stop and search left out: individual stops with each
--     person's details); NaPTAN stops; Historic England's listed buildings;
--     Wikidata places with an English GSS code; the 14 electricity regions'
--     boundaries (NESO, one JSON feature per row). Ofgem's price cap
--     workbooks and DESNZ's sub-regional fuel poverty tables go to
--     PUBLISHED_CELL (made by sql/load_05_official_tables.sql).
--   OPTIONS_DB.RAW: HESA Graduate Outcomes (as republished by DfE).
--
-- Typed tables: columns named exactly as in each file's header, all text;
-- plus SOURCEFILEID and FILEROWNUMBER. Add-only.
--
-- DATA_LOAD_ROLE gets SELECT and INSERT on every new table: no UPDATE,
-- DELETE, TRUNCATE or CREATE. The app roles get nothing.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NESO_DNO_AREA (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the GeoJSON file.',
  FEATURENUMBER NUMBER(38,0) NOT NULL COMMENT 'Its place among the file''s features, from 1.',
  PROPERTIES    VARIANT      COMMENT 'The region: ID, Name (the GSP group letter, e.g. _M), DNO, Area, DNO_Full.',
  GEOMETRY      VARIANT      COMMENT 'Its approximate boundary as GeoJSON, in British National Grid (EPSG:27700), as published.'
)
COMMENT = 'Batch 6. GB DNO licence areas: the 14 electricity regions, approximate boundaries (NESO, NESO Open Data Licence), one feature per row. Placing a postcode in its region: its ONSPD easting and northing inside the region''s boundary. Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ONSPD (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "pcd7" VARCHAR,
  "pcd8" VARCHAR,
  "pcds" VARCHAR,
  "dointr" VARCHAR,
  "doterm" VARCHAR,
  "cty26cd" VARCHAR,
  "ced25cd" VARCHAR,
  "lad26cd" VARCHAR,
  "wd26cd" VARCHAR,
  "parncp26cd" VARCHAR,
  "usrtypind" VARCHAR,
  "east1m" VARCHAR,
  "north1m" VARCHAR,
  "gridind" VARCHAR,
  "hlth19cd" VARCHAR,
  "nhser24cd" VARCHAR,
  "ctry26cd" VARCHAR,
  "rgn26cd" VARCHAR,
  "ssr95cd" VARCHAR,
  "pcon24cd" VARCHAR,
  "eer20cd" VARCHAR,
  "educ23cd" VARCHAR,
  "ttwa15cd" VARCHAR,
  "pco19cd" VARCHAR,
  "itl25cd" VARCHAR,
  "wdstl05cd" VARCHAR,
  "oa01cd" VARCHAR,
  "wdcas03cd" VARCHAR,
  "npark16cd" VARCHAR,
  "lsoa01cd" VARCHAR,
  "msoa01cd" VARCHAR,
  "ruc01ind" VARCHAR,
  "oac01ind" VARCHAR,
  "oa11cd" VARCHAR,
  "lsoa11cd" VARCHAR,
  "msoa11cd" VARCHAR,
  "wz11cd" VARCHAR,
  "sicbl26cd" VARCHAR,
  "bua24cd" VARCHAR,
  "ruc11ind" VARCHAR,
  "oac11ind" VARCHAR,
  "lat" VARCHAR,
  "long" VARCHAR,
  "lep21cd1" VARCHAR,
  "lep21cd2" VARCHAR,
  "pfa23cd" VARCHAR,
  "imd20ind" VARCHAR,
  "cal26cd" VARCHAR,
  "icb26cd" VARCHAR,
  "oa21cd" VARCHAR,
  "lsoa21cd" VARCHAR,
  "msoa21cd" VARCHAR,
  "ruc21ind" VARCHAR,
  "oac21ind" VARCHAR,
  "imd25ind" VARCHAR
)
COMMENT = 'Batch 6. ONS Postcode Directory: ONSPD_AUG_2026_UK.csv. Office for National Statistics. Open Government Licence v3.0 (credit the Office for National Statistics; postcode data also Royal Mail and Ordnance Survey copyright). Source: Data/ONSPD_AUG_2026_UK.csv in ONSPD_AUG_2026.zip. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_POPULATION_LSOA (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "GENDER_NAME" VARCHAR,
  "C_AGE_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 6. Population estimates, small area (2021 based), broad age groups (Nomis NM_2014_1). Office for National Statistics, via Nomis. Open Government Licence v3.0. Source: population_lsoa_nm_2014_1_2011_2024.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_POPULATION_LA (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "SEX_NAME" VARCHAR,
  "AGE_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 6. Population estimates, local authority, five-year age bands (Nomis NM_31_1). Office for National Statistics, via Nomis. Open Government Licence v3.0. Source: population_la_nm_31_1_1981_2025.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.APAR_PROVIDER (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Ukprn" VARCHAR,
  "Name" VARCHAR,
  "ApplicationType" VARCHAR,
  "StartDate" VARCHAR,
  "Status" VARCHAR,
  "ApplicationDeterminedDate" VARCHAR,
  "CanDeliverApprenticeships" VARCHAR,
  "CanDeliverApprenticeshipUnits" VARCHAR
)
COMMENT = 'Batch 6. Apprenticeship provider and assessment register. Department for Education. Open Government Licence v3.0. Source: apar-2026-10-14-02-00-08.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.POLICE_STREET_CRIME (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MEMBER" VARCHAR,
  "Crime ID" VARCHAR,
  "Month" VARCHAR,
  "Reported by" VARCHAR,
  "Falls within" VARCHAR,
  "Longitude" VARCHAR,
  "Latitude" VARCHAR,
  "Location" VARCHAR,
  "LSOA code" VARCHAR,
  "LSOA name" VARCHAR,
  "Crime type" VARCHAR,
  "Last outcome category" VARCHAR,
  "Context" VARCHAR
)
COMMENT = 'Batch 6. police.uk street-level crimes, latest 3-year archive. police.uk (Home Office). Open Government Licence v3.0. Source: *-street.csv (every month and force, joined) in police-uk-archive-2026-10-14.zip. Columns named exactly as in the file, after MEMBER (the monthly file each row came from), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.POLICE_OUTCOME (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MEMBER" VARCHAR,
  "Crime ID" VARCHAR,
  "Month" VARCHAR,
  "Reported by" VARCHAR,
  "Falls within" VARCHAR,
  "Longitude" VARCHAR,
  "Latitude" VARCHAR,
  "Location" VARCHAR,
  "LSOA code" VARCHAR,
  "LSOA name" VARCHAR,
  "Outcome type" VARCHAR
)
COMMENT = 'Batch 6. police.uk outcomes, latest 3-year archive. police.uk (Home Office). Open Government Licence v3.0. Source: *-outcomes.csv (every month and force, joined) in police-uk-archive-2026-10-14.zip. Columns named exactly as in the file, after MEMBER (the monthly file each row came from), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NAPTAN_STOP (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ATCOCode" VARCHAR,
  "NaptanCode" VARCHAR,
  "PlateCode" VARCHAR,
  "CleardownCode" VARCHAR,
  "CommonName" VARCHAR,
  "CommonNameLang" VARCHAR,
  "ShortCommonName" VARCHAR,
  "ShortCommonNameLang" VARCHAR,
  "Landmark" VARCHAR,
  "LandmarkLang" VARCHAR,
  "Street" VARCHAR,
  "StreetLang" VARCHAR,
  "Crossing" VARCHAR,
  "CrossingLang" VARCHAR,
  "Indicator" VARCHAR,
  "IndicatorLang" VARCHAR,
  "Bearing" VARCHAR,
  "NptgLocalityCode" VARCHAR,
  "LocalityName" VARCHAR,
  "ParentLocalityName" VARCHAR,
  "GrandParentLocalityName" VARCHAR,
  "Town" VARCHAR,
  "TownLang" VARCHAR,
  "Suburb" VARCHAR,
  "SuburbLang" VARCHAR,
  "LocalityCentre" VARCHAR,
  "GridType" VARCHAR,
  "Easting" VARCHAR,
  "Northing" VARCHAR,
  "Longitude" VARCHAR,
  "Latitude" VARCHAR,
  "StopType" VARCHAR,
  "BusStopType" VARCHAR,
  "TimingStatus" VARCHAR,
  "DefaultWaitTime" VARCHAR,
  "Notes" VARCHAR,
  "NotesLang" VARCHAR,
  "AdministrativeAreaCode" VARCHAR,
  "CreationDateTime" VARCHAR,
  "ModificationDateTime" VARCHAR,
  "RevisionNumber" VARCHAR,
  "Modification" VARCHAR,
  "Status" VARCHAR
)
COMMENT = 'Batch 6. NaPTAN: every public transport stop. Department for Transport. Open Government Licence v3.0. Source: naptan_stops_2026-10-14.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.GRADUATE_OUTCOMES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "graduate_group" VARCHAR,
  "graduate_characteristic" VARCHAR,
  "characteristic_breakdown" VARCHAR,
  "all_responding_graduates" VARCHAR,
  "employed_and_or_fs_graduates" VARCHAR,
  "percentage_in_employment_or_fs" VARCHAR,
  "employed_graduates_uk_work_locn_work_most_important_activity" VARCHAR,
  "employed_graduates_uk_work_locn_work_most_important_activity_in_high_skilled_work" VARCHAR,
  "percentage_in_high_skilled_work" VARCHAR
)
COMMENT = 'Batch 6. HESA Graduate Outcomes data (Explore education statistics data set 8067a649). HESA, via the Department for Education. CC BY 4.0 (credit HESA). Source: hesa_graduate_outcomes_8067a649-9929-43a1-931a-4e58ae04a3f8.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.HE_LISTED_BUILDING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "OBJECTID" VARCHAR,
  "ListEntry" VARCHAR,
  "Name" VARCHAR,
  "Grade" VARCHAR,
  "ListDate" VARCHAR,
  "AmendDate" VARCHAR,
  "CaptureScale" VARCHAR,
  "hyperlink" VARCHAR,
  "NGR" VARCHAR,
  "Easting" VARCHAR,
  "Northing" VARCHAR
)
COMMENT = 'Batch 6. National Heritage List for England: listed building points. Historic England. Open Government Licence v3.0 (credit Historic England). Source: listed_building_points_2026-10-14.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.WIKIDATA_PLACE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "item" VARCHAR,
  "gss" VARCHAR,
  "itemLabel" VARCHAR,
  "itemDescription" VARCHAR,
  "inception" VARCHAR,
  "coord" VARCHAR,
  "type" VARCHAR
)
COMMENT = 'Batch 6. Wikidata: items with an English GSS code (parishes, wards, local authorities...), with description, inception and coordinates. Wikidata. CC0 1.0. Source: wikidata_england_gss_places_2026-10-14.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- ---------------------------------------------------------------------------
-- Grants: the loaders add rows, nothing else
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NESO_DNO_AREA TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ONSPD TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_POPULATION_LSOA TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_POPULATION_LA TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.APAR_PROVIDER TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.POLICE_STREET_CRIME TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.POLICE_OUTCOME TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NAPTAN_STOP TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.GRADUATE_OUTCOMES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.HE_LISTED_BUILDING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.WIKIDATA_PLACE TO ROLE DATA_LOAD_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: 11 rows, ROW_COUNT 0, COLUMNS_ as listed:
--      SHARED_DB.RAW.NESO_DNO_AREA 4
--      SHARED_DB.RAW.ONSPD 57
--      SHARED_DB.RAW.NOMIS_POPULATION_LSOA 11
--      SHARED_DB.RAW.NOMIS_POPULATION_LA 11
--      SHARED_DB.RAW.APAR_PROVIDER 10
--      SHARED_DB.RAW.POLICE_STREET_CRIME 15
--      SHARED_DB.RAW.POLICE_OUTCOME 13
--      SHARED_DB.RAW.NAPTAN_STOP 45
--      OPTIONS_DB.RAW.GRADUATE_OUTCOMES 16
--      SHARED_DB.RAW.HE_LISTED_BUILDING 13
--      SHARED_DB.RAW.WIKIDATA_PLACE 9
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 6.%'
UNION ALL
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME)
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 6.%'
ORDER BY 1;

-- 2. Who else has rights on them. Expected: 2 rows, DATA_LOAD_ROLE with
--    INSERT and with SELECT, each on 11 tables; nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM (
  SELECT PRIVILEGE_TYPE, GRANTEE FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('NESO_DNO_AREA', 'ONSPD', 'NOMIS_POPULATION_LSOA', 'NOMIS_POPULATION_LA', 'APAR_PROVIDER', 'POLICE_STREET_CRIME', 'POLICE_OUTCOME', 'NAPTAN_STOP', 'HE_LISTED_BUILDING', 'WIKIDATA_PLACE')
  UNION ALL
  SELECT PRIVILEGE_TYPE, GRANTEE FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('GRADUATE_OUTCOMES')
) WHERE GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;
