-- Employers, file 3: sites and contacts (employers build step 5).
--
--   ILR.EMPLOYER_CONTACT   one record per person at an employer: name, job
--                          title, email, phone, optional site they're based
--                          at, optional Burrow sign-in (USERID)
--   ILR.EMPLOYER_SITE      an employer's workplaces (e.g. a branch), with a
--                          postcode and a main contact
--   ILR.LEARNER_EMPLOYER   gains SITEID and LINEMANAGERCONTACTID
--   ACCESS.APP_USER        gains ISHEADOFFICE: an employer contact who sees
--                          all the employer's apprentices in Burrow
--   ACCESS.APP_USER_SITE   which sites an employer contact sees in Burrow
--
-- Burrow access fails closed: an employer contact sees an apprentice only if
-- they're head office (ISHEADOFFICE = TRUE) or the apprentice's current link
-- is at one of their current site assignments. No flag and no assignments
-- means nobody. The six existing test employer contacts are made head office
-- below, so they see what they see today. Assignments are set by hand-run
-- SQL for now (docs/before-real-data.md): the app can only read ACCESS.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, AFTER
-- sql/employers_02_own_copy.sql. Safe to run twice. Test data only beyond
-- the new tables and columns; the test snapshot gains the new tables and
-- columns, so the reset (sql/test_reset_02_reset.sql) puts them back.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- ILR.EMPLOYER_CONTACT and ILR.EMPLOYER_SITE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.EMPLOYER_CONTACT (
  CONTACTID     VARCHAR(20)   NOT NULL COMMENT 'e.g. CON-T201, or made by the app. Permanent, never reused.',
  EMPLOYERID    VARCHAR(20)   NOT NULL COMMENT 'The employer they work for (ILR.EMPLOYER), in the same organisation.',
  SITEID        VARCHAR(20)   COMMENT 'The site they are based at, if any: one of the same employer''s sites. Information only: it gives no Burrow access.',
  NAME          VARCHAR(200)  NOT NULL,
  JOBTITLE      VARCHAR(200),
  EMAIL         VARCHAR(320)  COMMENT 'Unique among the employer''s current contacts. For a Burrow user, the same as their sign-in email (ACCESS.APP_USER).',
  PHONE         VARCHAR(40),
  USERID        VARCHAR(36)   COMMENT 'Their Burrow sign-in (ACCESS.APP_USER), if they have one. At most one contact per user.',
  ISCURRENT     BOOLEAN       DEFAULT TRUE NOT NULL COMMENT 'FALSE once they no longer work with us. Never deleted (see the retention item in docs/before-real-data.md).',
  CREATEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY     VARCHAR(40),
  UPDATEDAT     TIMESTAMP_LTZ,
  UPDATEDBY     VARCHAR(40),
  ISTESTDATA    BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_EMPLOYER_CONTACT PRIMARY KEY (CONTACTID)
)
COMMENT = 'People at employers: site contacts, line managers and Burrow users. One record per person. Contact details are personal data (docs/before-real-data.md).';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ILR.EMPLOYER_SITE (
  SITEID        VARCHAR(20)   NOT NULL COMMENT 'e.g. SITE-T001, or made by the app. Permanent, never reused.',
  EMPLOYERID    VARCHAR(20)   NOT NULL COMMENT 'The employer (ILR.EMPLOYER) whose workplace this is.',
  NAME          VARCHAR(200)  NOT NULL COMMENT 'e.g. Tesco Express Crosspool. Unique within the employer.',
  ADDRESSLINE1  VARCHAR(100),
  ADDRESSLINE2  VARCHAR(100),
  TOWN          VARCHAR(100),
  POSTCODE      VARCHAR(8)    NOT NULL COMMENT 'Upper case, on the ONS postcode list (REF.POSTCODE). Prefills the delivery location postcode of new aims.',
  CONTACTID     VARCHAR(20)   COMMENT 'The site''s main contact (ILR.EMPLOYER_CONTACT), at the same employer.',
  ISACTIVE      BOOLEAN       DEFAULT TRUE NOT NULL COMMENT 'FALSE once no longer used. Never deleted.',
  CREATEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY     VARCHAR(40),
  UPDATEDAT     TIMESTAMP_LTZ,
  UPDATEDBY     VARCHAR(40),
  ISTESTDATA    BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_EMPLOYER_SITE PRIMARY KEY (SITEID)
)
COMMENT = 'An employer''s workplaces, e.g. a branch. Companies House only knows the legal company; apprentices work at a site.';

-- ---------------------------------------------------------------------------
-- ILR.LEARNER_EMPLOYER: the apprentice's site and line manager
-- ---------------------------------------------------------------------------
ALTER TABLE CAPTURE_DB.ILR.LEARNER_EMPLOYER ADD COLUMN IF NOT EXISTS SITEID VARCHAR(20) COMMENT 'The site they work at (ILR.EMPLOYER_SITE), one of this link''s employer''s sites. Null: not set, and only head-office contacts see them in Burrow.';
ALTER TABLE CAPTURE_DB.ILR.LEARNER_EMPLOYER ADD COLUMN IF NOT EXISTS LINEMANAGERCONTACTID VARCHAR(20) COMMENT 'Their line manager (ILR.EMPLOYER_CONTACT), a current contact at this link''s employer.';
-- The snapshot table gets the same columns in the same order, so the reset
-- can copy rows back (sql/test_reset_01_baseline.sql).
ALTER TABLE CAPTURE_DB.TEST_BASELINE.LEARNER_EMPLOYER ADD COLUMN IF NOT EXISTS SITEID VARCHAR(20);
ALTER TABLE CAPTURE_DB.TEST_BASELINE.LEARNER_EMPLOYER ADD COLUMN IF NOT EXISTS LINEMANAGERCONTACTID VARCHAR(20);

-- ---------------------------------------------------------------------------
-- ACCESS: head office, and site assignments
-- ---------------------------------------------------------------------------
ALTER TABLE CAPTURE_DB.ACCESS.APP_USER ADD COLUMN IF NOT EXISTS ISHEADOFFICE BOOLEAN DEFAULT FALSE NOT NULL COMMENT 'For an employer contact: TRUE to see all the employer''s current apprentices in Burrow. FALSE (the default): only those at their assigned sites (ACCESS.APP_USER_SITE), or nobody.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.ACCESS.APP_USER_SITE (
  USERID        VARCHAR(36)   NOT NULL COMMENT 'An employer contact (ACCESS.APP_USER).',
  SITEID        VARCHAR(20)   NOT NULL COMMENT 'A site of the user''s own employer (ILR.EMPLOYER_SITE).',
  STARTEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  ENDEDAT       TIMESTAMP_LTZ COMMENT 'Set when the assignment ends. Current only while empty. Never deleted.',
  CREATEDBY     VARCHAR(40)   NOT NULL COMMENT 'Who assigned it: a USERID, or test-data-seed.',
  ENDEDBY       VARCHAR(40),
  ISTESTDATA    BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_APP_USER_SITE PRIMARY KEY (USERID, SITEID, STARTEDAT)
)
COMMENT = 'Which sites an employer contact sees in Burrow. Set by hand-run SQL for now; the app only reads it.';

-- ---------------------------------------------------------------------------
-- Grants to the app's role: table by table, never DELETE
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.EMPLOYER_CONTACT TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.ILR.EMPLOYER_SITE TO ROLE ILR_APP_ROLE;
-- ACCESS stays read-only for the app (npm run check:grants).
GRANT SELECT ON TABLE CAPTURE_DB.ACCESS.APP_USER_SITE TO ROLE ILR_APP_ROLE;
-- ILR.LEARNER_EMPLOYER and ACCESS.APP_USER: the existing grants cover the
-- new columns.

-- ---------------------------------------------------------------------------
-- Test data (ISTESTDATA = TRUE only)
-- ---------------------------------------------------------------------------
-- The six existing test employer contacts are head office: they keep seeing
-- all their employer's apprentices, as today.
UPDATE CAPTURE_DB.ACCESS.APP_USER SET ISHEADOFFICE = TRUE
WHERE USERID IN ('USR-T0201', 'USR-T0202', 'USR-T0203', 'USR-T0204', 'USR-T0205', 'USR-T0206')
  AND ISTESTDATA = TRUE;

-- Four new contacts at Testco Retail Ltd (EMP-T001, ORG-T001), none head
-- office: one site, two sites, an ended assignment, and no assignments.
MERGE INTO CAPTURE_DB.ACCESS.APP_USER t
USING (SELECT * FROM (VALUES
    ('USR-T0207', 'Sam Testsitecontact07', 'sam.testsitecontact07@example.com'),
    ('USR-T0208', 'Ari Testareamanager08', 'ari.testareamanager08@example.com'),
    ('USR-T0209', 'Lee Testendedsite09', 'lee.testendedsite09@example.com'),
    ('USR-T0210', 'Kai Testnosites10', 'kai.testnosites10@example.com')) AS v (USERID, DISPLAYNAME, EMAIL)) s
  ON t.USERID = s.USERID
WHEN NOT MATCHED THEN INSERT (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, EMPLOYERID, ISACTIVE, ISTESTDATA, CREATEDBY)
  VALUES (s.USERID, 'ORG-T001', s.DISPLAYNAME, s.EMAIL, 'EMP-T001', TRUE, TRUE, 'test-data-seed');

MERGE INTO CAPTURE_DB.ACCESS.USER_ROLE t
USING (SELECT * FROM (VALUES ('USR-T0207'), ('USR-T0208'), ('USR-T0209'), ('USR-T0210')) AS v (USERID)) s
  ON t.ROLEGRANTID = 'RG-' || s.USERID || '-EMPLOYER'
WHEN NOT MATCHED THEN INSERT (ROLEGRANTID, USERID, ROLE, GRANTEDBY, ISTESTDATA)
  VALUES ('RG-' || s.USERID || '-EMPLOYER', s.USERID, 'EMPLOYER', 'test-data-seed', TRUE);

-- Sites: three at Testco Retail (one no longer used), one at Example Care
-- Homes (EMP-T002). Real, current postcodes from REF.POSTCODE.
MERGE INTO CAPTURE_DB.ILR.EMPLOYER_SITE t
USING (SELECT * FROM (VALUES
    ('SITE-T001', 'EMP-T001', 'Testco Express Crosspool', '1 Test Road', 'Sheffield', 'S10 5AA', 'CON-T207', TRUE),
    ('SITE-T002', 'EMP-T001', 'Testco Superstore Hillsborough', '2 Test Road', 'Sheffield', 'S6 2AA', 'CON-T212', TRUE),
    ('SITE-T003', 'EMP-T001', 'Testco Metro Old Town (closed)', '3 Test Road', 'Sheffield', 'S10 5AB', NULL, FALSE),
    ('SITE-T004', 'EMP-T002', 'Example Care Home Ecclesall', '4 Test Road', 'Sheffield', 'S11 0AZ', 'CON-T213', TRUE))
    AS v (SITEID, EMPLOYERID, NAME, ADDRESSLINE1, TOWN, POSTCODE, CONTACTID, ISACTIVE)) s
  ON t.SITEID = s.SITEID
WHEN NOT MATCHED THEN INSERT (SITEID, EMPLOYERID, NAME, ADDRESSLINE1, TOWN, POSTCODE, CONTACTID, ISACTIVE, CREATEDBY, ISTESTDATA)
  VALUES (s.SITEID, s.EMPLOYERID, s.NAME, s.ADDRESSLINE1, s.TOWN, s.POSTCODE, s.CONTACTID, s.ISACTIVE, 'test-data-seed', TRUE);

-- Contacts: one for each test employer user (their name and email from
-- ACCESS.APP_USER, so the two match), and three line managers with no
-- Burrow sign-in.
MERGE INTO CAPTURE_DB.ILR.EMPLOYER_CONTACT t
USING (
  SELECT 'CON-T' || RIGHT(u.USERID, 3) AS CONTACTID, u.EMPLOYERID, v.SITEID, u.DISPLAYNAME AS NAME, v.JOBTITLE,
         u.EMAIL, u.USERID
  FROM CAPTURE_DB.ACCESS.APP_USER u
  JOIN (SELECT * FROM (VALUES
      ('USR-T0201', NULL, 'Apprenticeship lead'),
      ('USR-T0202', NULL, 'HR manager'),
      ('USR-T0203', NULL, 'Operations manager'),
      ('USR-T0204', NULL, 'Apprenticeship lead'),
      ('USR-T0205', NULL, 'Owner'),
      ('USR-T0206', NULL, 'Training manager'),
      ('USR-T0207', 'SITE-T001', 'Store manager'),
      ('USR-T0208', NULL, 'Area manager'),
      ('USR-T0209', 'SITE-T002', 'Deputy store manager'),
      ('USR-T0210', NULL, 'Payroll officer')) AS v (USERID, SITEID, JOBTITLE)) v ON v.USERID = u.USERID
  WHERE u.ISTESTDATA = TRUE
  UNION ALL
  SELECT * FROM (VALUES
      ('CON-T211', 'EMP-T001', 'SITE-T001', 'Rae Testlinemanager11', 'Team leader', 'rae.testlinemanager11@example.com', NULL),
      ('CON-T212', 'EMP-T001', 'SITE-T002', 'Ira Testlinemanager12', 'Team leader', 'ira.testlinemanager12@example.com', NULL),
      ('CON-T213', 'EMP-T002', 'SITE-T004', 'Una Testlinemanager13', 'Senior carer', 'una.testlinemanager13@example.com', NULL))
    AS m (CONTACTID, EMPLOYERID, SITEID, NAME, JOBTITLE, EMAIL, USERID)
) s
  ON t.CONTACTID = s.CONTACTID
WHEN NOT MATCHED THEN INSERT (CONTACTID, EMPLOYERID, SITEID, NAME, JOBTITLE, EMAIL, USERID, ISCURRENT, CREATEDBY, ISTESTDATA)
  VALUES (s.CONTACTID, s.EMPLOYERID, s.SITEID, s.NAME, s.JOBTITLE, s.EMAIL, s.USERID, TRUE, 'test-data-seed', TRUE);

-- Site assignments: Sam one site, Ari two, Lee's only one ended, Kai none.
MERGE INTO CAPTURE_DB.ACCESS.APP_USER_SITE t
USING (SELECT * FROM (VALUES
    ('USR-T0207', 'SITE-T001', '2026-10-01 09:00:00', NULL),
    ('USR-T0208', 'SITE-T001', '2026-10-01 09:00:00', NULL),
    ('USR-T0208', 'SITE-T002', '2026-10-01 09:00:00', NULL),
    ('USR-T0209', 'SITE-T002', '2026-10-01 09:00:00', '2026-10-05 17:00:00'))
    AS v (USERID, SITEID, STARTEDAT, ENDEDAT)) s
  ON t.USERID = s.USERID AND t.SITEID = s.SITEID AND t.STARTEDAT = s.STARTEDAT::TIMESTAMP_LTZ
WHEN NOT MATCHED THEN INSERT (USERID, SITEID, STARTEDAT, ENDEDAT, CREATEDBY, ENDEDBY, ISTESTDATA)
  VALUES (s.USERID, s.SITEID, s.STARTEDAT::TIMESTAMP_LTZ, s.ENDEDAT::TIMESTAMP_LTZ, 'test-data-seed',
          IFF(s.ENDEDAT IS NULL, NULL, 'test-data-seed'), TRUE);

-- Some apprentices at sites, with line managers, in the live table and the
-- snapshot alike (their current links only). The rest have no site.
UPDATE CAPTURE_DB.ILR.LEARNER_EMPLOYER le
SET SITEID = v.SITEID, LINEMANAGERCONTACTID = v.CONTACTID
FROM (SELECT * FROM (VALUES
    ('TESTL0001', 'EMP-T001', 'SITE-T001', 'CON-T211'),
    ('TESTL0004', 'EMP-T001', 'SITE-T001', 'CON-T211'),
    ('TESTL0007', 'EMP-T001', 'SITE-T001', NULL),
    ('TESTL0010', 'EMP-T001', 'SITE-T002', 'CON-T212'),
    ('TESTL0028', 'EMP-T001', 'SITE-T002', 'CON-T212'),
    ('TESTL0002', 'EMP-T002', 'SITE-T004', 'CON-T213'),
    ('TESTL0005', 'EMP-T002', 'SITE-T004', 'CON-T213')) AS v (LEARNREFNUMBER, EMPLOYERID, SITEID, CONTACTID)) v
WHERE le.LEARNREFNUMBER = v.LEARNREFNUMBER AND le.EMPLOYERID = v.EMPLOYERID AND le.TODATE IS NULL
  AND le.ISTESTDATA = TRUE AND le.SITEID IS NULL;

UPDATE CAPTURE_DB.TEST_BASELINE.LEARNER_EMPLOYER le
SET SITEID = v.SITEID, LINEMANAGERCONTACTID = v.CONTACTID
FROM (SELECT * FROM (VALUES
    ('TESTL0001', 'EMP-T001', 'SITE-T001', 'CON-T211'),
    ('TESTL0004', 'EMP-T001', 'SITE-T001', 'CON-T211'),
    ('TESTL0007', 'EMP-T001', 'SITE-T001', NULL),
    ('TESTL0010', 'EMP-T001', 'SITE-T002', 'CON-T212'),
    ('TESTL0028', 'EMP-T001', 'SITE-T002', 'CON-T212'),
    ('TESTL0002', 'EMP-T002', 'SITE-T004', 'CON-T213'),
    ('TESTL0005', 'EMP-T002', 'SITE-T004', 'CON-T213')) AS v (LEARNREFNUMBER, EMPLOYERID, SITEID, CONTACTID)) v
WHERE le.LEARNREFNUMBER = v.LEARNREFNUMBER AND le.EMPLOYERID = v.EMPLOYERID AND le.TODATE IS NULL
  AND le.ISTESTDATA = TRUE AND le.SITEID IS NULL;

-- ---------------------------------------------------------------------------
-- The test snapshot (sql/test_reset_02_reset.sql puts these back)
-- ---------------------------------------------------------------------------
-- Taken now, after the test data above. ACCESS.APP_USER (with ISHEADOFFICE)
-- isn't in the snapshot, as before; APP_USER_SITE is, so the reset undoes
-- assignments changed while testing.
CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.EMPLOYER_SITE AS
  SELECT * FROM CAPTURE_DB.ILR.EMPLOYER_SITE WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.EMPLOYER_CONTACT AS
  SELECT * FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.APP_USER_SITE AS
  SELECT * FROM CAPTURE_DB.ACCESS.APP_USER_SITE WHERE ISTESTDATA = TRUE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The app's role on the new tables. Expected: ACCESS.APP_USER_SITE
--    SELECT only; ILR.EMPLOYER_CONTACT and ILR.EMPLOYER_SITE INSERT,
--    SELECT, UPDATE. No DELETE.
SELECT TABLE_SCHEMA, TABLE_NAME, LISTAGG(PRIVILEGE_TYPE, ', ') WITHIN GROUP (ORDER BY PRIVILEGE_TYPE) AS PRIVILEGES
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE GRANTEE = 'ILR_APP_ROLE'
  AND TABLE_SCHEMA || '.' || TABLE_NAME IN ('ACCESS.APP_USER_SITE', 'ILR.EMPLOYER_CONTACT', 'ILR.EMPLOYER_SITE')
GROUP BY TABLE_SCHEMA, TABLE_NAME
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- 2. The new columns. Expected: 5 rows (ACCESS.APP_USER ISHEADOFFICE; ILR
--    and TEST_BASELINE LEARNER_EMPLOYER LINEMANAGERCONTACTID and SITEID).
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME = 'LEARNER_EMPLOYER' AND COLUMN_NAME IN ('SITEID', 'LINEMANAGERCONTACTID'))
   OR (TABLE_SCHEMA = 'ACCESS' AND TABLE_NAME = 'APP_USER' AND COLUMN_NAME = 'ISHEADOFFICE')
ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME;

-- 3. Employer contacts and head office. Expected: USR-T0201 to T0206 TRUE,
--    USR-T0207 to T0210 FALSE, and no employer user that isn't test data.
SELECT USERID, DISPLAYNAME, EMPLOYERID, ISHEADOFFICE, ISTESTDATA
FROM CAPTURE_DB.ACCESS.APP_USER
WHERE EMPLOYERID IS NOT NULL
ORDER BY USERID;

-- 4. The test data. Expected: SITES 4 (ACTIVE_SITES 3), CONTACTS 13
--    (WITH_SIGN_IN 10), ASSIGNMENTS 4 (CURRENT_ASSIGNMENTS 3), LINKS_AT_SITES
--    7 and SNAPSHOT_LINKS_AT_SITES 7, NOT_TEST 0.
SELECT
  (SELECT COUNT(*) FROM CAPTURE_DB.ILR.EMPLOYER_SITE) AS SITES,
  (SELECT COUNT_IF(ISACTIVE) FROM CAPTURE_DB.ILR.EMPLOYER_SITE) AS ACTIVE_SITES,
  (SELECT COUNT(*) FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT) AS CONTACTS,
  (SELECT COUNT(USERID) FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT) AS WITH_SIGN_IN,
  (SELECT COUNT(*) FROM CAPTURE_DB.ACCESS.APP_USER_SITE) AS ASSIGNMENTS,
  (SELECT COUNT_IF(ENDEDAT IS NULL) FROM CAPTURE_DB.ACCESS.APP_USER_SITE) AS CURRENT_ASSIGNMENTS,
  (SELECT COUNT(SITEID) FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER) AS LINKS_AT_SITES,
  (SELECT COUNT(SITEID) FROM CAPTURE_DB.TEST_BASELINE.LEARNER_EMPLOYER) AS SNAPSHOT_LINKS_AT_SITES,
  (SELECT COUNT_IF(NOT ISTESTDATA) FROM CAPTURE_DB.ILR.EMPLOYER_SITE)
    + (SELECT COUNT_IF(NOT ISTESTDATA) FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT)
    + (SELECT COUNT_IF(NOT ISTESTDATA) FROM CAPTURE_DB.ACCESS.APP_USER_SITE) AS NOT_TEST;

-- 5. Everything points within the same employer, and one person is one
--    record. Expected: 0 on every row.
SELECT 'site contact at another employer' AS PROBLEM, COUNT(*) AS N
FROM CAPTURE_DB.ILR.EMPLOYER_SITE s JOIN CAPTURE_DB.ILR.EMPLOYER_CONTACT c ON c.CONTACTID = s.CONTACTID
WHERE c.EMPLOYERID <> s.EMPLOYERID
UNION ALL SELECT 'site contact that does not exist', COUNT(*)
FROM CAPTURE_DB.ILR.EMPLOYER_SITE s LEFT JOIN CAPTURE_DB.ILR.EMPLOYER_CONTACT c ON c.CONTACTID = s.CONTACTID
WHERE s.CONTACTID IS NOT NULL AND c.CONTACTID IS NULL
UNION ALL SELECT 'contact based at another employer''s site', COUNT(*)
FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT c JOIN CAPTURE_DB.ILR.EMPLOYER_SITE s ON s.SITEID = c.SITEID
WHERE s.EMPLOYERID <> c.EMPLOYERID
UNION ALL SELECT 'apprentice at another employer''s site, or a site that does not exist', COUNT(*)
FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER le LEFT JOIN CAPTURE_DB.ILR.EMPLOYER_SITE s ON s.SITEID = le.SITEID
WHERE le.SITEID IS NOT NULL AND (s.SITEID IS NULL OR s.EMPLOYERID <> le.EMPLOYERID)
UNION ALL SELECT 'line manager at another employer, or not a contact', COUNT(*)
FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER le LEFT JOIN CAPTURE_DB.ILR.EMPLOYER_CONTACT c ON c.CONTACTID = le.LINEMANAGERCONTACTID
WHERE le.LINEMANAGERCONTACTID IS NOT NULL AND (c.CONTACTID IS NULL OR c.EMPLOYERID <> le.EMPLOYERID)
UNION ALL SELECT 'assignment to a site not at the user''s employer', COUNT(*)
FROM CAPTURE_DB.ACCESS.APP_USER_SITE a
JOIN CAPTURE_DB.ACCESS.APP_USER u ON u.USERID = a.USERID
LEFT JOIN CAPTURE_DB.ILR.EMPLOYER_SITE s ON s.SITEID = a.SITEID
WHERE s.SITEID IS NULL OR s.EMPLOYERID IS DISTINCT FROM u.EMPLOYERID
UNION ALL SELECT 'contact and sign-in emails differ', COUNT(*)
FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT c JOIN CAPTURE_DB.ACCESS.APP_USER u ON u.USERID = c.USERID
WHERE LOWER(c.EMAIL) IS DISTINCT FROM LOWER(u.EMAIL) OR c.EMPLOYERID IS DISTINCT FROM u.EMPLOYERID
UNION ALL SELECT 'user with more than one contact', COUNT(*)
FROM (SELECT USERID FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT WHERE USERID IS NOT NULL GROUP BY USERID HAVING COUNT(*) > 1)
UNION ALL SELECT 'same email twice among an employer''s current contacts', COUNT(*)
FROM (SELECT EMPLOYERID, LOWER(EMAIL) FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT WHERE ISCURRENT AND EMAIL IS NOT NULL
      GROUP BY 1, 2 HAVING COUNT(*) > 1)
UNION ALL SELECT 'head office with current site assignments', COUNT(DISTINCT u.USERID)
FROM CAPTURE_DB.ACCESS.APP_USER u JOIN CAPTURE_DB.ACCESS.APP_USER_SITE a ON a.USERID = u.USERID AND a.ENDEDAT IS NULL
WHERE u.ISHEADOFFICE;

-- 6. Who would see which apprentices in Burrow, by the rule the app uses:
--    an active user who is head office, or an active user with a current
--    assignment to the apprentice's site at their own employer; nothing
--    else. (A CTE: a correlated subquery in a join condition gave Snowflake
--    internal error 300010.) Expected: USR-T0201 Erin 17 (all of Testco's
--    current apprentices, as today), USR-T0207 Sam 3 (Crosspool), USR-T0208
--    Ari 5 (Crosspool and Hillsborough), USR-T0209 Lee 0 (assignment ended),
--    USR-T0210 Kai 0 (no assignments).
WITH users AS (
  SELECT USERID, DISPLAYNAME, EMPLOYERID, ISACTIVE, ISHEADOFFICE
  FROM CAPTURE_DB.ACCESS.APP_USER
  WHERE USERID IN ('USR-T0201', 'USR-T0207', 'USR-T0208', 'USR-T0209', 'USR-T0210')
),
current_links AS (
  SELECT LEARNREFNUMBER, EMPLOYERID, SITEID
  FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER
  WHERE TODATE IS NULL OR TODATE >= CURRENT_DATE()
),
site_access AS (
  SELECT a.USERID, a.SITEID, s.EMPLOYERID
  FROM CAPTURE_DB.ACCESS.APP_USER_SITE a
  JOIN CAPTURE_DB.ILR.EMPLOYER_SITE s ON s.SITEID = a.SITEID
  WHERE a.ENDEDAT IS NULL
),
visible AS (
  SELECT u.USERID, l.LEARNREFNUMBER
  FROM users u JOIN current_links l ON l.EMPLOYERID = u.EMPLOYERID
  WHERE u.ISACTIVE AND u.ISHEADOFFICE = TRUE
  UNION
  SELECT u.USERID, l.LEARNREFNUMBER
  FROM users u
  JOIN site_access a ON a.USERID = u.USERID AND a.EMPLOYERID = u.EMPLOYERID
  JOIN current_links l ON l.EMPLOYERID = u.EMPLOYERID AND l.SITEID = a.SITEID
  WHERE u.ISACTIVE
)
SELECT u.USERID, u.DISPLAYNAME, COUNT(v.LEARNREFNUMBER) AS SEES
FROM users u LEFT JOIN visible v ON v.USERID = u.USERID
GROUP BY u.USERID, u.DISPLAYNAME
ORDER BY u.USERID;

-- 7. The snapshot holds only test data and matches the live tables (for
--    apprentice links, the site links only: other tests may have changed
--    links until the next reset). Expected: 0 in every column.
SELECT
  (SELECT COUNT_IF(NOT ISTESTDATA) FROM CAPTURE_DB.TEST_BASELINE.EMPLOYER_SITE)
    + (SELECT COUNT_IF(NOT ISTESTDATA) FROM CAPTURE_DB.TEST_BASELINE.EMPLOYER_CONTACT)
    + (SELECT COUNT_IF(NOT ISTESTDATA) FROM CAPTURE_DB.TEST_BASELINE.APP_USER_SITE) AS NOT_TEST,
  (SELECT COUNT(*) FROM (SELECT * FROM CAPTURE_DB.ILR.EMPLOYER_SITE WHERE ISTESTDATA MINUS SELECT * FROM CAPTURE_DB.TEST_BASELINE.EMPLOYER_SITE)) AS SITES_DIFFERENT,
  (SELECT COUNT(*) FROM (SELECT * FROM CAPTURE_DB.ILR.EMPLOYER_CONTACT WHERE ISTESTDATA MINUS SELECT * FROM CAPTURE_DB.TEST_BASELINE.EMPLOYER_CONTACT)) AS CONTACTS_DIFFERENT,
  (SELECT COUNT(*) FROM (SELECT * FROM CAPTURE_DB.ACCESS.APP_USER_SITE WHERE ISTESTDATA MINUS SELECT * FROM CAPTURE_DB.TEST_BASELINE.APP_USER_SITE)) AS ASSIGNMENTS_DIFFERENT,
  (SELECT COUNT(*) FROM (
     SELECT LEARNREFNUMBER, EMPLOYERID, SITEID, LINEMANAGERCONTACTID FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER WHERE ISTESTDATA AND SITEID IS NOT NULL
     MINUS
     SELECT LEARNREFNUMBER, EMPLOYERID, SITEID, LINEMANAGERCONTACTID FROM CAPTURE_DB.TEST_BASELINE.LEARNER_EMPLOYER WHERE SITEID IS NOT NULL)) AS SITE_LINKS_DIFFERENT;

-- 8. The app's role still can't see the snapshot. Expected: 0.
SHOW GRANTS ON SCHEMA CAPTURE_DB.TEST_BASELINE
  ->> SELECT COUNT(*) AS APP_ROLE_GRANTS FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';
