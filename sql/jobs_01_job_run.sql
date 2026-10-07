-- Scheduling, file 1: OPS.JOB_RUN, one row per run of a background job.
--
-- The jobs: vacancies-full (nightly), vacancies-new (every 2 hours),
-- companies-refresh (nightly) and skills (weekly). Every run is recorded
-- here the same way, whether started by hand (npm run import:... /
-- refresh:companies) or by the scheduler (npm run jobs). Each job keeps its
-- own detailed run table too (EXT.VACANCY_IMPORT_RUN,
-- SKILLS.SKILLS_IMPORT_RUN); this is the one place the screens read: when
-- adverts were last updated, and for managers whether each job's last run
-- succeeded and whether it's overdue.
--
-- The scheduler decides what's due from a small local file, and connects
-- to Snowflake only when a job runs, so it doesn't wake the warehouse
-- every 15 minutes.
--
-- Not organisation data: no ORGANISATIONID or ISTESTDATA. Screens show
-- only times and outcomes (SUMMARY can hold counts across organisations).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks are in
-- sql/jobs_01_checks.sql, to run one at a time afterwards.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE SCHEMA IF NOT EXISTS CAPTURE_DB.OPS
  COMMENT = 'Running the system: background job runs. Not organisation data.';

CREATE TABLE IF NOT EXISTS CAPTURE_DB.OPS.JOB_RUN (
  JOBRUNID     VARCHAR(36)   NOT NULL,
  JOB          VARCHAR(40)   NOT NULL COMMENT 'vacancies-full, vacancies-new, companies-refresh or skills.',
  TRIGGEREDBY  VARCHAR(10)   NOT NULL COMMENT 'manual (npm run by hand) or schedule (npm run jobs).',
  HOST         VARCHAR(100)  COMMENT 'The machine it ran on.',
  STARTEDAT    TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  FINISHEDAT   TIMESTAMP_LTZ COMMENT 'Null while running. Still null long after STARTEDAT: it didn''t finish (e.g. the laptop slept or was shut down).',
  OUTCOME      VARCHAR(20)   COMMENT 'Null while running; then succeeded, failed, or refused (another run of the job was open).',
  JOBRUNREF    VARCHAR(36)   COMMENT 'The job''s own run ID (EXT.VACANCY_IMPORT_RUN or SKILLS.SKILLS_IMPORT_RUN RUNID), when it has one.',
  ERROR        VARCHAR(1000) COMMENT 'Why it failed or was refused.',
  SUMMARY      VARIANT       COMMENT 'The job''s counts. May cover every organisation: never shown on screens.',
  CONSTRAINT PK_JOB_RUN PRIMARY KEY (JOBRUNID)
)
COMMENT = 'One row per background job run, manual or scheduled. Written by the jobs, read by the app for when data was last updated.';

-- The app's role (the jobs run as it for now: docs/before-real-data.md,
-- "Imports under their own role"): USAGE on the schema only, so it can't
-- create tables there; SELECT, INSERT, UPDATE on the table, never DELETE.
GRANT USAGE ON SCHEMA CAPTURE_DB.OPS TO ROLE ILR_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CAPTURE_DB.OPS.JOB_RUN TO ROLE ILR_APP_ROLE;
