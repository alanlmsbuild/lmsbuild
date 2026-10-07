-- Skills England, file 3 checks: run these one at a time, after Run All on
-- sql/skills_03_unmapped_links.sql, as ACCOUNTADMIN.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- 1. The column is there. Expected: one row, UNMAPPED_LINKS, VARIANT.
SELECT COLUMN_NAME, DATA_TYPE FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'SKILLS' AND TABLE_NAME = 'SKILLS_IMPORT_RUN' AND COLUMN_NAME = 'UNMAPPED_LINKS';

-- 2. The app's role on the table is unchanged. Expected: INSERT, SELECT,
--    UPDATE (no DELETE).
SHOW GRANTS ON TABLE CAPTURE_DB.SKILLS.SKILLS_IMPORT_RUN
  ->> SELECT LISTAGG("privilege", ', ') WITHIN GROUP (ORDER BY "privilege") AS PRIVILEGES FROM $1 WHERE "grantee_name" = 'ILR_APP_ROLE';
