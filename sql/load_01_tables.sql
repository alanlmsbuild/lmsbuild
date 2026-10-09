-- Loading everything, steps 1 to 5: the tables they load into, and their
-- grants to DATA_LOAD_ROLE. Run after sql/load_00_setup.sql.
--
--   1. Knowledge bank  -> OPTIONS_DB.CONTENT (entries, questions, topics,
--                         glossary, synonyms, jobs)
--   2. Page data       -> OPTIONS_DB.CONTENT (the 2,689 institution files,
--                         institutions.json, national.json, sources.json,
--                         import-log.jsonl)
--   3. National 16 to 18 figures (2 API data sets) -> OPTIONS_DB.RAW
--   4. Ofsted further education and skills (4 sheets) -> OPTIONS_DB.RAW
--   5. Education and training achievement rates -> OPTIONS_DB.RAW
--
-- CONTENT holds COPIES of the school-leavers-app repo files. The repo is
-- the source of truth: a command reloads the copy after commits (refusing
-- files with uncommitted changes), and nothing here is ever edited. Each
-- reload adds a new set of rows under a new CONTENTLOADID, so the history
-- stays; the *_CURRENT views show the latest load. The original YAML,
-- Markdown and JSON files go into the stage untouched; COPY reads them
-- converted to one JSON object per line.
--
-- RAW tables: columns named exactly as in the file's header, all text,
-- plus SOURCEFILEID and FILEROWNUMBER. Add-only: a new version of a file is
-- a new set of rows. The loader does each file's COPY and its SOURCE_FILE
-- row in one transaction, so a failed load leaves nothing behind and can
-- simply be run again. Typed CLEAN tables come in a later file.
--
-- DATA_LOAD_ROLE gets SELECT and INSERT on every table here: no UPDATE,
-- DELETE or TRUNCATE (add-only), no CREATE. ILR_APP_ROLE gets nothing.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- CONTENT (steps 1 and 2)
-- ---------------------------------------------------------------------------
ALTER SCHEMA OPTIONS_DB.CONTENT SET
  COMMENT = 'COPIES of the school-leavers-app repo files: the knowledge bank (content/) and the page data built from official data (data/). The repo is the source of truth. Reloaded by a command after commits; never edit anything here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.CONTENT_LOAD (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  PART          VARCHAR(20)   NOT NULL COMMENT 'knowledge-bank (content/) or page-data (data/).',
  GITCOMMIT     VARCHAR(40)   NOT NULL COMMENT 'The school-leavers-app commit loaded. The loader refuses files with uncommitted changes.',
  SETSHA256     VARCHAR(64)   NOT NULL COMMENT 'Checksum over every file''s path and checksum. If it matches the latest load of the part, nothing is loaded.',
  FILECOUNT     NUMBER(38,0)  NOT NULL,
  ROWSLOADED    VARIANT       COMMENT 'Rows loaded, per table.',
  JOBRUNID      VARCHAR(36)   COMMENT 'The SHARED_DB.OPS.JOB_RUN row of the run.',
  LOADEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CONSTRAINT PK_CONTENT_LOAD PRIMARY KEY (CONTENTLOADID)
)
COMMENT = 'One row per reload of a copy of the repo files (knowledge bank or page data). The repo is the source of truth; never edited here. Add-only.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.ENTRY (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL COMMENT 'The OPTIONS_DB.RAW.SOURCE_FILE row of the .md file.',
  ID            VARCHAR(200)  NOT NULL,
  QUESTIONNUMBER NUMBER(38,0) COMMENT 'Its number in content/questions.yaml.',
  QUESTION      VARCHAR(1000),
  TOPIC         VARCHAR(200),
  STATUS        VARCHAR(20)   COMMENT 'draft or reviewed.',
  FRONTMATTER   VARIANT       NOT NULL COMMENT 'Everything in the file''s front matter, as written.',
  BODY          VARCHAR       NOT NULL COMMENT 'The Markdown after the front matter, as written.'
)
COMMENT = 'COPY of content/entries/*.md (one row per answer) in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.QUESTION (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  ID            VARCHAR(200)  NOT NULL,
  QUESTIONNUMBER NUMBER(38,0),
  QUESTION      VARCHAR(1000),
  TOPIC         VARCHAR(200),
  STATE         VARCHAR(40),
  ITEM          VARIANT       NOT NULL COMMENT 'The whole item, as written.'
)
COMMENT = 'COPY of content/questions.yaml in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.TOPIC (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  ID            VARCHAR(200)  NOT NULL,
  STEP          NUMBER(38,0)  COMMENT 'Its place on the route.',
  NAME          VARCHAR(300),
  ITEM          VARIANT       NOT NULL COMMENT 'The whole item, as written.'
)
COMMENT = 'COPY of content/topics.yaml in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.GLOSSARY_TERM (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  ID            VARCHAR(200)  NOT NULL,
  TERM          VARCHAR(300),
  ITEM          VARIANT       NOT NULL COMMENT 'The whole item, as written.'
)
COMMENT = 'COPY of content/glossary.yaml in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.SYNONYM (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  MEANS         VARCHAR(300)  COMMENT 'The word the others mean.',
  KIND          VARCHAR(40),
  ITEM          VARIANT       NOT NULL COMMENT 'The whole item, as written.'
)
COMMENT = 'COPY of content/synonyms.yaml in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.JOB (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  ID            VARCHAR(200)  NOT NULL,
  NAME          VARCHAR(300),
  ITEM          VARIANT       NOT NULL COMMENT 'The whole item, as written (with its SOC 2020, occupation, standard and LARS links).'
)
COMMENT = 'COPY of content/jobs.yaml in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.INSTITUTION_PAGE (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  URN           VARCHAR(20)   NOT NULL,
  UKPRN         VARCHAR(20),
  NAME          VARCHAR(300),
  KIND          VARCHAR(60),
  ITEM          VARIANT       NOT NULL COMMENT 'The whole file, as built.'
)
COMMENT = 'COPY of data/institutions/<URN>.json (one row per college or sixth form page) in the school-leavers-app repo, built by npm run import:institutions; the repo is the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.PAGE_DATA_FILE (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  FILENAME      VARCHAR(200)  NOT NULL COMMENT 'institutions.json, national.json or sources.json.',
  ITEM          VARIANT       NOT NULL COMMENT 'The whole file, as built.'
)
COMMENT = 'COPY of data/institutions.json, national.json and sources.json in the school-leavers-app repo, built by npm run import:institutions; the repo is the source of truth. Reloaded by a command after commits; never edit it here.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.CONTENT.IMPORT_LOG_LINE (
  CONTENTLOADID VARCHAR(36)   NOT NULL,
  SOURCEFILEID  VARCHAR(36)   NOT NULL,
  LINENUMBER    NUMBER(38,0)  NOT NULL,
  ITEM          VARIANT       NOT NULL COMMENT 'The line, as written: one run of npm run import:institutions.'
)
COMMENT = 'COPY of data/import-log.jsonl in the school-leavers-app repo, the source of truth. Reloaded by a command after commits; never edit it here.';

-- The latest load of each part. (Snowflake keeps the earlier ones in the
-- tables: the history of the copy, commit by commit.)
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.LATEST_LOAD
  COMMENT = 'The latest CONTENT_LOAD of each part (knowledge-bank, page-data).'
AS SELECT * FROM OPTIONS_DB.CONTENT.CONTENT_LOAD
   QUALIFY ROW_NUMBER() OVER (PARTITION BY PART ORDER BY LOADEDAT DESC) = 1;

CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.ENTRY_CURRENT COMMENT = 'The answers as in the latest knowledge bank load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.ENTRY t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.QUESTION_CURRENT COMMENT = 'The questions as in the latest knowledge bank load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.QUESTION t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.TOPIC_CURRENT COMMENT = 'The topics as in the latest knowledge bank load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.TOPIC t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.GLOSSARY_TERM_CURRENT COMMENT = 'The glossary as in the latest knowledge bank load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.GLOSSARY_TERM t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.SYNONYM_CURRENT COMMENT = 'The synonyms as in the latest knowledge bank load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.SYNONYM t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.JOB_CURRENT COMMENT = 'The jobs as in the latest knowledge bank load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.JOB t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.INSTITUTION_PAGE_CURRENT COMMENT = 'The institution pages as in the latest page data load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.INSTITUTION_PAGE t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.PAGE_DATA_FILE_CURRENT COMMENT = 'The page data files as in the latest page data load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.PAGE_DATA_FILE t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;
CREATE OR REPLACE VIEW OPTIONS_DB.CONTENT.IMPORT_LOG_LINE_CURRENT COMMENT = 'The import log as in the latest page data load.'
AS SELECT t.* FROM OPTIONS_DB.CONTENT.IMPORT_LOG_LINE t JOIN OPTIONS_DB.CONTENT.LATEST_LOAD l ON l.CONTENTLOADID = t.CONTENTLOADID;

-- ---------------------------------------------------------------------------
-- RAW (steps 3 to 5): columns exactly as in each file's header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.EES_NATIONAL_ATTAINMENT_16_18 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "version" VARCHAR,
  "establishment_type_group" VARCHAR,
  "establishment_type" VARCHAR,
  "sex" VARCHAR,
  "exam_cohort" VARCHAR,
  "aps_per_entry_student_count" VARCHAR,
  "aps_per_entry" VARCHAR,
  "aps_per_entry_grade" VARCHAR,
  "two_or_more_level3_percent" VARCHAR,
  "one_or_more_alevel_or_applied_student_count" VARCHAR,
  "best_three_alevels_aps" VARCHAR,
  "best_three_alevels_grade" VARCHAR,
  "three_astar_to_a_percent" VARCHAR,
  "aab_percent" VARCHAR,
  "one_or_more_alevel_student_count" VARCHAR,
  "aab_two_facilitating_percent" VARCHAR,
  "level3_voc_not_applied_general_student_count" VARCHAR,
  "level3_voc_tech_level_percent" VARCHAR,
  "level3_voc_not_tech_level_student_count" VARCHAR,
  "level3_voc_applied_general_percent" VARCHAR,
  "level2_highest_entry_student_count" VARCHAR,
  "level2_techcert_percent" VARCHAR,
  "institution_count" VARCHAR
)
COMMENT = 'Step 3. Explore education statistics API data set 019d9132-c369-7165-8288-207ef5e5e616, "Attainment and other performance measures: institution type and sex" (A level and other 16 to 18 results), CSV as returned by the API. Department for Education, Open Government Licence v3.0. One row per institution type, sex, cohort and year. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.EES_NATIONAL_RETENTION_16_18 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "version" VARCHAR,
  "sex" VARCHAR,
  "establishment_type_group" VARCHAR,
  "establishment_type" VARCHAR,
  "exam_cohort" VARCHAR,
  "qualification_level" VARCHAR,
  "year_1_student_count" VARCHAR,
  "year_2_student_count" VARCHAR,
  "retained_student_count" VARCHAR,
  "retained_assessed_student_count" VARCHAR,
  "retained_2nd_year_student_count" VARCHAR,
  "retained_percent" VARCHAR,
  "retained_assessed_percent" VARCHAR,
  "retained_2nd_year_percent" VARCHAR
)
COMMENT = 'Step 3. Explore education statistics API data set 019d9138-fa46-7320-a39a-07864bfca1b6, "Retention: institution type and sex" (A level and other 16 to 18 results), CSV as returned by the API. Department for Education, Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OFSTED_FE_D1_FULL_INSPECTIONS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Web link to Ofsted provider webpage (opens in new window)" VARCHAR,
  "Provider URN" VARCHAR,
  "Provider UKPRN" VARCHAR,
  "Provider name" VARCHAR,
  "Provider type" VARCHAR,
  "Provider group" VARCHAR,
  "Local authority" VARCHAR,
  "Region" VARCHAR,
  "Ofsted region" VARCHAR,
  "Inspection number" VARCHAR,
  "First day of inspection" VARCHAR,
  "Date published" VARCHAR,
  "Safeguarding standards" VARCHAR,
  "Inclusion" VARCHAR,
  "Leadership and governance" VARCHAR,
  "Contribution to meeting skills needs" VARCHAR,
  "Education programmes for young people - curriculum, teaching and training" VARCHAR,
  "Education programmes for young people - achievement" VARCHAR,
  "Education programmes for young people - participation and development" VARCHAR,
  "Adult learning programmes - curriculum, teaching and training" VARCHAR,
  "Adult learning programmes - achievement" VARCHAR,
  "Adult learning programmes - participation and development" VARCHAR,
  "Apprenticeships - curriculum, teaching and training" VARCHAR,
  "Apprenticeships - achievement" VARCHAR,
  "Apprenticeships - participation and development" VARCHAR,
  "Provision for learners and apprentices with high needs - curriculum, teaching and training" VARCHAR,
  "Provision for learners and apprentices with high needs - achievement" VARCHAR,
  "Provision for learners and apprentices with high needs - participation and development" VARCHAR,
  "Web link to Ofsted provider webpage (opens in new window) [link address]" VARCHAR
)
COMMENT = 'Step 4. Ofsted, "Further education and skills inspections and outcomes: management information", sheet D1_In-year_full_inspections (renewed EIF report cards since 10 November 2025), converted from .ods to CSV: cell text as shown, plus the link address of the web link column as the last column. Identified by Provider URN (Ofsted) and Provider UKPRN. Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OFSTED_FE_D2_MONITORING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Web link to Ofsted provider webpage (opens in new window)" VARCHAR,
  "Provider URN" VARCHAR,
  "Provider UKPRN" VARCHAR,
  "Provider name" VARCHAR,
  "Provider type" VARCHAR,
  "Provider group" VARCHAR,
  "Local authority" VARCHAR,
  "Region" VARCHAR,
  "Ofsted region" VARCHAR,
  "Event type" VARCHAR,
  "Inspection number" VARCHAR,
  "First day of inspection" VARCHAR,
  "Date published" VARCHAR,
  "Safeguarding standards" VARCHAR,
  "Inclusion" VARCHAR,
  "Leadership and governance" VARCHAR,
  "Contribution to meeting skills needs" VARCHAR,
  "Education programmes for young people - curriculum, teaching and training" VARCHAR,
  "Education programmes for young people - achievement" VARCHAR,
  "Education programmes for young people - participation and development" VARCHAR,
  "Adult learning programmes - curriculum, teaching and training" VARCHAR,
  "Adult learning programmes - achievement" VARCHAR,
  "Adult learning programmes - participation and development" VARCHAR,
  "Apprenticeships - curriculum, teaching and training" VARCHAR,
  "Apprenticeships - achievement" VARCHAR,
  "Apprenticeships - participation and development" VARCHAR,
  "Provision for learners and apprentices with high needs - curriculum, teaching and training" VARCHAR,
  "Provision for learners and apprentices with high needs - achievement" VARCHAR,
  "Provision for learners and apprentices with high needs - participation and development" VARCHAR,
  "Web link to Ofsted provider webpage (opens in new window) [link address]" VARCHAR
)
COMMENT = 'Step 4. Ofsted further education and skills management information, sheet D2_Monitoring_inspections, converted from .ods (cell text, plus the web link address last). Provider URN and UKPRN. Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OFSTED_FE_D3_NEW_PROVIDER_MONITORING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Web link to Ofsted provider webpage (opens in new window)" VARCHAR,
  "Provider URN" VARCHAR,
  "Provider UKPRN" VARCHAR,
  "Provider name" VARCHAR,
  "Provider type" VARCHAR,
  "Provider group" VARCHAR,
  "Local authority" VARCHAR,
  "Region" VARCHAR,
  "Ofsted region" VARCHAR,
  "Event type" VARCHAR,
  "Inspection number" VARCHAR,
  "First day of inspection" VARCHAR,
  "Date published" VARCHAR,
  "Follow-up safeguarding inspection" VARCHAR,
  "Inclusion theme" VARCHAR,
  "Leadership and governance theme" VARCHAR,
  "Curriculum, teaching and training theme - education programmes for young people" VARCHAR,
  "Curriculum, teaching and training theme - apprenticeships" VARCHAR,
  "Curriculum, teaching and training theme - adult learning programmes" VARCHAR,
  "Curriculum, teaching and training theme - provision for learners and apprentices with high needs" VARCHAR,
  "Safeguarding theme" VARCHAR,
  "Web link to Ofsted provider webpage (opens in new window) [link address]" VARCHAR
)
COMMENT = 'Step 4. Ofsted further education and skills management information, sheet D3_New_provider_monitoring_insp, converted from .ods (cell text, plus the web link address last). Provider URN and UKPRN. Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OFSTED_FE_D4_PROVIDER_LIST (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Web link to Ofsted provider webpage (opens in new window)" VARCHAR,
  "Provider URN" VARCHAR,
  "Provider UKPRN" VARCHAR,
  "Provider name" VARCHAR,
  "Provider type" VARCHAR,
  "Provider group" VARCHAR,
  "Local authority" VARCHAR,
  "Region" VARCHAR,
  "Ofsted region" VARCHAR,
  "Has the provider received a full inspection under the renewed EIF?" VARCHAR,
  "Has the provider received a new provider monitoring inspection?" VARCHAR,
  "Date of latest short inspection before renewed EIF (if relevant)" VARCHAR,
  "Inspection number of latest full inspection before renewed EIF" VARCHAR,
  "First day of inspection of latest inspection before renewed EIF" VARCHAR,
  "Latest overall effectiveness before renewed EIF" VARCHAR,
  "Latest quality of education before renewed EIF" VARCHAR,
  "Latest behaviour and attitudes before renewed EIF" VARCHAR,
  "Latest personal development before renewed EIF" VARCHAR,
  "Latest leadership and management before renewed EIF" VARCHAR,
  "Latest contribution to meeting skills needs before renewed EIF" VARCHAR,
  "Latest safeguarding before renewed EIF" VARCHAR,
  "Web link to Ofsted provider webpage (opens in new window) [link address]" VARCHAR
)
COMMENT = 'Step 4. Ofsted further education and skills management information, sheet D4_Provider_list (every provider eligible for inspection, with its latest grades before the renewed EIF), converted from .ods (cell text, plus the web link address last). Provider URN and UKPRN. Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER_SUMMARY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "provider_name" VARCHAR,
  "provider_ukprn" VARCHAR,
  "provider_type" VARCHAR,
  "age_band" VARCHAR,
  "sector_subject_area_t1" VARCHAR,
  "leavers" VARCHAR,
  "completers" VARCHAR,
  "achievers" VARCHAR,
  "retention_rate" VARCHAR,
  "pass_rate" VARCHAR,
  "achievement_rate" VARCHAR
)
COMMENT = 'Step 5. Department for Education, "Further education and skills": education and training achievement rates by provider (et_narts_providers_summary.csv, extracted from the release zip). Identified by provider_ukprn. Open Government Licence v3.0. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';
-- ---------------------------------------------------------------------------
-- DATA_LOAD_ROLE: SELECT and INSERT on each table (add-only), nothing else
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.CONTENT_LOAD TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.ENTRY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.QUESTION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.TOPIC TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.GLOSSARY_TERM TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.SYNONYM TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.JOB TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.INSTITUTION_PAGE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.PAGE_DATA_FILE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.CONTENT.IMPORT_LOG_LINE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.EES_NATIONAL_ATTAINMENT_16_18 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.EES_NATIONAL_RETENTION_16_18 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OFSTED_FE_D1_FULL_INSPECTIONS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OFSTED_FE_D2_MONITORING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OFSTED_FE_D3_NEW_PROVIDER_MONITORING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OFSTED_FE_D4_PROVIDER_LIST TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER_SUMMARY TO ROLE DATA_LOAD_ROLE;
