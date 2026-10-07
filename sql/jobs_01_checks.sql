-- Scheduling, file 1 checks: run these one at a time, after Run All on
-- sql/jobs_01_job_run.sql, as ACCOUNTADMIN.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- 1. The table is there, owned by ACCOUNTADMIN, and empty. Expected: one
--    row, JOB_RUN, ACCOUNTADMIN, 0.
SHOW TABLES IN SCHEMA CAPTURE_DB.OPS
  ->> SELECT "name", "owner", "rows" FROM $1;

-- 2. The app's role on the schema. Expected: USAGE only.
SHOW GRANTS ON SCHEMA CAPTURE_DB.OPS
  ->> SELECT "privilege" FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE' ORDER BY 1;

-- 3. The app's role on the table. Expected: INSERT, SELECT, UPDATE (no
--    DELETE).
SHOW GRANTS ON TABLE CAPTURE_DB.OPS.JOB_RUN
  ->> SELECT LISTAGG("privilege", ', ') WITHIN GROUP (ORDER BY "privilege") AS PRIVILEGES FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';
