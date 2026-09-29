-- Access, file 3: PROPOSED, not run. Makes the ACCESS tables read-only for
-- the app's role.
--
-- Why: sql/access_01_users_and_roles.sql gave ILR_APP_ROLE SELECT, INSERT
-- and UPDATE on ACCESS.ORGANISATION, APP_USER and USER_ROLE, and the same on
-- every future table in the schema. The app only ever reads them (checked
-- 29 September 2026: no insert, update or merge into an ACCESS table
-- anywhere in server/). Signing in as a test user sets a cookie and writes
-- nothing. With write access, anything that made the app run an unintended
-- statement could create users, give itself roles or reactivate a user
-- whose access has ended. Taking it away means that can't happen through
-- the app at all.
--
-- When the app gets screens to manage users and roles (part 8), grant back
-- exactly what those screens need, table by table.
--
-- Run by hand as ACCOUNTADMIN in a Snowflake worksheet. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

REVOKE INSERT, UPDATE ON TABLE CAPTURE_DB.ACCESS.ORGANISATION FROM ROLE ILR_APP_ROLE;
REVOKE INSERT, UPDATE ON TABLE CAPTURE_DB.ACCESS.APP_USER FROM ROLE ILR_APP_ROLE;
REVOKE INSERT, UPDATE ON TABLE CAPTURE_DB.ACCESS.USER_ROLE FROM ROLE ILR_APP_ROLE;

-- New tables in the schema get SELECT only from now on.
REVOKE INSERT, UPDATE ON FUTURE TABLES IN SCHEMA CAPTURE_DB.ACCESS FROM ROLE ILR_APP_ROLE;

-- Checks

-- 1. Expected: SELECT only on each of the three tables.
SHOW GRANTS TO ROLE ILR_APP_ROLE;
SELECT "name" AS TABLE_NAME, LISTAGG("privilege", ', ') WITHIN GROUP (ORDER BY "privilege") AS PRIVILEGES
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))
WHERE "granted_on" = 'TABLE' AND "name" LIKE 'CAPTURE_DB.ACCESS.%'
GROUP BY 1
ORDER BY 1;

-- 2. Expected: SELECT only.
SHOW FUTURE GRANTS IN SCHEMA CAPTURE_DB.ACCESS;

-- 3. The app still works: sign in as a test user and open any page. Every
--    request reads ACCESS.APP_USER and USER_ROLE, so a missing SELECT would
--    show at once.
