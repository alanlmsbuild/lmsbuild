-- Reference data, file 2 of 2: checks to run after
--   npm run import:ref
--   npm run import:ksbs -- --all
-- Read-only. Run in a Snowflake worksheet (any role that can read REF and
-- SKILLS, e.g. ACCOUNTADMIN).

-- 1. The latest REF import. Expected: STATUS succeeded, PARTS
--    soc,interests,sic,postcodes and ROW_COUNTS:
--    SOC2020_UNIT_GROUP 412, SOC2020_SUB_UNIT_GROUP 1,384, SOC2020_INDEX 32,439,
--    INTEREST_WORD 212, SIC2007 731, SIC2007_TO_SIC2026 1,329, POSTCODE 2,729,090.
--    SOURCES lists each file's URL, version and SHA-256.
SELECT ID, PARTS, STATUS, ROW_COUNTS, SOURCES, ERROR
FROM CAPTURE_DB.REF.IMPORT_RUN
ORDER BY ID DESC
LIMIT 1;

-- 2. Postcodes. Expected: 2,729,090 postcodes, 1,810,364 live, 2,704,825 with a
--    location, 1,495,008 live in England. SW1A 1AA at 51.50101, -0.141563.
SELECT COUNT(*) AS POSTCODES, COUNT_IF(TERMINATED IS NULL) AS LIVE, COUNT(LATITUDE) AS WITH_LOCATION,
       COUNT_IF(COUNTRY = 'E92000001' AND TERMINATED IS NULL) AS LIVE_IN_ENGLAND,
       MAX(IFF(POSTCODE_KEY = 'SW1A1AA', LATITUDE || ', ' || LONGITUDE, NULL)) AS SW1A_1AA
FROM CAPTURE_DB.REF.POSTCODE;

-- 3. Interest words. Expected: 69 words, 212 rows, and 0 in the last column
--    (every word's job title is in the ONS index under its SOC 2020 code).
SELECT COUNT(DISTINCT w.WORD) AS WORDS, COUNT(*) AS ROWS_,
       COUNT_IF(NOT EXISTS (SELECT 1 FROM CAPTURE_DB.REF.SOC2020_INDEX i
                            WHERE LOWER(i.JOB_TITLE) = LOWER(w.JOB_TITLE) AND i.SOC2020 = w.SOC2020)) AS NOT_IN_INDEX
FROM CAPTURE_DB.REF.INTEREST_WORD w;

-- 4. "sports" in the ONS index. Expected: 29 job titles across these SOC
--    2020 unit groups (and a few more): 3432 Sports coaches, instructors and
--    officials 6, 1224 Leisure and sports managers and proprietors 6, 6211
--    Sports and leisure assistants 3.
SELECT i.SOC2020, u.TITLE, COUNT(*) AS JOB_TITLES, LISTAGG(i.JOB_TITLE, '; ') WITHIN GROUP (ORDER BY i.JOB_TITLE) AS EXAMPLES
FROM CAPTURE_DB.REF.SOC2020_INDEX i
JOIN CAPTURE_DB.REF.SOC2020_UNIT_GROUP u ON u.SOC2020 = i.SOC2020
WHERE REGEXP_LIKE(i.JOB_TITLE, '.*\\bsports?\\b.*', 'i')
GROUP BY 1, 2
ORDER BY JOB_TITLES DESC, 1;

-- 5. SIC. Expected: 731 condensed-list codes in sections A to U (87100 is
--    section Q, Residential nursing care facilities), and SIC 2007 class
--    01.19 corresponding to two SIC 2026 classes (01.13 and 01.19).
SELECT SECTION, COUNT(*) AS CODES FROM CAPTURE_DB.REF.SIC2007 GROUP BY 1 ORDER BY 1;
SELECT * FROM CAPTURE_DB.REF.SIC2007_TO_SIC2026 WHERE SIC2007 = '01.19';

-- 6. The KSB import (needs SKILLS_ENGLAND_API_KEY). Expected: a succeeded
--    run with SCOPE all open standards, and most occupations having a SOC
--    2020 unit group. The numbers depend on the API.
SELECT r.ID, r.SCOPE, r.STATUS, r.ERROR,
       (SELECT COUNT(*) FROM CAPTURE_DB.SKILLS.OCCUPATION) AS OCCUPATIONS,
       (SELECT COUNT(*) FROM CAPTURE_DB.SKILLS.KSB) AS KSBS,
       (SELECT COUNT(DISTINCT OCCUPATION_CODE) FROM CAPTURE_DB.SKILLS.OCCUPATION_SOC WHERE SOC_VERSION = 'SOC2020') AS WITH_SOC2020,
       (SELECT COUNT(*) FROM CAPTURE_DB.SKILLS.OCCUPATION_SOC WHERE SUB_UNIT_GROUP IS NOT NULL) AS SUB_UNIT_GROUP_LINKS,
       (SELECT COUNT(*) FROM CAPTURE_DB.SKILLS.OCCUPATION_TERM WHERE KIND = 'job title') AS TYPICAL_JOB_TITLES
FROM CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN r
ORDER BY r.ID DESC
LIMIT 1;

-- 7. Our learners' three standards and their SOC codes. Expected: ST0005,
--    ST0072 and ST0259 each with a SOC 2020 unit group whose title fits the
--    job, and 0 in the last check below.
SELECT o.ST_REFERENCE, o.LARS_STANDARD_CODE, o.TITLE, o.ROUTE_NAME, s.SOC_VERSION, s.SOC_KEY, s.IS_PRIMARY,
       COALESCE(u.TITLE, s.DESCRIPTION) AS SOC_TITLE
FROM CAPTURE_DB.SKILLS.OCCUPATION o
LEFT JOIN CAPTURE_DB.SKILLS.OCCUPATION_SOC s ON s.OCCUPATION_CODE = o.OCCUPATION_CODE
LEFT JOIN CAPTURE_DB.REF.SOC2020_UNIT_GROUP u ON u.SOC2020 = s.UNIT_GROUP AND s.SOC_VERSION = 'SOC2020'
WHERE o.ST_REFERENCE IN ('ST0005', 'ST0072', 'ST0259')
ORDER BY o.ST_REFERENCE, s.SOC_VERSION DESC, s.SOC_KEY;

-- Occupation SOC 2020 codes that aren't in the ONS SOC 2020 structure. Expected: 0.
SELECT COUNT(*) AS UNKNOWN_SOC2020
FROM CAPTURE_DB.SKILLS.OCCUPATION_SOC s
WHERE s.SOC_VERSION = 'SOC2020'
  AND NOT EXISTS (SELECT 1 FROM CAPTURE_DB.REF.SOC2020_UNIT_GROUP u WHERE u.SOC2020 = s.UNIT_GROUP);

-- 8. Interests to standards, the path the diagnostic will use: interest word
--    -> SOC 2020 unit group -> occupation -> standard (LARS code). Expected:
--    a list of standards for each word, e.g. care work standards for "care".
SELECT w.WORD, COUNT(DISTINCT o.ST_REFERENCE) AS STANDARDS,
       LISTAGG(DISTINCT o.ST_REFERENCE || ' ' || o.TITLE, '; ') WITHIN GROUP (ORDER BY o.ST_REFERENCE || ' ' || o.TITLE) AS EXAMPLES
FROM CAPTURE_DB.REF.INTEREST_WORD w
JOIN CAPTURE_DB.SKILLS.OCCUPATION_SOC s ON s.UNIT_GROUP = w.SOC2020 AND s.SOC_VERSION = 'SOC2020'
JOIN CAPTURE_DB.SKILLS.OCCUPATION o ON o.OCCUPATION_CODE = s.OCCUPATION_CODE
WHERE w.WORD IN ('sports', 'care', 'cars', 'warehouses', 'talking to people', 'computers')
GROUP BY 1
ORDER BY 1;
