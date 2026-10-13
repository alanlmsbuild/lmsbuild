-- Loading everything, batch 5: the further official data sets (plan of 13
-- October 2026, under decision 15), their RAW tables and grants to
-- DATA_LOAD_ROLE. Loaded by npm run load:data steps 21 to 31
-- (scripts/load/official2.js).
--
--   SHARED_DB.RAW: the SOC 2020 coding index as published; Restart Scheme
--     and Work and Health Programme tables (DWP); NEET and participation at
--     16 and 17; Universal Credit and WHP by month and local authority
--     (Stat-Xplore); online job adverts by SOC 2020 and area (ONS); APS,
--     UK Business Counts, BRES and Census 2021 (Nomis); the Ofqual register;
--     the Employer Skills Survey; Skills England's dashboard data; VACS02;
--     apprenticeship underlying data from the 2022/23 release (2017/18 on);
--     Nesta's skills taxonomy
--   OPTIONS_DB.RAW: the history (achievement rates 2018/19; Ofsted further
--     education and school inspections, yearly since 2018). The 2021/22 to
--     2023/24 achievement rates go into the existing ACHIEVEMENT_ tables
--     (same columns): no new table for them
--
-- Typed tables: columns named exactly as in each file's header, all text;
-- plus SOURCEFILEID and FILEROWNUMBER. PUBLISHED_CELL (one in each
-- database): files whose layout varies, one row per non-empty cell. The
-- Ofqual register and Nesta's taxonomy: one JSON record per row. All
-- add-only; suppressed and small numbers stay as published.
--
-- New file formats: SHARED_DB.RAW.JSON_LINES and SHARED_DB.RAW.CSV_WINDOWS1252
-- (the coding index is Windows-1252), as in OPTIONS_DB.RAW.
--
-- DATA_LOAD_ROLE gets SELECT and INSERT on every new table and USAGE on the
-- new formats: no UPDATE, DELETE, TRUNCATE or CREATE. The app roles get
-- nothing.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE FILE FORMAT IF NOT EXISTS SHARED_DB.RAW.JSON_LINES
  TYPE = JSON COMPRESSION = AUTO
  COMMENT = 'One JSON object per line (the Ofqual register, Nesta''s taxonomy).';
CREATE FILE FORMAT IF NOT EXISTS SHARED_DB.RAW.CSV_WINDOWS1252
  TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"' ENCODING = 'WINDOWS1252' COMPRESSION = AUTO
  EMPTY_FIELD_AS_NULL = FALSE NULL_IF = () TRIM_SPACE = FALSE ERROR_ON_COLUMN_COUNT_MISMATCH = TRUE
  COMMENT = 'CSVs published in Windows-1252 (the SOC 2020 coding index).';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.PUBLISHED_CELL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this cell came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row in the converted copy (one row per cell), as COPY counts it.',
  "MEMBER"      VARCHAR COMMENT 'The file inside a zip, if the original is a zip; otherwise empty.',
  "SHEET"       VARCHAR COMMENT 'The sheet (spreadsheets); empty for a CSV.',
  "SHEETROW"    VARCHAR COMMENT 'The cell''s row in the sheet or CSV, from 1.',
  "SHEETCOLUMN" VARCHAR COMMENT 'Its column, from 1 (A = 1).',
  "HEADERROW"   VARCHAR COMMENT 'The sheet''s header row: the first with at least three non-empty cells (a CSV''s first row). Empty if none.',
  "HEADER"      VARCHAR COMMENT 'The header row''s text in this column, for cells below the header row; empty otherwise.',
  "VALUE"       VARCHAR COMMENT 'The cell''s text as shown (a formula''s result; a date as YYYY-MM-DD). Empty cells are left out.'
)
COMMENT = 'Batch 5. Published files whose layout varies from file to file or year to year (spreadsheets with title rows, yearly CSVs whose columns change), one row per non-empty cell, so they can be kept as published and shaped in silver. What each file is: SOURCE_FILE (by SOURCEFILEID). Add-only.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.PUBLISHED_CELL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this cell came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row in the converted copy (one row per cell), as COPY counts it.',
  "MEMBER"      VARCHAR COMMENT 'The file inside a zip, if the original is a zip; otherwise empty.',
  "SHEET"       VARCHAR COMMENT 'The sheet (spreadsheets); empty for a CSV.',
  "SHEETROW"    VARCHAR COMMENT 'The cell''s row in the sheet or CSV, from 1.',
  "SHEETCOLUMN" VARCHAR COMMENT 'Its column, from 1 (A = 1).',
  "HEADERROW"   VARCHAR COMMENT 'The sheet''s header row: the first with at least three non-empty cells (a CSV''s first row). Empty if none.',
  "HEADER"      VARCHAR COMMENT 'The header row''s text in this column, for cells below the header row; empty otherwise.',
  "VALUE"       VARCHAR COMMENT 'The cell''s text as shown (a formula''s result; a date as YYYY-MM-DD). Empty cells are left out.'
)
COMMENT = 'Batch 5. Published files whose layout varies from file to file or year to year (spreadsheets with title rows, yearly CSVs whose columns change), one row per non-empty cell, so they can be kept as published and shaped in silver. What each file is: SOURCE_FILE (by SOURCEFILEID). Add-only.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.OFQUAL_QUALIFICATION (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER   NUMBER(38,0) NOT NULL COMMENT 'Its line in the fetched file.',
  QUALIFICATIONNUMBER VARCHAR COMMENT 'The qualification number (QAN), e.g. 603/1234/5.',
  ITEM         VARIANT      NOT NULL COMMENT 'The record, as the source gives it.'
)
COMMENT = 'Batch 5. Ofqual register of regulated qualifications: every qualification, from the register API (all pages), one JSON record per row. Ofqual. Open Government Licence v3.0. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.OFQUAL_ORGANISATION (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER   NUMBER(38,0) NOT NULL COMMENT 'Its line in the fetched file.',
  RECOGNITIONNUMBER VARCHAR COMMENT 'The awarding organisation''s recognition number, e.g. RN5133.',
  ITEM         VARIANT      NOT NULL COMMENT 'The record, as the source gives it.'
)
COMMENT = 'Batch 5. Ofqual register: awarding organisations, from the register API, one JSON record per row. Ofqual. Open Government Licence v3.0. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NESTA_SKILLS_TAXONOMY (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  NAME         VARCHAR COMMENT 'The file name.',
  ITEM         VARIANT      NOT NULL COMMENT 'The record, as the source gives it.'
)
COMMENT = 'Batch 5. Nesta UK skills taxonomy v2 (2022): the named hierarchy (skill groups to 6,685 skills), one row per file. Built from Textkernel adverts no longer available, so never updated. Nesta, MIT licence (credit Nesta). Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SOC2020_CODING_INDEX (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "UNIQUE ID" VARCHAR,
  "RECNO" VARCHAR,
  "D" VARCHAR,
  "SOC_90" VARCHAR,
  "SOC_2000" VARCHAR,
  "SOC_2010" VARCHAR,
  "SOC_2020" VARCHAR,
  "SOC_2020_ext" VARCHAR,
  "INDEXOCC" VARCHAR,
  "ADD" VARCHAR,
  "IND" VARCHAR,
  "SEE" VARCHAR,
  "ISCO-08 code based on SOC2020" VARCHAR,
  "VERSNO" VARCHAR,
  "CHANGE" VARCHAR,
  "SOC2020_ext_SUG_title" VARCHAR,
  "SOC90_unit_group_title" VARCHAR,
  "SOC2000_unit_group_title" VARCHAR,
  "SOC2010_unit_group_title" VARCHAR,
  "SOC2020_unit_group_title" VARCHAR,
  "ISCO08_unit_group_title" VARCHAR,
  "INDEXOCC_-_natural_word_order" VARCHAR,
  "*" VARCHAR,
  "* (2)" VARCHAR
)
COMMENT = 'Batch 5. SOC 2020 Volume 2: the coding index. Office for National Statistics. Open Government Licence v3.0 (credit the Office for National Statistics). Source: SOC2020_volume2_thecodingindexv2.csv in soc2020volume2thecodingindexzip20260827v2.zip. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SOC2020_FRAMEWORK (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Unique ID" VARCHAR,
  "SOC2020 Major Group" VARCHAR,
  "SOC2020 Sub-Major Group" VARCHAR,
  "SOC2020 Minor Group" VARCHAR,
  "SOC2020 Unit Group" VARCHAR,
  "SOC2020 Group Title" VARCHAR,
  "Change" VARCHAR,
  "VERNO" VARCHAR
)
COMMENT = 'Batch 5. SOC 2020 Volume 2: the SOC 2020 framework. Office for National Statistics. Open Government Licence v3.0 (credit the Office for National Statistics). Source: SOC2020_framework.csv in soc2020volume2thecodingindexzip20260827v2.zip. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "region_code" VARCHAR,
  "region_name" VARCHAR,
  "old_la_code" VARCHAR,
  "new_la_code" VARCHAR,
  "la_name" VARCHAR,
  "age" VARCHAR,
  "characteristic_grouping" VARCHAR,
  "characteristic" VARCHAR,
  "avg_cohort_count" VARCHAR,
  "avg_neet_nk_count" VARCHAR,
  "avg_neet_count" VARCHAR,
  "avg_nk_count" VARCHAR,
  "neet_nk_percent" VARCHAR,
  "neet_percent" VARCHAR,
  "nk_percent" VARCHAR,
  "annual_change_neet_nk_percent" VARCHAR
)
COMMENT = 'Batch 5. NEET age 16 to 17 by characteristics. Department for Education. Open Government Licence v3.0. Source: neet_by_characteristics_a7bc111a-9503-40df-99fa-764fcb13a2e9.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.PARTICIPATION_16_17_BY_CHARACTERISTICS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "region_code" VARCHAR,
  "region_name" VARCHAR,
  "old_la_code" VARCHAR,
  "new_la_code" VARCHAR,
  "la_name" VARCHAR,
  "age" VARCHAR,
  "characteristic_grouping" VARCHAR,
  "characteristic" VARCHAR,
  "cohort_count" VARCHAR,
  "total_in_education_and_training_count" VARCHAR,
  "total_in_education_and_training_percent" VARCHAR,
  "annual_change_percent" VARCHAR
)
COMMENT = 'Batch 5. Participation age 16 to 17 by characteristics. Department for Education. Open Government Licence v3.0. Source: participation_by_characteristics_e1f4011a-ed67-408e-8b7b-076a44a6cc8c.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.PARTICIPATION_16_17_BY_TYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "region_code" VARCHAR,
  "region_name" VARCHAR,
  "old_la_code" VARCHAR,
  "new_la_code" VARCHAR,
  "la_name" VARCHAR,
  "participation_grouping" VARCHAR,
  "participation_type" VARCHAR,
  "count" VARCHAR,
  "percent" VARCHAR,
  "annual_change_percent" VARCHAR
)
COMMENT = 'Batch 5. Participation age 16 to 17 by type. Department for Education. Open Government Licence v3.0. Source: participation_by_type_a9b8ebe6-1d51-41c3-babe-ee7d16ea5f78.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.STATXPLORE_TABLE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATABASE" VARCHAR,
  "MEASURE" VARCHAR,
  "MONTH" VARCHAR,
  "MONTHCODE" VARCHAR,
  "AREACODE" VARCHAR,
  "AREANAME" VARCHAR,
  "BREAKDOWN" VARCHAR,
  "BREAKDOWNVALUE" VARCHAR,
  "VALUE" VARCHAR
)
COMMENT = 'Batch 5. Stat-Xplore: UC_Monthly by month and local authority. Department for Work and Pensions, via Stat-Xplore. Open Government Licence v3.0. Source: uc_people_by_employment_201305_202605.csv; uc_people_by_conditionality_201305_202605.csv; uc_households_201508_202605.csv; whp_referrals_201711_202411.csv; whp_starts_201711_202411.csv; whp_job_outcomes_201711_202410.csv; whp_first_earnings_201711_202410.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_APS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE" VARCHAR,
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "VARIABLE_CODE" VARCHAR,
  "VARIABLE_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 5. Annual Population Survey: qualifications and employment (Nomis NM_17_5). Office for National Statistics, via Nomis. Open Government Licence v3.0 (credit the Office for National Statistics). Source: aps_nm_17_5_2004-12_2026-03.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_UBC_LOCAL_UNITS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "INDUSTRY_NAME" VARCHAR,
  "EMPLOYMENT_SIZEBAND_NAME" VARCHAR,
  "LEGAL_STATUS_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 5. UK Business Counts: local units (Nomis NM_141_1). Office for National Statistics, via Nomis. Open Government Licence v3.0 (credit the Office for National Statistics). Source: ubc_local_units_nm_141_1_2010_2026.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_UBC_ENTERPRISES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "INDUSTRY_NAME" VARCHAR,
  "EMPLOYMENT_SIZEBAND_NAME" VARCHAR,
  "LEGAL_STATUS_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 5. UK Business Counts: enterprises (Nomis NM_142_1). Office for National Statistics, via Nomis. Open Government Licence v3.0 (credit the Office for National Statistics). Source: ubc_enterprises_nm_142_1_2010_2026.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_BRES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "INDUSTRY_NAME" VARCHAR,
  "EMPLOYMENT_STATUS_NAME" VARCHAR,
  "MEASURE_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 5. Business Register and Employment Survey, open access (Nomis NM_189_1). Office for National Statistics, via Nomis. Open Government Licence v3.0 (credit the Office for National Statistics). Source: bres_nm_189_1_2015_2024.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_CENSUS_TS063_OCCUPATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "C2021_OCC_10_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 5. Census 2021 TS063: occupation (Nomis NM_2080_1). Office for National Statistics, via Nomis. Open Government Licence v3.0 (credit the Office for National Statistics). Source: census_ts063_occupation_nm_2080_1_2021_2021.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NOMIS_CENSUS_TS060_INDUSTRY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DATE_NAME" VARCHAR,
  "GEOGRAPHY_CODE" VARCHAR,
  "GEOGRAPHY_NAME" VARCHAR,
  "GEOGRAPHY_TYPE" VARCHAR,
  "C2021_IND_88_NAME" VARCHAR,
  "MEASURES_NAME" VARCHAR,
  "OBS_VALUE" VARCHAR,
  "OBS_STATUS_NAME" VARCHAR
)
COMMENT = 'Batch 5. Census 2021 TS060: industry (Nomis NM_2077_1). Office for National Statistics, via Nomis. Open Government Licence v3.0 (credit the Office for National Statistics). Source: census_ts060_industry_nm_2077_1_2021_2021.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ESS_CORE_INDICATORS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "country_name" VARCHAR,
  "region_name" VARCHAR,
  "site_size" VARCHAR,
  "sector" VARCHAR,
  "single_or_multi_site" VARCHAR,
  "site_type" VARCHAR,
  "weight_base" VARCHAR,
  "has_trained_base" VARCHAR,
  "sample_size" VARCHAR,
  "sample_size_w_vac" VARCHAR,
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "region_code" VARCHAR,
  "country_code" VARCHAR,
  "has_vac" VARCHAR,
  "has_htfv" VARCHAR,
  "has_ssv" VARCHAR,
  "has_skillgap" VARCHAR,
  "vac_sum" VARCHAR,
  "htfv_sum" VARCHAR,
  "ssv_sum" VARCHAR,
  "skillgaps" VARCHAR,
  "employees" VARCHAR,
  "trainees" VARCHAR,
  "training_days" VARCHAR,
  "has_offthejob_training" VARCHAR,
  "has_onthejob_training" VARCHAR,
  "has_onthejob_training_only" VARCHAR,
  "has_training_in_general" VARCHAR,
  "has_e_learning" VARCHAR,
  "has_basic_induction_training" VARCHAR,
  "has_extensive_induction_training" VARCHAR,
  "has_health_safety_training" VARCHAR,
  "has_job_specific_training" VARCHAR,
  "has_supervisory_training" VARCHAR,
  "has_management_training" VARCHAR,
  "has_new_technology_training" VARCHAR,
  "vac_inc" VARCHAR,
  "htfv_inc" VARCHAR,
  "ssv_inc" VARCHAR,
  "skillgap_inc" VARCHAR,
  "offthejob_training_inc" VARCHAR,
  "onthejob_training_inc" VARCHAR,
  "onthejob_training_only_inc" VARCHAR,
  "training_in_general_inc" VARCHAR,
  "e_learning_inc" VARCHAR,
  "basic_induction_training_inc" VARCHAR,
  "extensive_induction_training_inc" VARCHAR,
  "health_safety_training_inc" VARCHAR,
  "job_specific_training_inc" VARCHAR,
  "supervisory_training_inc" VARCHAR,
  "management_training_inc" VARCHAR,
  "new_technology_training_inc" VARCHAR,
  "vac_den" VARCHAR,
  "htfv_den" VARCHAR,
  "ssv_den" VARCHAR,
  "skillgap_den" VARCHAR,
  "training_den" VARCHAR,
  "train_days_employee" VARCHAR,
  "train_days_trainee" VARCHAR
)
COMMENT = 'Batch 5. Employer Skills Survey: core indicators. Department for Education. Open Government Licence v3.0. Source: core_indicators_1e6b799b-c9c0-41bb-aaf8-997dcdc546cc.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ESS_INVESTMENT_IN_TRAINING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "country_name" VARCHAR,
  "country_code" VARCHAR,
  "region_name" VARCHAR,
  "region_code" VARCHAR,
  "site_size" VARCHAR,
  "sector" VARCHAR,
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "iit_sample_size" VARCHAR,
  "employees" VARCHAR,
  "trainees" VARCHAR,
  "total_per_employee" VARCHAR,
  "total_per_trainee" VARCHAR,
  "sum_off_job_mn" VARCHAR,
  "sum_on_job_mn" VARCHAR,
  "sum_total_mn" VARCHAR,
  "twentyfour_prices_total_per_employee" VARCHAR,
  "twentyfour_prices_total_per_trainee" VARCHAR,
  "twentyfour_inflaton_sum_off_job_mn" VARCHAR,
  "twentyfour_inflaton_sum_on_job_mn" VARCHAR,
  "twentyfour_prices_sum_total_mn" VARCHAR
)
COMMENT = 'Batch 5. Employer Skills Survey: investment in training. Department for Education. Open Government Licence v3.0. Source: investment_in_training_a07479d1-e26d-4b66-9ec9-e683917c1388.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ESS_VACANCY_SOC2010 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "country_name" VARCHAR,
  "country_code" VARCHAR,
  "geographic_level" VARCHAR,
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "sector" VARCHAR,
  "soc2010_4_labelled" VARCHAR,
  "soc2010_3_labelled" VARCHAR,
  "soc2010_2_labelled" VARCHAR,
  "soc2010_1_labelled" VARCHAR,
  "sample_occupations_site_has_vacancy" VARCHAR,
  "vac_sum" VARCHAR,
  "htfv_sum" VARCHAR,
  "ssv_sum" VARCHAR,
  "htfv_den" VARCHAR,
  "ssv_den" VARCHAR
)
COMMENT = 'Batch 5. Employer Skills Survey: vacancy measures by occupation (SOC 2010). Department for Education. Open Government Licence v3.0. Source: vacancy_measures_soc2010_450dc707-6bd9-445f-910c-eb9e36b76712.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ESS_VACANCY_SOC2020 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "country_name" VARCHAR,
  "country_code" VARCHAR,
  "geographic_level" VARCHAR,
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "sector" VARCHAR,
  "soc2020_4_labelled" VARCHAR,
  "soc2020_3_labelled" VARCHAR,
  "soc2020_2_labelled" VARCHAR,
  "soc2020_1_labelled" VARCHAR,
  "sample_occupations_site_has_vacancy" VARCHAR,
  "vac_sum" VARCHAR,
  "htfv_sum" VARCHAR,
  "ssv_sum" VARCHAR,
  "htfv_den" VARCHAR,
  "ssv_den" VARCHAR
)
COMMENT = 'Batch 5. Employer Skills Survey: vacancy measures by occupation (SOC 2020). Department for Education. Open Government Licence v3.0. Source: vacancy_measures_soc2020_1c000555-8188-4e28-ac32-22313d8702a1.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ESS_MAYORAL_CORE_INDICATORS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "country_name" VARCHAR,
  "country_code" VARCHAR,
  "region_name" VARCHAR,
  "region_code" VARCHAR,
  "english_devolved_area_name" VARCHAR,
  "english_devolved_area_code" VARCHAR,
  "geographic_level" VARCHAR,
  "site_size" VARCHAR,
  "sector" VARCHAR,
  "single_or_multi_site" VARCHAR,
  "site_type" VARCHAR,
  "weight_base" VARCHAR,
  "has_trained_base" VARCHAR,
  "sample_size" VARCHAR,
  "sample_size_w_vac" VARCHAR,
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "has_vac" VARCHAR,
  "has_htfv" VARCHAR,
  "has_ssv" VARCHAR,
  "has_skillgap" VARCHAR,
  "vac_sum" VARCHAR,
  "htfv_sum" VARCHAR,
  "ssv_sum" VARCHAR,
  "skillgaps" VARCHAR,
  "employees" VARCHAR,
  "trainees" VARCHAR,
  "training_days" VARCHAR,
  "has_offthejob_training" VARCHAR,
  "has_onthejob_training" VARCHAR,
  "has_onthejob_training_only" VARCHAR,
  "has_training_in_general" VARCHAR,
  "has_e_learning" VARCHAR,
  "has_basic_induction_training" VARCHAR,
  "has_extensive_induction_training" VARCHAR,
  "has_health_safety_training" VARCHAR,
  "has_job_specific_training" VARCHAR,
  "has_supervisory_training" VARCHAR,
  "has_management_training" VARCHAR,
  "has_new_technology_training" VARCHAR,
  "vac_inc" VARCHAR,
  "htfv_inc" VARCHAR,
  "ssv_inc" VARCHAR,
  "skillgap_inc" VARCHAR,
  "offthejob_training_inc" VARCHAR,
  "onthejob_training_inc" VARCHAR,
  "onthejob_training_only_inc" VARCHAR,
  "training_in_general_inc" VARCHAR,
  "e_learning_inc" VARCHAR,
  "basic_induction_training_inc" VARCHAR,
  "extensive_induction_training_inc" VARCHAR,
  "health_safety_training_inc" VARCHAR,
  "job_specific_training_inc" VARCHAR,
  "supervisory_training_inc" VARCHAR,
  "management_training_inc" VARCHAR,
  "new_technology_training_inc" VARCHAR,
  "vac_den" VARCHAR,
  "htfv_den" VARCHAR,
  "ssv_den" VARCHAR,
  "skillgap_den" VARCHAR,
  "training_den" VARCHAR,
  "train_days_employee" VARCHAR,
  "train_days_trainee" VARCHAR
)
COMMENT = 'Batch 5. Employer Skills Survey: core indicators by mayoral strategic authority. Department for Education. Open Government Licence v3.0. Source: mayoral_authority_core_indicators_22_24_with_filters.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ESS_TWO_DIGIT_SIC_CORE_INDICATORS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "country_name" VARCHAR,
  "country_code" VARCHAR,
  "region_name" VARCHAR,
  "region_code" VARCHAR,
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "site_size" VARCHAR,
  "twodigit_sic" VARCHAR,
  "single_or_multi_site" VARCHAR,
  "site_type" VARCHAR,
  "weight_base" VARCHAR,
  "has_trained_base" VARCHAR,
  "sample_size" VARCHAR,
  "sample_size_w_vac" VARCHAR,
  "has_vac" VARCHAR,
  "has_htfv" VARCHAR,
  "has_ssv" VARCHAR,
  "has_skillgap" VARCHAR,
  "vac_sum" VARCHAR,
  "htfv_sum" VARCHAR,
  "ssv_sum" VARCHAR,
  "skillgaps" VARCHAR,
  "employees" VARCHAR,
  "trainees" VARCHAR,
  "training_days" VARCHAR,
  "has_offthejob_training" VARCHAR,
  "has_onthejob_training" VARCHAR,
  "has_onthejob_training_only" VARCHAR,
  "has_training_in_general" VARCHAR,
  "has_e_learning" VARCHAR,
  "has_basic_induction_training" VARCHAR,
  "has_extensive_induction_training" VARCHAR,
  "has_health_safety_training" VARCHAR,
  "has_job_specific_training" VARCHAR,
  "has_supervisory_training" VARCHAR,
  "has_management_training" VARCHAR,
  "has_new_technology_training" VARCHAR,
  "vac_inc" VARCHAR,
  "htfv_inc" VARCHAR,
  "ssv_inc" VARCHAR,
  "skillgap_inc" VARCHAR,
  "offthejob_training_inc" VARCHAR,
  "onthejob_training_inc" VARCHAR,
  "onthejob_training_only_inc" VARCHAR,
  "training_in_general_inc" VARCHAR,
  "e_learning_inc" VARCHAR,
  "basic_induction_training_inc" VARCHAR,
  "extensive_induction_training_inc" VARCHAR,
  "health_safety_training_inc" VARCHAR,
  "job_specific_training_inc" VARCHAR,
  "supervisory_training_inc" VARCHAR,
  "management_training_inc" VARCHAR,
  "new_technology_training_inc" VARCHAR,
  "vac_den" VARCHAR,
  "htfv_den" VARCHAR,
  "ssv_den" VARCHAR,
  "skillgap_den" VARCHAR,
  "training_den" VARCHAR,
  "train_days_employee" VARCHAR,
  "train_days_trainee" VARCHAR
)
COMMENT = 'Batch 5. Employer Skills Survey: core indicators by two-digit SIC. Department for Education. Open Government Licence v3.0. Source: twodigitsic_core_indicators_22_24_with_filters.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_LSIP_DATAHUB (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Area" VARCHAR,
  "metric" VARCHAR,
  "metricNeat" VARCHAR,
  "Breakdown" VARCHAR,
  "Subgroup" VARCHAR,
  "Period" VARCHAR,
  "valueText" VARCHAR
)
COMMENT = 'Batch 5. Skills England Local Skills Dashboard: data hub. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_datahub.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_LSIP_TIME (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "geogConcat" VARCHAR,
  "metric" VARCHAR,
  "timePeriod" VARCHAR,
  "chartPeriod" VARCHAR,
  "latest" VARCHAR,
  "value" VARCHAR,
  "valueText" VARCHAR
)
COMMENT = 'Batch 5. Skills England Local Skills Dashboard: time series. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_time1.csv; C_time2.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_LSIP_BREAKDOWN (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "geogConcat" VARCHAR,
  "metric" VARCHAR,
  "breakdown" VARCHAR,
  "subgroup" VARCHAR,
  "value" VARCHAR,
  "total" VARCHAR,
  "valueText" VARCHAR
)
COMMENT = 'Batch 5. Skills England Local Skills Dashboard: breakdowns. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_breakdown.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_LSIP_TOP_TEN (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "metric" VARCHAR,
  "breakdown" VARCHAR,
  "geogConcat" VARCHAR,
  "subgroup" VARCHAR,
  "Occupation (SOC2020 Major Group)" VARCHAR
)
COMMENT = 'Batch 5. Skills England Local Skills Dashboard: top ten in each breakdown. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_topTenEachBreakdown.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_JOBS_SKILLS_TIME (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "geogConcat" VARCHAR,
  "chartPeriod" VARCHAR,
  "timePeriod" VARCHAR,
  "latest" VARCHAR,
  "metric" VARCHAR,
  "breakdown" VARCHAR,
  "subgroup" VARCHAR,
  "breakdown2" VARCHAR,
  "ids" VARCHAR,
  "value" VARCHAR,
  "valueText" VARCHAR,
  "SOC2010code" VARCHAR,
  "source" VARCHAR,
  "SOC2020code" VARCHAR
)
COMMENT = 'Batch 5. Skills England Jobs and Skills Dashboard: time series. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_time.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_JOBS_SKILLS_TABLE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "geogConcat" VARCHAR,
  "subgroup" VARCHAR,
  "breakdown" VARCHAR,
  "Employed" VARCHAR,
  "EmployedLast" VARCHAR,
  "growth" VARCHAR,
  "EmployedFemale" VARCHAR,
  "femalePerc" VARCHAR,
  "employmentProjectionGrowth2023to2035" VARCHAR,
  "employmentProjectionGrowth2023to2030" VARCHAR,
  "latest" VARCHAR,
  "vac_sum" VARCHAR,
  "htfv_sum" VARCHAR,
  "htfv_den" VARCHAR,
  "ssv_sum" VARCHAR,
  "ssv_den" VARCHAR,
  "sample_occupations_estab_has_vacancy" VARCHAR
)
COMMENT = 'Batch 5. Skills England Jobs and Skills Dashboard: occupation table. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_table.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_JOBS_SKILLS_PATHWAYS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "subgroup" VARCHAR,
  "STEM" VARCHAR,
  "pathway" VARCHAR,
  "SubjectHEFE" VARCHAR,
  "value" VARCHAR,
  "englandPer" VARCHAR,
  "ids" VARCHAR,
  "label" VARCHAR,
  "parents" VARCHAR,
  "colors" VARCHAR,
  "labelPer" VARCHAR,
  "idsPer" VARCHAR
)
COMMENT = 'Batch 5. Skills England Jobs and Skills Dashboard: education pathways. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_pathways.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SE_JOBS_SKILLS_SECTOR_LOOKUP (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Sector" VARCHAR,
  "SOC" VARCHAR,
  "SectorSocYear" VARCHAR,
  "SOCcode" VARCHAR,
  "occYear" VARCHAR
)
COMMENT = 'Batch 5. Skills England Jobs and Skills Dashboard: sector to SOC lookup. Skills England (Department for Education). MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0). Source: C_sectorLookup.csv. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.APP_UNDERLYING_STARTS_2022_23 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "year" VARCHAR,
  "snapshot" VARCHAR,
  "ukprn" VARCHAR,
  "provider_name" VARCHAR,
  "provider_type" VARCHAR,
  "delivery_region_code" VARCHAR,
  "delivery_region" VARCHAR,
  "delivery_pcon_code" VARCHAR,
  "delivery_pcon" VARCHAR,
  "delivery_la_code" VARCHAR,
  "delivery_la" VARCHAR,
  "delivery_lad_code" VARCHAR,
  "delivery_lad" VARCHAR,
  "delivery_devolved_administration_code" VARCHAR,
  "delivery_devolved_administration" VARCHAR,
  "learner_home_region_code" VARCHAR,
  "learner_home_region" VARCHAR,
  "learner_home_pcon_code" VARCHAR,
  "learner_home_pcon" VARCHAR,
  "learnerhome_la_code" VARCHAR,
  "learnerhome_la" VARCHAR,
  "learner_home_lad_code" VARCHAR,
  "learner_home_lad" VARCHAR,
  "learner_home_devolved_administration_code" VARCHAR,
  "learner_home_devolved_administration" VARCHAR,
  "age_summary" VARCHAR,
  "age_youth_adult" VARCHAR,
  "apps_level_6p" VARCHAR,
  "apps_level" VARCHAR,
  "apps_level_detailed" VARCHAR,
  "ssa_t1_code" VARCHAR,
  "ssa_t1_desc" VARCHAR,
  "ssa_t2_code" VARCHAR,
  "ssa_t2_desc" VARCHAR,
  "stem" VARCHAR,
  "std_fwk_flag" VARCHAR,
  "std_fwk_name" VARCHAR,
  "std_fwk_code" VARCHAR,
  "st_code" VARCHAR,
  "route" VARCHAR,
  "apps_degree" VARCHAR,
  "start_quarter" VARCHAR,
  "start_month_number" VARCHAR,
  "start_month_name" VARCHAR,
  "length_of_employment" VARCHAR,
  "funding_type" VARCHAR,
  "starts" VARCHAR,
  "of_which_flexi_jobs" VARCHAR
)
COMMENT = 'Batch 5. Apprenticeships and traineeships 2022/23 underlying data: starts. Department for Education. Open Government Licence v3.0. Source: underlying-data-apps-starts-202223-q4.csv in underlying-data-apps-starts-202223-q4.zip. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.APP_UNDERLYING_ACHIEVEMENTS_2022_23 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "year" VARCHAR,
  "snapshot" VARCHAR,
  "ukprn" VARCHAR,
  "provider_name" VARCHAR,
  "provider_type" VARCHAR,
  "delivery_region_code" VARCHAR,
  "delivery_region" VARCHAR,
  "delivery_pcon_code" VARCHAR,
  "delivery_pcon" VARCHAR,
  "delivery_la_code" VARCHAR,
  "delivery_la" VARCHAR,
  "delivery_lad_code" VARCHAR,
  "delivery_lad" VARCHAR,
  "delivery_devolved_administration_code" VARCHAR,
  "delivery_devolved_administration" VARCHAR,
  "learner_home_region_code" VARCHAR,
  "learner_home_region" VARCHAR,
  "learner_home_pcon_code" VARCHAR,
  "learner_home_pcon" VARCHAR,
  "learnerhome_la_code" VARCHAR,
  "learnerhome_la" VARCHAR,
  "learner_home_lad_code" VARCHAR,
  "learner_home_lad" VARCHAR,
  "learner_home_devolved_administration_code" VARCHAR,
  "learner_home_devolved_administration" VARCHAR,
  "age_summary" VARCHAR,
  "age_youth_adult" VARCHAR,
  "apps_level_6p" VARCHAR,
  "apps_level" VARCHAR,
  "apps_level_detailed" VARCHAR,
  "ssa_t1_code" VARCHAR,
  "ssa_t1_desc" VARCHAR,
  "ssa_t2_code" VARCHAR,
  "ssa_t2_desc" VARCHAR,
  "stem" VARCHAR,
  "std_fwk_flag" VARCHAR,
  "framework_standard_name" VARCHAR,
  "std_fwk_code" VARCHAR,
  "st_code" VARCHAR,
  "route" VARCHAR,
  "apps_degree" VARCHAR,
  "leave_month_number" VARCHAR,
  "leave_month_name" VARCHAR,
  "leave_quarter" VARCHAR,
  "length_of_employment" VARCHAR,
  "funding_type" VARCHAR,
  "achievements" VARCHAR
)
COMMENT = 'Batch 5. Apprenticeships and traineeships 2022/23 underlying data: achievements. Department for Education. Open Government Licence v3.0. Source: underlying-data-apps-achievements-202223-q4.csv in underlying-data-apps-achievements-202223-q4.zip. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- ---------------------------------------------------------------------------
-- Grants: the loaders add rows, nothing else
-- ---------------------------------------------------------------------------
GRANT USAGE ON FILE FORMAT SHARED_DB.RAW.JSON_LINES TO ROLE DATA_LOAD_ROLE;
GRANT USAGE ON FILE FORMAT SHARED_DB.RAW.CSV_WINDOWS1252 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.PUBLISHED_CELL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.PUBLISHED_CELL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.OFQUAL_QUALIFICATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.OFQUAL_ORGANISATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NESTA_SKILLS_TAXONOMY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SOC2020_CODING_INDEX TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SOC2020_FRAMEWORK TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.PARTICIPATION_16_17_BY_CHARACTERISTICS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.PARTICIPATION_16_17_BY_TYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.STATXPLORE_TABLE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_APS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_UBC_LOCAL_UNITS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_UBC_ENTERPRISES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_BRES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_CENSUS_TS063_OCCUPATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.NOMIS_CENSUS_TS060_INDUSTRY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ESS_CORE_INDICATORS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ESS_INVESTMENT_IN_TRAINING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ESS_VACANCY_SOC2010 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ESS_VACANCY_SOC2020 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ESS_MAYORAL_CORE_INDICATORS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ESS_TWO_DIGIT_SIC_CORE_INDICATORS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_LSIP_DATAHUB TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_LSIP_TIME TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_LSIP_BREAKDOWN TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_LSIP_TOP_TEN TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_JOBS_SKILLS_TIME TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_JOBS_SKILLS_TABLE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_JOBS_SKILLS_PATHWAYS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SE_JOBS_SKILLS_SECTOR_LOOKUP TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.APP_UNDERLYING_STARTS_2022_23 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.APP_UNDERLYING_ACHIEVEMENTS_2022_23 TO ROLE DATA_LOAD_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: 33 rows, ROW_COUNT 0, COLUMNS_ as listed:
--      SHARED_DB.RAW.PUBLISHED_CELL 9
--      OPTIONS_DB.RAW.PUBLISHED_CELL 9
--      SHARED_DB.RAW.OFQUAL_QUALIFICATION 4
--      SHARED_DB.RAW.OFQUAL_ORGANISATION 4
--      SHARED_DB.RAW.NESTA_SKILLS_TAXONOMY 3
--      SHARED_DB.RAW.SOC2020_CODING_INDEX 26
--      SHARED_DB.RAW.SOC2020_FRAMEWORK 10
--      SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS 23
--      SHARED_DB.RAW.PARTICIPATION_16_17_BY_CHARACTERISTICS 19
--      SHARED_DB.RAW.PARTICIPATION_16_17_BY_TYPE 17
--      SHARED_DB.RAW.STATXPLORE_TABLE 11
--      SHARED_DB.RAW.NOMIS_APS 12
--      SHARED_DB.RAW.NOMIS_UBC_LOCAL_UNITS 12
--      SHARED_DB.RAW.NOMIS_UBC_ENTERPRISES 12
--      SHARED_DB.RAW.NOMIS_BRES 12
--      SHARED_DB.RAW.NOMIS_CENSUS_TS063_OCCUPATION 10
--      SHARED_DB.RAW.NOMIS_CENSUS_TS060_INDUSTRY 10
--      SHARED_DB.RAW.ESS_CORE_INDICATORS 63
--      SHARED_DB.RAW.ESS_INVESTMENT_IN_TRAINING 24
--      SHARED_DB.RAW.ESS_VACANCY_SOC2010 18
--      SHARED_DB.RAW.ESS_VACANCY_SOC2020 18
--      SHARED_DB.RAW.ESS_MAYORAL_CORE_INDICATORS 65
--      SHARED_DB.RAW.ESS_TWO_DIGIT_SIC_CORE_INDICATORS 63
--      SHARED_DB.RAW.SE_LSIP_DATAHUB 9
--      SHARED_DB.RAW.SE_LSIP_TIME 9
--      SHARED_DB.RAW.SE_LSIP_BREAKDOWN 9
--      SHARED_DB.RAW.SE_LSIP_TOP_TEN 7
--      SHARED_DB.RAW.SE_JOBS_SKILLS_TIME 16
--      SHARED_DB.RAW.SE_JOBS_SKILLS_TABLE 19
--      SHARED_DB.RAW.SE_JOBS_SKILLS_PATHWAYS 14
--      SHARED_DB.RAW.SE_JOBS_SKILLS_SECTOR_LOOKUP 7
--      SHARED_DB.RAW.APP_UNDERLYING_STARTS_2022_23 50
--      SHARED_DB.RAW.APP_UNDERLYING_ACHIEVEMENTS_2022_23 49
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 5.%'
UNION ALL
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME)
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 5.%'
ORDER BY 1;

-- 2. Who else has rights on them. Expected: 2 rows, DATA_LOAD_ROLE with
--    INSERT and with SELECT, each on 33 tables; nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM (
  SELECT PRIVILEGE_TYPE, GRANTEE FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('PUBLISHED_CELL', 'OFQUAL_QUALIFICATION', 'OFQUAL_ORGANISATION', 'NESTA_SKILLS_TAXONOMY', 'SOC2020_CODING_INDEX', 'SOC2020_FRAMEWORK', 'NEET_16_17_BY_CHARACTERISTICS', 'PARTICIPATION_16_17_BY_CHARACTERISTICS', 'PARTICIPATION_16_17_BY_TYPE', 'STATXPLORE_TABLE', 'NOMIS_APS', 'NOMIS_UBC_LOCAL_UNITS', 'NOMIS_UBC_ENTERPRISES', 'NOMIS_BRES', 'NOMIS_CENSUS_TS063_OCCUPATION', 'NOMIS_CENSUS_TS060_INDUSTRY', 'ESS_CORE_INDICATORS', 'ESS_INVESTMENT_IN_TRAINING', 'ESS_VACANCY_SOC2010', 'ESS_VACANCY_SOC2020', 'ESS_MAYORAL_CORE_INDICATORS', 'ESS_TWO_DIGIT_SIC_CORE_INDICATORS', 'SE_LSIP_DATAHUB', 'SE_LSIP_TIME', 'SE_LSIP_BREAKDOWN', 'SE_LSIP_TOP_TEN', 'SE_JOBS_SKILLS_TIME', 'SE_JOBS_SKILLS_TABLE', 'SE_JOBS_SKILLS_PATHWAYS', 'SE_JOBS_SKILLS_SECTOR_LOOKUP', 'APP_UNDERLYING_STARTS_2022_23', 'APP_UNDERLYING_ACHIEVEMENTS_2022_23')
  UNION ALL
  SELECT PRIVILEGE_TYPE, GRANTEE FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('PUBLISHED_CELL')
) WHERE GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. The new file formats. Expected: JSON_LINES and CSV_WINDOWS1252 in SHARED_DB.RAW.
SHOW FILE FORMATS IN SCHEMA SHARED_DB.RAW;
