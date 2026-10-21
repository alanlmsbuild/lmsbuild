-- The silver layer, step 1: the places, identity and governance tags that
-- dbt needs (decision 16: BRONZE/SILVER/GOLD; decision 21: governance built
-- into Snowflake, docs/decisions.md). No tables yet: dbt makes them.
--
--   SHARED_DB.SILVER, OPTIONS_DB.SILVER
--                   Cleaned, typed, joined tables made by dbt from RAW (bronze)
--                   and EXT. Managed access: only ACCOUNTADMIN grants on what's
--                   in them, so TRANSFORM_ROLE owns its tables but can't pass
--                   them on. Time Travel 1 day: silver is rebuilt from bronze.
--   SHARED_DB.GOVERNANCE
--                   The tags (and later the masking and row access policies,
--                   built when the first personal table reaches silver).
--   TRANSFORM_WH    X-Small, suspends after 60 seconds; its own resource
--                   monitor (10 credits a month: told at 80%, suspended at
--                   100%). Resource monitors take no comment.
--   TRANSFORM_ROLE  What dbt runs as. Reads RAW and the vacancy tables,
--                   makes tables and views in SILVER, applies the tags, logs
--                   runs in OPS.JOB_RUN. Nothing in CAPTURE_DB (ILR), ACCESS
--                   or CRM_DB.
--   TRANSFORM_USER  A service user (key pair only, no password) used only by
--                   dbt. Private key: ~/.snowflake/transform_key.p8 (made 14
--                   October 2026, never committed); public key below.
--
-- The tags: LAYER, SOURCE, LICENCE, ATTRIBUTION, OWNER, REFRESH and
-- SENSITIVITY. SOURCE and ATTRIBUTION are free text (SOURCE is checked by a
-- dbt test against SOURCE_FILE instead); the rest have fixed values.
--
-- SELECT on RAW is granted on the tables there now. Each later load_ script
-- grants its new tables to TRANSFORM_ROLE too (no future grants).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The governance schema and tags
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS SHARED_DB.GOVERNANCE
  COMMENT = 'Decision 21: the tags on every database, schema, table and column, and later the masking and row access policies. Owned by ACCOUNTADMIN; TRANSFORM_ROLE may apply the tags.';

CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.LAYER
  ALLOWED_VALUES 'bronze', 'silver', 'gold'
  COMMENT = 'Which layer: bronze (files as loaded, RAW), silver (cleaned and typed, made by dbt), gold (shaped for an app or report).';
CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.SOURCE
  COMMENT = 'Which data set it comes from, as SOURCE_FILE.SOURCE names it (e.g. onspd, gias, nomis-nm-2014-1); several joined with commas. Checked by a dbt test, not a fixed list.';
CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.LICENCE
  ALLOWED_VALUES 'ogl-3', 'cc-by-4', 'cc0', 'odbl', 'mit', 'neso-odl', 'test-data', 'nr-open', 'opl-3'
  COMMENT = 'The licence it is used under: Open Government Licence v3.0, CC BY 4.0, CC0, ODbL, MIT, NESO Open Data Licence, or test data made by Rarebit.';
CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.ATTRIBUTION
  COMMENT = 'What must be credited wherever it is shown, in plain words (e.g. Contains ONS data; Royal Mail and OS copyright). Empty when the licence asks for none.';
CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.OWNER
  ALLOWED_VALUES 'rarebit-data'
  COMMENT = 'Who looks after it and answers for it.';
CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.REFRESH
  ALLOWED_VALUES 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'by-hand'
  COMMENT = 'How often it is refreshed: by a scheduled job, or by hand.';
CREATE TAG IF NOT EXISTS SHARED_DB.GOVERNANCE.SENSITIVITY
  ALLOWED_VALUES 'public', 'internal', 'personal', 'special-category', 'minor'
  COMMENT = 'public: published open data. internal: Rarebit''s own, not personal. personal: about an identifiable person. special-category: UK GDPR article 9 data (health, ethnicity and the rest). minor: about someone under 18. Masking policies will hang on personal, special-category and minor.';

-- ---------------------------------------------------------------------------
-- The SILVER schemas
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS SHARED_DB.SILVER WITH MANAGED ACCESS
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Silver (decision 16): shared reference data cleaned, typed and joined by dbt from RAW and EXT (areas, postcodes, jobs and pay). Rebuilt by the transform-silver job; never edited by hand. Every table and column described and tagged.';
CREATE SCHEMA IF NOT EXISTS OPTIONS_DB.SILVER WITH MANAGED ACCESS
  DATA_RETENTION_TIME_IN_DAYS = 1
  COMMENT = 'Silver (decision 16): the school leavers app''s data (schools, colleges, providers, university courses) cleaned, typed and joined by dbt from OPTIONS_DB.RAW. Rebuilt by the transform-silver job; never edited by hand.';

ALTER SCHEMA SHARED_DB.SILVER SET TAG SHARED_DB.GOVERNANCE.LAYER = 'silver', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';
ALTER SCHEMA OPTIONS_DB.SILVER SET TAG SHARED_DB.GOVERNANCE.LAYER = 'silver', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.REFRESH = 'daily';
ALTER SCHEMA SHARED_DB.GOVERNANCE SET TAG SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data';

-- ---------------------------------------------------------------------------
-- The warehouse, its resource monitor, the role and the user
-- ---------------------------------------------------------------------------
CREATE WAREHOUSE IF NOT EXISTS TRANSFORM_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'dbt only (TRANSFORM_ROLE): builds and tests SILVER. X-Small, suspends after 60 seconds.';
-- Creating a warehouse makes it the current one: back to CAPTURE_WH, so
-- this file never wakes TRANSFORM_WH.
USE WAREHOUSE capture_wh;

CREATE RESOURCE MONITOR IF NOT EXISTS TRANSFORM_MONITOR
  WITH CREDIT_QUOTA = 10 FREQUENCY = MONTHLY START_TIMESTAMP = IMMEDIATELY
  TRIGGERS ON 80 PERCENT DO NOTIFY
           ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE TRANSFORM_WH SET RESOURCE_MONITOR = TRANSFORM_MONITOR;
ALTER WAREHOUSE TRANSFORM_WH SET TAG SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data';

CREATE ROLE IF NOT EXISTS TRANSFORM_ROLE
  COMMENT = 'dbt: reads RAW and the vacancy tables, makes SILVER, applies the governance tags, logs runs. Granted only to TRANSFORM_USER. Nothing in CAPTURE_DB, ACCESS or CRM_DB.';

CREATE USER IF NOT EXISTS TRANSFORM_USER
  TYPE = SERVICE
  DEFAULT_ROLE = TRANSFORM_ROLE
  DEFAULT_WAREHOUSE = TRANSFORM_WH
  RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzH7kLrjtwJHq1Con8+cqDx7UKRYFGYV3bx5bCbC+YOru+y2ICSD989jIaC5QQ2xP2ycX8pla36wFqO1Q2C/9R9HX5wCzjKxmZBKoNAqzOcZH/vQ2qHAbb5GdLdULBUej2pGMwfHY3LAHQNVgOUjLRH4zskcnF9kqyTt4MAIJmNzyNmrkTgo5ab1GOLfcj+RrKlF9VW8EQkjoVlYjuJ9Xpsn3IPrDwh5zDHOnHqmNapy1eTDhx2hf5zn6pb03uN0Fj+sLhBcUeEJhRxFVSpz9J5Wmor+K5kbDQc7Gm/LQwc3kGGaO7BzCvGtRQgE27GPI9um5HqNMEBXVw8beCCDJzwIDAQAB'
  COMMENT = 'Service user for dbt (the transform-silver job) only. Key pair, no password. Not the app, not the loaders.';

GRANT ROLE TRANSFORM_ROLE TO USER TRANSFORM_USER;
GRANT USAGE ON WAREHOUSE TRANSFORM_WH TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Grants: least privilege
-- ---------------------------------------------------------------------------
GRANT USAGE ON DATABASE SHARED_DB TO ROLE TRANSFORM_ROLE;
GRANT USAGE ON DATABASE OPTIONS_DB TO ROLE TRANSFORM_ROLE;

-- Bronze: read only.
GRANT USAGE ON SCHEMA SHARED_DB.RAW TO ROLE TRANSFORM_ROLE;
GRANT USAGE ON SCHEMA OPTIONS_DB.RAW TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA SHARED_DB.RAW TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA OPTIONS_DB.RAW TO ROLE TRANSFORM_ROLE;

-- The vacancy tables (the import and the SOC coder write them): read only.
GRANT USAGE ON SCHEMA SHARED_DB.EXT TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.VACANCY TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.VACANCY_SOC TO ROLE TRANSFORM_ROLE;

-- Silver: makes its own tables and views (and owns them). No CREATE SCHEMA.
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA SHARED_DB.SILVER TO ROLE TRANSFORM_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA OPTIONS_DB.SILVER TO ROLE TRANSFORM_ROLE;

-- The tags: apply them, nothing else.
GRANT USAGE ON SCHEMA SHARED_DB.GOVERNANCE TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.LAYER TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.SOURCE TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.LICENCE TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.ATTRIBUTION TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.OWNER TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.REFRESH TO ROLE TRANSFORM_ROLE;
GRANT APPLY ON TAG SHARED_DB.GOVERNANCE.SENSITIVITY TO ROLE TRANSFORM_ROLE;

-- Logging its runs.
GRANT USAGE ON SCHEMA SHARED_DB.OPS TO ROLE TRANSFORM_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.OPS.JOB_RUN TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The tags. Expected: 7 rows; ALLOWED_VALUES empty for SOURCE and
--    ATTRIBUTION; SENSITIVITY with minor.
SHOW TAGS IN SCHEMA SHARED_DB.GOVERNANCE;
SELECT "name" AS TAG, "allowed_values" AS ALLOWED_VALUES FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) ORDER BY 1;

-- 2. TRANSFORM_ROLE's grants, by privilege and database. Expected:
--      APPLY       TAG       SHARED_DB    7
--      CREATE TABLE / CREATE VIEW  SCHEMA  OPTIONS_DB 1, SHARED_DB 1
--      INSERT, UPDATE  TABLE SHARED_DB    1 (JOB_RUN)
--      SELECT      TABLE     OPTIONS_DB   62 (all of RAW), SHARED_DB 149
--                            (146 in RAW, VACANCY, VACANCY_SOC, JOB_RUN)
--      USAGE       DATABASE  2; SCHEMA OPTIONS_DB 2, SHARED_DB 5;
--                  WAREHOUSE TRANSFORM_WH 1
--    and no CAPTURE_DB, CRM_DB or ACCESS anywhere.
SHOW GRANTS TO ROLE TRANSFORM_ROLE;
SELECT "privilege" AS PRIVILEGE_, "granted_on" AS ON_, SPLIT_PART("name", '.', 1) AS DATABASE_, COUNT(*) AS N
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- 3. Who has TRANSFORM_ROLE. Expected: 1 row, USER TRANSFORM_USER.
SHOW GRANTS OF ROLE TRANSFORM_ROLE;

-- 4. The warehouse and its monitor. Expected: TRANSFORM_WH, X-Small,
--    auto_suspend 60, resource_monitor TRANSFORM_MONITOR.
SHOW WAREHOUSES LIKE 'TRANSFORM_WH';
SELECT "name", "size", "auto_suspend", "resource_monitor" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
