-- Oak National Academy's curriculum (decision 56): the three bronze tables,
-- their grants and their governance tags. Loaded by npm run load:data -- 52
-- (units and lessons) and 53 (quizzes), scripts/load/oak.js, from Oak's bulk
-- download and Curriculum API with Rarebit's key.
--
--   OPTIONS_DB.RAW.OAK_UNIT    a unit of a secondary sequence (subject), one row
--     per unit per load: its slugs, titles, year, key stage, exam board and
--     lesson list. The unit's description, prior knowledge, curriculum content
--     and rationale are kept only for a unit with at least one open lesson.
--   OPTIONS_DB.RAW.OAK_LESSON  a lesson, one row per lesson per load. An open
--     lesson is kept whole, transcript included. A RESTRICTED lesson (Oak's
--     flag for third-party content) keeps only its slug and title, its unit's
--     slug and title and its exam board: Oak confirmed on 27 October 2026 that
--     storing those is fine (docs/licences/emails-2026-10.md). The raw
--     download is never staged or kept; only the filtered copy is.
--   OPTIONS_DB.RAW.OAK_QUIZ    the starter and exit quiz of an open lesson,
--     one row per lesson per load, from the API (load step 53, a later
--     session). A question with an image on the question or an answer is
--     left out, and the number left out is in the row.
--
-- Licence: Open Government Licence v3.0 "except where otherwise stated".
-- Attribution: "A [subject] lesson by Oak National Academy licensed under
-- Open Government Licence (OGL)" with a link to the OGL v3.0, carried through
-- silver and gold. The options app never calls Oak: it reads our gold tables.
--
-- Add-only: a subject whose file has changed is loaded again as new rows
-- under a new SOURCEFILEID; silver reads the latest. DATA_LOAD_ROLE gets
-- SELECT and INSERT (no UPDATE, DELETE, TRUNCATE or CREATE); TRANSFORM_ROLE
-- gets SELECT. OPTIONS_DB.RAW.JSON_LINES already exists
-- (sql/load_00_setup.sql).
--
-- Run it in Snowsight, in one go, as ACCOUNTADMIN. Safe to run again.
USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OAK_UNIT (
  SOURCEFILEID    VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER      NUMBER(38,0) NOT NULL COMMENT 'Its line in the filtered file.',
  SEQUENCE_SLUG   VARCHAR COMMENT 'The subject sequence in Oak''s bulk download, e.g. science-secondary.',
  UNIT_SLUG       VARCHAR COMMENT 'Oak''s slug for the unit.',
  KEY_STAGE_SLUG  VARCHAR COMMENT 'ks3 or ks4.',
  EXAM_BOARD_SLUG VARCHAR COMMENT 'The exam board of a key stage 4 unit (e.g. aqa, edexcel, ocr, eduqas); empty for key stage 3 and units with none.',
  ITEM            VARIANT      NOT NULL COMMENT 'The unit as Oak''s bulk download gives it, with sequenceSlug and hasOpenLessons added. For a unit with no open lesson the description, prior knowledge, national curriculum content and why-this-why-now text are removed.'
)
COMMENT = 'Oak National Academy (decision 56). The units of the 17 secondary sequences from Oak''s bulk download, one JSON record per row, added each time a subject''s file changes. Open Government Licence v3.0 except where otherwise stated. Add-only.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OAK_LESSON (
  SOURCEFILEID    VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER      NUMBER(38,0) NOT NULL COMMENT 'Its line in the filtered file.',
  SEQUENCE_SLUG   VARCHAR COMMENT 'The subject sequence in Oak''s bulk download, e.g. science-secondary.',
  LESSON_SLUG     VARCHAR COMMENT 'Oak''s slug for the lesson (its address is https://www.thenational.academy/teachers/lessons/ followed by the slug).',
  UNIT_SLUG       VARCHAR COMMENT 'The slug of the unit the lesson is in.',
  EXAM_BOARD_SLUG VARCHAR COMMENT 'The exam board of the lesson''s unit, where it has one.',
  RESTRICTED      BOOLEAN      COMMENT 'TRUE for a lesson Oak marks restricted (third-party content): only its slug, title, unit and exam board are kept. FALSE for an open lesson, kept whole.',
  ITEM            VARIANT      NOT NULL COMMENT 'An open lesson as Oak''s bulk download gives it (keywords, learning points, misconceptions, teacher tips, transcript and the rest), with sequenceSlug, restricted and examBoard added. A restricted lesson: sequenceSlug, restricted, lessonSlug, lessonTitle, unitSlug, unitTitle and examBoard only.'
)
COMMENT = 'Oak National Academy (decision 56). The lessons of the 17 secondary sequences from Oak''s bulk download, one JSON record per row, added each time a subject''s file changes. Restricted lessons are titles only (Oak, 27 October 2026). Open Government Licence v3.0 except where otherwise stated. Add-only.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.OAK_QUIZ (
  SOURCEFILEID    VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file.',
  LINENUMBER      NUMBER(38,0) NOT NULL COMMENT 'Its line in the saved file.',
  LESSON_SLUG     VARCHAR COMMENT 'Oak''s slug for the (open) lesson the quizzes belong to.',
  ITEM            VARIANT      NOT NULL COMMENT 'The lesson''s starter and exit quizzes as the Curriculum API gives them, without any question that has an image on the question or an answer; questionsLeftOut counts those.'
)
COMMENT = 'Oak National Academy (decision 56). The starter and exit quizzes of the open lessons, from the Curriculum API, one JSON record per row. Questions with images are left out. Never loaded for a restricted lesson. Open Government Licence v3.0 except where otherwise stated. Add-only.';

GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OAK_UNIT TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OAK_LESSON TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.OAK_QUIZ TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.OAK_UNIT TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.OAK_LESSON TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.OAK_QUIZ TO ROLE TRANSFORM_ROLE;

ALTER TABLE OPTIONS_DB.RAW.OAK_UNIT SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'oak-curriculum', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0. Lessons by Oak National Academy.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE OPTIONS_DB.RAW.OAK_LESSON SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'oak-curriculum', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0. Lessons by Oak National Academy.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE OPTIONS_DB.RAW.OAK_QUIZ SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'oak-curriculum', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0. Lessons by Oak National Academy.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The three tables. Expected: 3 rows, ROW_COUNT 0, and COLUMNS_ 8 for
--    OAK_LESSON, 4 for OAK_QUIZ and 7 for OAK_UNIT.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('OAK_UNIT', 'OAK_LESSON', 'OAK_QUIZ')
ORDER BY 1;

-- 2. Who has rights on them. Expected: 3 rows: INSERT DATA_LOAD_ROLE (3 tables),
--    SELECT DATA_LOAD_ROLE (3), SELECT TRANSFORM_ROLE (3); nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('OAK_UNIT', 'OAK_LESSON', 'OAK_QUIZ') AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. The tags. Expected: 21 rows, 7 for each table, with the values set above.
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(OPTIONS_DB.INFORMATION_SCHEMA.TAG_REFERENCES('OPTIONS_DB.RAW.OAK_UNIT', 'TABLE'))
UNION ALL
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(OPTIONS_DB.INFORMATION_SCHEMA.TAG_REFERENCES('OPTIONS_DB.RAW.OAK_LESSON', 'TABLE'))
UNION ALL
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(OPTIONS_DB.INFORMATION_SCHEMA.TAG_REFERENCES('OPTIONS_DB.RAW.OAK_QUIZ', 'TABLE'))
ORDER BY 1, 2;
