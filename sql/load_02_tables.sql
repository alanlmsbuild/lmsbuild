-- Loading everything, batch 2: the tables for everything still outside
-- Snowflake except the FIS reference data (held until its licence is
-- checked), and their grants to DATA_LOAD_ROLE. Run after
-- sql/load_01_tables.sql.
--
--   OPTIONS_DB.RAW (32 tables)
--     Ofsted state-funded schools, sheets D1 and D2 (from .ods, with the
--       web link address as a last column)
--     GIAS all establishments, WITHOUT HeadTitle (name), HeadFirstName,
--       HeadLastName, HeadPreferredJobTitle and PropsName: removed before
--       staging; the original zip never reaches Snowflake (SOURCE_FILE keeps
--       its checksum next to the copy's)
--     16 to 18 results by institution
--     apprenticeship achievement rates by provider
--     Discover Uni: 27 CSVs (TEFOutcome.csv is empty: staged, no table).
--       The 353 MB XML, Exclusions.xlsx and readme.txt are staged only,
--       inside the original zip
--   SHARED_DB.RAW (92 tables): every LARS file as published, LARS_<file>.
--     All 92, not only the 75 CAPTURE_DB.LARS doesn't use: RAW holds the
--     download as published; CAPTURE_DB.LARS stays as it is (17 of these
--     files, cleaned)
--   CAPTURE_DB.TEST_BASELINE (3 tables, TEST DATA ONLY): the ILR files
--     exported from the test learners, the FIS reports run on them, and
--     FIS's JSON output. Fictional learners only; every row ISTESTDATA. The
--     test reset never touches these tables
--
-- RAW tables: columns named exactly as in each file's header, all text, a
-- repeated name numbered (KISCOURSE.csv has HECOS five times: HECOS,
-- HECOS (2) ... HECOS (5)); plus SOURCEFILEID and FILEROWNUMBER. Add-only.
-- The loader checks each file's header against its table before loading.
--
-- DATA_LOAD_ROLE gets SELECT and INSERT on every table here, USAGE on the
-- new file format: no UPDATE, DELETE, TRUNCATE or CREATE. ILR_APP_ROLE gets
-- nothing.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- CAPTURE_DB.TEST_BASELINE: test ILR exports and FIS output (TEST DATA)
-- ---------------------------------------------------------------------------
CREATE FILE FORMAT IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.JSON_LINES
  TYPE = JSON COMPRESSION = AUTO
  COMMENT = 'TEST DATA ONLY: one JSON object per line (FIS reports and output, converted).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.ILR_EXPORT_XML (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The TEST_BASELINE.SOURCE_FILE row of the file.',
  ISTESTDATA   BOOLEAN      DEFAULT TRUE NOT NULL COMMENT 'Always TRUE: fictional test learners.',
  XMLDOC       VARIANT      NOT NULL COMMENT 'The whole ILR file, as exported.'
)
COMMENT = 'TEST DATA ONLY: ILR XML files exported from the test learners (ILR-99999999-2627-*.XML), one row per file, as given to FIS. Add-only.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.FIS_REPORT_ROW (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The TEST_BASELINE.SOURCE_FILE row of the report file (or of FIS-CSV.zip, for its CSVs).',
  ISTESTDATA   BOOLEAN      DEFAULT TRUE NOT NULL COMMENT 'Always TRUE: fictional test learners.',
  RUN          VARCHAR(100) NOT NULL COMMENT 'The ILR file the FIS run was for (the run''s folder name).',
  REPORT       VARCHAR(300) NOT NULL COMMENT 'The report: its file name without the run time, or the CSV''s name inside FIS-CSV.zip.',
  SHEET        VARCHAR(100) COMMENT 'The sheet, for .xlsx reports.',
  ROWNUMBER    NUMBER(38,0) NOT NULL COMMENT 'Its row in the file or sheet, from 1 (header and title rows included).',
  CELLS        ARRAY        NOT NULL COMMENT 'The row''s cells, as text, in order.'
)
COMMENT = 'TEST DATA ONLY: every row of every FIS report (CSV and .xlsx) and FIS-CSV.zip file from the FIS runs on the test ILR files, converted to JSON lines. Add-only.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.FIS_OUTPUT_JSON (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The TEST_BASELINE.SOURCE_FILE row of the file.',
  ISTESTDATA   BOOLEAN      DEFAULT TRUE NOT NULL COMMENT 'Always TRUE: fictional test learners.',
  NAME         VARCHAR(200) NOT NULL COMMENT 'The file name, e.g. FundingFm36Output.json.',
  ITEM         VARIANT      NOT NULL COMMENT 'The whole file.'
)
COMMENT = 'TEST DATA ONLY: the JSON files FIS left in its Sandbox folder after its latest run (funding model output, reference data used, valid and invalid learners, rule violations), one row per file. Add-only.';

-- ---------------------------------------------------------------------------
-- RAW: columns exactly as in each file's header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OFSTED_SCHOOLS_D1_IN_YEAR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Web Link (opens in new window)" VARCHAR,
  "URN" VARCHAR,
  "LAESTAB" VARCHAR,
  "School name" VARCHAR,
  "Ofsted phase" VARCHAR,
  "Type of education" VARCHAR,
  "School open date" VARCHAR,
  "Admissions policy" VARCHAR,
  "Sixth form" VARCHAR,
  "Designated religious character" VARCHAR,
  "Religious ethos" VARCHAR,
  "Faith grouping" VARCHAR,
  "Ofsted region" VARCHAR,
  "Region" VARCHAR,
  "Local authority" VARCHAR,
  "Parliamentary constituency" VARCHAR,
  "Postcode" VARCHAR,
  "Multi-academy trust UID" VARCHAR,
  "Multi-academy trust name" VARCHAR,
  "Academy sponsor UID" VARCHAR,
  "Academy Sponsor Name" VARCHAR,
  "The income deprivation affecting children index (IDACI) quintile" VARCHAR,
  "Total number of pupils" VARCHAR,
  "Statutory lowest age" VARCHAR,
  "Statutory highest age" VARCHAR,
  "Inspection number" VARCHAR,
  "Inspection type" VARCHAR,
  "Inspection type grouping" VARCHAR,
  "Event type grouping" VARCHAR,
  "Inspection start date" VARCHAR,
  "Publication date" VARCHAR,
  "Outcomes for legacy monitoring inspections" VARCHAR,
  "Category of concern" VARCHAR,
  "Safeguarding standards" VARCHAR,
  "Inclusion" VARCHAR,
  "Curriculum and teaching" VARCHAR,
  "Achievement" VARCHAR,
  "Attendance and behaviour" VARCHAR,
  "Personal development and wellbeing" VARCHAR,
  "Early years (where applicable)" VARCHAR,
  "Post-16 provision (where applicable)" VARCHAR,
  "Leadership and governance" VARCHAR,
  "Web Link (opens in new window) [link address]" VARCHAR
)
COMMENT = 'Batch 2. Ofsted, "State-funded schools inspections and outcomes: management information", sheet D1_In_year_inspections (inspections since 10 November 2025), converted from .ods to CSV: cell text as shown, plus the web link address as the last column. Identified by URN. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OFSTED_SCHOOLS_D2_MOST_RECENT (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Web Link (opens in new window)" VARCHAR,
  "URN" VARCHAR,
  "LAESTAB" VARCHAR,
  "School name" VARCHAR,
  "Ofsted phase" VARCHAR,
  "Type of education" VARCHAR,
  "School open date" VARCHAR,
  "Admissions policy" VARCHAR,
  "Sixth form" VARCHAR,
  "Designated religious character" VARCHAR,
  "Religious ethos" VARCHAR,
  "Faith grouping" VARCHAR,
  "Ofsted region" VARCHAR,
  "Region" VARCHAR,
  "Local authority" VARCHAR,
  "Parliamentary constituency" VARCHAR,
  "Postcode" VARCHAR,
  "Multi-academy trust UID" VARCHAR,
  "Multi-academy trust name" VARCHAR,
  "Academy sponsor UID" VARCHAR,
  "Academy sponsor name" VARCHAR,
  "The income deprivation affecting children index (IDACI) quintile" VARCHAR,
  "Total number of pupils" VARCHAR,
  "Statutory lowest age" VARCHAR,
  "Statutory highest age" VARCHAR,
  "Inspection number of latest full inspection" VARCHAR,
  "Inspection type" VARCHAR,
  "Inspection type grouping" VARCHAR,
  "Event type grouping" VARCHAR,
  "Inspection start date" VARCHAR,
  "Publication date" VARCHAR,
  "Does the latest full inspection relate to the URN of the current school?" VARCHAR,
  "URN at time of latest full inspection" VARCHAR,
  "LAESTAB at time of latest full inspection" VARCHAR,
  "School name at time of latest full inspection" VARCHAR,
  "School type at time of latest full inspection" VARCHAR,
  "Category of concern" VARCHAR,
  "Safeguarding standards" VARCHAR,
  "Safeguarding standards - date of grade" VARCHAR,
  "Inclusion" VARCHAR,
  "Inclusion - date of grade" VARCHAR,
  "Curriculum and teaching" VARCHAR,
  "Curriculum and teaching - date of grade" VARCHAR,
  "Achievement" VARCHAR,
  "Achievement - date of grade" VARCHAR,
  "Attendance and behaviour" VARCHAR,
  "Attendance and behaviour - date of grade" VARCHAR,
  "Personal development and wellbeing" VARCHAR,
  "Personal development and wellbeing - date of grade" VARCHAR,
  "Early years (where applicable)" VARCHAR,
  "Early years - date of grade" VARCHAR,
  "Post-16 provision (where applicable)" VARCHAR,
  "Post-16 provision - date of grade" VARCHAR,
  "Leadership and governance" VARCHAR,
  "Leadership and governance - date of grade" VARCHAR,
  "Inspection number of latest OEIF graded inspection" VARCHAR,
  "Inspection type of latest OEIF graded inspection" VARCHAR,
  "Inspection type grouping of latest OEIF graded inspection" VARCHAR,
  "Event type grouping of latest OEIF graded inspection" VARCHAR,
  "Inspection start date of latest OEIF graded inspection" VARCHAR,
  "Publication date of latest OEIF graded inspection" VARCHAR,
  "Does the latest OEIF graded inspection relate to the URN of the current school?" VARCHAR,
  "URN at time of latest OEIF graded inspection" VARCHAR,
  "LAESTAB at time of latest OEIF graded inspection" VARCHAR,
  "School name at time of latest OEIF graded inspection" VARCHAR,
  "School type at time of latest OEIF graded inspection" VARCHAR,
  "Latest OEIF category of concern" VARCHAR,
  "Latest OEIF overall effectiveness" VARCHAR,
  "Latest OEIF quality of education" VARCHAR,
  "Latest OEIF behaviour and attitudes" VARCHAR,
  "Latest OEIF personal development" VARCHAR,
  "Latest OEIF effectiveness of leadership and management" VARCHAR,
  "Latest OEIF  safeguarding is effective?" VARCHAR,
  "Latest OEIF early years provision (where applicable)" VARCHAR,
  "Latest OEIF sixth form provision (where applicable)" VARCHAR,
  "Latest ungraded inspection number" VARCHAR,
  "Date of latest ungraded inspection" VARCHAR,
  "Ungraded inspection publication date" VARCHAR,
  "Does the ungraded inspection relate to the URN of the current school?" VARCHAR,
  "URN at time of the ungraded inspection" VARCHAR,
  "LAESTAB at time of the ungraded inspection" VARCHAR,
  "School name at time of the ungraded inspection" VARCHAR,
  "School type at time of the ungraded inspection" VARCHAR,
  "Ungraded inspection overall outcome" VARCHAR,
  "Most recent category of concern" VARCHAR,
  "Web Link (opens in new window) [link address]" VARCHAR
)
COMMENT = 'Batch 2. Ofsted state-funded schools management information, sheet D2_Most_recent_inspections (every open school''s latest inspections), converted from .ods (cell text, plus the web link address last). Identified by URN. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.GIAS_ESTABLISHMENT (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "URN" VARCHAR,
  "LA (code)" VARCHAR,
  "LA (name)" VARCHAR,
  "EstablishmentNumber" VARCHAR,
  "EstablishmentName" VARCHAR,
  "TypeOfEstablishment (code)" VARCHAR,
  "TypeOfEstablishment (name)" VARCHAR,
  "EstablishmentTypeGroup (code)" VARCHAR,
  "EstablishmentTypeGroup (name)" VARCHAR,
  "EstablishmentStatus (code)" VARCHAR,
  "EstablishmentStatus (name)" VARCHAR,
  "ReasonEstablishmentOpened (code)" VARCHAR,
  "ReasonEstablishmentOpened (name)" VARCHAR,
  "OpenDate" VARCHAR,
  "ReasonEstablishmentClosed (code)" VARCHAR,
  "ReasonEstablishmentClosed (name)" VARCHAR,
  "CloseDate" VARCHAR,
  "PhaseOfEducation (code)" VARCHAR,
  "PhaseOfEducation (name)" VARCHAR,
  "StatutoryLowAge" VARCHAR,
  "StatutoryHighAge" VARCHAR,
  "Boarders (code)" VARCHAR,
  "Boarders (name)" VARCHAR,
  "NurseryProvision (name)" VARCHAR,
  "OfficialSixthForm (code)" VARCHAR,
  "OfficialSixthForm (name)" VARCHAR,
  "Gender (code)" VARCHAR,
  "Gender (name)" VARCHAR,
  "ReligiousCharacter (code)" VARCHAR,
  "ReligiousCharacter (name)" VARCHAR,
  "ReligiousEthos (name)" VARCHAR,
  "Diocese (code)" VARCHAR,
  "Diocese (name)" VARCHAR,
  "AdmissionsPolicy (code)" VARCHAR,
  "AdmissionsPolicy (name)" VARCHAR,
  "SchoolCapacity" VARCHAR,
  "SpecialClasses (code)" VARCHAR,
  "SpecialClasses (name)" VARCHAR,
  "CensusDate" VARCHAR,
  "NumberOfPupils" VARCHAR,
  "NumberOfBoys" VARCHAR,
  "NumberOfGirls" VARCHAR,
  "PercentageFSM" VARCHAR,
  "TrustSchoolFlag (code)" VARCHAR,
  "TrustSchoolFlag (name)" VARCHAR,
  "Trusts (code)" VARCHAR,
  "Trusts (name)" VARCHAR,
  "SchoolSponsorFlag (name)" VARCHAR,
  "SchoolSponsors (name)" VARCHAR,
  "FederationFlag (name)" VARCHAR,
  "Federations (code)" VARCHAR,
  "Federations (name)" VARCHAR,
  "UKPRN" VARCHAR,
  "FEHEIdentifier" VARCHAR,
  "FurtherEducationType (name)" VARCHAR,
  "LastChangedDate" VARCHAR,
  "Street" VARCHAR,
  "Locality" VARCHAR,
  "Address3" VARCHAR,
  "Town" VARCHAR,
  "County (name)" VARCHAR,
  "Postcode" VARCHAR,
  "SchoolWebsite" VARCHAR,
  "TelephoneNum" VARCHAR,
  "BSOInspectorateName (name)" VARCHAR,
  "InspectorateReport" VARCHAR,
  "DateOfLastInspectionVisit" VARCHAR,
  "NextInspectionVisit" VARCHAR,
  "TeenMoth (name)" VARCHAR,
  "TeenMothPlaces" VARCHAR,
  "CCF (name)" VARCHAR,
  "SENPRU (name)" VARCHAR,
  "EBD (name)" VARCHAR,
  "PlacesPRU" VARCHAR,
  "FTProv (name)" VARCHAR,
  "EdByOther (name)" VARCHAR,
  "Section41Approved (name)" VARCHAR,
  "SEN1 (name)" VARCHAR,
  "SEN2 (name)" VARCHAR,
  "SEN3 (name)" VARCHAR,
  "SEN4 (name)" VARCHAR,
  "SEN5 (name)" VARCHAR,
  "SEN6 (name)" VARCHAR,
  "SEN7 (name)" VARCHAR,
  "SEN8 (name)" VARCHAR,
  "SEN9 (name)" VARCHAR,
  "SEN10 (name)" VARCHAR,
  "SEN11 (name)" VARCHAR,
  "SEN12 (name)" VARCHAR,
  "SEN13 (name)" VARCHAR,
  "TypeOfResourcedProvision (name)" VARCHAR,
  "ResourcedProvisionOnRoll" VARCHAR,
  "ResourcedProvisionCapacity" VARCHAR,
  "SenUnitOnRoll" VARCHAR,
  "SenUnitCapacity" VARCHAR,
  "GOR (code)" VARCHAR,
  "GOR (name)" VARCHAR,
  "DistrictAdministrative (code)" VARCHAR,
  "DistrictAdministrative (name)" VARCHAR,
  "AdministrativeWard (code)" VARCHAR,
  "AdministrativeWard (name)" VARCHAR,
  "ParliamentaryConstituency (code)" VARCHAR,
  "ParliamentaryConstituency (name)" VARCHAR,
  "UrbanRural (code)" VARCHAR,
  "UrbanRural (name)" VARCHAR,
  "GSSLACode (name)" VARCHAR,
  "Easting" VARCHAR,
  "Northing" VARCHAR,
  "MSOA (name)" VARCHAR,
  "LSOA (name)" VARCHAR,
  "InspectorateName (name)" VARCHAR,
  "SENStat" VARCHAR,
  "SENNoStat" VARCHAR,
  "BoardingEstablishment (name)" VARCHAR,
  "PreviousLA (code)" VARCHAR,
  "PreviousLA (name)" VARCHAR,
  "PreviousEstablishmentNumber" VARCHAR,
  "Country (name)" VARCHAR,
  "UPRN" VARCHAR,
  "SiteName" VARCHAR,
  "QABName (code)" VARCHAR,
  "QABName (name)" VARCHAR,
  "EstablishmentAccredited (code)" VARCHAR,
  "EstablishmentAccredited (name)" VARCHAR,
  "QABReport" VARCHAR,
  "CHNumber" VARCHAR,
  "MSOA (code)" VARCHAR,
  "LSOA (code)" VARCHAR,
  "FSM" VARCHAR,
  "AccreditationExpiryDate" VARCHAR
)
COMMENT = 'Batch 2. Get Information about Schools, all establishments (edubasealldata<date>.csv from extract.zip), Department for Education. WITHOUT the five personal columns HeadTitle (name), HeadFirstName, HeadLastName, HeadPreferredJobTitle and PropsName: the loader removes them before staging, and the original zip never reaches Snowflake. Windows-1252. Identified by URN; gives UKPRN. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.PERFORMANCE_16_18_INSTITUTION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "version" VARCHAR,
  "old_la_code" VARCHAR,
  "new_la_code" VARCHAR,
  "la_name" VARCHAR,
  "school_name" VARCHAR,
  "school_urn" VARCHAR,
  "school_laestab" VARCHAR,
  "disadvantage_status" VARCHAR,
  "exam_cohort" VARCHAR,
  "end1618_student_count" VARCHAR,
  "aps_per_entry" VARCHAR,
  "aps_per_entry_grade" VARCHAR,
  "aps_per_entry_student_count" VARCHAR,
  "retained_percent" VARCHAR,
  "retained_assessed_percent" VARCHAR,
  "retained_student_count" VARCHAR,
  "retained_2nd_year_percent" VARCHAR,
  "retained_2nd_year_student_count" VARCHAR,
  "value_added" VARCHAR,
  "value_added_upper_ci" VARCHAR,
  "value_added_lower_ci" VARCHAR,
  "progress_banding" VARCHAR,
  "best_three_alevels_aps" VARCHAR,
  "best_three_alevels_grade" VARCHAR,
  "best_three_alevels_student_count" VARCHAR,
  "aab_percent" VARCHAR,
  "aab_student_count" VARCHAR,
  "level_3_maths_percent" VARCHAR,
  "level_3_maths_student_count" VARCHAR,
  "vocational_percent" VARCHAR,
  "vocational_student_count" VARCHAR,
  "maths_progress" VARCHAR,
  "maths_progress_entries_percent" VARCHAR,
  "maths_progress_inscope_count" VARCHAR,
  "english_progress" VARCHAR,
  "english_progress_entries_percent" VARCHAR,
  "english_progress_inscope_count" VARCHAR
)
COMMENT = 'Batch 2. "A level and other 16 to 18 results": institution_performance_202225_API.csv (the release file; also Explore education statistics API data set 019c2960-81e3-70c2-8d65-72c3718ae4fd, version 1.0.3). Department for Education. Identified by school_urn. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.ACHIEVEMENT_APP_PROVIDER (
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
  "ssa_tier_1" VARCHAR,
  "level" VARCHAR,
  "std_fwk_name_stcode" VARCHAR,
  "age_youth_adult" VARCHAR,
  "age_group" VARCHAR,
  "leavers" VARCHAR,
  "completers" VARCHAR,
  "achievers" VARCHAR,
  "retention_rate" VARCHAR,
  "pass_rate" VARCHAR,
  "achievement_rate" VARCHAR
)
COMMENT = 'Batch 2. "Apprenticeships": apprenticeship achievement rates by provider, level, framework or standard and age (na05_app_narts_provider_level_fwk_std_ptype_202526_14.csv, extracted from apprenticeships_2025-26.zip). Department for Education. Identified by provider_ukprn. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_ACCREDITATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "ACCTYPE" VARCHAR,
  "ACCDEPEND" VARCHAR,
  "ACCDEPENDURL" VARCHAR,
  "ACCDEPENDURLW" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, ACCREDITATION.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_ACCREDITATIONTABLE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ACCURL" VARCHAR,
  "ACCTEXT" VARCHAR,
  "ACCTEXTW" VARCHAR,
  "ACCTYPE" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, ACCREDITATIONTABLE.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_ACCREDITATIONBYHEP (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "AccreditingBodyName" VARCHAR,
  "AccreditionType" VARCHAR,
  "HEP" VARCHAR,
  "KisCourseTitle" VARCHAR,
  "KiscourseID" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, AccreditationByHep.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_COMMON (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "COMUNAVAILREASON" VARCHAR,
  "COMPOP" VARCHAR,
  "COMRESPONSE" VARCHAR,
  "COMSAMPLE" VARCHAR,
  "COMRESP_RATE" VARCHAR,
  "COMAGG" VARCHAR,
  "COMAGGYEAR" VARCHAR,
  "COMYEAR1" VARCHAR,
  "COMYEAR2" VARCHAR,
  "COMSBJ" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, COMMON.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_CONTINUATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "CONTUNAVAILREASON" VARCHAR,
  "CONTPOP" VARCHAR,
  "CONTAGG" VARCHAR,
  "CONTAGGYEAR" VARCHAR,
  "CONTYEAR1" VARCHAR,
  "CONTYEAR2" VARCHAR,
  "CONTSBJ" VARCHAR,
  "UCONT" VARCHAR,
  "UDORMANT" VARCHAR,
  "UGAINED" VARCHAR,
  "ULEFT" VARCHAR,
  "ULOWER" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, CONTINUATION.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_COURSELOCATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "LOCID" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, COURSELOCATION.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_EMPLOYMENT (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "EMPUNAVAILREASON" VARCHAR,
  "EMPPOP" VARCHAR,
  "EMPRESPONSE" VARCHAR,
  "EMPSAMPLE" VARCHAR,
  "EMPRESP_RATE" VARCHAR,
  "EMPAGG" VARCHAR,
  "EMPAGGYEAR" VARCHAR,
  "EMPYEAR1" VARCHAR,
  "EMPYEAR2" VARCHAR,
  "EMPSBJ" VARCHAR,
  "WORKSTUDY" VARCHAR,
  "STUDY" VARCHAR,
  "UNEMP" VARCHAR,
  "PREVWORKSTUD" VARCHAR,
  "BOTH" VARCHAR,
  "NOAVAIL" VARCHAR,
  "WORK" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, EMPLOYMENT.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_ENTRY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "ENTUNAVAILREASON" VARCHAR,
  "ENTPOP" VARCHAR,
  "ENTAGG" VARCHAR,
  "ENTAGGYEAR" VARCHAR,
  "ENTYEAR1" VARCHAR,
  "ENTYEAR2" VARCHAR,
  "ENTSBJ" VARCHAR,
  "ACCESS" VARCHAR,
  "ALEVEL" VARCHAR,
  "BACC" VARCHAR,
  "DEGREE" VARCHAR,
  "FOUNDTN" VARCHAR,
  "NOQUALS" VARCHAR,
  "OTHER" VARCHAR,
  "OTHERHE" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, ENTRY.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_EXCLUSIONS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "PUBNAME" VARCHAR,
  "UKPRN" VARCHAR,
  "SUBNAME" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "SBJ" VARCHAR,
  "KISAIMCODE" VARCHAR,
  "OUTCOME" VARCHAR,
  "REASON" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, Exclusions.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_GOSALARY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "GOSALUNAVAILREASON" VARCHAR,
  "GOSALPOP" VARCHAR,
  "GOSALRESPONSE" VARCHAR,
  "GOSALSAMPLE" VARCHAR,
  "GOSALRESP_RATE" VARCHAR,
  "GOSALAGG" VARCHAR,
  "GOSALAGGYEAR" VARCHAR,
  "GOSALYEAR1" VARCHAR,
  "GOSALYEAR2" VARCHAR,
  "GOSALSBJ" VARCHAR,
  "GOINSTLQ" VARCHAR,
  "GOINSTMED" VARCHAR,
  "GOINSTUQ" VARCHAR,
  "GOPROV_PC_UK" VARCHAR,
  "GOPROV_PC_E" VARCHAR,
  "GOPROV_PC_NI" VARCHAR,
  "GOPROV_PC_S" VARCHAR,
  "GOPROV_PC_W" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, GOSALARY.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_GOSECSAL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "GOSECSBJ" VARCHAR,
  "KISMODE" VARCHAR,
  "KISLEVEL" VARCHAR,
  "GOSECLQ_UK" VARCHAR,
  "GOSECMED_UK" VARCHAR,
  "GOSECUQ_UK" VARCHAR,
  "GOSECPOP_UK" VARCHAR,
  "GOSECLQ_E" VARCHAR,
  "GOSECMED_E" VARCHAR,
  "GOSECUQ_E" VARCHAR,
  "GOSECPOP_E" VARCHAR,
  "GOSECLQ_NI" VARCHAR,
  "GOSECMED_NI" VARCHAR,
  "GOSECUQ_NI" VARCHAR,
  "GOSECPOP_NI" VARCHAR,
  "GOSECLQ_S" VARCHAR,
  "GOSECMED_S" VARCHAR,
  "GOSECUQ_S" VARCHAR,
  "GOSECPOP_S" VARCHAR,
  "GOSECLQ_W" VARCHAR,
  "GOSECMED_W" VARCHAR,
  "GOSECUQ_W" VARCHAR,
  "GOSECPOP_W" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, GOSECSAL.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_GOVOICEWORK (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "GOWORKUNAVAILREASON" VARCHAR,
  "GOWORKPOP" VARCHAR,
  "GOWORKRESPONSE" VARCHAR,
  "GOWORKSAMPLE" VARCHAR,
  "GOWORKRESP_RATE" VARCHAR,
  "GOWORKAGG" VARCHAR,
  "GOWORKAGGYEAR" VARCHAR,
  "GOWORKYEAR1" VARCHAR,
  "GOWORKYEAR2" VARCHAR,
  "GOWORKSBJ" VARCHAR,
  "GOWORKMEAN" VARCHAR,
  "GOWORKONTRACK" VARCHAR,
  "GOWORKSKILLS" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, GOVOICEWORK.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_INSTITUTION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LEGAL_NAME" VARCHAR,
  "FIRST_TRADING_NAME" VARCHAR,
  "OTHER_NAMES" VARCHAR,
  "PROVADDRESS" VARCHAR,
  "PROVTEL" VARCHAR,
  "PROVURL" VARCHAR,
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "COUNTRY" VARCHAR,
  "PUBUKPRNCOUNTRY" VARCHAR,
  "QAA_Report_Type" VARCHAR,
  "QAA_URL" VARCHAR,
  "SUURL" VARCHAR,
  "SUURLW" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, INSTITUTION.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_JOBLIST (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "COMSBJ" VARCHAR,
  "JOB" VARCHAR,
  "PERC" VARCHAR,
  "ORDER" VARCHAR,
  "HS" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, JOBLIST.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_JOBTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "JOBUNAVAILREASON" VARCHAR,
  "JOBPOP" VARCHAR,
  "JOBRESPONSE" VARCHAR,
  "JOBSAMPLE" VARCHAR,
  "JOBRESP_RATE" VARCHAR,
  "JOBAGG" VARCHAR,
  "JOBAGGYEAR" VARCHAR,
  "JOBYEAR1" VARCHAR,
  "JOBYEAR2" VARCHAR,
  "JOBSBJ" VARCHAR,
  "PROFMAN" VARCHAR,
  "OTHERJOB" VARCHAR,
  "UNKWN" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, JOBTYPE.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_KISAIM (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "KISAIMCODE" VARCHAR,
  "KISAIMLABEL" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, KISAIM.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_KISCOURSE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "ASSURL" VARCHAR,
  "ASSURLW" VARCHAR,
  "CRSECSTURL" VARCHAR,
  "CRSECSTURLW" VARCHAR,
  "CRSEURL" VARCHAR,
  "CRSEURLW" VARCHAR,
  "DISTANCE" VARCHAR,
  "EMPLOYURL" VARCHAR,
  "EMPLOYURLW" VARCHAR,
  "FOUNDATION" VARCHAR,
  "HONOURS" VARCHAR,
  "HECOS" VARCHAR,
  "HECOS (2)" VARCHAR,
  "HECOS (3)" VARCHAR,
  "HECOS (4)" VARCHAR,
  "HECOS (5)" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "LOCCHNGE" VARCHAR,
  "LTURL" VARCHAR,
  "LTURLW" VARCHAR,
  "NHS" VARCHAR,
  "NUMSTAGE" VARCHAR,
  "SANDWICH" VARCHAR,
  "SUPPORTURL" VARCHAR,
  "SUPPORTURLW" VARCHAR,
  "TITLE" VARCHAR,
  "TITLEW" VARCHAR,
  "UCASPROGID" VARCHAR,
  "UKPRNAPPLY" VARCHAR,
  "YEARABROAD" VARCHAR,
  "KISAIMCODE" VARCHAR,
  "KISLEVEL" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, KISCOURSE.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_LEO3 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "LEO3UNAVAILREASON" VARCHAR,
  "LEO3POP" VARCHAR,
  "LEO3AGG" VARCHAR,
  "LEO3AGGYEAR" VARCHAR,
  "LEO3SBJ" VARCHAR,
  "LEO3INSTLQ" VARCHAR,
  "LEO3INSTMED" VARCHAR,
  "LEO3INSTUQ" VARCHAR,
  "LEO3PROV_PC_UK" VARCHAR,
  "LEO3PROV_PC_E" VARCHAR,
  "LEO3PROV_PC_NW" VARCHAR,
  "LEO3PROV_PC_NE" VARCHAR,
  "LEO3PROV_PC_EM" VARCHAR,
  "LEO3PROV_PC_WM" VARCHAR,
  "LEO3PROV_PC_EE" VARCHAR,
  "LEO3PROV_PC_SE" VARCHAR,
  "LEO3PROV_PC_SW" VARCHAR,
  "LEO3PROV_PC_YH" VARCHAR,
  "LEO3PROV_PC_LN" VARCHAR,
  "LEO3PROV_PC_NI" VARCHAR,
  "LEO3PROV_PC_S" VARCHAR,
  "LEO3PROV_PC_ED" VARCHAR,
  "LEO3PROV_PC_GL" VARCHAR,
  "LEO3PROV_PC_W" VARCHAR,
  "LEO3PROV_PC_CF" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, LEO3.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_LEO3SEC (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LEO3SECSBJ" VARCHAR,
  "KISMODE" VARCHAR,
  "KISLEVEL" VARCHAR,
  "LEO3SECPOP_UK" VARCHAR,
  "LEO3LQ_UK" VARCHAR,
  "LEO3MED_UK" VARCHAR,
  "LEO3UQ_UK" VARCHAR,
  "LEO3SECPOP_E" VARCHAR,
  "LEO3LQ_E" VARCHAR,
  "LEO3MED_E" VARCHAR,
  "LEO3UQ_E" VARCHAR,
  "LEO3SECPOP_NW" VARCHAR,
  "LEO3LQ_NW" VARCHAR,
  "LEO3MED_NW" VARCHAR,
  "LEO3UQ_NW" VARCHAR,
  "LEO3SECPOP_NE" VARCHAR,
  "LEO3LQ_NE" VARCHAR,
  "LEO3MED_NE" VARCHAR,
  "LEO3UQ_NE" VARCHAR,
  "LEO3SECPOP_EM" VARCHAR,
  "LEO3LQ_EM" VARCHAR,
  "LEO3MED_EM" VARCHAR,
  "LEO3UQ_EM" VARCHAR,
  "LEO3SECPOP_WM" VARCHAR,
  "LEO3LQ_WM" VARCHAR,
  "LEO3MED_WM" VARCHAR,
  "LEO3UQ_WM" VARCHAR,
  "LEO3SECPOP_EE" VARCHAR,
  "LEO3LQ_EE" VARCHAR,
  "LEO3MED_EE" VARCHAR,
  "LEO3UQ_EE" VARCHAR,
  "LEO3SECPOP_SE" VARCHAR,
  "LEO3LQ_SE" VARCHAR,
  "LEO3MED_SE" VARCHAR,
  "LEO3UQ_SE" VARCHAR,
  "LEO3SECPOP_SW" VARCHAR,
  "LEO3LQ_SW" VARCHAR,
  "LEO3MED_SW" VARCHAR,
  "LEO3UQ_SW" VARCHAR,
  "LEO3SECPOP_YH" VARCHAR,
  "LEO3LQ_YH" VARCHAR,
  "LEO3MED_YH" VARCHAR,
  "LEO3UQ_YH" VARCHAR,
  "LEO3SECPOP_LN" VARCHAR,
  "LEO3LQ_LN" VARCHAR,
  "LEO3MED_LN" VARCHAR,
  "LEO3UQ_LN" VARCHAR,
  "LEO3SECPOP_W" VARCHAR,
  "LEO3LQ_W" VARCHAR,
  "LEO3MED_W" VARCHAR,
  "LEO3UQ_W" VARCHAR,
  "LEO3SECPOP_CF" VARCHAR,
  "LEO3LQ_CF" VARCHAR,
  "LEO3MED_CF" VARCHAR,
  "LEO3UQ_CF" VARCHAR,
  "LEO3SECPOP_S" VARCHAR,
  "LEO3LQ_S" VARCHAR,
  "LEO3MED_S" VARCHAR,
  "LEO3UQ_S" VARCHAR,
  "LEO3SECPOP_ED" VARCHAR,
  "LEO3LQ_ED" VARCHAR,
  "LEO3MED_ED" VARCHAR,
  "LEO3UQ_ED" VARCHAR,
  "LEO3SECPOP_GL" VARCHAR,
  "LEO3LQ_GL" VARCHAR,
  "LEO3MED_GL" VARCHAR,
  "LEO3UQ_GL" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, LEO3SEC.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_LEO5 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "LEO5UNAVAILREASON" VARCHAR,
  "LEO5POP" VARCHAR,
  "LEO5AGG" VARCHAR,
  "LEO5AGGYEAR" VARCHAR,
  "LEO5SBJ" VARCHAR,
  "LEO5INSTLQ" VARCHAR,
  "LEO5INSTMED" VARCHAR,
  "LEO5INSTUQ" VARCHAR,
  "LEO5PROV_PC_UK" VARCHAR,
  "LEO5PROV_PC_E" VARCHAR,
  "LEO5PROV_PC_NW" VARCHAR,
  "LEO5PROV_PC_NE" VARCHAR,
  "LEO5PROV_PC_EM" VARCHAR,
  "LEO5PROV_PC_WM" VARCHAR,
  "LEO5PROV_PC_EE" VARCHAR,
  "LEO5PROV_PC_SE" VARCHAR,
  "LEO5PROV_PC_SW" VARCHAR,
  "LEO5PROV_PC_YH" VARCHAR,
  "LEO5PROV_PC_LN" VARCHAR,
  "LEO5PROV_PC_NI" VARCHAR,
  "LEO5PROV_PC_S" VARCHAR,
  "LEO5PROV_PC_ED" VARCHAR,
  "LEO5PROV_PC_GL" VARCHAR,
  "LEO5PROV_PC_W" VARCHAR,
  "LEO5PROV_PC_CF" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, LEO5.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_LEO5SEC (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LEO5SECSBJ" VARCHAR,
  "KISMODE" VARCHAR,
  "KISLEVEL" VARCHAR,
  "LEO5SECPOP_UK" VARCHAR,
  "LEO5LQ_UK" VARCHAR,
  "LEO5MED_UK" VARCHAR,
  "LEO5UQ_UK" VARCHAR,
  "LEO5SECPOP_E" VARCHAR,
  "LEO5LQ_E" VARCHAR,
  "LEO5MED_E" VARCHAR,
  "LEO5UQ_E" VARCHAR,
  "LEO5SECPOP_NW" VARCHAR,
  "LEO5LQ_NW" VARCHAR,
  "LEO5MED_NW" VARCHAR,
  "LEO5UQ_NW" VARCHAR,
  "LEO5SECPOP_NE" VARCHAR,
  "LEO5LQ_NE" VARCHAR,
  "LEO5MED_NE" VARCHAR,
  "LEO5UQ_NE" VARCHAR,
  "LEO5SECPOP_EM" VARCHAR,
  "LEO5LQ_EM" VARCHAR,
  "LEO5MED_EM" VARCHAR,
  "LEO5UQ_EM" VARCHAR,
  "LEO5SECPOP_WM" VARCHAR,
  "LEO5LQ_WM" VARCHAR,
  "LEO5MED_WM" VARCHAR,
  "LEO5UQ_WM" VARCHAR,
  "LEO5SECPOP_EE" VARCHAR,
  "LEO5LQ_EE" VARCHAR,
  "LEO5MED_EE" VARCHAR,
  "LEO5UQ_EE" VARCHAR,
  "LEO5SECPOP_SE" VARCHAR,
  "LEO5LQ_SE" VARCHAR,
  "LEO5MED_SE" VARCHAR,
  "LEO5UQ_SE" VARCHAR,
  "LEO5SECPOP_SW" VARCHAR,
  "LEO5LQ_SW" VARCHAR,
  "LEO5MED_SW" VARCHAR,
  "LEO5UQ_SW" VARCHAR,
  "LEO5SECPOP_YH" VARCHAR,
  "LEO5LQ_YH" VARCHAR,
  "LEO5MED_YH" VARCHAR,
  "LEO5UQ_YH" VARCHAR,
  "LEO5SECPOP_LN" VARCHAR,
  "LEO5LQ_LN" VARCHAR,
  "LEO5MED_LN" VARCHAR,
  "LEO5UQ_LN" VARCHAR,
  "LEO5SECPOP_W" VARCHAR,
  "LEO5LQ_W" VARCHAR,
  "LEO5MED_W" VARCHAR,
  "LEO5UQ_W" VARCHAR,
  "LEO5SECPOP_CF" VARCHAR,
  "LEO5LQ_CF" VARCHAR,
  "LEO5MED_CF" VARCHAR,
  "LEO5UQ_CF" VARCHAR,
  "LEO5SECPOP_S" VARCHAR,
  "LEO5LQ_S" VARCHAR,
  "LEO5MED_S" VARCHAR,
  "LEO5UQ_S" VARCHAR,
  "LEO5SECPOP_ED" VARCHAR,
  "LEO5LQ_ED" VARCHAR,
  "LEO5MED_ED" VARCHAR,
  "LEO5UQ_ED" VARCHAR,
  "LEO5SECPOP_GL" VARCHAR,
  "LEO5LQ_GL" VARCHAR,
  "LEO5MED_GL" VARCHAR,
  "LEO5UQ_GL" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, LEO5SEC.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_LOCATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "UKPRN" VARCHAR,
  "ACCOMURL" VARCHAR,
  "ACCOMURLW" VARCHAR,
  "LOCID" VARCHAR,
  "LOCNAME" VARCHAR,
  "LOCNAMEW" VARCHAR,
  "LATITUDE" VARCHAR,
  "LONGITUDE" VARCHAR,
  "LOCUKPRN" VARCHAR,
  "LOCCOUNTRY" VARCHAR,
  "SUURL" VARCHAR,
  "SUURLW" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, LOCATION.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_NSS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "NSSUNAVAILREASON" VARCHAR,
  "NSSPOP" VARCHAR,
  "NSSRESP_RATE" VARCHAR,
  "NSSAGG" VARCHAR,
  "NSSAGGYEAR" VARCHAR,
  "NSSYEAR1" VARCHAR,
  "NSSYEAR2" VARCHAR,
  "NSSSBJ" VARCHAR,
  "Q1" VARCHAR,
  "Q2" VARCHAR,
  "Q3" VARCHAR,
  "Q4" VARCHAR,
  "Q5" VARCHAR,
  "Q6" VARCHAR,
  "Q7" VARCHAR,
  "Q8" VARCHAR,
  "Q9" VARCHAR,
  "Q10" VARCHAR,
  "Q11" VARCHAR,
  "Q12" VARCHAR,
  "Q13" VARCHAR,
  "Q14" VARCHAR,
  "Q15" VARCHAR,
  "Q16" VARCHAR,
  "Q17" VARCHAR,
  "Q18" VARCHAR,
  "Q19" VARCHAR,
  "Q20" VARCHAR,
  "Q21" VARCHAR,
  "Q22" VARCHAR,
  "Q23" VARCHAR,
  "Q24" VARCHAR,
  "Q25" VARCHAR,
  "Q26" VARCHAR,
  "T1" VARCHAR,
  "T2" VARCHAR,
  "T3" VARCHAR,
  "T4" VARCHAR,
  "T5" VARCHAR,
  "T6" VARCHAR,
  "T7" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, NSS.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_NSSCOUNTRY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "NSSCOUNTRYUNAVAILREASON" VARCHAR,
  "NSSCOUNTRYPOP" VARCHAR,
  "NSSCOUNTRYRESP_RATE" VARCHAR,
  "NSSCOUNTRYAGG" VARCHAR,
  "NSSCOUNTRYAGGYEAR" VARCHAR,
  "NSSCOUNTRYYEAR1" VARCHAR,
  "NSSCOUNTRYYEAR2" VARCHAR,
  "NSSCOUNTRYSBJ" VARCHAR,
  "Q27" VARCHAR,
  "Q28" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, NSSCOUNTRY.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_SBJ (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "SBJ" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, SBJ.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_TARIFF (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "TARUNAVAILREASON" VARCHAR,
  "TARPOP" VARCHAR,
  "TARAGG" VARCHAR,
  "TARAGGYEAR" VARCHAR,
  "TARYEAR1" VARCHAR,
  "TARYEAR2" VARCHAR,
  "TARSBJ" VARCHAR,
  "T001" VARCHAR,
  "T048" VARCHAR,
  "T064" VARCHAR,
  "T080" VARCHAR,
  "T096" VARCHAR,
  "T112" VARCHAR,
  "T128" VARCHAR,
  "T144" VARCHAR,
  "T160" VARCHAR,
  "T176" VARCHAR,
  "T192" VARCHAR,
  "T208" VARCHAR,
  "T224" VARCHAR,
  "T240" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, TARIFF.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.DISCOVERUNI_UCASCOURSEID (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "PUBUKPRN" VARCHAR,
  "UKPRN" VARCHAR,
  "KISCOURSEID" VARCHAR,
  "KISMODE" VARCHAR,
  "LOCID" VARCHAR,
  "UCASCOURSEID" VARCHAR
)
COMMENT = 'Batch 2. HESA Discover Uni open data (DiscoverUni_latest.zip, UCASCOURSEID.csv). Identified by UKPRN / PUBUKPRN and KISCOURSEID where present. Licence CC BY 4.0: credit HESA (www.hesa.ac.uk), link to the licence, say what was changed. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_A2LEVELINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "A2LevelIndicator" VARCHAR,
  "A2LevelIndicatorDesc" VARCHAR,
  "A2LevelIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) A2LevelIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ALEVELINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ALevelIndicator" VARCHAR,
  "ALevelIndicatorDesc" VARCHAR,
  "ALevelIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ALevelIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ASLEVELINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ASLevelIndicator" VARCHAR,
  "ASLevelIndicatorDesc" VARCHAR,
  "ASLevelIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ASLevelIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ACADEMICYEAR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "AcademicYear" VARCHAR,
  "AcademicYearDesc" VARCHAR,
  "AcademicYearDesc2" VARCHAR,
  "StartDate" VARCHAR,
  "EndDate" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) AcademicYear.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ACCESSHEINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "AccessHEIndicator" VARCHAR,
  "AccessHEIndicatorDesc" VARCHAR,
  "AccessHEIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) AccessHEIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ADULTSKILLSFUNDINGBAND (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "AdultSkillsFundingBand" VARCHAR,
  "AdultSkillsFundingBandRate" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) AdultSkillsFundingBand.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ANNUALVALUE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "BasicSkills" VARCHAR,
  "BasicSkillsBroadType" VARCHAR,
  "BasicSkillsType" VARCHAR,
  "BasicSkillsParticipation" VARCHAR,
  "FullLevel2EntitlementCategory" VARCHAR,
  "FullLevel2Percent" VARCHAR,
  "FullLevel3EntitlementCategory" VARCHAR,
  "FullLevel3Percent" VARCHAR,
  "MI_FullLevel2" VARCHAR,
  "MI_FullLevel2Percent" VARCHAR,
  "MI_FullLevel3" VARCHAR,
  "MI_FullLevel3Percent" VARCHAR,
  "OfQualValid19Plus" VARCHAR,
  "SfaApprovalStatus" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) AnnualValue.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_APPRENTICESHIPCOMPONENTTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ApprenticeshipComponentType" VARCHAR,
  "ApprenticeshipComponentTypeDesc" VARCHAR,
  "ApprenticeshipComponentTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ApprenticeshipComponentType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_APPRENTICESHIPFUNDING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ApprenticeshipType" VARCHAR,
  "ApprenticeshipCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "FundingCategory" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "BandNumber" VARCHAR,
  "CoreGovContributionCap" VARCHAR,
  "1618Incentive" VARCHAR,
  "1618ProviderAdditionalPayment" VARCHAR,
  "1618EmployerAdditionalPayment" VARCHAR,
  "1618FrameworkUplift" VARCHAR,
  "FoundationAppFirstEmpPayment" VARCHAR,
  "FoundationAppSecondEmpPayment" VARCHAR,
  "FoundationAppThirdEmpPayment" VARCHAR,
  "Duration" VARCHAR,
  "CareLeaverAdditionalPayment" VARCHAR,
  "ReservedValue2" VARCHAR,
  "ReservedValue3" VARCHAR,
  "ReservedValue4" VARCHAR,
  "MaxEmployerLevyCap" VARCHAR,
  "FundableWithoutEmployer" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ApprenticeshipFunding.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_APPRENTICESHIPSTANDARDTYPECODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ApprenticeshipStandardTypeCode" VARCHAR,
  "ApprenticeshipStandardTypeCodeDesc" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ApprenticeshipStandardTypeCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_AREACODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "AreaCode" VARCHAR,
  "AreaCodeDesc" VARCHAR,
  "AreaCodeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) AreaCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_AWARDORGCODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "AwardOrgCode" VARCHAR,
  "AwardOrgUKPRN" VARCHAR,
  "AwardOrgName" VARCHAR,
  "AwardOrgShortName" VARCHAR,
  "AwardOrgAcronym" VARCHAR,
  "AwardOrgNonExtant" VARCHAR,
  "AwardOrgNotes" VARCHAR,
  "AwardOrgHigherEducationInstitution" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) AwardOrgCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_BANDNUMBER (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "BandNumber" VARCHAR,
  "BandNumberDesc" VARCHAR,
  "BandNumberDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) BandNumber.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_BASICSKILLS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "BasicSkills" VARCHAR,
  "BasicSkillsDesc" VARCHAR,
  "BasicSkillsDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) BasicSkills.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_BASICSKILLSBROADTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "BasicSkillsBroadType" VARCHAR,
  "BasicSkillsBroadTypeDesc" VARCHAR,
  "BasicSkillsBroadTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) BasicSkillsBroadType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_BASICSKILLSPARTICIPATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "BasicSkillsParticipation" VARCHAR,
  "BasicSkillsParticipationDesc" VARCHAR,
  "BasicSkillsParticipationDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) BasicSkillsParticipation.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_BASICSKILLSTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "BasicSkillsType" VARCHAR,
  "BasicSkillsTypeDesc" VARCHAR,
  "BasicSkillsTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) BasicSkillsType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_CAREERLEARNINGPILOT (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "AreaCode" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "MaxLoanAmount" VARCHAR,
  "SubsidyPercent" VARCHAR,
  "SubsidyRate" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) CareerLearningPilot.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_CATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "CategoryRef" VARCHAR,
  "ParentCategoryRef" VARCHAR,
  "CategoryName" VARCHAR,
  "Target" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Category.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_COMMONCOMPONENT (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "CommonComponent" VARCHAR,
  "CommonComponentDesc" VARCHAR,
  "CommonComponentDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) CommonComponent.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_CREDITBASEDFWKTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "CreditBasedFwkType" VARCHAR,
  "CreditBasedFwkTypeDesc" VARCHAR,
  "CreditBasedFwkTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) CreditBasedFwkType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_DANCEANDDRAMAINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DanceAndDramaIndicator" VARCHAR,
  "DanceAndDramaIndicatorDesc" VARCHAR,
  "DanceAndDramaIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) DanceAndDramaIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_DATAGENERATION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DataGeneratedOn" VARCHAR,
  "Description" VARCHAR,
  "Comment" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) DataGeneration.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_DEVOLVEDFUNDING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "SourceOfFunding" VARCHAR,
  "DevolvedFundingCategory" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "RateWeighted" VARCHAR,
  "RateUnWeighted" VARCHAR,
  "RateUpLift" VARCHAR,
  "SpecialistUplift" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) DevolvedFunding.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_DEVOLVEDFUNDINGCATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "DevolvedFundingCategory" VARCHAR,
  "DevolvedFundingCategoryDesc" VARCHAR,
  "DevolvedFundingCategoryDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) DevolvedFundingCategory.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_DEVOLVED_SOF (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SourceOfFunding" VARCHAR,
  "MCAGLAShortCode" VARCHAR,
  "Name" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Devolved_SoF.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_EFACOFTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "EFACOFTypeCode" VARCHAR,
  "EFACOFTypeDesc" VARCHAR,
  "EFACOFTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) EFACOFType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ENGLPRSCID (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "EnglPrscID" VARCHAR,
  "EnglPrscIDDesc" VARCHAR,
  "EnglPrscIDDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) EnglPrscID.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ENGLANDFEHESTATUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "EnglandFEHEStatus" VARCHAR,
  "EnglandFEHEStatusDesc" VARCHAR,
  "EnglandFEHEStatusDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) EnglandFEHEStatus.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ENTRYSUBLEVEL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "EntrySubLevel" VARCHAR,
  "EntrySubLevelDesc" VARCHAR,
  "EntrySubLevelDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) EntrySubLevel.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FRAMEWORK (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FworkCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "PathwayName" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "SectorSubjectAreaTier1" VARCHAR,
  "SectorSubjectAreaTier2" VARCHAR,
  "NASTitle" VARCHAR,
  "ImplementDate" VARCHAR,
  "IssuingAuthorityTitle" VARCHAR,
  "IssuingAuthority" VARCHAR,
  "DataReceivedDate" VARCHAR,
  "MI_FullLevel2" VARCHAR,
  "MI_FullLevel2Percent" VARCHAR,
  "MI_FullLevel3" VARCHAR,
  "MI_FullLevel3Percent" VARCHAR,
  "CurrentVersion" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Framework.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FRAMEWORKAIMS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FworkCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "LearnAimRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "FrameworkComponentType" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) FrameworkAims.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FRAMEWORKCMNCOMP (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FworkCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "CommonComponent" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "MinLevel" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) FrameworkCmnComp.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FULLLEVEL2ENTITLEMENTCATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FullLevel2EntitlementCategory" VARCHAR,
  "FullLevel2EntitlementCategoryDesc" VARCHAR,
  "FullLevel2EntitlementCategoryDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) FullLevel2EntitlementCategory.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FULLLEVEL3ENTITLEMENTCATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FullLevel3EntitlementCategory" VARCHAR,
  "FullLevel3EntitlementCategoryDesc" VARCHAR,
  "FullLevel3EntitlementCategoryDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) FullLevel3EntitlementCategory.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FUNCTIONALSKILLSINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FunctionalSkillsIndicator" VARCHAR,
  "FunctionalSkillsIndicatorDesc" VARCHAR,
  "FunctionalSkillsIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) FunctionalSkillsIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FUNDING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "FundingCategory" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "RateWeighted" VARCHAR,
  "RateUnWeighted" VARCHAR,
  "WeightingFactor" VARCHAR,
  "AdultSkillsFundingBand" VARCHAR,
  "FundedGuidedLearningHours" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Funding.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_FUNDINGCATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "FundingCategory" VARCHAR,
  "FundingCategoryDesc" VARCHAR,
  "FundingCategoryDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "TargetIndicator" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) FundingCategory.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_GCEINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "GCEIndicator" VARCHAR,
  "GCEIndicatorDesc" VARCHAR,
  "GCEIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) GCEIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_GCSEINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "GCSEIndicator" VARCHAR,
  "GCSEIndicatorDesc" VARCHAR,
  "GCSEIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) GCSEIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_HECOS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "HECoSCode" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) HECoS.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_HECOSCODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "HECoSCode" VARCHAR,
  "HECoSCodeDesc" VARCHAR,
  "HECoSCodeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) HECoSCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ISSUINGAUTHORITY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "IssuingAuthority" VARCHAR,
  "IssuingAuthorityDesc" VARCHAR,
  "IssuingAuthorityDesc2" VARCHAR,
  "IssuingAuthorityUKPRN" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) IssuingAuthority.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_KEYSKILLSINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "KeySkillsIndicator" VARCHAR,
  "KeySkillsIndicatorDesc" VARCHAR,
  "KeySkillsIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) KeySkillsIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_LEARNAIMREFTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRefType" VARCHAR,
  "LearnAimRefTypeDesc" VARCHAR,
  "LearnAimRefTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) LearnAimRefType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_LEARNDIRECTCLASSSYSTEMCODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnDirectClassSystemCode" VARCHAR,
  "LearnDirectClassSystemCodeDesc" VARCHAR,
  "LearnDirectClassSystemCodeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) LearnDirectClassSystemCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_LEARNINGDELIVERY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "LearnAimRefTitle" VARCHAR,
  "LearnAimRefType" VARCHAR,
  "NotionalNVQLevel" VARCHAR,
  "NotionalNVQLevelv2" VARCHAR,
  "AwardOrgAimRef" VARCHAR,
  "CertificationEndDate" VARCHAR,
  "OperationalStartDate" VARCHAR,
  "OperationalEndDate" VARCHAR,
  "EnglandFEHEStatus" VARCHAR,
  "CreditBasedFwkType" VARCHAR,
  "QltyAssAgencyType" VARCHAR,
  "OfQualGlhMin" VARCHAR,
  "OfQualGlhMax" VARCHAR,
  "FrameworkCommonComponent" VARCHAR,
  "EntrySubLevel" VARCHAR,
  "SuccessRateMapCode" VARCHAR,
  "EnglPrscID" VARCHAR,
  "AwardOrgCode" VARCHAR,
  "UnitType" VARCHAR,
  "LearningDeliveryGenre" VARCHAR,
  "OfQualOfferedEngland" VARCHAR,
  "RgltnStartDate" VARCHAR,
  "SourceQualType" VARCHAR,
  "SourceSystemRef" VARCHAR,
  "SourceURLRef" VARCHAR,
  "SourceURLLinkType" VARCHAR,
  "OccupationalIndicator" VARCHAR,
  "AccessHEIndicator" VARCHAR,
  "KeySkillsIndicator" VARCHAR,
  "FunctionalSkillsIndicator" VARCHAR,
  "GCEIndicator" VARCHAR,
  "GCSEIndicator" VARCHAR,
  "ASLevelIndicator" VARCHAR,
  "A2LevelIndicator" VARCHAR,
  "ALevelIndicator" VARCHAR,
  "QCFIndicator" VARCHAR,
  "QCFDiplomaIndicator" VARCHAR,
  "QCFCertificateIndicator" VARCHAR,
  "EFACOFType" VARCHAR,
  "SFAFundedIndicator" VARCHAR,
  "DanceAndDramaIndicator" VARCHAR,
  "Note" VARCHAR,
  "LearnDirectClassSystemCode1" VARCHAR,
  "LearnDirectClassSystemCode2" VARCHAR,
  "LearnDirectClassSystemCode3" VARCHAR,
  "RegulatedCreditValue" VARCHAR,
  "SectorSubjectAreaTier1" VARCHAR,
  "SectorSubjectAreaTier2" VARCHAR,
  "MI_NotionalNVQLevel" VARCHAR,
  "MI_NotionalNVQLevelv2" VARCHAR,
  "GuidedLearningHours" VARCHAR,
  "TotalQualificationTime" VARCHAR,
  "RecognisedHEForOfSFundingPurposes" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) LearningDelivery.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_LEARNINGDELIVERYCATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "CategoryRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) LearningDeliveryCategory.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_LEARNINGDELIVERYGENRE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearningDeliveryGenre" VARCHAR,
  "LearningDeliveryGenreDesc" VARCHAR,
  "LearningDeliveryGenreDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) LearningDeliveryGenre.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_MI_FULLLEVEL2INDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MI_FullLevel2Indicator" VARCHAR,
  "MI_FullLevel2IndicatorDesc" VARCHAR,
  "MI_FullLevel2IndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) MI_FullLevel2Indicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_MI_FULLLEVEL3INDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MI_FullLevel3Indicator" VARCHAR,
  "MI_FullLevel3IndicatorDesc" VARCHAR,
  "MI_FullLevel3IndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) MI_FullLevel3Indicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_MI_NOTIONALNVQLEVEL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MI_NotionalNVQLevel" VARCHAR,
  "MI_NotionalNVQLevelDesc" VARCHAR,
  "MI_NotionalNVQLevelDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) MI_NotionalNVQLevel.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_MI_NOTIONALNVQLEVELV2 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MI_NotionalNVQLevelv2" VARCHAR,
  "MI_NotionalNVQLevelv2Desc" VARCHAR,
  "MI_NotionalNVQLevelv2Desc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) MI_NotionalNVQLevelv2.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_NOTIONALNVQLEVEL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "NotionalNVQLevel" VARCHAR,
  "NotionalNVQLevelDesc" VARCHAR,
  "NotionalNVQLevelDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) NotionalNVQLevel.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_NOTIONALNVQLEVELV2 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "NotionalNVQLevelV2" VARCHAR,
  "NotionalNVQLevelV2Desc" VARCHAR,
  "NotionalNVQLevelV2Desc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) NotionalNVQLevelv2.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_OCCUPATIONALINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "OccupationalIndicator" VARCHAR,
  "OccupationalIndicatorDesc" VARCHAR,
  "OccupationalIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) OccupationalIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_OFQUALOFFEREDENGLAND (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "OfQualOfferedEngland" VARCHAR,
  "OfQualOfferedEnglandDesc" VARCHAR,
  "OfQualOfferedEnglandDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) OfQualOfferedEngland.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_OFQUALVALID19PLUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "OfQualValid19Plus" VARCHAR,
  "OfQualValid19PlusDesc" VARCHAR,
  "OfQualValid19PlusDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) OfQualValid19Plus.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_PROGTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ProgType" VARCHAR,
  "ProgTypeDesc" VARCHAR,
  "ProgTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ProgType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_PROGRAMME (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ProgrammeCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "LastDateforNewStarts" VARCHAR,
  "EffectiveTo" VARCHAR,
  "FundingCategory" VARCHAR,
  "ProgrammeArea" VARCHAR,
  "CoreAim" VARCHAR,
  "Specialism" VARCHAR,
  "SubSpecialism" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Programme.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_PROGRAMMEAIMS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ProgrammeCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "LearnAimRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ProgrammeAims.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_PROGRAMMEFUNDING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ProgrammeCode" VARCHAR,
  "ProgType" VARCHAR,
  "PwayCode" VARCHAR,
  "Identfier" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "FundingBand" VARCHAR,
  "FundingFactor" VARCHAR,
  "RateWeighted" VARCHAR,
  "RateUnWeighted" VARCHAR,
  "ProgrammeCostWeightingFactor" VARCHAR,
  "ProgrammeCostWeightingFactorDesc" VARCHAR,
  "WorkExperience" VARCHAR,
  "Hours" VARCHAR,
  "Duration" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ProgrammeFunding.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_QCFCERTIFICATEINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "QCFCertificateIndicator" VARCHAR,
  "QCFCertificateIndicatorDesc" VARCHAR,
  "QCFCertificateIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) QCFCertificateIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_QCFDIPLOMAINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "QCFDiplomaIndicator" VARCHAR,
  "QCFDiplomaIndicatorDesc" VARCHAR,
  "QCFDiplomaIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) QCFDiplomaIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_QCFINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "QCFIndicator" VARCHAR,
  "QCFIndicatorDesc" VARCHAR,
  "QCFIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) QCFIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_QLTYASSAGENCYTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "QltyAssAgencyType" VARCHAR,
  "QltyAssAgencyTypeDesc" VARCHAR,
  "QltyAssAgencyTypeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) QltyAssAgencyType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_RECOGNISEDHEFOROFSFUNDINGPURPOSES (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "RecognisedHEForOfSFundingPurposes" VARCHAR,
  "RecognisedHEForOfSFundingPurposesDesc" VARCHAR,
  "RecognisedHEForOfSFundingPurposesDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) RecognisedHEForOfSFundingPurposes.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_ROUTE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "RouteId" VARCHAR,
  "ParentRouteId" VARCHAR,
  "RouteName" VARCHAR,
  "RouteShortName" VARCHAR,
  "Target" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Route.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SFAAPPROVALSTATUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SFAApprovalStatus" VARCHAR,
  "SFAApprovalStatusDesc" VARCHAR,
  "SFAApprovalStatusDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SFAApprovalStatus.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SFAFUNDEDINDICATOR (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SFAFundedIndicator" VARCHAR,
  "SFAFundedIndicatorDesc" VARCHAR,
  "SFAFundedIndicatorDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SFAFundedIndicator.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTION96 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Section96ApprovalStatus" VARCHAR,
  "Section96ApprovalStartDate" VARCHAR,
  "Section96ReviewDate" VARCHAR,
  "Section96ValidPre16" VARCHAR,
  "Section96Valid16to18" VARCHAR,
  "Section96Valid18plus" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Section96.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTION96APPROVALSTATUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Section96ApprovalStatus" VARCHAR,
  "Section96ApprovalStatusDesc" VARCHAR,
  "Section96ApprovalStatusDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Section96ApprovalStatus.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTION96VALID16TO18 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Section96Valid16to18" VARCHAR,
  "Section96Valid16to18Desc" VARCHAR,
  "Section96Valid16to18Desc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Section96Valid16to18.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTION96VALID18PLUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Section96Valid18plus" VARCHAR,
  "Section96Valid18plusDesc" VARCHAR,
  "Section96Valid18plusDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Section96Valid18plus.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTION96VALIDPRE16 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "Section96ValidPre16" VARCHAR,
  "Section96ValidPre16Desc" VARCHAR,
  "Section96ValidPre16Desc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Section96ValidPre16.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTORSUBJECTAREA (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SectorSubjectAreaTier1" VARCHAR,
  "SectorSubjectAreaTier1Desc" VARCHAR,
  "SectorSubjectAreaTier1Desc2" VARCHAR,
  "SectorSubjectAreaTier1_EffFrom" VARCHAR,
  "SectorSubjectAreaTier1_EffTo" VARCHAR,
  "SectorSubjectAreaTier2" VARCHAR,
  "SectorSubjectAreaTier2Desc" VARCHAR,
  "SectorSubjectAreaTier2Desc2" VARCHAR,
  "SectorSubjectAreaTier2_EffFrom" VARCHAR,
  "SectorSubjectAreaTier2_EffTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SectorSubjectArea.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTORSUBJECTAREATIER1 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SectorSubjectAreaTier1" VARCHAR,
  "SectorSubjectAreaTier1Desc" VARCHAR,
  "SectorSubjectAreaTier1Desc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SectorSubjectAreaTier1.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SECTORSUBJECTAREATIER2 (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SectorSubjectAreaTier2" VARCHAR,
  "SectorSubjectAreaTier2Desc" VARCHAR,
  "SectorSubjectAreaTier2Desc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SectorSubjectAreaTier2.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SOURCEURLLINKTYPE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SourceURLLinkType" VARCHAR,
  "SourceURLLinkTypeDesc" VARCHAR,
  "SourceURLLinkTypeDesc2" VARCHAR,
  "SourceURLLink" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SourceURLLinkType.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_STANDARD (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardCode" VARCHAR,
  "Version" VARCHAR,
  "ApprenticeshipStandardTypeCode" VARCHAR,
  "StandardName" VARCHAR,
  "StandardSectorCode" VARCHAR,
  "NotionalEndLevel" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "LastDateStarts" VARCHAR,
  "EffectiveTo" VARCHAR,
  "URLLink" VARCHAR,
  "Reference" VARCHAR,
  "SectorSubjectAreaTier1" VARCHAR,
  "SectorSubjectAreaTier2" VARCHAR,
  "IntegratedDegreeStandard" VARCHAR,
  "OtherBodyApprovalRequired" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Standard.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_STANDARDAIMS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardCode" VARCHAR,
  "LearnAimRef" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "StandardComponentType" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) StandardAims.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_STANDARDCOMMONCOMPONENT (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardCode" VARCHAR,
  "CommonComponent" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "MinLevel" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) StandardCommonComponent.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_STANDARDFUNDING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardCode" VARCHAR,
  "FundingCategory" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "BandNumber" VARCHAR,
  "CoreGovContributionCap" VARCHAR,
  "1618Incentive" VARCHAR,
  "SmallBusinessIncentive" VARCHAR,
  "AchievementIncentive" VARCHAR,
  "FundableWithoutEmployer" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) StandardFunding.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_STANDARDSECTORCODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardSectorCode" VARCHAR,
  "StandardSectorCodeDesc" VARCHAR,
  "StandardSectorCodeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) StandardSectorCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_STANDARDVALIDITY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardCode" VARCHAR,
  "ValidityCategory" VARCHAR,
  "StartDate" VARCHAR,
  "LastNewStartDate" VARCHAR,
  "EndDate" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) StandardValidity.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_SUCCESSRATEMAPCODE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "SuccessRateMapCode" VARCHAR,
  "SuccessRateMapCodeDesc" VARCHAR,
  "SuccessRateMapCodeDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) SuccessRateMapCode.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_TLEVELPATHWAY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "StandardCode" VARCHAR,
  "RouteId" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) TLevelPathway.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_TECHNICALROUTE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "RouteId" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) TechnicalRoute.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_VALIDITY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "LearnAimRef" VARCHAR,
  "ValidityCategory" VARCHAR,
  "StartDate" VARCHAR,
  "EndDate" VARCHAR,
  "LastNewStartDate" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Validity.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_VALIDITYCATEGORY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ValidityCategory" VARCHAR,
  "ValidityCategoryDesc" VARCHAR,
  "ValidityCategoryDesc2" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "TargetIndicator" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ValidityCategory.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. CAPTURE_DB.LARS has a cleaned copy of this file; this is the file as published. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_VALIDITYFUNDING_MAPPING (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ValidityCategory" VARCHAR,
  "FundingCategory" VARCHAR,
  "EffectiveFrom" VARCHAR,
  "EffectiveTo" VARCHAR,
  "Comments" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) ValidityFunding_Mapping.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.LARS_VERSION (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "MajorNumber" VARCHAR,
  "MinorNumber" VARCHAR,
  "MaintenanceNumber" VARCHAR,
  "MainDataSchemaName" VARCHAR,
  "RefDataSchemaName" VARCHAR,
  "ActivationDate" VARCHAR,
  "ExpiryDate" VARCHAR,
  "Description" VARCHAR,
  "Comment" VARCHAR,
  "Created_On" VARCHAR,
  "Created_By" VARCHAR,
  "Modified_On" VARCHAR,
  "Modified_By" VARCHAR
)
COMMENT = 'Batch 2. LARS (Learning Aim Reference Service) Version.csv, from published_012_LearningDelivery_V012_CSV.Zip (generated 24 Sep 2026, schema version 12). Department for Education. Open Government Licence v3.0. Columns named exactly as in the file (a repeated name gets (2), (3)...), all text. Add-only: each load adds its rows under a new SOURCEFILEID.';
-- ---------------------------------------------------------------------------
-- DATA_LOAD_ROLE: SELECT and INSERT on each table (add-only), nothing else
-- ---------------------------------------------------------------------------
GRANT USAGE ON FILE FORMAT CAPTURE_DB.TEST_BASELINE.JSON_LINES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.ILR_EXPORT_XML TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.FIS_REPORT_ROW TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.FIS_OUTPUT_JSON TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OFSTED_SCHOOLS_D1_IN_YEAR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OFSTED_SCHOOLS_D2_MOST_RECENT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.GIAS_ESTABLISHMENT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.PERFORMANCE_16_18_INSTITUTION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_APP_PROVIDER TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_ACCREDITATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_ACCREDITATIONTABLE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_ACCREDITATIONBYHEP TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_COMMON TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_CONTINUATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_COURSELOCATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_EMPLOYMENT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_ENTRY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_EXCLUSIONS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_GOSALARY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_GOSECSAL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_GOVOICEWORK TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_INSTITUTION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_JOBLIST TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_JOBTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_KISAIM TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_KISCOURSE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_LEO3 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_LEO3SEC TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_LEO5 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_LEO5SEC TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_LOCATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_NSS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_NSSCOUNTRY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_SBJ TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_TARIFF TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.DISCOVERUNI_UCASCOURSEID TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_A2LEVELINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ALEVELINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ASLEVELINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ACADEMICYEAR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ACCESSHEINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ADULTSKILLSFUNDINGBAND TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ANNUALVALUE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_APPRENTICESHIPCOMPONENTTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_APPRENTICESHIPFUNDING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_APPRENTICESHIPSTANDARDTYPECODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_AREACODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_AWARDORGCODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_BANDNUMBER TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_BASICSKILLS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_BASICSKILLSBROADTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_BASICSKILLSPARTICIPATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_BASICSKILLSTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_CAREERLEARNINGPILOT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_CATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_COMMONCOMPONENT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_CREDITBASEDFWKTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_DANCEANDDRAMAINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_DATAGENERATION TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_DEVOLVEDFUNDING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_DEVOLVEDFUNDINGCATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_DEVOLVED_SOF TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_EFACOFTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ENGLPRSCID TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ENGLANDFEHESTATUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ENTRYSUBLEVEL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FRAMEWORK TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FRAMEWORKAIMS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FRAMEWORKCMNCOMP TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FULLLEVEL2ENTITLEMENTCATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FULLLEVEL3ENTITLEMENTCATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FUNCTIONALSKILLSINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FUNDING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_FUNDINGCATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_GCEINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_GCSEINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_HECOS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_HECOSCODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ISSUINGAUTHORITY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_KEYSKILLSINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_LEARNAIMREFTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_LEARNDIRECTCLASSSYSTEMCODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_LEARNINGDELIVERY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_LEARNINGDELIVERYCATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_LEARNINGDELIVERYGENRE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_MI_FULLLEVEL2INDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_MI_FULLLEVEL3INDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_MI_NOTIONALNVQLEVEL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_MI_NOTIONALNVQLEVELV2 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_NOTIONALNVQLEVEL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_NOTIONALNVQLEVELV2 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_OCCUPATIONALINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_OFQUALOFFEREDENGLAND TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_OFQUALVALID19PLUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_PROGTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_PROGRAMME TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_PROGRAMMEAIMS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_PROGRAMMEFUNDING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_QCFCERTIFICATEINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_QCFDIPLOMAINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_QCFINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_QLTYASSAGENCYTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_RECOGNISEDHEFOROFSFUNDINGPURPOSES TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_ROUTE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SFAAPPROVALSTATUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SFAFUNDEDINDICATOR TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTION96 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTION96APPROVALSTATUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTION96VALID16TO18 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTION96VALID18PLUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTION96VALIDPRE16 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTORSUBJECTAREA TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTORSUBJECTAREATIER1 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SECTORSUBJECTAREATIER2 TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SOURCEURLLINKTYPE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_STANDARD TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_STANDARDAIMS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_STANDARDCOMMONCOMPONENT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_STANDARDFUNDING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_STANDARDSECTORCODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_STANDARDVALIDITY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_SUCCESSRATEMAPCODE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_TLEVELPATHWAY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_TECHNICALROUTE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_VALIDITY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_VALIDITYCATEGORY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_VALIDITYFUNDING_MAPPING TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.LARS_VERSION TO ROLE DATA_LOAD_ROLE;
