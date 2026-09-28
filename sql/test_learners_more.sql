-- More test learners: 100 extra learners (TESTL0017 to TESTL0116) so the
-- reports, caseloads and QAR have realistic numbers, plus the tutors,
-- assessors and employers they need.
--
-- TEST DATA ONLY. Every row this file adds has ISTESTDATA = TRUE, names are
-- obviously fake (every family name is TestlearnerNN, TesttutorNN and so
-- on), every email ends @example.com and every postcode starts ZZ.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet, after
-- access_test_users.sql. Safe to run twice: every row has a fixed id and is
-- only added if it isn't there already (MERGE ... WHEN NOT MATCHED), so a
-- second run adds nothing and never overwrites changes made in the app
-- since. The one update (the existing learners' ULNs) only changes a ULN
-- that still has its old seeded value.
--
-- Generated from a script with a fixed seed, so the learners, dates and
-- expected figures below always match each other.
--
-- What it sets up:
--   ORG-T001 Rarebit Test Provider: 85 new learners.
--     New tutors    OFF0014 Hal Testtutor05 to OFF0018 Luca Testtutor09
--     New assessors OFF0019 Mo Testassessor05 to OFF0023 Ravi Testassessor09
--     The officers are split into two groups, which become Max's and Mia's
--     teams in part 8 (there's no team table yet, so this split is the only
--     record of it, and check 4 lists it):
--       Max's group: tutors OFF0002, OFF0004 Tina, OFF0005 Toby, OFF0014 Hal,
--                    assessors OFF0001, OFF0003, OFF0006 Ada, OFF0019 Mo.
--                    The 13 existing learners and 36 new ones.
--       Mia's group: tutors OFF0015 to OFF0018, assessors OFF0020 to OFF0023.
--                    49 new learners.
--     Dee (OFF0010, inactive) gets no learners, and Ivy (OFF0007) stays IQA only.
--     New employer EMP-T005 Placeholder Foods Ltd, contact Pat Testcontact05.
--   ORG-T002 Second Test Provider: 15 new learners.
--     New tutor OFF0024 Suki Testtutor10, new assessor OFF0025 Tam Testassessor10.
--     New employer EMP-T006 Sample Care Group Ltd, contact Jo Testcontact06.
--   Every learner has exactly one current tutor and one current assessor,
--   both from the same group, about 12 learners per officer in ORG-T001
--   and 9 in ORG-T002.
--   Standards: each organisation's learners are split about equally across
--   ST0072 Customer Service Practitioner (122), ST0005 Adult Care Worker
--   (119) and ST0259 Supply Chain Warehouse Operative (111).
--   Employers: 86 of the 100 are linked to an employer that fits their
--   standard, from their start date. Withdrawn learners' links end on the
--   date they withdrew, so they no longer show on the employer's screens.
--   14 have no employer.
--   Users: one per new officer (USR-T0014 to USR-T0025, numbered like the
--   officer), one per new learner (USR-T1017 to USR-T1116: USR-T1 plus the
--   learner number, because USR-T02xx is already used for employer
--   contacts), and the two new employer contacts (USR-T0205, USR-T0206).
--   The 16 existing learners get ULNs that pass the check digit rule
--   (none of 9100000001 to 9100000016 did).
--
-- Outcomes, for the QAR. Academic years run 1 August to 31 July.
--   Ending in 2024/25 (26 learners): 16 achieved, 3 completed but not
--     achieved, 6 withdrawn, 1 withdrawn 18 days after starting (excluded
--     from the QAR).
--   Ending in 2025/26 (36): 17 achieved, 2 more who planned to end in
--     2024/25 but achieved in 2025/26, 4 completed but not achieved,
--     6 withdrawn, 5 still continuing past their planned end date with no
--     outcome, 2 on a break in learning (excluded from the QAR).
--   Continuing (38): 36 in learning with planned end dates from November
--     2026 onwards, 2 on a break in learning.
--   How each is recorded, matching what the app writes:
--     Achieved: COMPSTATUS 2, OUTCOME 1, LEARNACTENDDATE and ACHDATE.
--     Completed but not achieved: COMPSTATUS 2, OUTCOME 3, no ACHDATE.
--     Withdrawn: COMPSTATUS 3, OUTCOME 3, LEARNACTENDDATE and WITHDRAWREASON.
--       (The first version of this file left OUTCOME empty, as the app's
--       Withdraw button did then. withdrawn_outcome.sql fills those in.)
--     Break in learning: COMPSTATUS 6, LEARNACTENDDATE = the day the break
--       started, OUTCOME left empty.
--     Continuing: COMPSTATUS 1, no end date.
--
-- No evidence, progress reviews or sign-offs.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;


-- ---------------------------------------------------------------------------
-- 1. New officers
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.OFFICER t
USING (SELECT * FROM (VALUES
    ('OFF0014', 'Hal Testtutor05', 'TUTOR', 'hal.testtutor05@example.com', 'ORG-T001'),
    ('OFF0015', 'Ines Testtutor06', 'TUTOR', 'ines.testtutor06@example.com', 'ORG-T001'),
    ('OFF0016', 'Jude Testtutor07', 'TUTOR', 'jude.testtutor07@example.com', 'ORG-T001'),
    ('OFF0017', 'Kemi Testtutor08', 'TUTOR', 'kemi.testtutor08@example.com', 'ORG-T001'),
    ('OFF0018', 'Luca Testtutor09', 'TUTOR', 'luca.testtutor09@example.com', 'ORG-T001'),
    ('OFF0019', 'Mo Testassessor05', 'ASSESSOR', 'mo.testassessor05@example.com', 'ORG-T001'),
    ('OFF0020', 'Nell Testassessor06', 'ASSESSOR', 'nell.testassessor06@example.com', 'ORG-T001'),
    ('OFF0021', 'Oli Testassessor07', 'ASSESSOR', 'oli.testassessor07@example.com', 'ORG-T001'),
    ('OFF0022', 'Pia Testassessor08', 'ASSESSOR', 'pia.testassessor08@example.com', 'ORG-T001'),
    ('OFF0023', 'Ravi Testassessor09', 'ASSESSOR', 'ravi.testassessor09@example.com', 'ORG-T001'),
    ('OFF0024', 'Suki Testtutor10', 'TUTOR', 'suki.testtutor10@example.com', 'ORG-T002'),
    ('OFF0025', 'Tam Testassessor10', 'ASSESSOR', 'tam.testassessor10@example.com', 'ORG-T002')) AS v (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL, ORGANISATIONID)) s
  ON t.OFFICERREFNUMBER = s.OFFICERREFNUMBER
WHEN NOT MATCHED THEN INSERT (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL, ORGANISATIONID, ISTESTDATA)
  VALUES (s.OFFICERREFNUMBER, s.OFFICERNAME, s.OFFICERTYPE, s.EMAIL, s.ORGANISATIONID, TRUE);


-- ---------------------------------------------------------------------------
-- 2. New employers
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.EMPLOYER t
USING (SELECT * FROM (VALUES
    ('EMP-T005', 'ORG-T001', 'Placeholder Foods Ltd', 999000005),
    ('EMP-T006', 'ORG-T002', 'Sample Care Group Ltd', 999000006)) AS v (EMPLOYERID, ORGANISATIONID, NAME, EMPLOYERREF)) s
  ON t.EMPLOYERID = s.EMPLOYERID
WHEN NOT MATCHED THEN INSERT (EMPLOYERID, ORGANISATIONID, NAME, EMPLOYERREF, ISTESTDATA)
  VALUES (s.EMPLOYERID, s.ORGANISATIONID, s.NAME, s.EMPLOYERREF, TRUE);


-- ---------------------------------------------------------------------------
-- 3. New learners
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.LEARNER t
USING (SELECT LEARNREFNUMBER, ORGANISATIONID, ULN, GIVENNAMES, FAMILYNAME, DOB::DATE AS DATEOFBIRTH, SEX, ETHNICITY,
              LLDDHEALTHPROB, POSTCODE, POSTCODEPRIOR, EMAIL
       FROM (VALUES
    ('TESTL0017', 'ORG-T001', 9100000174, 'Sami', 'Testlearner17', '2005-02-16', 'M', 34, 2, 'ZZ4 7BX', 'ZZ4 7BX', 'sami.testlearner17@example.com'),
    ('TESTL0018', 'ORG-T001', 9100000182, 'Chloe', 'Testlearner18', '1987-11-25', 'F', 31, 2, 'ZZ4 8BY', 'ZZ4 8BY', 'chloe.testlearner18@example.com'),
    ('TESTL0019', 'ORG-T001', 9100000190, 'Liam', 'Testlearner19', '2007-02-08', 'M', 31, 2, 'ZZ4 9BZ', 'ZZ5 7SN', 'liam.testlearner19@example.com'),
    ('TESTL0020', 'ORG-T001', 9100000204, 'Arjun', 'Testlearner20', '2000-05-15', 'M', 31, 2, 'ZZ4 0DA', 'ZZ4 0DA', 'arjun.testlearner20@example.com'),
    ('TESTL0021', 'ORG-T001', 9100000212, 'Ella', 'Testlearner21', '2007-09-03', 'F', 31, 2, 'ZZ4 1DB', 'ZZ4 1DB', 'ella.testlearner21@example.com'),
    ('TESTL0022', 'ORG-T001', 9100000220, 'Umar', 'Testlearner22', '1993-04-20', 'M', 31, 2, 'ZZ4 2DD', 'ZZ4 2DD', 'umar.testlearner22@example.com'),
    ('TESTL0023', 'ORG-T001', 9100000239, 'Lena', 'Testlearner23', '2006-06-27', 'F', 31, 2, 'ZZ4 3DE', 'ZZ4 3DE', 'lena.testlearner23@example.com'),
    ('TESTL0024', 'ORG-T001', 9100000247, 'Tomasz', 'Testlearner24', '2006-04-28', 'M', 40, 1, 'ZZ4 4DF', 'ZZ4 4DF', 'tomasz.testlearner24@example.com'),
    ('TESTL0025', 'ORG-T001', 9100000255, 'Kian', 'Testlearner25', '2001-11-23', 'M', 31, 9, 'ZZ4 5DG', 'ZZ4 5DG', 'kian.testlearner25@example.com'),
    ('TESTL0026', 'ORG-T001', 9100000263, 'Aisha', 'Testlearner26', '2007-09-23', 'F', 31, 2, 'ZZ4 6DH', 'ZZ4 6DH', 'aisha.testlearner26@example.com'),
    ('TESTL0027', 'ORG-T001', 9100000271, 'Niamh', 'Testlearner27', '2004-12-16', 'F', 31, 2, 'ZZ4 7DJ', 'ZZ4 7DJ', 'niamh.testlearner27@example.com'),
    ('TESTL0028', 'ORG-T001', 9100005281, 'Declan', 'Testlearner28', '2007-06-21', 'M', 31, 1, 'ZZ4 8DL', 'ZZ4 8DL', 'declan.testlearner28@example.com'),
    ('TESTL0029', 'ORG-T001', 9100000298, 'Kwame', 'Testlearner29', '2010-02-10', 'M', 31, 2, 'ZZ4 9DN', 'ZZ4 9DN', 'kwame.testlearner29@example.com'),
    ('TESTL0030', 'ORG-T001', 9100000301, 'Ben', 'Testlearner30', '2006-08-11', 'M', 31, 2, 'ZZ4 0EP', 'ZZ4 0EP', 'ben.testlearner30@example.com'),
    ('TESTL0031', 'ORG-T001', 9100005311, 'Priya', 'Testlearner31', '2006-03-31', 'F', 31, 1, 'ZZ4 1EQ', 'ZZ4 1EQ', 'priya.testlearner31@example.com'),
    ('TESTL0032', 'ORG-T001', 9100000328, 'Noah', 'Testlearner32', '1983-03-30', 'M', 31, 1, 'ZZ4 2ER', 'ZZ4 2ER', 'noah.testlearner32@example.com'),
    ('TESTL0033', 'ORG-T001', 9100000336, 'Omar', 'Testlearner33', '2005-06-24', 'M', 37, 2, 'ZZ4 3ES', 'ZZ4 3ES', 'omar.testlearner33@example.com'),
    ('TESTL0034', 'ORG-T002', 9100000344, 'Adam', 'Testlearner34', '2002-11-25', 'M', 31, 2, 'ZZ4 4ET', 'ZZ4 4ET', 'adam.testlearner34@example.com'),
    ('TESTL0035', 'ORG-T001', 9100000352, 'Keira', 'Testlearner35', '2003-07-21', 'F', 44, 2, 'ZZ4 5EU', 'ZZ4 5EU', 'keira.testlearner35@example.com'),
    ('TESTL0036', 'ORG-T001', 9100000360, 'Jasmin', 'Testlearner36', '2006-09-24', 'F', 31, 1, 'ZZ4 6EW', 'ZZ4 6EW', 'jasmin.testlearner36@example.com'),
    ('TESTL0037', 'ORG-T001', 9100000379, 'Lewis', 'Testlearner37', '2009-09-25', 'M', 31, 2, 'ZZ4 7EX', 'ZZ4 7EX', 'lewis.testlearner37@example.com'),
    ('TESTL0038', 'ORG-T002', 9100000387, 'Ffion', 'Testlearner38', '2006-03-11', 'F', 31, 2, 'ZZ4 8EY', 'ZZ4 8EY', 'ffion.testlearner38@example.com'),
    ('TESTL0039', 'ORG-T001', 9100000395, 'Isla', 'Testlearner39', '1971-07-01', 'F', 31, 2, 'ZZ4 9EZ', 'ZZ5 7SN', 'isla.testlearner39@example.com'),
    ('TESTL0040', 'ORG-T002', 9100000409, 'Callum', 'Testlearner40', '1995-08-04', 'M', 31, 2, 'ZZ4 0FA', 'ZZ4 0FA', 'callum.testlearner40@example.com'),
    ('TESTL0041', 'ORG-T001', 9100000417, 'Sana', 'Testlearner41', '2006-09-12', 'F', 31, 2, 'ZZ4 1FB', 'ZZ4 1FB', 'sana.testlearner41@example.com'),
    ('TESTL0042', 'ORG-T001', 9100000425, 'Olivia', 'Testlearner42', '2006-09-18', 'F', 31, 2, 'ZZ4 2FD', 'ZZ4 2FD', 'olivia.testlearner42@example.com'),
    ('TESTL0043', 'ORG-T001', 9100000433, 'Leah', 'Testlearner43', '2003-10-17', 'F', 31, 2, 'ZZ4 3FE', 'ZZ4 3FE', 'leah.testlearner43@example.com'),
    ('TESTL0044', 'ORG-T001', 9100000441, 'Grace', 'Testlearner44', '2006-03-02', 'F', 31, 2, 'ZZ4 4FF', 'ZZ4 4FF', 'grace.testlearner44@example.com'),
    ('TESTL0045', 'ORG-T001', 9100005451, 'Zara', 'Testlearner45', '1972-08-12', 'F', 31, 9, 'ZZ4 5FG', 'ZZ4 5FG', 'zara.testlearner45@example.com'),
    ('TESTL0046', 'ORG-T001', 9100000468, 'Hana', 'Testlearner46', '1991-10-27', 'F', 31, 1, 'ZZ4 6FH', 'ZZ4 6FH', 'hana.testlearner46@example.com'),
    ('TESTL0047', 'ORG-T002', 9100000476, 'Nadia', 'Testlearner47', '1996-03-06', 'F', 34, 2, 'ZZ4 7FJ', 'ZZ4 7FJ', 'nadia.testlearner47@example.com'),
    ('TESTL0048', 'ORG-T002', 9100000484, 'Theo', 'Testlearner48', '2002-09-18', 'M', 31, 2, 'ZZ4 8FL', 'ZZ4 8FL', 'theo.testlearner48@example.com'),
    ('TESTL0049', 'ORG-T001', 9100000492, 'Mei', 'Testlearner49', '2001-03-19', 'F', 34, 2, 'ZZ4 9FN', 'ZZ5 7EZ', 'mei.testlearner49@example.com'),
    ('TESTL0050', 'ORG-T002', 9100000506, 'Will', 'Testlearner50', '2005-04-03', 'M', 31, 1, 'ZZ4 0GP', 'ZZ4 0GP', 'will.testlearner50@example.com'),
    ('TESTL0051', 'ORG-T001', 9100000514, 'Dev', 'Testlearner51', '2002-04-14', 'M', 99, 2, 'ZZ4 1GQ', 'ZZ4 1GQ', 'dev.testlearner51@example.com'),
    ('TESTL0052', 'ORG-T001', 9100000522, 'Rosa', 'Testlearner52', '2009-04-25', 'F', 99, 2, 'ZZ4 2GR', 'ZZ4 2GR', 'rosa.testlearner52@example.com'),
    ('TESTL0053', 'ORG-T002', 9100000530, 'Daria', 'Testlearner53', '2007-06-28', 'F', 31, 2, 'ZZ4 3GS', 'ZZ4 3GS', 'daria.testlearner53@example.com'),
    ('TESTL0054', 'ORG-T001', 9100000549, 'Zak', 'Testlearner54', '2006-08-09', 'M', 31, 2, 'ZZ4 4GT', 'ZZ4 4GT', 'zak.testlearner54@example.com'),
    ('TESTL0055', 'ORG-T001', 9100000557, 'Tia', 'Testlearner55', '1990-02-16', 'F', 31, 2, 'ZZ4 5GU', 'ZZ4 5GU', 'tia.testlearner55@example.com'),
    ('TESTL0056', 'ORG-T001', 9100000565, 'Yasmin', 'Testlearner56', '2009-01-01', 'F', 37, 1, 'ZZ4 6GW', 'ZZ4 6GW', 'yasmin.testlearner56@example.com'),
    ('TESTL0057', 'ORG-T001', 9100000573, 'Uma', 'Testlearner57', '2003-03-26', 'F', 31, 2, 'ZZ4 7GX', 'ZZ4 7GX', 'uma.testlearner57@example.com'),
    ('TESTL0058', 'ORG-T001', 9100000581, 'Ethan', 'Testlearner58', '1983-10-29', 'M', 46, 2, 'ZZ4 8GY', 'ZZ5 4HY', 'ethan.testlearner58@example.com'),
    ('TESTL0059', 'ORG-T001', 9100005591, 'Maya', 'Testlearner59', '2009-09-14', 'F', 98, 1, 'ZZ4 9GZ', 'ZZ4 9GZ', 'maya.testlearner59@example.com'),
    ('TESTL0060', 'ORG-T001', 9100000603, 'Amara', 'Testlearner60', '2000-10-07', 'F', 31, 1, 'ZZ4 0HA', 'ZZ4 0HA', 'amara.testlearner60@example.com'),
    ('TESTL0061', 'ORG-T001', 9100000611, 'Jonah', 'Testlearner61', '2008-11-02', 'M', 31, 2, 'ZZ4 1HB', 'ZZ4 1HB', 'jonah.testlearner61@example.com'),
    ('TESTL0062', 'ORG-T001', 9100005621, 'Quinn', 'Testlearner62', '1976-05-27', 'F', 31, 2, 'ZZ4 2HD', 'ZZ4 2HD', 'quinn.testlearner62@example.com'),
    ('TESTL0063', 'ORG-T001', 9100000638, 'Milo', 'Testlearner63', '2006-09-20', 'M', 31, 2, 'ZZ4 3HE', 'ZZ4 3HE', 'milo.testlearner63@example.com'),
    ('TESTL0064', 'ORG-T002', 9100000646, 'Wren', 'Testlearner64', '2003-05-04', 'F', 31, 2, 'ZZ4 4HF', 'ZZ4 4HF', 'wren.testlearner64@example.com'),
    ('TESTL0065', 'ORG-T001', 9100000654, 'Yusuf', 'Testlearner65', '2004-07-01', 'M', 31, 9, 'ZZ4 5HG', 'ZZ4 5HG', 'yusuf.testlearner65@example.com'),
    ('TESTL0066', 'ORG-T001', 9100000662, 'Idris', 'Testlearner66', '2006-05-30', 'M', 31, 2, 'ZZ4 6HH', 'ZZ4 6HH', 'idris.testlearner66@example.com'),
    ('TESTL0067', 'ORG-T002', 9100000670, 'Finn', 'Testlearner67', '2007-07-30', 'M', 44, 2, 'ZZ4 7HJ', 'ZZ4 7HJ', 'finn.testlearner67@example.com'),
    ('TESTL0068', 'ORG-T002', 9100000689, 'Vera', 'Testlearner68', '2005-08-20', 'F', 47, 1, 'ZZ4 8HL', 'ZZ4 8HL', 'vera.testlearner68@example.com'),
    ('TESTL0069', 'ORG-T001', 9100000697, 'Harun', 'Testlearner69', '1976-05-03', 'M', 31, 2, 'ZZ4 9HN', 'ZZ4 9HN', 'harun.testlearner69@example.com'),
    ('TESTL0070', 'ORG-T001', 9100000700, 'Vik', 'Testlearner70', '2006-07-07', 'M', 31, 2, 'ZZ4 0JP', 'ZZ4 0JP', 'vik.testlearner70@example.com'),
    ('TESTL0071', 'ORG-T001', 9100000719, 'Freya', 'Testlearner71', '2009-11-27', 'F', 32, 2, 'ZZ4 1JQ', 'ZZ4 1JQ', 'freya.testlearner71@example.com'),
    ('TESTL0072', 'ORG-T001', 9100000727, 'Bea', 'Testlearner72', '2006-11-17', 'F', 34, 2, 'ZZ4 2JR', 'ZZ4 2JR', 'bea.testlearner72@example.com'),
    ('TESTL0073', 'ORG-T001', 9100000735, 'Sana', 'Testlearner73', '1993-12-12', 'F', 42, 2, 'ZZ4 3JS', 'ZZ5 9QE', 'sana.testlearner73@example.com'),
    ('TESTL0074', 'ORG-T001', 9100000743, 'Quinn', 'Testlearner74', '2008-07-10', 'F', 34, 2, 'ZZ4 4JT', 'ZZ4 4JT', 'quinn.testlearner74@example.com'),
    ('TESTL0075', 'ORG-T001', 9100000751, 'Rhys', 'Testlearner75', '2003-10-29', 'M', 31, 2, 'ZZ4 5JU', 'ZZ5 5GG', 'rhys.testlearner75@example.com'),
    ('TESTL0076', 'ORG-T001', 9100005761, 'Mei', 'Testlearner76', '2002-08-17', 'F', 31, 2, 'ZZ4 6JW', 'ZZ4 6JW', 'mei.testlearner76@example.com'),
    ('TESTL0077', 'ORG-T001', 9100000778, 'Chloe', 'Testlearner77', '2003-05-24', 'F', 31, 2, 'ZZ4 7JX', 'ZZ4 7JX', 'chloe.testlearner77@example.com'),
    ('TESTL0078', 'ORG-T001', 9100000786, 'Reuben', 'Testlearner78', '2009-11-12', 'M', 31, 2, 'ZZ4 8JY', 'ZZ4 8JY', 'reuben.testlearner78@example.com'),
    ('TESTL0079', 'ORG-T001', 9100000794, 'Piotr', 'Testlearner79', '2006-12-16', 'M', 31, 2, 'ZZ4 9JZ', 'ZZ5 7SN', 'piotr.testlearner79@example.com'),
    ('TESTL0080', 'ORG-T001', 9100000808, 'Keira', 'Testlearner80', '2005-08-29', 'F', 31, 2, 'ZZ4 0LA', 'ZZ4 0LA', 'keira.testlearner80@example.com'),
    ('TESTL0081', 'ORG-T001', 9100000816, 'Grace', 'Testlearner81', '1981-06-25', 'F', 31, 2, 'ZZ4 1LB', 'ZZ4 1LB', 'grace.testlearner81@example.com'),
    ('TESTL0082', 'ORG-T001', 9100000824, 'Gabe', 'Testlearner82', '1973-09-14', 'M', 45, 2, 'ZZ4 2LD', 'ZZ5 6TD', 'gabe.testlearner82@example.com'),
    ('TESTL0083', 'ORG-T001', 9100000832, 'Bea', 'Testlearner83', '2008-03-07', 'F', 31, 2, 'ZZ4 3LE', 'ZZ5 9BS', 'bea.testlearner83@example.com'),
    ('TESTL0084', 'ORG-T001', 9100000840, 'Ethan', 'Testlearner84', '2006-10-21', 'M', 31, 2, 'ZZ4 4LF', 'ZZ4 4LF', 'ethan.testlearner84@example.com'),
    ('TESTL0085', 'ORG-T001', 9100000859, 'Hana', 'Testlearner85', '2001-02-03', 'F', 35, 9, 'ZZ4 5LG', 'ZZ4 5LG', 'hana.testlearner85@example.com'),
    ('TESTL0086', 'ORG-T002', 9100000867, 'Kian', 'Testlearner86', '2006-09-01', 'M', 31, 2, 'ZZ4 6LH', 'ZZ4 6LH', 'kian.testlearner86@example.com'),
    ('TESTL0087', 'ORG-T002', 9100000875, 'Milo', 'Testlearner87', '2007-11-11', 'M', 31, 2, 'ZZ4 7LJ', 'ZZ4 7LJ', 'milo.testlearner87@example.com'),
    ('TESTL0088', 'ORG-T001', 9100000883, 'Reuben', 'Testlearner88', '1979-07-02', 'M', 99, 2, 'ZZ4 8LL', 'ZZ4 8LL', 'reuben.testlearner88@example.com'),
    ('TESTL0089', 'ORG-T001', 9100000891, 'Quinn', 'Testlearner89', '2005-12-09', 'F', 38, 1, 'ZZ4 9LN', 'ZZ4 9LN', 'quinn.testlearner89@example.com'),
    ('TESTL0090', 'ORG-T001', 9100000905, 'Omar', 'Testlearner90', '1984-01-12', 'M', 31, 2, 'ZZ4 0NP', 'ZZ4 0NP', 'omar.testlearner90@example.com'),
    ('TESTL0091', 'ORG-T001', 9100000913, 'Grace', 'Testlearner91', '2008-07-06', 'F', 31, 2, 'ZZ4 1NQ', 'ZZ5 3XB', 'grace.testlearner91@example.com'),
    ('TESTL0092', 'ORG-T002', 9100000921, 'Zak', 'Testlearner92', '2008-12-07', 'M', 39, 1, 'ZZ4 2NR', 'ZZ4 2NR', 'zak.testlearner92@example.com'),
    ('TESTL0093', 'ORG-T001', 9100005931, 'Grace', 'Testlearner93', '1997-06-07', 'F', 31, 2, 'ZZ4 3NS', 'ZZ4 3NS', 'grace.testlearner93@example.com'),
    ('TESTL0094', 'ORG-T001', 9100000948, 'Will', 'Testlearner94', '2004-03-01', 'M', 31, 2, 'ZZ4 4NT', 'ZZ4 4NT', 'will.testlearner94@example.com'),
    ('TESTL0095', 'ORG-T001', 9100000956, 'Noah', 'Testlearner95', '2008-04-08', 'M', 31, 2, 'ZZ4 5NU', 'ZZ4 5NU', 'noah.testlearner95@example.com'),
    ('TESTL0096', 'ORG-T001', 9100000964, 'Yasmin', 'Testlearner96', '2005-02-19', 'F', 31, 2, 'ZZ4 6NW', 'ZZ4 6NW', 'yasmin.testlearner96@example.com'),
    ('TESTL0097', 'ORG-T001', 9100000972, 'Yusuf', 'Testlearner97', '1982-04-15', 'M', 43, 2, 'ZZ4 7NX', 'ZZ4 7NX', 'yusuf.testlearner97@example.com'),
    ('TESTL0098', 'ORG-T001', 9100000980, 'Mei', 'Testlearner98', '1988-10-27', 'F', 39, 2, 'ZZ4 8NY', 'ZZ4 8NY', 'mei.testlearner98@example.com'),
    ('TESTL0099', 'ORG-T001', 9100000999, 'Lewis', 'Testlearner99', '2005-10-12', 'M', 31, 1, 'ZZ4 9NZ', 'ZZ4 9NZ', 'lewis.testlearner99@example.com'),
    ('TESTL0100', 'ORG-T001', 9100001006, 'Olivia', 'Testlearner100', '1977-01-09', 'F', 31, 2, 'ZZ4 0PA', 'ZZ5 0AA', 'olivia.testlearner100@example.com'),
    ('TESTL0101', 'ORG-T001', 9100001014, 'Aisha', 'Testlearner101', '1976-09-27', 'F', 31, 2, 'ZZ4 1PB', 'ZZ4 1PB', 'aisha.testlearner101@example.com'),
    ('TESTL0102', 'ORG-T001', 9100001022, 'Quinn', 'Testlearner102', '1992-08-31', 'F', 31, 2, 'ZZ4 2PD', 'ZZ4 2PD', 'quinn.testlearner102@example.com'),
    ('TESTL0103', 'ORG-T001', 9100001030, 'Ffion', 'Testlearner103', '2008-07-28', 'F', 31, 2, 'ZZ4 3PE', 'ZZ5 9BS', 'ffion.testlearner103@example.com'),
    ('TESTL0104', 'ORG-T001', 9100001049, 'Rhys', 'Testlearner104', '1995-08-30', 'M', 44, 2, 'ZZ4 4PF', 'ZZ4 4PF', 'rhys.testlearner104@example.com'),
    ('TESTL0105', 'ORG-T001', 9100001057, 'Declan', 'Testlearner105', '2008-04-06', 'M', 99, 9, 'ZZ4 5PG', 'ZZ4 5PG', 'declan.testlearner105@example.com'),
    ('TESTL0106', 'ORG-T001', 9100001065, 'Yusuf', 'Testlearner106', '2007-03-08', 'M', 31, 2, 'ZZ4 6PH', 'ZZ4 6PH', 'yusuf.testlearner106@example.com'),
    ('TESTL0107', 'ORG-T001', 9100001073, 'Rosa', 'Testlearner107', '2000-10-15', 'F', 31, 2, 'ZZ4 7PJ', 'ZZ4 7PJ', 'rosa.testlearner107@example.com'),
    ('TESTL0108', 'ORG-T001', 9100001081, 'Uma', 'Testlearner108', '2006-12-09', 'F', 32, 2, 'ZZ4 8PL', 'ZZ4 8PL', 'uma.testlearner108@example.com'),
    ('TESTL0109', 'ORG-T001', 9100006091, 'Callum', 'Testlearner109', '2008-04-06', 'M', 32, 2, 'ZZ4 9PN', 'ZZ4 9PN', 'callum.testlearner109@example.com'),
    ('TESTL0110', 'ORG-T002', 9100001103, 'Reuben', 'Testlearner110', '2001-01-01', 'M', 31, 2, 'ZZ4 0QP', 'ZZ4 0QP', 'reuben.testlearner110@example.com'),
    ('TESTL0111', 'ORG-T001', 9100001111, 'Declan', 'Testlearner111', '1992-11-01', 'M', 31, 1, 'ZZ4 1QQ', 'ZZ4 1QQ', 'declan.testlearner111@example.com'),
    ('TESTL0112', 'ORG-T001', 9100006121, 'Milo', 'Testlearner112', '1998-08-15', 'M', 31, 2, 'ZZ4 2QR', 'ZZ4 2QR', 'milo.testlearner112@example.com'),
    ('TESTL0113', 'ORG-T001', 9100001138, 'Noah', 'Testlearner113', '1973-11-14', 'M', 31, 2, 'ZZ4 3QS', 'ZZ4 3QS', 'noah.testlearner113@example.com'),
    ('TESTL0114', 'ORG-T001', 9100001146, 'Omar', 'Testlearner114', '1973-12-17', 'M', 31, 2, 'ZZ4 4QT', 'ZZ4 4QT', 'omar.testlearner114@example.com'),
    ('TESTL0115', 'ORG-T001', 9100001154, 'Declan', 'Testlearner115', '2006-06-22', 'M', 99, 2, 'ZZ4 5QU', 'ZZ5 5GG', 'declan.testlearner115@example.com'),
    ('TESTL0116', 'ORG-T002', 9100001162, 'Freya', 'Testlearner116', '2007-10-17', 'F', 31, 2, 'ZZ4 6QW', 'ZZ5 8RW', 'freya.testlearner116@example.com')) AS v (LEARNREFNUMBER, ORGANISATIONID, ULN, GIVENNAMES, FAMILYNAME, DOB, SEX, ETHNICITY,
                          LLDDHEALTHPROB, POSTCODE, POSTCODEPRIOR, EMAIL)) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER
WHEN NOT MATCHED THEN INSERT (LEARNREFNUMBER, ULN, GIVENNAMES, FAMILYNAME, DATEOFBIRTH, SEX, ETHNICITY, LLDDHEALTHPROB,
                              POSTCODE, POSTCODEPRIOR, EMAIL, ORGANISATIONID, ISTESTDATA)
  VALUES (s.LEARNREFNUMBER, s.ULN, s.GIVENNAMES, s.FAMILYNAME, s.DATEOFBIRTH, s.SEX, s.ETHNICITY, s.LLDDHEALTHPROB,
          s.POSTCODE, s.POSTCODEPRIOR, s.EMAIL, s.ORGANISATIONID, TRUE);


-- ---------------------------------------------------------------------------
-- 4. Their programme aims, in the same pattern as the existing learners
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.LEARNING_DELIVERY t
USING (SELECT LEARNREFNUMBER, STARTDATE::DATE AS LEARNSTARTDATE, PLANENDDATE::DATE AS LEARNPLANENDDATE, STDCODE,
              COMPSTATUS, ACTENDDATE::DATE AS LEARNACTENDDATE, OUTCOME, ACHIEVED::DATE AS ACHDATE, WITHDRAWREASON
       FROM (VALUES
    ('TESTL0017', '2024-03-18', '2025-04-14', 122, 3, '2024-11-12', 3, NULL, 44),
    ('TESTL0018', '2023-09-04', '2025-03-01', 119, 2, '2025-02-22', 1, '2025-04-23', NULL),
    ('TESTL0019', '2025-12-29', '2027-05-29', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0020', '2024-09-23', '2026-03-19', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0021', '2025-06-16', '2026-11-16', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0022', '2024-10-21', '2025-12-18', 122, 2, '2025-11-23', 1, '2025-12-27', NULL),
    ('TESTL0023', '2024-02-19', '2025-04-14', 122, 2, '2025-04-04', 1, '2025-04-25', NULL),
    ('TESTL0024', '2025-03-03', '2026-05-30', 119, 2, '2026-05-10', 1, '2026-06-23', NULL),
    ('TESTL0025', '2025-03-03', '2026-03-30', 111, 2, '2026-03-21', 1, '2026-05-03', NULL),
    ('TESTL0026', '2025-08-18', '2027-02-18', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0027', '2024-04-29', '2025-05-29', 111, 2, '2025-05-03', 1, '2025-06-24', NULL),
    ('TESTL0028', '2025-12-29', '2027-03-29', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0029', '2026-08-31', '2027-12-01', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0030', '2024-02-05', '2025-05-03', 111, 2, '2025-04-26', 1, '2025-06-16', NULL),
    ('TESTL0031', '2023-10-02', '2024-12-02', 111, 2, '2024-11-30', 1, '2025-01-02', NULL),
    ('TESTL0032', '2024-07-22', '2026-01-16', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0033', '2025-03-10', '2026-05-10', 122, 2, '2026-05-08', 3, NULL, NULL),
    ('TESTL0034', '2024-08-12', '2025-11-08', 122, 2, '2025-10-22', 1, '2025-11-18', NULL),
    ('TESTL0035', '2026-08-24', '2027-11-24', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0036', '2026-04-06', '2027-05-06', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0037', '2026-01-12', '2027-02-12', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0038', '2023-12-04', '2025-02-28', 119, 2, '2025-01-31', 1, '2025-02-22', NULL),
    ('TESTL0039', '2024-04-29', '2025-05-24', 122, 2, '2025-05-14', 1, '2025-07-02', NULL),
    ('TESTL0040', '2026-05-11', '2027-08-11', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0041', '2026-01-12', '2027-02-12', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0042', '2024-01-22', '2025-05-22', 119, 3, '2024-07-30', 3, NULL, 98),
    ('TESTL0043', '2023-07-31', '2025-01-26', 119, 2, '2025-01-22', 1, '2025-03-01', NULL),
    ('TESTL0044', '2026-01-19', '2027-02-19', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0045', '2024-03-04', '2025-06-04', 122, 2, '2025-06-27', 1, '2025-08-02', NULL),
    ('TESTL0046', '2023-09-11', '2024-10-09', 111, 2, '2024-10-04', 1, '2024-11-23', NULL),
    ('TESTL0047', '2026-03-30', '2027-05-30', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0048', '2024-09-23', '2025-12-22', 122, 3, '2025-06-17', 3, NULL, 97),
    ('TESTL0049', '2023-10-16', '2024-11-13', 122, 2, '2024-10-19', 1, '2024-11-17', NULL),
    ('TESTL0050', '2025-01-06', '2026-04-01', 111, 2, '2026-03-25', 3, NULL, NULL),
    ('TESTL0051', '2025-01-20', '2026-02-16', 122, 6, '2025-06-22', NULL, NULL, NULL),
    ('TESTL0052', '2026-01-12', '2027-04-12', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0053', '2023-10-30', '2024-12-25', 122, 2, '2024-11-28', 3, NULL, NULL),
    ('TESTL0054', '2025-02-17', '2026-03-13', 122, 2, '2026-02-28', 1, '2026-04-08', NULL),
    ('TESTL0055', '2025-11-17', '2027-03-17', 111, 6, '2026-09-07', NULL, NULL, NULL),
    ('TESTL0056', '2025-03-10', '2026-04-10', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0057', '2025-12-22', '2027-03-22', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0058', '2025-04-28', '2026-05-23', 111, 2, '2026-05-10', 3, NULL, NULL),
    ('TESTL0059', '2025-10-20', '2026-11-20', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0060', '2024-01-15', '2025-07-12', 119, 2, '2025-07-26', 1, '2025-08-25', NULL),
    ('TESTL0061', '2025-11-17', '2027-01-17', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0062', '2023-07-03', '2025-01-01', 119, 2, '2024-12-14', 1, '2025-02-01', NULL),
    ('TESTL0063', '2024-11-25', '2025-12-20', 111, 3, '2025-10-18', 3, NULL, 97),
    ('TESTL0064', '2025-07-28', '2026-12-28', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0065', '2025-04-21', '2026-05-17', 111, 6, '2026-03-08', NULL, NULL, NULL),
    ('TESTL0066', '2024-07-29', '2025-10-28', 119, 2, '2025-10-19', 1, '2025-12-03', NULL),
    ('TESTL0067', '2024-09-23', '2025-12-20', 111, 2, '2025-11-25', 1, '2025-12-18', NULL),
    ('TESTL0068', '2026-01-12', '2027-04-12', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0069', '2025-12-22', '2027-03-22', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0070', '2024-01-22', '2025-02-16', 111, 3, '2024-09-28', 3, NULL, 44),
    ('TESTL0071', '2026-04-13', '2027-06-13', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0072', '2024-05-13', '2025-09-13', 119, 2, '2025-09-02', 1, '2025-09-25', NULL),
    ('TESTL0073', '2025-06-23', '2026-11-23', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0074', '2026-05-25', '2027-08-25', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0075', '2025-12-22', '2027-03-22', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0076', '2024-02-26', '2025-05-26', 119, 2, '2025-05-26', 1, '2025-07-04', NULL),
    ('TESTL0077', '2024-07-08', '2025-11-08', 119, 2, '2025-11-05', 1, '2025-12-14', NULL),
    ('TESTL0078', '2026-04-20', '2027-09-20', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0079', '2023-12-25', '2025-01-24', 111, 2, '2024-12-27', 3, NULL, NULL),
    ('TESTL0080', '2025-04-21', '2026-05-17', 111, 2, '2026-05-03', 1, '2026-05-29', NULL),
    ('TESTL0081', '2023-12-04', '2025-03-01', 119, 3, '2025-01-08', 3, NULL, 97),
    ('TESTL0082', '2023-12-04', '2025-01-04', 122, 2, '2024-12-20', 3, NULL, NULL),
    ('TESTL0083', '2024-04-01', '2025-06-01', 111, 3, '2024-09-16', 3, NULL, 98),
    ('TESTL0084', '2025-02-24', '2026-04-22', 122, 3, '2025-11-15', 3, NULL, 98),
    ('TESTL0085', '2024-12-02', '2025-12-31', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0086', '2023-10-09', '2025-01-09', 111, 2, '2024-12-29', 1, '2025-01-29', NULL),
    ('TESTL0087', '2024-01-15', '2025-05-13', 119, 3, '2024-05-30', 3, NULL, 44),
    ('TESTL0088', '2025-08-25', '2027-01-25', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0089', '2024-10-07', '2025-11-01', 122, 2, '2025-10-31', 1, '2025-12-14', NULL),
    ('TESTL0090', '2026-05-11', '2027-06-11', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0091', '2024-09-16', '2025-12-15', 122, 3, '2025-06-20', 3, NULL, 29),
    ('TESTL0092', '2025-06-16', '2026-11-16', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0093', '2024-11-18', '2026-05-13', 119, 3, '2026-01-27', 3, NULL, 98),
    ('TESTL0094', '2025-06-30', '2026-11-30', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0095', '2026-04-27', '2027-05-27', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0096', '2026-04-20', '2027-07-20', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0097', '2025-01-06', '2026-03-01', 122, 2, '2026-02-13', 1, '2026-03-08', NULL),
    ('TESTL0098', '2025-01-20', '2026-06-14', 119, 2, '2026-06-03', 1, '2026-07-18', NULL),
    ('TESTL0099', '2024-03-18', '2025-04-16', 122, 2, '2025-04-15', 1, '2025-05-09', NULL),
    ('TESTL0100', '2024-11-04', '2026-01-29', 119, 2, '2026-01-12', 3, NULL, NULL),
    ('TESTL0101', '2026-03-16', '2027-06-16', 119, 1, NULL, NULL, NULL, NULL),
    ('TESTL0102', '2023-07-17', '2024-10-17', 122, 2, '2024-10-05', 1, '2024-11-05', NULL),
    ('TESTL0103', '2025-06-23', '2026-10-23', 122, 6, '2026-03-16', NULL, NULL, NULL),
    ('TESTL0104', '2025-10-06', '2027-01-06', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0105', '2026-08-24', '2027-10-24', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0106', '2024-08-26', '2025-10-20', 111, 3, '2025-03-19', 3, NULL, 97),
    ('TESTL0107', '2023-11-06', '2025-02-02', 119, 2, '2025-01-16', 1, '2025-02-15', NULL),
    ('TESTL0108', '2026-03-02', '2027-05-02', 111, 1, NULL, NULL, NULL, NULL),
    ('TESTL0109', '2026-07-27', '2027-08-27', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0110', '2024-07-08', '2025-10-02', 119, 2, '2025-09-07', 1, '2025-10-19', NULL),
    ('TESTL0111', '2024-08-12', '2025-09-08', 111, 2, '2025-09-08', 1, '2025-09-30', NULL),
    ('TESTL0112', '2024-09-02', '2025-09-30', 111, 2, '2025-09-05', 1, '2025-10-08', NULL),
    ('TESTL0113', '2025-03-03', '2026-05-28', 111, 2, '2026-04-30', 1, '2026-06-11', NULL),
    ('TESTL0114', '2026-08-17', '2027-10-17', 122, 1, NULL, NULL, NULL, NULL),
    ('TESTL0115', '2024-01-08', '2025-03-31', 122, 3, '2024-01-26', 3, NULL, 98),
    ('TESTL0116', '2024-07-22', '2025-11-17', 119, 1, NULL, NULL, NULL, NULL)) AS v (LEARNREFNUMBER, STARTDATE, PLANENDDATE, STDCODE, COMPSTATUS, ACTENDDATE, OUTCOME, ACHIEVED,
                          WITHDRAWREASON)) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER AND t.LEARNAIMREF = 'ZPROG001' AND t.AIMSEQNUMBER = 1
WHEN NOT MATCHED THEN INSERT (LEARNREFNUMBER, LEARNAIMREF, AIMTYPE, AIMSEQNUMBER, LEARNSTARTDATE, LEARNPLANENDDATE,
                              FUNDMODEL, PROGTYPE, STDCODE, DELLOCPOSTCODE, COMPSTATUS, LEARNACTENDDATE, OUTCOME, ACHDATE,
                              WITHDRAWREASON, ISTESTDATA)
  VALUES (s.LEARNREFNUMBER, 'ZPROG001', 1, 1, s.LEARNSTARTDATE, s.LEARNPLANENDDATE,
          36, 25, s.STDCODE, 'ZZ3 3DA', s.COMPSTATUS, s.LEARNACTENDDATE, s.OUTCOME, s.ACHDATE,
          s.WITHDRAWREASON, TRUE);


-- ---------------------------------------------------------------------------
-- 5. Which learners work for which employer, from their start date. A
--    withdrawn learner's link ends on the day they withdrew.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.LEARNER_EMPLOYER t
USING (SELECT LEARNREFNUMBER, EMPLOYERID, FROMDATE::DATE AS FROMDATE, TODATE::DATE AS TODATE
       FROM (VALUES
    ('TESTL0017', 'EMP-T001', '2024-03-18', '2024-11-12'),
    ('TESTL0018', 'EMP-T002', '2023-09-04', NULL),
    ('TESTL0019', 'EMP-T002', '2025-12-29', NULL),
    ('TESTL0020', 'EMP-T002', '2024-09-23', NULL),
    ('TESTL0021', 'EMP-T002', '2025-06-16', NULL),
    ('TESTL0023', 'EMP-T005', '2024-02-19', NULL),
    ('TESTL0024', 'EMP-T002', '2025-03-03', NULL),
    ('TESTL0025', 'EMP-T003', '2025-03-03', NULL),
    ('TESTL0027', 'EMP-T003', '2024-04-29', NULL),
    ('TESTL0028', 'EMP-T001', '2025-12-29', NULL),
    ('TESTL0029', 'EMP-T002', '2026-08-31', NULL),
    ('TESTL0030', 'EMP-T005', '2024-02-05', NULL),
    ('TESTL0031', 'EMP-T003', '2023-10-02', NULL),
    ('TESTL0032', 'EMP-T002', '2024-07-22', NULL),
    ('TESTL0033', 'EMP-T001', '2025-03-10', NULL),
    ('TESTL0034', 'EMP-T004', '2024-08-12', NULL),
    ('TESTL0035', 'EMP-T002', '2026-08-24', NULL),
    ('TESTL0036', 'EMP-T005', '2026-04-06', NULL),
    ('TESTL0037', 'EMP-T001', '2026-01-12', NULL),
    ('TESTL0038', 'EMP-T006', '2023-12-04', NULL),
    ('TESTL0039', 'EMP-T005', '2024-04-29', NULL),
    ('TESTL0040', 'EMP-T004', '2026-05-11', NULL),
    ('TESTL0041', 'EMP-T003', '2026-01-12', NULL),
    ('TESTL0042', 'EMP-T002', '2024-01-22', '2024-07-30'),
    ('TESTL0043', 'EMP-T002', '2023-07-31', NULL),
    ('TESTL0044', 'EMP-T001', '2026-01-19', NULL),
    ('TESTL0045', 'EMP-T005', '2024-03-04', NULL),
    ('TESTL0046', 'EMP-T003', '2023-09-11', NULL),
    ('TESTL0047', 'EMP-T004', '2026-03-30', NULL),
    ('TESTL0048', 'EMP-T004', '2024-09-23', '2025-06-17'),
    ('TESTL0049', 'EMP-T001', '2023-10-16', NULL),
    ('TESTL0050', 'EMP-T004', '2025-01-06', NULL),
    ('TESTL0051', 'EMP-T005', '2025-01-20', NULL),
    ('TESTL0052', 'EMP-T001', '2026-01-12', NULL),
    ('TESTL0053', 'EMP-T004', '2023-10-30', NULL),
    ('TESTL0054', 'EMP-T005', '2025-02-17', NULL),
    ('TESTL0055', 'EMP-T003', '2025-11-17', NULL),
    ('TESTL0056', 'EMP-T003', '2025-03-10', NULL),
    ('TESTL0059', 'EMP-T001', '2025-10-20', NULL),
    ('TESTL0060', 'EMP-T002', '2024-01-15', NULL),
    ('TESTL0062', 'EMP-T002', '2023-07-03', NULL),
    ('TESTL0063', 'EMP-T003', '2024-11-25', '2025-10-18'),
    ('TESTL0065', 'EMP-T005', '2025-04-21', NULL),
    ('TESTL0066', 'EMP-T002', '2024-07-29', NULL),
    ('TESTL0067', 'EMP-T004', '2024-09-23', NULL),
    ('TESTL0068', 'EMP-T006', '2026-01-12', NULL),
    ('TESTL0069', 'EMP-T002', '2025-12-22', NULL),
    ('TESTL0071', 'EMP-T001', '2026-04-13', NULL),
    ('TESTL0072', 'EMP-T002', '2024-05-13', NULL),
    ('TESTL0073', 'EMP-T003', '2025-06-23', NULL),
    ('TESTL0074', 'EMP-T002', '2026-05-25', NULL),
    ('TESTL0075', 'EMP-T005', '2025-12-22', NULL),
    ('TESTL0076', 'EMP-T002', '2024-02-26', NULL),
    ('TESTL0078', 'EMP-T002', '2026-04-20', NULL),
    ('TESTL0079', 'EMP-T003', '2023-12-25', NULL),
    ('TESTL0080', 'EMP-T005', '2025-04-21', NULL),
    ('TESTL0081', 'EMP-T002', '2023-12-04', '2025-01-08'),
    ('TESTL0082', 'EMP-T001', '2023-12-04', NULL),
    ('TESTL0083', 'EMP-T003', '2024-04-01', '2024-09-16'),
    ('TESTL0085', 'EMP-T001', '2024-12-02', NULL),
    ('TESTL0086', 'EMP-T004', '2023-10-09', NULL),
    ('TESTL0089', 'EMP-T005', '2024-10-07', NULL),
    ('TESTL0090', 'EMP-T003', '2026-05-11', NULL),
    ('TESTL0091', 'EMP-T001', '2024-09-16', '2025-06-20'),
    ('TESTL0092', 'EMP-T004', '2025-06-16', NULL),
    ('TESTL0093', 'EMP-T002', '2024-11-18', '2026-01-27'),
    ('TESTL0094', 'EMP-T005', '2025-06-30', NULL),
    ('TESTL0095', 'EMP-T003', '2026-04-27', NULL),
    ('TESTL0096', 'EMP-T002', '2026-04-20', NULL),
    ('TESTL0097', 'EMP-T001', '2025-01-06', NULL),
    ('TESTL0098', 'EMP-T002', '2025-01-20', NULL),
    ('TESTL0100', 'EMP-T002', '2024-11-04', NULL),
    ('TESTL0101', 'EMP-T002', '2026-03-16', NULL),
    ('TESTL0102', 'EMP-T005', '2023-07-17', NULL),
    ('TESTL0103', 'EMP-T001', '2025-06-23', NULL),
    ('TESTL0104', 'EMP-T003', '2025-10-06', NULL),
    ('TESTL0105', 'EMP-T005', '2026-08-24', NULL),
    ('TESTL0106', 'EMP-T003', '2024-08-26', '2025-03-19'),
    ('TESTL0108', 'EMP-T005', '2026-03-02', NULL),
    ('TESTL0109', 'EMP-T001', '2026-07-27', NULL),
    ('TESTL0110', 'EMP-T006', '2024-07-08', NULL),
    ('TESTL0111', 'EMP-T003', '2024-08-12', NULL),
    ('TESTL0112', 'EMP-T005', '2024-09-02', NULL),
    ('TESTL0113', 'EMP-T003', '2025-03-03', NULL),
    ('TESTL0115', 'EMP-T001', '2024-01-08', '2024-01-26'),
    ('TESTL0116', 'EMP-T006', '2024-07-22', NULL)) AS v (LEARNREFNUMBER, EMPLOYERID, FROMDATE, TODATE)) s
  ON t.LEARNREFNUMBER = s.LEARNREFNUMBER AND t.EMPLOYERID = s.EMPLOYERID
WHEN NOT MATCHED THEN INSERT (LEARNREFNUMBER, EMPLOYERID, FROMDATE, TODATE, ISTESTDATA)
  VALUES (s.LEARNREFNUMBER, s.EMPLOYERID, s.FROMDATE, s.TODATE, TRUE);


-- ---------------------------------------------------------------------------
-- 6. Caseloads: one current tutor and one current assessor each. Matched on
--    the fixed ASSIGNMENTID, so an assignment ended in the app later isn't
--    added again by a second run.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ILR.OFFICER_ASSIGNMENT t
USING (SELECT * FROM (VALUES
    ('TESTL0017', 'OFF0014', 'TUTOR'),
    ('TESTL0017', 'OFF0019', 'ASSESSOR'),
    ('TESTL0018', 'OFF0015', 'TUTOR'),
    ('TESTL0018', 'OFF0020', 'ASSESSOR'),
    ('TESTL0019', 'OFF0016', 'TUTOR'),
    ('TESTL0019', 'OFF0021', 'ASSESSOR'),
    ('TESTL0020', 'OFF0014', 'TUTOR'),
    ('TESTL0020', 'OFF0019', 'ASSESSOR'),
    ('TESTL0021', 'OFF0017', 'TUTOR'),
    ('TESTL0021', 'OFF0022', 'ASSESSOR'),
    ('TESTL0022', 'OFF0018', 'TUTOR'),
    ('TESTL0022', 'OFF0023', 'ASSESSOR'),
    ('TESTL0023', 'OFF0015', 'TUTOR'),
    ('TESTL0023', 'OFF0020', 'ASSESSOR'),
    ('TESTL0024', 'OFF0016', 'TUTOR'),
    ('TESTL0024', 'OFF0021', 'ASSESSOR'),
    ('TESTL0025', 'OFF0014', 'TUTOR'),
    ('TESTL0025', 'OFF0019', 'ASSESSOR'),
    ('TESTL0026', 'OFF0017', 'TUTOR'),
    ('TESTL0026', 'OFF0022', 'ASSESSOR'),
    ('TESTL0027', 'OFF0014', 'TUTOR'),
    ('TESTL0027', 'OFF0019', 'ASSESSOR'),
    ('TESTL0028', 'OFF0002', 'TUTOR'),
    ('TESTL0028', 'OFF0003', 'ASSESSOR'),
    ('TESTL0029', 'OFF0004', 'TUTOR'),
    ('TESTL0029', 'OFF0006', 'ASSESSOR'),
    ('TESTL0030', 'OFF0018', 'TUTOR'),
    ('TESTL0030', 'OFF0023', 'ASSESSOR'),
    ('TESTL0031', 'OFF0014', 'TUTOR'),
    ('TESTL0031', 'OFF0019', 'ASSESSOR'),
    ('TESTL0032', 'OFF0015', 'TUTOR'),
    ('TESTL0032', 'OFF0020', 'ASSESSOR'),
    ('TESTL0033', 'OFF0016', 'TUTOR'),
    ('TESTL0033', 'OFF0021', 'ASSESSOR'),
    ('TESTL0034', 'OFF0024', 'TUTOR'),
    ('TESTL0034', 'OFF0025', 'ASSESSOR'),
    ('TESTL0035', 'OFF0002', 'TUTOR'),
    ('TESTL0035', 'OFF0001', 'ASSESSOR'),
    ('TESTL0036', 'OFF0004', 'TUTOR'),
    ('TESTL0036', 'OFF0003', 'ASSESSOR'),
    ('TESTL0037', 'OFF0017', 'TUTOR'),
    ('TESTL0037', 'OFF0022', 'ASSESSOR'),
    ('TESTL0038', 'OFF0024', 'TUTOR'),
    ('TESTL0038', 'OFF0025', 'ASSESSOR'),
    ('TESTL0039', 'OFF0005', 'TUTOR'),
    ('TESTL0039', 'OFF0006', 'ASSESSOR'),
    ('TESTL0040', 'OFF0024', 'TUTOR'),
    ('TESTL0040', 'OFF0025', 'ASSESSOR'),
    ('TESTL0041', 'OFF0018', 'TUTOR'),
    ('TESTL0041', 'OFF0023', 'ASSESSOR'),
    ('TESTL0042', 'OFF0015', 'TUTOR'),
    ('TESTL0042', 'OFF0020', 'ASSESSOR'),
    ('TESTL0043', 'OFF0014', 'TUTOR'),
    ('TESTL0043', 'OFF0019', 'ASSESSOR'),
    ('TESTL0044', 'OFF0016', 'TUTOR'),
    ('TESTL0044', 'OFF0021', 'ASSESSOR'),
    ('TESTL0045', 'OFF0017', 'TUTOR'),
    ('TESTL0045', 'OFF0022', 'ASSESSOR'),
    ('TESTL0046', 'OFF0018', 'TUTOR'),
    ('TESTL0046', 'OFF0023', 'ASSESSOR'),
    ('TESTL0047', 'OFF0012', 'TUTOR'),
    ('TESTL0047', 'OFF0013', 'ASSESSOR'),
    ('TESTL0048', 'OFF0024', 'TUTOR'),
    ('TESTL0048', 'OFF0025', 'ASSESSOR'),
    ('TESTL0049', 'OFF0015', 'TUTOR'),
    ('TESTL0049', 'OFF0020', 'ASSESSOR'),
    ('TESTL0050', 'OFF0012', 'TUTOR'),
    ('TESTL0050', 'OFF0013', 'ASSESSOR'),
    ('TESTL0051', 'OFF0002', 'TUTOR'),
    ('TESTL0051', 'OFF0001', 'ASSESSOR'),
    ('TESTL0052', 'OFF0004', 'TUTOR'),
    ('TESTL0052', 'OFF0003', 'ASSESSOR'),
    ('TESTL0053', 'OFF0024', 'TUTOR'),
    ('TESTL0053', 'OFF0025', 'ASSESSOR'),
    ('TESTL0054', 'OFF0005', 'TUTOR'),
    ('TESTL0054', 'OFF0006', 'ASSESSOR'),
    ('TESTL0055', 'OFF0016', 'TUTOR'),
    ('TESTL0055', 'OFF0021', 'ASSESSOR'),
    ('TESTL0056', 'OFF0014', 'TUTOR'),
    ('TESTL0056', 'OFF0019', 'ASSESSOR'),
    ('TESTL0057', 'OFF0002', 'TUTOR'),
    ('TESTL0057', 'OFF0001', 'ASSESSOR'),
    ('TESTL0058', 'OFF0017', 'TUTOR'),
    ('TESTL0058', 'OFF0022', 'ASSESSOR'),
    ('TESTL0059', 'OFF0018', 'TUTOR'),
    ('TESTL0059', 'OFF0023', 'ASSESSOR'),
    ('TESTL0060', 'OFF0004', 'TUTOR'),
    ('TESTL0060', 'OFF0003', 'ASSESSOR'),
    ('TESTL0061', 'OFF0005', 'TUTOR'),
    ('TESTL0061', 'OFF0006', 'ASSESSOR'),
    ('TESTL0062', 'OFF0014', 'TUTOR'),
    ('TESTL0062', 'OFF0019', 'ASSESSOR'),
    ('TESTL0063', 'OFF0015', 'TUTOR'),
    ('TESTL0063', 'OFF0020', 'ASSESSOR'),
    ('TESTL0064', 'OFF0012', 'TUTOR'),
    ('TESTL0064', 'OFF0013', 'ASSESSOR'),
    ('TESTL0065', 'OFF0016', 'TUTOR'),
    ('TESTL0065', 'OFF0021', 'ASSESSOR'),
    ('TESTL0066', 'OFF0017', 'TUTOR'),
    ('TESTL0066', 'OFF0022', 'ASSESSOR'),
    ('TESTL0067', 'OFF0024', 'TUTOR'),
    ('TESTL0067', 'OFF0025', 'ASSESSOR'),
    ('TESTL0068', 'OFF0012', 'TUTOR'),
    ('TESTL0068', 'OFF0013', 'ASSESSOR'),
    ('TESTL0069', 'OFF0018', 'TUTOR'),
    ('TESTL0069', 'OFF0023', 'ASSESSOR'),
    ('TESTL0070', 'OFF0015', 'TUTOR'),
    ('TESTL0070', 'OFF0020', 'ASSESSOR'),
    ('TESTL0071', 'OFF0016', 'TUTOR'),
    ('TESTL0071', 'OFF0021', 'ASSESSOR'),
    ('TESTL0072', 'OFF0002', 'TUTOR'),
    ('TESTL0072', 'OFF0001', 'ASSESSOR'),
    ('TESTL0073', 'OFF0017', 'TUTOR'),
    ('TESTL0073', 'OFF0022', 'ASSESSOR'),
    ('TESTL0074', 'OFF0018', 'TUTOR'),
    ('TESTL0074', 'OFF0023', 'ASSESSOR'),
    ('TESTL0075', 'OFF0015', 'TUTOR'),
    ('TESTL0075', 'OFF0020', 'ASSESSOR'),
    ('TESTL0076', 'OFF0016', 'TUTOR'),
    ('TESTL0076', 'OFF0021', 'ASSESSOR'),
    ('TESTL0077', 'OFF0017', 'TUTOR'),
    ('TESTL0077', 'OFF0022', 'ASSESSOR'),
    ('TESTL0078', 'OFF0018', 'TUTOR'),
    ('TESTL0078', 'OFF0023', 'ASSESSOR'),
    ('TESTL0079', 'OFF0004', 'TUTOR'),
    ('TESTL0079', 'OFF0003', 'ASSESSOR'),
    ('TESTL0080', 'OFF0015', 'TUTOR'),
    ('TESTL0080', 'OFF0020', 'ASSESSOR'),
    ('TESTL0081', 'OFF0005', 'TUTOR'),
    ('TESTL0081', 'OFF0006', 'ASSESSOR'),
    ('TESTL0082', 'OFF0016', 'TUTOR'),
    ('TESTL0082', 'OFF0021', 'ASSESSOR'),
    ('TESTL0083', 'OFF0017', 'TUTOR'),
    ('TESTL0083', 'OFF0022', 'ASSESSOR'),
    ('TESTL0084', 'OFF0018', 'TUTOR'),
    ('TESTL0084', 'OFF0023', 'ASSESSOR'),
    ('TESTL0085', 'OFF0015', 'TUTOR'),
    ('TESTL0085', 'OFF0020', 'ASSESSOR'),
    ('TESTL0086', 'OFF0024', 'TUTOR'),
    ('TESTL0086', 'OFF0025', 'ASSESSOR'),
    ('TESTL0087', 'OFF0012', 'TUTOR'),
    ('TESTL0087', 'OFF0013', 'ASSESSOR'),
    ('TESTL0088', 'OFF0014', 'TUTOR'),
    ('TESTL0088', 'OFF0019', 'ASSESSOR'),
    ('TESTL0089', 'OFF0016', 'TUTOR'),
    ('TESTL0089', 'OFF0021', 'ASSESSOR'),
    ('TESTL0090', 'OFF0002', 'TUTOR'),
    ('TESTL0090', 'OFF0001', 'ASSESSOR'),
    ('TESTL0091', 'OFF0004', 'TUTOR'),
    ('TESTL0091', 'OFF0003', 'ASSESSOR'),
    ('TESTL0092', 'OFF0024', 'TUTOR'),
    ('TESTL0092', 'OFF0025', 'ASSESSOR'),
    ('TESTL0093', 'OFF0017', 'TUTOR'),
    ('TESTL0093', 'OFF0022', 'ASSESSOR'),
    ('TESTL0094', 'OFF0018', 'TUTOR'),
    ('TESTL0094', 'OFF0023', 'ASSESSOR'),
    ('TESTL0095', 'OFF0005', 'TUTOR'),
    ('TESTL0095', 'OFF0006', 'ASSESSOR'),
    ('TESTL0096', 'OFF0014', 'TUTOR'),
    ('TESTL0096', 'OFF0019', 'ASSESSOR'),
    ('TESTL0097', 'OFF0002', 'TUTOR'),
    ('TESTL0097', 'OFF0001', 'ASSESSOR'),
    ('TESTL0098', 'OFF0004', 'TUTOR'),
    ('TESTL0098', 'OFF0003', 'ASSESSOR'),
    ('TESTL0099', 'OFF0015', 'TUTOR'),
    ('TESTL0099', 'OFF0020', 'ASSESSOR'),
    ('TESTL0100', 'OFF0005', 'TUTOR'),
    ('TESTL0100', 'OFF0006', 'ASSESSOR'),
    ('TESTL0101', 'OFF0016', 'TUTOR'),
    ('TESTL0101', 'OFF0021', 'ASSESSOR'),
    ('TESTL0102', 'OFF0017', 'TUTOR'),
    ('TESTL0102', 'OFF0022', 'ASSESSOR'),
    ('TESTL0103', 'OFF0014', 'TUTOR'),
    ('TESTL0103', 'OFF0019', 'ASSESSOR'),
    ('TESTL0104', 'OFF0018', 'TUTOR'),
    ('TESTL0104', 'OFF0023', 'ASSESSOR'),
    ('TESTL0105', 'OFF0015', 'TUTOR'),
    ('TESTL0105', 'OFF0020', 'ASSESSOR'),
    ('TESTL0106', 'OFF0002', 'TUTOR'),
    ('TESTL0106', 'OFF0001', 'ASSESSOR'),
    ('TESTL0107', 'OFF0016', 'TUTOR'),
    ('TESTL0107', 'OFF0021', 'ASSESSOR'),
    ('TESTL0108', 'OFF0017', 'TUTOR'),
    ('TESTL0108', 'OFF0022', 'ASSESSOR'),
    ('TESTL0109', 'OFF0004', 'TUTOR'),
    ('TESTL0109', 'OFF0003', 'ASSESSOR'),
    ('TESTL0110', 'OFF0012', 'TUTOR'),
    ('TESTL0110', 'OFF0013', 'ASSESSOR'),
    ('TESTL0111', 'OFF0018', 'TUTOR'),
    ('TESTL0111', 'OFF0023', 'ASSESSOR'),
    ('TESTL0112', 'OFF0015', 'TUTOR'),
    ('TESTL0112', 'OFF0020', 'ASSESSOR'),
    ('TESTL0113', 'OFF0005', 'TUTOR'),
    ('TESTL0113', 'OFF0006', 'ASSESSOR'),
    ('TESTL0114', 'OFF0014', 'TUTOR'),
    ('TESTL0114', 'OFF0019', 'ASSESSOR'),
    ('TESTL0115', 'OFF0002', 'TUTOR'),
    ('TESTL0115', 'OFF0001', 'ASSESSOR'),
    ('TESTL0116', 'OFF0024', 'TUTOR'),
    ('TESTL0116', 'OFF0025', 'ASSESSOR')) AS v (LEARNREFNUMBER, OFFICERREFNUMBER, ASSIGNMENTROLE)) s
  ON t.ASSIGNMENTID = 'ASG-T-' || s.LEARNREFNUMBER || '-' || s.ASSIGNMENTROLE
WHEN NOT MATCHED THEN INSERT (ASSIGNMENTID, LEARNREFNUMBER, OFFICERREFNUMBER, ASSIGNMENTROLE, STARTEDBY, ISTESTDATA)
  VALUES ('ASG-T-' || s.LEARNREFNUMBER || '-' || s.ASSIGNMENTROLE, s.LEARNREFNUMBER, s.OFFICERREFNUMBER,
          s.ASSIGNMENTROLE, 'test-data-seed', TRUE);


-- ---------------------------------------------------------------------------
-- 7. Users. Names come from the officer and learner records.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ACCESS.APP_USER t
USING (
  SELECT 'USR-T' || SUBSTR(o.OFFICERREFNUMBER, 4) AS USERID, o.ORGANISATIONID, o.OFFICERNAME AS DISPLAYNAME, o.EMAIL,
         o.OFFICERREFNUMBER, NULL AS LEARNREFNUMBER, NULL AS EMPLOYERID
  FROM CAPTURE_DB.ILR.OFFICER o
  WHERE o.OFFICERREFNUMBER BETWEEN 'OFF0014' AND 'OFF0025'
  UNION ALL
  SELECT 'USR-T1' || SUBSTR(l.LEARNREFNUMBER, 7), l.ORGANISATIONID,
         TRIM(COALESCE(l.GIVENNAMES, '') || ' ' || COALESCE(l.FAMILYNAME, '')), l.EMAIL,
         NULL, l.LEARNREFNUMBER, NULL
  FROM CAPTURE_DB.ILR.LEARNER l
  WHERE l.LEARNREFNUMBER BETWEEN 'TESTL0017' AND 'TESTL0116'
  UNION ALL
  SELECT USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, NULL, NULL, EMPLOYERID
  FROM (VALUES
    ('USR-T0205', 'ORG-T001', 'Pat Testcontact05', 'pat.testcontact05@example.com', 'EMP-T005'),
    ('USR-T0206', 'ORG-T002', 'Jo Testcontact06', 'jo.testcontact06@example.com', 'EMP-T006')) AS v (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, EMPLOYERID)
) s
  ON t.USERID = s.USERID
WHEN NOT MATCHED THEN INSERT (USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, OFFICERREFNUMBER, LEARNREFNUMBER, EMPLOYERID,
                              ISACTIVE, ISTESTDATA, CREATEDBY)
  VALUES (s.USERID, s.ORGANISATIONID, s.DISPLAYNAME, s.EMAIL, s.OFFICERREFNUMBER, s.LEARNREFNUMBER, s.EMPLOYERID,
          TRUE, TRUE, 'test-data-seed');


-- ---------------------------------------------------------------------------
-- 8. Roles: each officer's type, LEARNER for learners, EMPLOYER for contacts.
-- ---------------------------------------------------------------------------
MERGE INTO CAPTURE_DB.ACCESS.USER_ROLE t
USING (
  SELECT u.USERID, COALESCE(o.OFFICERTYPE, IFF(u.LEARNREFNUMBER IS NOT NULL, 'LEARNER', 'EMPLOYER')) AS ROLE
  FROM CAPTURE_DB.ACCESS.APP_USER u
  LEFT JOIN CAPTURE_DB.ILR.OFFICER o ON o.OFFICERREFNUMBER = u.OFFICERREFNUMBER
  WHERE u.USERID BETWEEN 'USR-T0014' AND 'USR-T0025'
     OR u.USERID BETWEEN 'USR-T1017' AND 'USR-T1116'
     OR u.USERID IN ('USR-T0205', 'USR-T0206')
) s
  ON t.ROLEGRANTID = 'RG-' || s.USERID || '-' || s.ROLE
WHEN NOT MATCHED THEN INSERT (ROLEGRANTID, USERID, ROLE, GRANTEDBY, ISTESTDATA)
  VALUES ('RG-' || s.USERID || '-' || s.ROLE, s.USERID, s.ROLE, 'test-data-seed', TRUE);


-- ---------------------------------------------------------------------------
-- 9. The 16 existing learners get ULNs that pass the check digit rule. Only
--    a ULN that still has its old seeded value is changed.
-- ---------------------------------------------------------------------------
UPDATE CAPTURE_DB.ILR.LEARNER t
SET ULN = s.ULN
FROM (SELECT * FROM (VALUES
    ('TESTL0001', 9100000001, 9100000018),
    ('TESTL0002', 9100000002, 9100000026),
    ('TESTL0003', 9100000003, 9100000034),
    ('TESTL0004', 9100000004, 9100000042),
    ('TESTL0005', 9100000005, 9100000050),
    ('TESTL0006', 9100000006, 9100000069),
    ('TESTL0007', 9100000007, 9100000077),
    ('TESTL0008', 9100000008, 9100000085),
    ('TESTL0009', 9100000009, 9100000093),
    ('TESTL0010', 9100000010, 9100000107),
    ('TESTL0011', 9100000011, 9100000115),
    ('TESTL0012', 9100000012, 9100000123),
    ('TESTL0013', 9100000013, 9100000131),
    ('TESTL0014', 9100000014, 9100005141),
    ('TESTL0015', 9100000015, 9100000158),
    ('TESTL0016', 9100000016, 9100000166)) AS v (LEARNREFNUMBER, OLDULN, ULN)) s
WHERE t.LEARNREFNUMBER = s.LEARNREFNUMBER AND t.ULN = s.OLDULN;


-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
-- The expected figures assume the existing test data is as it was on
-- 2026-09-28 (16 learners, 35 caseload assignments). Anything changed in the
-- app since will show up as a difference.

-- 1. Each organisation. Expected:
--    ORG-T001  98 learners, 20 officers, 4 employers, 122 users, 1 inactive user
--    ORG-T002  18 learners,  5 officers, 2 employers,  25 users, 0 inactive users
WITH learners AS (SELECT ORGANISATIONID, COUNT(*) AS N FROM CAPTURE_DB.ILR.LEARNER GROUP BY 1),
officers AS (SELECT ORGANISATIONID, COUNT(*) AS N FROM CAPTURE_DB.ILR.OFFICER GROUP BY 1),
employers AS (SELECT ORGANISATIONID, COUNT(*) AS N FROM CAPTURE_DB.ILR.EMPLOYER GROUP BY 1),
users AS (SELECT ORGANISATIONID, COUNT(*) AS N, COUNT_IF(NOT ISACTIVE) AS INACTIVE FROM CAPTURE_DB.ACCESS.APP_USER GROUP BY 1)
SELECT o.ORGANISATIONID, o.NAME,
  COALESCE(l.N, 0) AS LEARNERS, COALESCE(f.N, 0) AS OFFICERS, COALESCE(e.N, 0) AS EMPLOYERS,
  COALESCE(u.N, 0) AS USERS, COALESCE(u.INACTIVE, 0) AS INACTIVE_USERS
FROM CAPTURE_DB.ACCESS.ORGANISATION o
LEFT JOIN learners l ON l.ORGANISATIONID = o.ORGANISATIONID
LEFT JOIN officers f ON f.ORGANISATIONID = o.ORGANISATIONID
LEFT JOIN employers e ON e.ORGANISATIONID = o.ORGANISATIONID
LEFT JOIN users u ON u.ORGANISATIONID = o.ORGANISATIONID
ORDER BY o.ORGANISATIONID;

-- 2. Active roles held by active users. Expected:
--    ORG-T001  ASSESSOR 8, EMPLOYER 4, IQA 2, LEARNER 98, MANAGER 2, TUTOR 8
--    ORG-T002  ASSESSOR 2, EMPLOYER 2, LEARNER 18, MANAGER 1, TUTOR 2
SELECT u.ORGANISATIONID, r.ROLE, COUNT(*) AS USERS_WITH_ROLE
FROM CAPTURE_DB.ACCESS.USER_ROLE r
JOIN CAPTURE_DB.ACCESS.APP_USER u ON u.USERID = r.USERID
WHERE r.REVOKEDAT IS NULL AND u.ISACTIVE
GROUP BY 1, 2
ORDER BY 1, 2;

-- 3. Expected: no rows. Any learner listed doesn't have exactly one current
--    tutor and one current assessor.
SELECT l.LEARNREFNUMBER,
  COUNT_IF(a.ASSIGNMENTROLE = 'TUTOR') AS TUTORS,
  COUNT_IF(a.ASSIGNMENTROLE = 'ASSESSOR') AS ASSESSORS
FROM CAPTURE_DB.ILR.LEARNER l
LEFT JOIN CAPTURE_DB.ILR.OFFICER_ASSIGNMENT a ON a.LEARNREFNUMBER = l.LEARNREFNUMBER AND a.ENDEDAT IS NULL
GROUP BY 1
HAVING TUTORS <> 1 OR ASSESSORS <> 1;

-- 4. Current caseload of each officer, by group. Expected:
--    Max's group  TUTOR     OFF0002 OFF0002 (existing)       13
--    Max's group  TUTOR     OFF0004 Tina Testtutor02         12
--    Max's group  TUTOR     OFF0005 Toby Testtutor03         12
--    Max's group  TUTOR     OFF0014 Hal Testtutor05          12
--    Max's group  ASSESSOR  OFF0001 OFF0001 (existing)       13
--    Max's group  ASSESSOR  OFF0003 OFF0003 (existing)       12
--    Max's group  ASSESSOR  OFF0006 Ada Testassessoriqa      12
--    Max's group  ASSESSOR  OFF0019 Mo Testassessor05        12
--    Mia's group  TUTOR     OFF0015 Ines Testtutor06         13
--    Mia's group  TUTOR     OFF0016 Jude Testtutor07         12
--    Mia's group  TUTOR     OFF0017 Kemi Testtutor08         12
--    Mia's group  TUTOR     OFF0018 Luca Testtutor09         12
--    Mia's group  ASSESSOR  OFF0020 Nell Testassessor06      13
--    Mia's group  ASSESSOR  OFF0021 Oli Testassessor07       12
--    Mia's group  ASSESSOR  OFF0022 Pia Testassessor08       12
--    Mia's group  ASSESSOR  OFF0023 Ravi Testassessor09      12
--    ORG-T002     TUTOR     OFF0012 Theo Testtutor04          9
--    ORG-T002     TUTOR     OFF0024 Suki Testtutor10          9
--    ORG-T002     ASSESSOR  OFF0013 Asha Testassessor04       9
--    ORG-T002     ASSESSOR  OFF0025 Tam Testassessor10        9
--    Every tutor and assessor with learners has 12 or 13 in ORG-T001 and
--    9 in ORG-T002. Tutors and assessors never share a learner across groups
--    (check 4b expects no rows).
SELECT CASE
         WHEN a.OFFICERREFNUMBER IN ('OFF0001', 'OFF0002', 'OFF0003', 'OFF0004', 'OFF0005', 'OFF0006', 'OFF0014', 'OFF0019')
           THEN 'Max''s group'
         WHEN a.OFFICERREFNUMBER BETWEEN 'OFF0015' AND 'OFF0023' THEN 'Mia''s group'
         ELSE o.ORGANISATIONID
       END AS OFFICER_GROUP,
       a.ASSIGNMENTROLE, a.OFFICERREFNUMBER, o.OFFICERNAME, COUNT(*) AS LEARNERS
FROM CAPTURE_DB.ILR.OFFICER_ASSIGNMENT a
JOIN CAPTURE_DB.ILR.OFFICER o ON o.OFFICERREFNUMBER = a.OFFICERREFNUMBER
WHERE a.ENDEDAT IS NULL
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2 DESC, 3;

-- 4b. Expected: no rows. A learner whose tutor and assessor are in different groups.
WITH grouped AS (
  SELECT a.LEARNREFNUMBER, a.ASSIGNMENTROLE,
         CASE
           WHEN a.OFFICERREFNUMBER IN ('OFF0001', 'OFF0002', 'OFF0003', 'OFF0004', 'OFF0005', 'OFF0006', 'OFF0014', 'OFF0019')
             THEN 'MAX'
           WHEN a.OFFICERREFNUMBER BETWEEN 'OFF0015' AND 'OFF0023' THEN 'MIA'
           ELSE 'ORG-T002'
         END AS G
  FROM CAPTURE_DB.ILR.OFFICER_ASSIGNMENT a
  WHERE a.ENDEDAT IS NULL
)
SELECT LEARNREFNUMBER, LISTAGG(ASSIGNMENTROLE || ' ' || G, ', ') AS GROUPS
FROM grouped
GROUP BY 1
HAVING COUNT(DISTINCT G) > 1;

-- 5. Each employer's current apprentices. Expected:
--    EMP-T001  Testco Retail Ltd        ORG-T001  17
--    EMP-T002  Example Care Homes Ltd   ORG-T001  25
--    EMP-T003  Sample Logistics Ltd     ORG-T001  15
--    EMP-T005  Placeholder Foods Ltd    ORG-T001  16
--    EMP-T004  Testco Retail Ltd        ORG-T002  10
--    EMP-T006  Sample Care Group Ltd    ORG-T002   4
--    14 of the new learners have no employer, and the 10 withdrawn new
--    learners who had one no longer count (their link ended when they withdrew).
SELECT e.ORGANISATIONID, e.EMPLOYERID, e.NAME, COUNT(le.LEARNREFNUMBER) AS CURRENT_APPRENTICES
FROM CAPTURE_DB.ILR.EMPLOYER e
LEFT JOIN CAPTURE_DB.ILR.LEARNER_EMPLOYER le ON le.EMPLOYERID = e.EMPLOYERID
  AND (le.TODATE IS NULL OR le.TODATE >= CURRENT_DATE())
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- 6. Who the 100 new learners are. Expected:
--    1 Age       16-18 at start                                42
--    1 Age       19-23 at start                                29
--    1 Age       24+ at start                                  29
--    2 Sex       F                                             50
--    2 Sex       M                                             50
--    3 Ethnicity Asian (39-43)                                  5
--    3 Ethnicity Black (44-46)                                  5
--    3 Ethnicity Mixed (35-38)                                  4
--    3 Ethnicity Not provided (99)                              5
--    3 Ethnicity Other (47, 98)                                 2
--    3 Ethnicity Other White (32-34)                            8
--    3 Ethnicity White British (31)                            71
--    4 LLDD      1 Yes                                         15
--    4 LLDD      2 No                                          80
--    4 LLDD      9 Not provided                                 5
WITH new_learners AS (
  SELECT l.*, ld.LEARNSTARTDATE,
         DATEDIFF(year, l.DATEOFBIRTH, ld.LEARNSTARTDATE)
           - IFF(DATEADD(year, DATEDIFF(year, l.DATEOFBIRTH, ld.LEARNSTARTDATE), l.DATEOFBIRTH) > ld.LEARNSTARTDATE, 1, 0) AS AGE_AT_START
  FROM CAPTURE_DB.ILR.LEARNER l
  JOIN CAPTURE_DB.ILR.LEARNING_DELIVERY ld
    ON ld.LEARNREFNUMBER = l.LEARNREFNUMBER AND ld.LEARNAIMREF = 'ZPROG001' AND ld.AIMSEQNUMBER = 1
  WHERE l.LEARNREFNUMBER BETWEEN 'TESTL0017' AND 'TESTL0116'
)
SELECT '1 Age' AS MEASURE,
       CASE WHEN AGE_AT_START <= 18 THEN '16-18 at start' WHEN AGE_AT_START <= 23 THEN '19-23 at start' ELSE '24+ at start' END AS VALUE,
       COUNT(*) AS LEARNERS
FROM new_learners GROUP BY 1, 2
UNION ALL
SELECT '2 Sex', SEX, COUNT(*) FROM new_learners GROUP BY 1, 2
UNION ALL
SELECT '3 Ethnicity',
       CASE WHEN ETHNICITY = 31 THEN 'White British (31)'
            WHEN ETHNICITY BETWEEN 32 AND 34 THEN 'Other White (32-34)'
            WHEN ETHNICITY BETWEEN 35 AND 38 THEN 'Mixed (35-38)'
            WHEN ETHNICITY BETWEEN 39 AND 43 THEN 'Asian (39-43)'
            WHEN ETHNICITY BETWEEN 44 AND 46 THEN 'Black (44-46)'
            WHEN ETHNICITY IN (47, 98) THEN 'Other (47, 98)'
            ELSE 'Not provided (99)' END,
       COUNT(*)
FROM new_learners GROUP BY 1, 2
UNION ALL
SELECT '4 LLDD', CASE LLDDHEALTHPROB WHEN 1 THEN '1 Yes' WHEN 2 THEN '2 No' ELSE '9 Not provided' END, COUNT(*)
FROM new_learners GROUP BY 1, 2
ORDER BY 1, 2;

-- 7. Expected: no rows. Any test learner whose ULN fails the check digit
--    rule: weight the first 9 digits 10, 9, ... 2 and add them up. The
--    remainder after dividing by 11 must not be 0, and the 10th digit must
--    be 10 minus that remainder.
WITH u AS (
  SELECT LEARNREFNUMBER, ULN, TO_VARCHAR(ULN) AS S FROM CAPTURE_DB.ILR.LEARNER WHERE ISTESTDATA
), r AS (
  SELECT *, MOD(10 * SUBSTR(S, 1, 1)::INT + 9 * SUBSTR(S, 2, 1)::INT + 8 * SUBSTR(S, 3, 1)::INT
              + 7 * SUBSTR(S, 4, 1)::INT + 6 * SUBSTR(S, 5, 1)::INT + 5 * SUBSTR(S, 6, 1)::INT
              + 4 * SUBSTR(S, 7, 1)::INT + 3 * SUBSTR(S, 8, 1)::INT + 2 * SUBSTR(S, 9, 1)::INT, 11) AS REMAINDER
  FROM u WHERE LENGTH(S) = 10
)
SELECT LEARNREFNUMBER, ULN FROM u WHERE LENGTH(S) <> 10
UNION ALL
SELECT LEARNREFNUMBER, ULN FROM r WHERE REMAINDER = 0 OR 10 - REMAINDER <> SUBSTR(S, 10, 1)::INT;

-- 7b. Expected: no rows. Two learners with the same ULN.
SELECT ULN, LISTAGG(LEARNREFNUMBER, ', ') AS LEARNERS
FROM CAPTURE_DB.ILR.LEARNER
GROUP BY 1
HAVING COUNT(*) > 1;

-- 8. Test-data rules. Expected: 0 on the first two lines, and TEST_ROWS =
--    ALL_ROWS on every other line:
--    ORGANISATION 2, APP_USER 147, USER_ROLE 149, LEARNER 116, LEARNING_DELIVERY 116,
--    OFFICER 25, OFFICER_ASSIGNMENT 235, EMPLOYER 6, LEARNER_EMPLOYER 97
SELECT 'Test users without an @example.com email' AS TABLE_NAME, COUNT(*) AS TEST_ROWS, NULL AS ALL_ROWS
FROM CAPTURE_DB.ACCESS.APP_USER WHERE ISTESTDATA AND EMAIL NOT LIKE '%@example.com'
UNION ALL SELECT 'Test learners with a postcode not starting ZZ', COUNT(*), NULL
FROM CAPTURE_DB.ILR.LEARNER WHERE ISTESTDATA AND (POSTCODE NOT LIKE 'ZZ%' OR POSTCODEPRIOR NOT LIKE 'ZZ%')
UNION ALL SELECT 'ACCESS.ORGANISATION', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ACCESS.ORGANISATION
UNION ALL SELECT 'ACCESS.APP_USER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ACCESS.APP_USER
UNION ALL SELECT 'ACCESS.USER_ROLE', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ACCESS.USER_ROLE
UNION ALL SELECT 'ILR.LEARNER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.LEARNER
UNION ALL SELECT 'ILR.LEARNING_DELIVERY', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.LEARNING_DELIVERY
UNION ALL SELECT 'ILR.OFFICER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.OFFICER
UNION ALL SELECT 'ILR.OFFICER_ASSIGNMENT', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.OFFICER_ASSIGNMENT
UNION ALL SELECT 'ILR.EMPLOYER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.EMPLOYER
UNION ALL SELECT 'ILR.LEARNER_EMPLOYER', COUNT_IF(ISTESTDATA), COUNT(*) FROM CAPTURE_DB.ILR.LEARNER_EMPLOYER;

-- 9. The QAR cohort for 2024/25 and 2025/26, worked out the same way as
--    the Reports page (server/reports.js), for all learners in each
--    organisation. Expected (leavers, completers, achievers, then
--    achievement, retention and pass rates in %):
--    ORG-T001  2024 to 2025 All      21  16  14   66.7  76.2  87.5
--    ORG-T001  2024 to 2025 ST0005    7   5   5   71.4  71.4  100.0
--    ORG-T001  2024 to 2025 ST0072    7   6   5   71.4  85.7  83.3
--    ORG-T001  2024 to 2025 ST0259    7   5   4   57.1  71.4  80.0
--    ORG-T001  2025 to 2026 All      26  21  18   69.2  80.8  85.7
--    ORG-T001  2025 to 2026 ST0005   10   9   8   80.0  90.0  88.9
--    ORG-T001  2025 to 2026 ST0072    8   6   5   62.5  75.0  83.3
--    ORG-T001  2025 to 2026 ST0259    8   6   5   62.5  75.0  83.3
--    ORG-T002  2024 to 2025 All       4   3   2   50.0  75.0  66.7
--    ORG-T002  2024 to 2025 ST0005    2   1   1   50.0  50.0  100.0
--    ORG-T002  2024 to 2025 ST0072    1   1   0   0.0   100.0 0.0
--    ORG-T002  2024 to 2025 ST0259    1   1   1   100.0 100.0 100.0
--    ORG-T002  2025 to 2026 All       6   5   4   66.7  83.3  80.0
--    ORG-T002  2025 to 2026 ST0005    1   1   1   100.0 100.0 100.0
--    ORG-T002  2025 to 2026 ST0072    2   1   1   50.0  50.0  100.0
--    ORG-T002  2025 to 2026 ST0259    3   3   2   66.7  100.0 66.7
--
--    How the 5 new learners past their planned end date with no outcome
--    are treated (plus TESTL0013, an existing learner in the same position,
--    listed by check 9b with the 2 on a break): their planned end dates are all in 2025/26 and
--    they have no actual end or achievement date, so their hybrid end year
--    is 2025/26, but they are NOT leavers, so they aren't in any year's
--    cohort. The Reports page lists them as a data quality warning instead.
--    (Until 28 September 2026 the Reports page counted them as leavers in
--    2025/26. That gave ORG-T001 31 leavers and ORG-T002 7.)
--
--    This follows the DfE rules, "Qualification achievement rates 2025 to
--    2026" (sections "Hybrid end years" and "Withdrawals" > "Overdue
--    continuing aims"): a continuing aim only counts as a leaver (treated
--    as a withdrawal, not achieved) when it is continuing in a year's final
--    R14 ILR return but missing from the next year's return. Warren holds
--    the live record, so a learner still continuing in Warren is treated as
--    still being returned. Overdue planned breaks work the same way: the 2
--    learners on a break past their planned end date stay excluded (as
--    breaks in learning) and are in the data quality warning too.
--
--    Also excluded from the cohort, as on the Reports page: the learner who
--    withdrew 18 days after starting (inside the 42-day qualifying period)
--    and the 2 learners on a break in learning with a 2025/26 planned end.
--    The 2 learners who planned to end in 2024/25 but achieved in 2025/26
--    count in 2025/26, not 2024/25 (their achievement year is later).
WITH aims AS (
  SELECT l.ORGANISATIONID, ld.LEARNREFNUMBER, s.REFERENCE AS STDREFERENCE,
         ld.LEARNPLANENDDATE, ld.LEARNACTENDDATE, ld.ACHDATE, ld.COMPSTATUS, ld.OUTCOME, ld.WITHDRAWREASON,
         YEAR(DATEADD(month, -7, ld.LEARNPLANENDDATE)) AS PLANNED_END_YEAR,
         YEAR(DATEADD(month, -7, ld.LEARNACTENDDATE)) AS ACTUAL_END_YEAR,
         YEAR(DATEADD(month, -7, ld.ACHDATE)) AS ACHIEVEMENT_YEAR,
         DATEDIFF(day, ld.LEARNSTARTDATE, ld.LEARNPLANENDDATE) AS PLANNED_DAYS,
         DATEDIFF(day, ld.LEARNSTARTDATE, ld.LEARNACTENDDATE) AS ACTUAL_DAYS
  FROM CAPTURE_DB.ILR.LEARNING_DELIVERY ld
  JOIN CAPTURE_DB.ILR.LEARNER l ON l.LEARNREFNUMBER = ld.LEARNREFNUMBER
  LEFT JOIN CAPTURE_DB.LARS.STANDARD s ON s.STANDARD_CODE = ld.STDCODE
  WHERE ld.AIMTYPE = 1 AND ld.PROGTYPE IN (2, 3, 10, 20, 21, 22, 23, 25)
), flagged AS (
  SELECT *,
         GREATEST(COALESCE(ACHIEVEMENT_YEAR, 0), COALESCE(ACTUAL_END_YEAR, 0), PLANNED_END_YEAR) AS HYBRID_END_YEAR,
         COALESCE(COMPSTATUS IN (2, 3), FALSE) AS IS_LEAVER,
         COALESCE(COMPSTATUS = 2, FALSE) AS IS_COMPLETER,
         COALESCE(OUTCOME = 1, FALSE) AS IS_ACHIEVER,
         (COMPSTATUS = 3 AND COALESCE(OUTCOME, 0) <> 1
           AND ((PLANNED_DAYS >= 168 AND ACTUAL_DAYS < 42) OR (PLANNED_DAYS BETWEEN 14 AND 167 AND ACTUAL_DAYS < 14)))
         OR COMPSTATUS = 6 OR COALESCE(WITHDRAWREASON = 7, FALSE) AS IS_EXCLUDED
  FROM aims
)
SELECT ORGANISATIONID,
       HYBRID_END_YEAR || ' to ' || (HYBRID_END_YEAR + 1) AS ACADEMIC_YEAR,
       COALESCE(STDREFERENCE, 'All') AS STANDARD,
       COUNT_IF(IS_LEAVER) AS LEAVERS,
       COUNT_IF(IS_COMPLETER) AS COMPLETERS,
       COUNT_IF(IS_ACHIEVER) AS ACHIEVERS,
       ROUND(100 * COUNT_IF(IS_ACHIEVER) / NULLIF(COUNT_IF(IS_LEAVER), 0), 1) AS ACHIEVEMENT_RATE,
       ROUND(100 * COUNT_IF(IS_COMPLETER) / NULLIF(COUNT_IF(IS_LEAVER), 0), 1) AS RETENTION_RATE,
       ROUND(100 * COUNT_IF(IS_ACHIEVER) / NULLIF(COUNT_IF(IS_COMPLETER), 0), 1) AS PASS_RATE
FROM flagged
WHERE HYBRID_END_YEAR IN (2024, 2025) AND IS_LEAVER AND NOT IS_EXCLUDED
GROUP BY GROUPING SETS ((ORGANISATIONID, HYBRID_END_YEAR, STDREFERENCE), (ORGANISATIONID, HYBRID_END_YEAR))
ORDER BY ORGANISATIONID, HYBRID_END_YEAR, STDREFERENCE NULLS FIRST;

-- 9b. The learners past their planned end date with no outcome (still
--     continuing, or on a break in learning): the Reports page's data
--     quality warning. Expected:
--    TESTL0116  ORG-T002  ST0005  Continuing   planned end 2025-11-17
--    TESTL0085  ORG-T001  ST0072  Continuing   planned end 2025-12-31
--    TESTL0032  ORG-T001  ST0005  Continuing   planned end 2026-01-16
--    TESTL0051  ORG-T001  ST0072  On a break   planned end 2026-02-16
--    TESTL0020  ORG-T001  ST0005  Continuing   planned end 2026-03-19
--    TESTL0056  ORG-T001  ST0259  Continuing   planned end 2026-04-10
--    TESTL0065  ORG-T001  ST0259  On a break   planned end 2026-05-17
--    TESTL0013  ORG-T001  ST0259  Continuing   planned end 2026-07-01
SELECT l.LEARNREFNUMBER, l.ORGANISATIONID, s.REFERENCE AS STANDARD,
       IFF(ld.COMPSTATUS = 6, 'On a break', 'Continuing') AS STATUS, ld.LEARNPLANENDDATE
FROM CAPTURE_DB.ILR.LEARNING_DELIVERY ld
JOIN CAPTURE_DB.ILR.LEARNER l ON l.LEARNREFNUMBER = ld.LEARNREFNUMBER
LEFT JOIN CAPTURE_DB.LARS.STANDARD s ON s.STANDARD_CODE = ld.STDCODE
WHERE ld.AIMTYPE = 1 AND ld.COMPSTATUS IN (1, 6) AND ld.LEARNPLANENDDATE < CURRENT_DATE()
ORDER BY ld.LEARNPLANENDDATE, l.LEARNREFNUMBER;
