-- The site export login: the one way the school leavers app's build reads
-- Snowflake (the real-data plan, 31 October 2026). Nothing on the live site
-- talks to Snowflake: at build time a script exports from GOLD into static
-- files, as this user, and the site is made from those files.
--
--   SITE_EXPORT_WH       X-Small, suspends after 60 seconds, with its own
--                        resource monitor: 2 credits a month, told at 80%,
--                        suspended at 100%. An export is a few minutes of
--                        reads, so the cap is far above what it needs.
--   SITE_EXPORT_ROLE     Read only, and only through the two GOLD_SITE
--                        database roles (SHARED_DB.GOLD_SITE and
--                        OPTIONS_DB.GOLD_SITE: one per database, the same
--                        reader role named in each gold model's meta.readers).
--                        Nothing else: no RAW, SILVER, CLEAN, CAPTURE_DB, ACCESS
--                        or CRM_DB, and no write or CREATE anywhere. Granted
--                        only to SITE_EXPORT_USER.
--   SITE_EXPORT_USER     A service user (key pair only, no password). Private
--                        key: ~/.snowflake/site_export_key.p8 (made 31 October
--                        2026, outside both repos, mode 600, never committed);
--                        its public key is below.
--
-- WHAT THE ROLE CAN READ TODAY: GOLD_SITE already has the six school leavers
-- tables (OPTIONS_DB.GOLD: institution_card, institution_result,
-- institution_achievement, national_comparison, university_course_card,
-- university_course_result) and, in SHARED_DB.GOLD, vacancy_card, job_outlook,
-- area_profile, travel_time, bus_fare, tram_fare, train_fare and
-- train_discount. It can NOT yet read the National Careers Service courses
-- (ncs_course_card, ncs_course_count), Oak (oak_lesson_card,
-- oak_restricted_lesson_link, oak_unit_card, oak_subject_coverage,
-- oak_quiz_question_card, oak_quiz_answer_result) or NEET (neet_la_year): those
-- gold models name no reader yet ("stop at gold"). Granting them here by hand
-- would not last: the dbt macro apply_reader_grants revokes any reader a model
-- does not name on every build. The fix is a one-line meta.readers change in
-- each of those models (and in scripts/gold-readers.js), then a transform
-- build; it is on the branch real-data-v1 for you to approve, not in this file.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The warehouse and its resource monitor
-- ---------------------------------------------------------------------------
CREATE WAREHOUSE IF NOT EXISTS SITE_EXPORT_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'The school leavers app''s build-time export (SITE_EXPORT_ROLE): reads GOLD only. X-Small, suspends after 60 seconds.';
-- Creating a warehouse makes it the current one: back to CAPTURE_WH, so
-- this file never wakes SITE_EXPORT_WH.
USE WAREHOUSE capture_wh;

CREATE RESOURCE MONITOR IF NOT EXISTS SITE_EXPORT_MONITOR
  WITH CREDIT_QUOTA = 2 FREQUENCY = MONTHLY START_TIMESTAMP = IMMEDIATELY
  TRIGGERS ON 80 PERCENT DO NOTIFY
           ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE SITE_EXPORT_WH SET RESOURCE_MONITOR = SITE_EXPORT_MONITOR;
ALTER WAREHOUSE SITE_EXPORT_WH SET TAG SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data';

-- ---------------------------------------------------------------------------
-- The role and the user
-- ---------------------------------------------------------------------------
CREATE ROLE IF NOT EXISTS SITE_EXPORT_ROLE
  COMMENT = 'The school leavers app''s build-time export: reads GOLD through the database roles SHARED_DB.GOLD_SITE and OPTIONS_DB.GOLD_SITE and nothing else. Read only. Granted only to SITE_EXPORT_USER.';

CREATE USER IF NOT EXISTS SITE_EXPORT_USER
  TYPE = SERVICE
  DEFAULT_ROLE = SITE_EXPORT_ROLE
  DEFAULT_WAREHOUSE = SITE_EXPORT_WH
  RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt+CBH+MNVwEF+keOmM6A6Z+zxLks0kYuTT+p/mzF27vGi0l6hVA69HE+rAcl8U8GyfpU5SqBc7LrnZwW5nfRiXPL0uHeVl9QzOXEIKjCCfONQdw1l1L3eh2tjkJ08wdmTieDkgqfD+D+cqRHiDTzmzT6W5AXK1yI/2+TKzbm695tJevXs6yJl9h25vgdA+Nv6kGTWaZdWtfNxoQ6O7UsW0rHDTyv9Z+AoyqVqVXFzG6hKgLoqKx1GR7owqwfQmKxqLVxwSas5P2E1Ox5pn12wWWFkOzfAGRLAk3042t/urmZPztUhIu/mDleMx7rLeVg0Lik8AKTl9fH7o4ABKcY1wIDAQAB'
  COMMENT = 'Service user for the school leavers app''s build-time export only. Key pair, no password. Not the app, not the loaders, not dbt.';

GRANT ROLE SITE_EXPORT_ROLE TO USER SITE_EXPORT_USER;
GRANT USAGE ON WAREHOUSE SITE_EXPORT_WH TO ROLE SITE_EXPORT_ROLE;
GRANT DATABASE ROLE SHARED_DB.GOLD_SITE TO ROLE SITE_EXPORT_ROLE;
GRANT DATABASE ROLE OPTIONS_DB.GOLD_SITE TO ROLE SITE_EXPORT_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The user. Expected: 1 row, SITE_EXPORT_USER, type SERVICE, default role
--    SITE_EXPORT_ROLE, default warehouse SITE_EXPORT_WH, has_password false,
--    has_rsa_public_key true.
SHOW USERS LIKE 'SITE_EXPORT_USER' ->> SELECT "name", "type", "default_role", "default_warehouse", "has_password", "has_rsa_public_key" FROM $1;

-- 2. What the user holds. Expected: 1 row, SITE_EXPORT_ROLE.
SHOW GRANTS TO USER SITE_EXPORT_USER ->> SELECT "role" FROM $1 ORDER BY 1;

-- 3. What the role holds. Expected: 3 rows, all USAGE: the warehouse
--    SITE_EXPORT_WH and the database roles OPTIONS_DB.GOLD_SITE and
--    SHARED_DB.GOLD_SITE. Nothing else.
SHOW GRANTS TO ROLE SITE_EXPORT_ROLE ->> SELECT "privilege", "granted_on", "name" FROM $1 ORDER BY 2, 3;

-- 4. Who holds the two reader roles. Expected: 1 row each, ROLE
--    SITE_EXPORT_ROLE.
SHOW GRANTS OF DATABASE ROLE SHARED_DB.GOLD_SITE ->> SELECT "granted_to", "grantee_name" FROM $1 ORDER BY 2;
SHOW GRANTS OF DATABASE ROLE OPTIONS_DB.GOLD_SITE ->> SELECT "granted_to", "grantee_name" FROM $1 ORDER BY 2;

-- 5. What OPTIONS_DB.GOLD_SITE reads. Expected today: USAGE on the schema
--    OPTIONS_DB.GOLD and SELECT on the six school leavers tables. After the
--    readers change on the branch real-data-v1 and a transform build, also the
--    ncs_ and oak_ tables.
SHOW GRANTS TO DATABASE ROLE OPTIONS_DB.GOLD_SITE ->> SELECT "privilege", "granted_on", "name" FROM $1 ORDER BY 3;

-- 6. What SHARED_DB.GOLD_SITE reads. Expected today: USAGE on the schema
--    SHARED_DB.GOLD and SELECT on area_profile, bus_fare, job_outlook,
--    train_discount, train_fare, tram_fare, travel_time and vacancy_card
--    (and, after the readers change, neet_la_year).
SHOW GRANTS TO DATABASE ROLE SHARED_DB.GOLD_SITE ->> SELECT "privilege", "granted_on", "name" FROM $1 ORDER BY 3;

-- 7. The warehouse. Expected: 1 row, X-Small, auto_suspend 60, auto_resume
--    true, resource monitor SITE_EXPORT_MONITOR.
SHOW WAREHOUSES LIKE 'SITE_EXPORT_WH' ->> SELECT "name", "size", "auto_suspend", "auto_resume", "resource_monitor" FROM $1;

-- 8. The resource monitor. Expected: 1 row, credit_quota 2, frequency
--    MONTHLY, notify_at 80, suspend_at 100.
SHOW RESOURCE MONITORS LIKE 'SITE_EXPORT_MONITOR' ->> SELECT "name", "credit_quota", "frequency", "notify_at", "suspend_at" FROM $1;
