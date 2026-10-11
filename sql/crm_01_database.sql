-- CRM, step 2 of the CRM design ("CRM database, the revised 1a"): CRM_DB,
-- its app role and user, the CRM's tables, default pipelines and stages,
-- test data and its snapshot; SHARED_DB.OPS.FLOW_RUN, the SHARED_DB.FLOW
-- schema and the FLOW_OWNER role. Nothing in CAPTURE_DB changes.
--
-- The CRM design doc: https://claude.ai/code/artifact/33499d3d-8002-442b-90cf-5277e78bdf39
-- The tables are the ones designed on 7 October 2026 (the "Onboarding
-- journey proposal", stage 1 and "The CRM: pipelines, activities and
-- tasks"), moved into their own database, with the design doc's changes:
-- the CRM has its own employer, site and contact tables for prospects (a
-- client's operational details stay Warren's: flow F5, later), and the
-- candidate sign-in is made at hand-over (flow F6, later), so 1a's
-- candidate procedure isn't here.
--
--   CRM_DB.BRONZE  form submissions exactly as received (decision 16)
--   CRM_DB.CRM     the CRM's own tables
--   CRM_DB.GOLD    empty: reports, built later with dbt (decision 16)
--   CRM_DB.TEST_BASELINE  the snapshot the test reset puts back (no app
--                  access), as CAPTURE_DB.TEST_BASELINE
--
-- Separation (the design's "three databases"): CRM_APP_ROLE has nothing in
-- CAPTURE_DB, and ILR_APP_ROLE nothing in CRM_DB; check:grants proves both.
-- The CRM reads shared data in place in SHARED_DB (REF, SKILLS,
-- EXT.VACANCY, ACCESS), read-only. Records cross between the two databases
-- only through the flow procedures (SHARED_DB.FLOW, owned by FLOW_OWNER,
-- logged in SHARED_DB.OPS.FLOW_RUN); the flows themselves come later, so
-- FLOW is empty and FLOW_OWNER has no rights on either side yet.
--
-- CRM_APP_USER is a service user (key pair, no password), used only by the
-- CRM's connection. Private key: ~/.snowflake/crm_app_key.p8 (made 11
-- October 2026, never committed).
--
-- Everything is owned by ACCOUNTADMIN; roles get explicit grants only (no
-- future grants, no CREATE, no DELETE). Pipelines, stages and close reasons
-- are read-only for the app: until stage setup screens exist, they change by
-- hand-run SQL.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. Then the checks in
-- sql/crm_01_checks.sql. The test reset (sql/test_reset_02_reset.sql)
-- covers CRM_DB from now on.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The warehouse, role and user
-- ---------------------------------------------------------------------------
CREATE WAREHOUSE IF NOT EXISTS CRM_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'The CRM app (CRM_APP_ROLE). X-Small, suspends after 60 seconds.';
-- Creating a warehouse makes it the current one: back to CAPTURE_WH, so
-- this file never wakes CRM_WH.
USE WAREHOUSE capture_wh;

CREATE ROLE IF NOT EXISTS CRM_APP_ROLE
  COMMENT = 'The CRM app: reads and writes CRM_DB.CRM, adds to CRM_DB.BRONZE, reads SHARED_DB REF, SKILLS, EXT.VACANCY and ACCESS. Nothing in CAPTURE_DB. Granted only to CRM_APP_USER.';

CREATE USER IF NOT EXISTS CRM_APP_USER
  TYPE = SERVICE
  DEFAULT_ROLE = CRM_APP_ROLE
  DEFAULT_WAREHOUSE = CRM_WH
  RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9/pGKjD6hY709BpSiffo+AibCao+moZj0/yiduNLhO0urB9Yp9qSDLMkEHW80WudPxmSolB+1zFgQt/qM3FlUEyd+MqHG8iOQoAhV/ANcS0uG55w0ajW4DptnxifbGqd9uyi/ZF3eIRvIr7FtgSRNbNYN+Zoaset3ILGy98aYPp4zzC0Uk/+3SrGHohXNhiGH1aEh8D1RMJ0nAHP0BvPCLrg9FAegGaFQ9g0wudG2x6tP2VBcOXs06ub5FpFF41zAkVpOb0/3zzglNLfjJcAUEJ5gWX82KC8iVLD+2TCkIqpwqMIKejH/TyniXslTOhooWiv2moq7cV13v344c0qGwIDAQAB'
  COMMENT = 'Service user for the CRM app''s connection only. Key pair, no password. Not Warren or Burrow.';

GRANT ROLE CRM_APP_ROLE TO USER CRM_APP_USER;

CREATE ROLE IF NOT EXISTS FLOW_OWNER
  COMMENT = 'Owns the flow procedures in SHARED_DB.FLOW (owner''s rights): the only role that will read and write both CAPTURE_DB and CRM_DB, and only the columns each flow names. Granted to no user. Its rights on each side come with each flow.';

-- ---------------------------------------------------------------------------
-- CRM_DB
-- ---------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS CRM_DB
  COMMENT = 'The CRM (sales and recruitment): leads, pipelines, journeys, placements, activities, tasks, prospect employers and contacts. Read and written only by CRM_APP_ROLE; Warren and Burrow''s role has no access. Owned by ACCOUNTADMIN.';

CREATE SCHEMA IF NOT EXISTS CRM_DB.BRONZE
  COMMENT = 'Data exactly as received (decision 16): the public form''s submissions. Add-only for the app. Holds personal data: the retention rule covers it.';
CREATE SCHEMA IF NOT EXISTS CRM_DB.CRM
  COMMENT = 'The CRM''s own tables. Every row has ORGANISATIONID and ISTESTDATA.';
CREATE SCHEMA IF NOT EXISTS CRM_DB.GOLD
  COMMENT = 'Reports, built later with dbt by a separate transform role (decision 16). Empty for now.';
CREATE SCHEMA IF NOT EXISTS CRM_DB.TEST_BASELINE
  COMMENT = 'TEST DATA ONLY: a snapshot of the CRM''s test rows, for sql/test_reset_02_reset.sql. No access for the app.';

-- ---------------------------------------------------------------------------
-- BRONZE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.BRONZE.FORM_SUBMISSION (
  SUBMISSIONID   VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL COMMENT 'The provider whose form it was (one form per provider).',
  FORM           VARCHAR(40)   NOT NULL COMMENT 'Which form: interest (stage 1).',
  FORMVERSION    VARCHAR(20)   COMMENT 'The version of the form''s questions.',
  NOTICEVERSION  VARCHAR(20)   COMMENT 'The version of the privacy notice shown with it.',
  RECEIVEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  PAYLOAD        VARIANT       NOT NULL COMMENT 'The answers exactly as submitted. Personal data.',
  LEADID         VARCHAR(40)   COMMENT 'The lead (CRM.LEAD) it created or updated, set as it is stored.',
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_FORM_SUBMISSION PRIMARY KEY (SUBMISSIONID)
)
COMMENT = 'Every public form submission exactly as received, before it becomes or updates a lead. Add-only for the app; the retention rule (later) clears the payload of anonymised leads.';

-- ---------------------------------------------------------------------------
-- CRM: pipelines, stages, close reasons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.CRM.PIPELINE (
  PIPELINEID     VARCHAR(40)   NOT NULL COMMENT 'e.g. PL-ORG-T001-CANDIDATE.',
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  KIND           VARCHAR(20)   NOT NULL COMMENT 'candidate or employer: one of each per organisation.',
  NAME           VARCHAR(100)  NOT NULL,
  ISACTIVE       BOOLEAN       DEFAULT TRUE NOT NULL,
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_PIPELINE PRIMARY KEY (PIPELINEID)
)
COMMENT = 'One candidate and one employer pipeline per organisation. Read-only for the app; changed by hand-run SQL until stage setup screens exist.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.PIPELINE_STAGE (
  STAGEID        VARCHAR(60)   NOT NULL COMMENT 'e.g. ST-ORG-T001-CANDIDATE-NEW.',
  PIPELINEID     VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  NAME           VARCHAR(100)  NOT NULL COMMENT 'As shown, e.g. Initial assessment.',
  SORTORDER      NUMBER(38,0)  NOT NULL,
  CATEGORY       VARCHAR(10)   NOT NULL COMMENT 'open, won or lost.',
  SYSTEMKEY      VARCHAR(30)   COMMENT 'A fixed key the system moves records into (NEW, CONFIRMED, ASSESSMENT, ENROLLED, LOST; PROSPECT, PLACED, LOST). Null: moved only by people.',
  ISACTIVE       BOOLEAN       DEFAULT TRUE NOT NULL,
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_PIPELINE_STAGE PRIMARY KEY (STAGEID)
)
COMMENT = 'The stages of each pipeline, in order, each open, won or lost. Read-only for the app.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.CLOSE_REASON (
  REASONID       VARCHAR(60)   NOT NULL COMMENT 'e.g. CR-ORG-T001-CANDIDATE-COLLEGE.',
  PIPELINEID     VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  LABEL          VARCHAR(200)  NOT NULL,
  SORTORDER      NUMBER(38,0)  NOT NULL,
  ISACTIVE       BOOLEAN       DEFAULT TRUE NOT NULL,
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_CLOSE_REASON PRIMARY KEY (REASONID)
)
COMMENT = 'The picklist of reasons for Not proceeding, per pipeline. Read-only for the app.';

-- ---------------------------------------------------------------------------
-- CRM: leads (candidates) and what hangs off them
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.CRM.LEAD (
  LEADID            VARCHAR(40)   NOT NULL,
  ORGANISATIONID    VARCHAR(20)   NOT NULL,
  GIVENNAMES        VARCHAR(100),
  FAMILYNAME        VARCHAR(100),
  EMAIL             VARCHAR(254)  COMMENT 'With DATEOFBIRTH, one lead per person per organisation: the same email and date of birth updates the lead; a different date of birth (a family sharing an email) is a new lead.',
  DATEOFBIRTH       DATE,
  MOBILE            VARCHAR(20),
  POSTCODE          VARCHAR(8)    COMMENT 'Upper case, on the ONS postcode list (SHARED_DB.REF.POSTCODE).',
  TRAVELMILES       NUMBER(38,0)  COMMENT 'How far they''ll travel, in miles.',
  TRAVELMODES       ARRAY         COMMENT 'e.g. ["bus","walk"].',
  HOURSWANTED       VARCHAR(20)   COMMENT 'full_time or part_time.',
  CURRENTSITUATION  VARCHAR(40)   COMMENT 'school, college, working, not_working.',
  HASENGLISHLEVEL2  BOOLEAN,
  HASMATHSLEVEL2    BOOLEAN,
  SOURCE            VARCHAR(40)   COMMENT 'web_form, or how else it came in.',
  CREATEDAT         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  EMAILCONFIRMEDAT  TIMESTAMP_LTZ COMMENT 'When the confirmation link was used. Null: not confirmed.',
  LASTACTIVITYAT    TIMESTAMP_LTZ COMMENT 'The latest form, email, activity, task or stage move: the retention rule counts from here.',
  HANDEDOVERAT      TIMESTAMP_LTZ COMMENT 'When hand-over (flow F6) passed them to the learning side; from then the learning record''s retention applies.',
  LEARNREFNUMBER    VARCHAR(12)   COMMENT 'Their learner reference once enrolled (flow F7).',
  ANONYMISEDAT      TIMESTAMP_LTZ COMMENT 'When the retention rule cleared their name, email, phone, date of birth and postcode.',
  UPDATEDAT         TIMESTAMP_LTZ,
  UPDATEDBY         VARCHAR(40),
  ISTESTDATA        BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use. Never emailed.',
  CONSTRAINT PK_LEAD PRIMARY KEY (LEADID)
)
COMMENT = 'A candidate: a person, one per email and date of birth per organisation, from the public form (stage 1). Personal data: anonymised by the retention rule after a period with no activity, unless handed over.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.LEAD_INTEREST (
  INTERESTID     VARCHAR(40)   NOT NULL,
  LEADID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  TYPEDTEXT      VARCHAR(200)  COMMENT 'What they typed, e.g. sparky.',
  SOCTITLE       VARCHAR(200)  COMMENT 'The SOC 2020 index title it was matched to.',
  SOC2020        VARCHAR(4)    COMMENT 'SOC 2020 unit group (SHARED_DB.REF.SOC2020_UNIT_GROUP).',
  ADDEDAT        TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  REMOVEDAT      TIMESTAMP_LTZ COMMENT 'When they dropped it. Never deleted.',
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_LEAD_INTEREST PRIMARY KEY (INTERESTID)
)
COMMENT = 'The jobs or sectors a lead is interested in, coded to SOC 2020.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.LEAD_CONSENT (
  CONSENTID      VARCHAR(40)   NOT NULL,
  LEADID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  KIND           VARCHAR(40)   NOT NULL COMMENT 'privacy_notice, contact_email, contact_phone, marketing.',
  NOTICEVERSION  VARCHAR(20)   COMMENT 'The privacy notice version they saw.',
  GIVEN          BOOLEAN       NOT NULL COMMENT 'TRUE given, FALSE withdrawn or refused.',
  RECORDEDAT     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  SUBMISSIONID   VARCHAR(40)   COMMENT 'The form submission (BRONZE.FORM_SUBMISSION) it came with, if any.',
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_LEAD_CONSENT PRIMARY KEY (CONSENTID)
)
COMMENT = 'Every consent given or withdrawn, with the notice version. Add-only: a change is a new row; the latest per kind counts.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.CONFIRM_TOKEN (
  TOKENID        VARCHAR(40)   NOT NULL,
  LEADID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  TOKENHASH      VARCHAR(64)   NOT NULL COMMENT 'sha256 of the token in the link. The token itself is never stored.',
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  EXPIRESAT      TIMESTAMP_LTZ NOT NULL COMMENT '7 days after it was made.',
  USEDAT         TIMESTAMP_LTZ COMMENT 'When it was used (one use only). Null: not used.',
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_CONFIRM_TOKEN PRIMARY KEY (TOKENID)
)
COMMENT = 'One-time links that confirm a lead''s email (and nothing else: they don''t sign anyone in). Stored only as a hash.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.LEAD_MATCH (
  MATCHID           VARCHAR(40)   NOT NULL,
  LEADID            VARCHAR(40)   NOT NULL,
  ORGANISATIONID    VARCHAR(20)   NOT NULL,
  VACANCYREFERENCE  VARCHAR(20)   NOT NULL COMMENT 'The advert (SHARED_DB.EXT.VACANCY).',
  SCORE             NUMBER(5,2)   COMMENT 'How well it fits, 0 to 100.',
  REASONS           VARIANT       COMMENT 'Why: interests, distance band, hours, English and maths.',
  EXCLUDEDREASON    VARCHAR(200)  COMMENT 'Set when an age rule rules it out: still shown, with this reason.',
  MATCHEDAT         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  SHOWNTOLEADAT     TIMESTAMP_LTZ COMMENT 'When it was shown on their confirmation page.',
  ISTESTDATA        BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_LEAD_MATCH PRIMARY KEY (MATCHID)
)
COMMENT = 'Adverts matched to a lead. Worded as current adverts to the lead, never an offer; staff see all of them.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.EMAIL_MESSAGE (
  MESSAGEID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID    VARCHAR(20)   NOT NULL,
  RECORDTYPE        VARCHAR(20)   COMMENT 'lead or contact.',
  RECORDID          VARCHAR(40),
  TOADDRESS         VARCHAR(254)  NOT NULL,
  TEMPLATE          VARCHAR(60)   NOT NULL COMMENT 'e.g. confirm_email.',
  SUBJECT           VARCHAR(300),
  MODE              VARCHAR(10)   NOT NULL COMMENT 'outbox (written to the local outbox, never sent) or send.',
  STATUS            VARCHAR(20)   NOT NULL COMMENT 'outbox, queued, sent, failed or bounced. Test data and @example.com addresses are always outbox.',
  PROVIDERMESSAGEID VARCHAR(200),
  CREATEDAT         TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  SENTAT            TIMESTAMP_LTZ,
  ERROR             VARCHAR(1000),
  ISTESTDATA        BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data. Never sent: checks prove no test email is logged as sent.',
  CONSTRAINT PK_EMAIL_MESSAGE PRIMARY KEY (MESSAGEID)
)
COMMENT = 'The email log: every email the CRM wrote, whether to the outbox or sent.';

-- ---------------------------------------------------------------------------
-- CRM: employers (prospects) and contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.CRM.EMPLOYER (
  EMPLOYERID          VARCHAR(40)   NOT NULL,
  ORGANISATIONID      VARCHAR(20)   NOT NULL,
  NAME                VARCHAR(200)  NOT NULL,
  COMPANYNUMBER       VARCHAR(8)    COMMENT 'Companies House number.',
  NOTONCOMPANIESHOUSE BOOLEAN       DEFAULT FALSE NOT NULL,
  COMPANYDETAILS      VARIANT       COMMENT 'The CRM''s own copy of the company profile (name, status, SIC codes, registered office), refreshed from Companies House, never from Warren.',
  COMPANYCHECKEDAT    TIMESTAMP_LTZ,
  COMPANYRESPONSEID   VARCHAR(40)   COMMENT 'The SHARED_DB.RAW.CH_COMPANY_PROFILE response it came from.',
  WEBSITE             VARCHAR(300),
  WARRENEMPLOYERID    VARCHAR(20)   COMMENT 'Set when it becomes a client (flow F8): the Warren employer. From then Warren owns its operational details.',
  BECAMECLIENTAT      TIMESTAMP_LTZ,
  ISACTIVE            BOOLEAN       DEFAULT TRUE NOT NULL,
  CREATEDAT           TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY           VARCHAR(40),
  UPDATEDAT           TIMESTAMP_LTZ,
  UPDATEDBY           VARCHAR(40),
  ISTESTDATA          BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_EMPLOYER PRIMARY KEY (EMPLOYERID)
)
COMMENT = 'Employers in the CRM: prospects (only here) and, after F8, clients linked to their Warren employer. Never deleted.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.EMPLOYER_SITE (
  SITEID         VARCHAR(40)   NOT NULL,
  EMPLOYERID     VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  NAME           VARCHAR(200)  NOT NULL,
  ADDRESSLINE1   VARCHAR(100),
  ADDRESSLINE2   VARCHAR(100),
  TOWN           VARCHAR(100),
  POSTCODE       VARCHAR(8)    COMMENT 'Upper case, on the ONS postcode list.',
  ISACTIVE       BOOLEAN       DEFAULT TRUE NOT NULL,
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY      VARCHAR(40),
  UPDATEDAT      TIMESTAMP_LTZ,
  UPDATEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_EMPLOYER_SITE PRIMARY KEY (SITEID)
)
COMMENT = 'A prospect''s addresses. F8 copies the ones chosen into Warren when it becomes a client.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.CONTACT (
  CONTACTID              VARCHAR(40)   NOT NULL,
  EMPLOYERID             VARCHAR(40)   NOT NULL,
  ORGANISATIONID         VARCHAR(20)   NOT NULL,
  NAME                   VARCHAR(200)  NOT NULL,
  JOBTITLE               VARCHAR(200),
  EMAIL                  VARCHAR(254),
  PHONE                  VARCHAR(30),
  SALESROLE              VARCHAR(40)   COMMENT 'decision_maker, finance, hr, line_manager or other.',
  PREFERREDCONTACTMETHOD VARCHAR(20)   COMMENT 'email, phone or post.',
  MARKETINGCONSENT       BOOLEAN       DEFAULT FALSE NOT NULL,
  MARKETINGCONSENTAT     TIMESTAMP_LTZ,
  WARRENCONTACTID        VARCHAR(20)   COMMENT 'The same person''s Warren contact (ILR.EMPLOYER_CONTACT), by ID only: never merged, so neither side overwrites the other.',
  ISCURRENT              BOOLEAN       DEFAULT TRUE NOT NULL,
  CREATEDAT              TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY              VARCHAR(40),
  UPDATEDAT              TIMESTAMP_LTZ,
  UPDATEDBY              VARCHAR(40),
  ISTESTDATA             BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_CONTACT PRIMARY KEY (CONTACTID)
)
COMMENT = 'People at employers, for sales: decision makers, finance and others, with their marketing consent and preferred contact method.';

-- ---------------------------------------------------------------------------
-- CRM: journeys, stage history, placements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.CRM.PIPELINE_ITEM (
  ITEMID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  PIPELINEID     VARCHAR(40)   NOT NULL,
  RECORDTYPE     VARCHAR(20)   NOT NULL COMMENT 'lead or employer.',
  RECORDID       VARCHAR(40)   NOT NULL COMMENT 'CRM.LEAD or CRM.EMPLOYER.',
  STAGEID        VARCHAR(60)   NOT NULL COMMENT 'The current stage.',
  OWNERUSERID    VARCHAR(20)   COMMENT 'Who''s handling it (SHARED_DB.ACCESS.APP_USER).',
  TITLE          VARCHAR(200)  COMMENT 'For employer journeys, e.g. Care apprentices, spring 2027.',
  OPENEDAT       TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  OPENEDBY       VARCHAR(40),
  CLOSEDAT       TIMESTAMP_LTZ COMMENT 'Set on reaching a won or lost stage.',
  CLOSEREASONID  VARCHAR(60)   COMMENT 'For a lost journey (CRM.CLOSE_REASON).',
  STAGECHANGEDAT TIMESTAMP_LTZ,
  UPDATEDAT      TIMESTAMP_LTZ,
  UPDATEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_PIPELINE_ITEM PRIMARY KEY (ITEMID)
)
COMMENT = 'One journey of a lead or an employer through a pipeline. A lead can have several journeys over time, one open at a time.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.STAGE_CHANGE (
  CHANGEID       VARCHAR(40)   NOT NULL,
  ITEMID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  FROMSTAGEID    VARCHAR(60)   COMMENT 'Null for the first stage.',
  TOSTAGEID      VARCHAR(60)   NOT NULL,
  CHANGEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CHANGEDBY      VARCHAR(40)   COMMENT 'A user ID, or web-form, system:email-confirmed and the like for automatic moves.',
  REASONID       VARCHAR(60)   COMMENT 'For a move to Not proceeding.',
  NOTE           VARCHAR(1000),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_STAGE_CHANGE PRIMARY KEY (CHANGEID)
)
COMMENT = 'Every stage move: from, to, when, who, why. Add-only: never edited.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.PLACEMENT (
  PLACEMENTID       VARCHAR(40)   NOT NULL,
  ORGANISATIONID    VARCHAR(20)   NOT NULL,
  LEADID            VARCHAR(40)   NOT NULL,
  CANDIDATEITEMID   VARCHAR(40)   COMMENT 'The lead''s journey (CRM.PIPELINE_ITEM).',
  EMPLOYERID        VARCHAR(40)   NOT NULL COMMENT 'CRM.EMPLOYER.',
  EMPLOYERITEMID    VARCHAR(40)   COMMENT 'The employer''s journey.',
  VACANCYREFERENCE  VARCHAR(20)   COMMENT 'The advert, if there is one (SHARED_DB.EXT.VACANCY).',
  STANDARDCODE      NUMBER(38,0)  COMMENT 'The apprenticeship standard (LARS).',
  STATUS            VARCHAR(20)   NOT NULL COMMENT 'put_forward, interviewing, offered, accepted, declined, withdrawn or enrolled.',
  PUTFORWARDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  PUTFORWARDBY      VARCHAR(40),
  STATUSCHANGEDAT   TIMESTAMP_LTZ,
  OUTCOMEREASONID   VARCHAR(60)   COMMENT 'Why it ended, for declined or withdrawn.',
  UPDATEDAT         TIMESTAMP_LTZ,
  UPDATEDBY         VARCHAR(40),
  ISTESTDATA        BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_PLACEMENT PRIMARY KEY (PLACEMENTID)
)
COMMENT = 'A lead put forward to an employer (and advert): where the two pipelines meet. A lead can be put forward to several at once; their stage shows the furthest.';

-- ---------------------------------------------------------------------------
-- CRM: activities, tasks, field history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.CRM.ACTIVITY (
  ACTIVITYID     VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  KIND           VARCHAR(20)   NOT NULL COMMENT 'call, email, note or meeting.',
  SUBJECT        VARCHAR(300),
  BODY           VARCHAR(10000),
  OCCURREDAT     TIMESTAMP_LTZ NOT NULL,
  BYUSERID       VARCHAR(20),
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  REMOVEDAT      TIMESTAMP_LTZ COMMENT 'Entered in error: marked, never deleted.',
  REMOVEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_ACTIVITY PRIMARY KEY (ACTIVITYID)
)
COMMENT = 'Calls, emails, notes and meetings, linked to any CRM records at once (CRM.ACTIVITY_LINK).';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.ACTIVITY_LINK (
  ACTIVITYID     VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  RECORDTYPE     VARCHAR(20)   NOT NULL COMMENT 'lead, employer, contact, item or placement.',
  RECORDID       VARCHAR(40)   NOT NULL,
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_ACTIVITY_LINK PRIMARY KEY (ACTIVITYID, RECORDTYPE, RECORDID)
)
COMMENT = 'Which records an activity is about. Add-only.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.TASK (
  TASKID         VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  TITLE          VARCHAR(300)  NOT NULL,
  DETAILS        VARCHAR(4000),
  DUEDATE        DATE,
  OWNERUSERID    VARCHAR(20)   NOT NULL COMMENT 'Whose My day it shows on (SHARED_DB.ACCESS.APP_USER).',
  RECORDTYPE     VARCHAR(20)   COMMENT 'lead, employer, contact, item or placement.',
  RECORDID       VARCHAR(40),
  STATUS         VARCHAR(20)   DEFAULT 'open' NOT NULL COMMENT 'open, done or cancelled.',
  DONEAT         TIMESTAMP_LTZ,
  DONEBY         VARCHAR(40),
  CREATEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CREATEDBY      VARCHAR(40),
  UPDATEDAT      TIMESTAMP_LTZ,
  UPDATEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_TASK PRIMARY KEY (TASKID)
)
COMMENT = 'Follow-ups with a due date and an owner, shown on the owner''s My day (flow F12). Never deleted: cancelled instead.';

CREATE TABLE IF NOT EXISTS CRM_DB.CRM.RECORD_CHANGE (
  CHANGEID       VARCHAR(40)   NOT NULL,
  ORGANISATIONID VARCHAR(20)   NOT NULL,
  RECORDTYPE     VARCHAR(20)   NOT NULL COMMENT 'lead, employer, site, contact, item, placement or task.',
  RECORDID       VARCHAR(40)   NOT NULL,
  FIELD          VARCHAR(100)  NOT NULL,
  OLDVALUE       VARCHAR,
  NEWVALUE       VARCHAR,
  CHANGEDAT      TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  CHANGEDBY      VARCHAR(40),
  ISTESTDATA     BOOLEAN       DEFAULT FALSE NOT NULL COMMENT 'TRUE for dummy data, so it can all be found and removed before real use.',
  CONSTRAINT PK_RECORD_CHANGE PRIMARY KEY (CHANGEID)
)
COMMENT = 'Field history: every change to a CRM record''s fields, old and new. Add-only. (1a''s CHANGE table, named like ILR.RECORD_CHANGE.)';

-- ---------------------------------------------------------------------------
-- SHARED_DB: the flow log and the flow schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS SHARED_DB.FLOW
  COMMENT = 'The flow procedures that move records between CAPTURE_DB and CRM_DB, owned by FLOW_OWNER (owner''s rights), each call logged in OPS.FLOW_RUN. Empty until the flows are built.';

CREATE TABLE IF NOT EXISTS SHARED_DB.OPS.FLOW_RUN (
  FLOWRUNID   VARCHAR(36)   NOT NULL,
  FLOW        VARCHAR(40)   NOT NULL COMMENT 'F5 client employers, F6 hand-over, F7 onboarding status, F8 won employer, F10 vacancy links, retention.',
  TRIGGEREDBY VARCHAR(10)   NOT NULL COMMENT 'event, schedule or manual.',
  BYUSERID    VARCHAR(20)   COMMENT 'The signed-in user who caused it, for an event.',
  STARTEDAT   TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP() NOT NULL,
  FINISHEDAT  TIMESTAMP_LTZ,
  OUTCOME     VARCHAR(20)   COMMENT 'succeeded, refused or failed. Null while running.',
  RECORDIDS   VARIANT       COMMENT 'The record IDs it was called with or moved. IDs only.',
  COUNTS      VARIANT       COMMENT 'What it did, as counts.',
  ERROR       VARCHAR(1000) COMMENT 'Why it was refused or failed.',
  JOBRUNID    VARCHAR(36)   COMMENT 'The OPS.JOB_RUN row, for scheduled flows.',
  CONSTRAINT PK_FLOW_RUN PRIMARY KEY (FLOWRUNID)
)
COMMENT = 'One row per call of a flow procedure, refused or not. No personal data: IDs and counts only.';

-- ---------------------------------------------------------------------------
-- Default pipelines, stages and close reasons, for every organisation in
-- SHARED_DB.ACCESS.ORGANISATION (test organisations get test rows). An
-- organisation added later gets its defaults the same way, by hand-run SQL,
-- until stage setup screens exist.
-- ---------------------------------------------------------------------------
INSERT INTO CRM_DB.CRM.PIPELINE (PIPELINEID, ORGANISATIONID, KIND, NAME, CREATEDBY, ISTESTDATA)
SELECT 'PL-' || o.ORGANISATIONID || '-' || UPPER(k.KIND), o.ORGANISATIONID, k.KIND, k.NAME, 'setup', o.ISTESTDATA
FROM SHARED_DB.ACCESS.ORGANISATION o
CROSS JOIN (SELECT 'candidate' AS KIND, 'Candidates' AS NAME UNION ALL SELECT 'employer', 'Employers') k
WHERE 'PL-' || o.ORGANISATIONID || '-' || UPPER(k.KIND) NOT IN (SELECT PIPELINEID FROM CRM_DB.CRM.PIPELINE);

INSERT INTO CRM_DB.CRM.PIPELINE_STAGE (STAGEID, PIPELINEID, ORGANISATIONID, NAME, SORTORDER, CATEGORY, SYSTEMKEY, CREATEDBY, ISTESTDATA)
SELECT 'ST-' || o.ORGANISATIONID || '-' || UPPER(s.KIND) || '-' || s.STAGEKEY, 'PL-' || o.ORGANISATIONID || '-' || UPPER(s.KIND),
       o.ORGANISATIONID, s.NAME, s.SORTORDER, s.CATEGORY, s.SYSTEMKEY, 'setup', o.ISTESTDATA
FROM SHARED_DB.ACCESS.ORGANISATION o
CROSS JOIN (SELECT * FROM VALUES
  ('candidate', 'NEW', 'New', 1, 'open', 'NEW'),
  ('candidate', 'CONFIRMED', 'Confirmed', 2, 'open', 'CONFIRMED'),
  ('candidate', 'CONTACTED', 'Contacted', 3, 'open', NULL),
  ('candidate', 'MATCHED', 'Matched', 4, 'open', NULL),
  ('candidate', 'INTERVIEWING', 'Interviewing', 5, 'open', NULL),
  ('candidate', 'OFFERED', 'Offered', 6, 'open', NULL),
  ('candidate', 'ASSESSMENT', 'Initial assessment', 7, 'open', 'ASSESSMENT'),
  ('candidate', 'ENROLLED', 'Enrolled', 8, 'won', 'ENROLLED'),
  ('candidate', 'LOST', 'Not proceeding', 9, 'lost', 'LOST'),
  ('employer', 'PROSPECT', 'Prospect', 1, 'open', 'PROSPECT'),
  ('employer', 'CONTACTED', 'Contacted', 2, 'open', NULL),
  ('employer', 'MEETING', 'Meeting', 3, 'open', NULL),
  ('employer', 'AGREED', 'Vacancy agreed', 4, 'open', NULL),
  ('employer', 'PLACED', 'Apprentice placed', 5, 'won', 'PLACED'),
  ('employer', 'LOST', 'Not proceeding', 6, 'lost', 'LOST')
  AS x (KIND, STAGEKEY, NAME, SORTORDER, CATEGORY, SYSTEMKEY)) s
WHERE 'ST-' || o.ORGANISATIONID || '-' || UPPER(s.KIND) || '-' || s.STAGEKEY NOT IN (SELECT STAGEID FROM CRM_DB.CRM.PIPELINE_STAGE);

INSERT INTO CRM_DB.CRM.CLOSE_REASON (REASONID, PIPELINEID, ORGANISATIONID, LABEL, SORTORDER, CREATEDBY, ISTESTDATA)
SELECT 'CR-' || o.ORGANISATIONID || '-' || UPPER(r.KIND) || '-' || r.REASONKEY, 'PL-' || o.ORGANISATIONID || '-' || UPPER(r.KIND),
       o.ORGANISATIONID, r.LABEL, r.SORTORDER, 'setup', o.ISTESTDATA
FROM SHARED_DB.ACCESS.ORGANISATION o
CROSS JOIN (SELECT * FROM VALUES
  ('candidate', 'COLLEGE', 'Chose college or sixth form', 1),
  ('candidate', 'OTHER_JOB', 'Found other work', 2),
  ('candidate', 'NOT_ELIGIBLE', 'Not eligible', 3),
  ('candidate', 'NO_RESPONSE', 'No response', 4),
  ('candidate', 'CHANGED_MIND', 'Changed their mind', 5),
  ('employer', 'NOT_NOW', 'Not the right time', 6),
  ('employer', 'OTHER_PROVIDER', 'Chose another provider', 7),
  ('employer', 'NO_ROLE', 'No suitable role', 8),
  ('employer', 'NO_RESPONSE', 'No response', 9)
  AS x (KIND, REASONKEY, LABEL, SORTORDER)) r
WHERE 'CR-' || o.ORGANISATIONID || '-' || UPPER(r.KIND) || '-' || r.REASONKEY NOT IN (SELECT REASONID FROM CRM_DB.CRM.CLOSE_REASON);

-- ---------------------------------------------------------------------------
-- Test data (ISTESTDATA = TRUE): fictional leads (example.com, 07700 900xxx),
-- three prospect employers in ORG-T001 and one in ORG-T002, their journeys,
-- stage history, placements, activities, tasks, matches to real current
-- adverts, consents, confirmation tokens (hashes of made-up tokens) and the
-- email log (outbox only). Safe to run twice: rows already there are
-- skipped. Owners are the test managers (USR-T0008, USR-T0009, USR-T0011).
-- ---------------------------------------------------------------------------

INSERT INTO CRM_DB.BRONZE.FORM_SUBMISSION (SUBMISSIONID, ORGANISATIONID, FORM, FORMVERSION, NOTICEVERSION, RECEIVEDAT, PAYLOAD, LEADID, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'FS-T001' AS SUBMISSIONID, 'ORG-T001' AS ORGANISATIONID, 'interest' AS FORM, 'TEST-1' AS FORMVERSION, 'TEST-1' AS NOTICEVERSION, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS RECEIVEDAT, PARSE_JSON('{"givenNames": "Jordan", "familyName": "Testlead-One", "email": "jordan.testlead1@example.com", "dateOfBirth": "2010-03-14", "mobile": "07700900001", "postcode": "S10 2TN", "travelMiles": 10, "travelModes": ["bus", "walk"], "hoursWanted": "full_time", "currentSituation": "school", "englishLevel2": true, "mathsLevel2": true, "interests": ["sports"], "consents": {"privacyNotice": true, "contactEmail": true}}') AS PAYLOAD, 'LEAD-T001' AS LEADID
  UNION ALL
  SELECT 'FS-T002', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Sam", "familyName": "Testlead-Two", "email": "sam.testlead2@example.com", "dateOfBirth": "2008-07-02", "mobile": "07700900002", "postcode": "S6 3AA", "travelMiles": 15, "travelModes": ["bus", "train"], "hoursWanted": "full_time", "currentSituation": "not_working", "englishLevel2": true, "mathsLevel2": false, "interests": ["care"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T002'
  UNION ALL
  SELECT 'FS-T003', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Priya", "familyName": "Testlead-Three", "email": "priya.testlead3@example.com", "dateOfBirth": "2001-11-20", "mobile": "07700900003", "postcode": "S1 2HE", "travelMiles": 20, "travelModes": ["drives"], "hoursWanted": "full_time", "currentSituation": "working", "englishLevel2": true, "mathsLevel2": true, "interests": ["computers"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T003'
  UNION ALL
  SELECT 'FS-T004', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Ash", "familyName": "Testfamily", "email": "family.testlead@example.com", "dateOfBirth": "2010-09-01", "mobile": "07700900004", "postcode": "S11 8YA", "travelMiles": 5, "travelModes": ["walk", "bus"], "hoursWanted": "full_time", "currentSituation": "school", "englishLevel2": false, "mathsLevel2": false, "interests": ["animals"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T004'
  UNION ALL
  SELECT 'FS-T005', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Bea", "familyName": "Testfamily", "email": "family.testlead@example.com", "dateOfBirth": "2011-10-01", "mobile": "07700900004", "postcode": "S11 8YA", "travelMiles": 5, "travelModes": ["walk", "bus"], "hoursWanted": "full_time", "currentSituation": "school", "englishLevel2": false, "mathsLevel2": false, "interests": ["office"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T005'
  UNION ALL
  SELECT 'FS-T006', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Chris", "familyName": "Testlead-Six", "email": "chris.testlead6@example.com", "dateOfBirth": "1998-05-05", "mobile": "07700900006", "postcode": "S35 2YH", "travelMiles": 25, "travelModes": ["drives"], "hoursWanted": "full_time", "currentSituation": "working", "englishLevel2": true, "mathsLevel2": true, "interests": ["cars"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T006'
  UNION ALL
  SELECT 'FS-T007', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Morgan", "familyName": "Testlead-Seven", "email": "morgan.testlead7@example.com", "dateOfBirth": "2007-01-10", "mobile": "07700900007", "postcode": "S2 4SU", "travelMiles": 10, "travelModes": ["bus"], "hoursWanted": "part_time", "currentSituation": "college", "englishLevel2": true, "mathsLevel2": true, "interests": ["animals"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T007'
  UNION ALL
  SELECT 'FS-T008', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Casey", "familyName": "Testlead-Eight", "email": "casey.testlead8@example.com", "dateOfBirth": "2009-12-12", "mobile": "07700900008", "postcode": "S10 5AA", "travelMiles": 10, "travelModes": ["bus", "walk"], "hoursWanted": "full_time", "currentSituation": "school", "englishLevel2": true, "mathsLevel2": true, "interests": ["office"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T008'
  UNION ALL
  SELECT 'FS-T009', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Jamie", "familyName": "Testlead-Nine", "email": "jamie.testlead9@example.com", "dateOfBirth": "2006-06-30", "mobile": "07700900009", "postcode": "S6 3AA", "travelMiles": 15, "travelModes": ["bus"], "hoursWanted": "full_time", "currentSituation": "not_working", "englishLevel2": false, "mathsLevel2": true, "interests": ["care"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T009'
  UNION ALL
  SELECT 'FS-T010', 'ORG-T001', 'interest', 'TEST-1', 'TEST-1', '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Drew", "familyName": "Testlead-Ten", "email": "drew.testlead10@example.com", "dateOfBirth": "2005-02-02", "mobile": "07700900010", "postcode": "S1 2HE", "travelMiles": 30, "travelModes": ["drives", "train"], "hoursWanted": "full_time", "currentSituation": "working", "englishLevel2": true, "mathsLevel2": true, "interests": ["football"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T010'
  UNION ALL
  SELECT 'FS-T011', 'ORG-T002', 'interest', 'TEST-1', 'TEST-1', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Ellis", "familyName": "Testlead-Eleven", "email": "ellis.testlead11@example.com", "dateOfBirth": "2009-04-04", "mobile": "07700900011", "postcode": "LS1 4DY", "travelMiles": 10, "travelModes": ["bus"], "hoursWanted": "full_time", "currentSituation": "school", "englishLevel2": true, "mathsLevel2": true, "interests": ["care"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T011'
  UNION ALL
  SELECT 'FS-T012', 'ORG-T002', 'interest', 'TEST-1', 'TEST-1', '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ, PARSE_JSON('{"givenNames": "Robin", "familyName": "Testlead-Twelve", "email": "robin.testlead12@example.com", "dateOfBirth": "2004-08-08", "mobile": "07700900012", "postcode": "LS1 4DY", "travelMiles": 20, "travelModes": ["train"], "hoursWanted": "full_time", "currentSituation": "not_working", "englishLevel2": true, "mathsLevel2": true, "interests": ["IT"], "consents": {"privacyNotice": true, "contactEmail": true}}'), 'LEAD-T012'
) v
WHERE v.SUBMISSIONID NOT IN (SELECT SUBMISSIONID FROM CRM_DB.BRONZE.FORM_SUBMISSION);

INSERT INTO CRM_DB.CRM.LEAD (LEADID, ORGANISATIONID, GIVENNAMES, FAMILYNAME, EMAIL, DATEOFBIRTH, MOBILE, POSTCODE, TRAVELMILES, TRAVELMODES, HOURSWANTED, CURRENTSITUATION, HASENGLISHLEVEL2, HASMATHSLEVEL2, SOURCE, CREATEDAT, EMAILCONFIRMEDAT, LASTACTIVITYAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'LEAD-T001' AS LEADID, 'ORG-T001' AS ORGANISATIONID, 'Jordan' AS GIVENNAMES, 'Testlead-One' AS FAMILYNAME, 'jordan.testlead1@example.com' AS EMAIL, '2010-03-14'::DATE AS DATEOFBIRTH, '07700900001' AS MOBILE, 'S10 2TN' AS POSTCODE, 10 AS TRAVELMILES, PARSE_JSON('["bus", "walk"]')::ARRAY AS TRAVELMODES, 'full_time' AS HOURSWANTED, 'school' AS CURRENTSITUATION, TRUE AS HASENGLISHLEVEL2, TRUE AS HASMATHSLEVEL2, 'web_form' AS SOURCE, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT, '2026-09-01 11:00:00 +01:00'::TIMESTAMP_LTZ AS EMAILCONFIRMEDAT, '2026-09-02 12:00:00 +01:00'::TIMESTAMP_LTZ AS LASTACTIVITYAT
  UNION ALL
  SELECT 'LEAD-T002', 'ORG-T001', 'Sam', 'Testlead-Two', 'sam.testlead2@example.com', '2008-07-02'::DATE, '07700900002', 'S6 3AA', 15, PARSE_JSON('["bus", "train"]')::ARRAY, 'full_time', 'not_working', TRUE, FALSE, 'web_form', '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-03 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T003', 'ORG-T001', 'Priya', 'Testlead-Three', 'priya.testlead3@example.com', '2001-11-20'::DATE, '07700900003', 'S1 2HE', 20, PARSE_JSON('["drives"]')::ARRAY, 'full_time', 'working', TRUE, TRUE, 'web_form', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-05 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T004', 'ORG-T001', 'Ash', 'Testfamily', 'family.testlead@example.com', '2010-09-01'::DATE, '07700900004', 'S11 8YA', 5, PARSE_JSON('["walk", "bus"]')::ARRAY, 'full_time', 'school', FALSE, FALSE, 'web_form', '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-07 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T005', 'ORG-T001', 'Bea', 'Testfamily', 'family.testlead@example.com', '2011-10-01'::DATE, '07700900004', 'S11 8YA', 5, PARSE_JSON('["walk", "bus"]')::ARRAY, 'full_time', 'school', FALSE, FALSE, 'web_form', '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ, NULL, '2026-09-09 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T006', 'ORG-T001', 'Chris', 'Testlead-Six', 'chris.testlead6@example.com', '1998-05-05'::DATE, '07700900006', 'S35 2YH', 25, PARSE_JSON('["drives"]')::ARRAY, 'full_time', 'working', TRUE, TRUE, 'web_form', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-11 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-15 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T007', 'ORG-T001', 'Morgan', 'Testlead-Seven', 'morgan.testlead7@example.com', '2007-01-10'::DATE, '07700900007', 'S2 4SU', 10, PARSE_JSON('["bus"]')::ARRAY, 'part_time', 'college', TRUE, TRUE, 'web_form', '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-13 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-16 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T008', 'ORG-T001', 'Casey', 'Testlead-Eight', 'casey.testlead8@example.com', '2009-12-12'::DATE, '07700900008', 'S10 5AA', 10, PARSE_JSON('["bus", "walk"]')::ARRAY, 'full_time', 'school', TRUE, TRUE, 'web_form', '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-15 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-20 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T009', 'ORG-T001', 'Jamie', 'Testlead-Nine', 'jamie.testlead9@example.com', '2006-06-30'::DATE, '07700900009', 'S6 3AA', 15, PARSE_JSON('["bus"]')::ARRAY, 'full_time', 'not_working', FALSE, TRUE, 'web_form', '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-17 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-23 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T010', 'ORG-T001', 'Drew', 'Testlead-Ten', 'drew.testlead10@example.com', '2005-02-02'::DATE, '07700900010', 'S1 2HE', 30, PARSE_JSON('["drives", "train"]')::ARRAY, 'full_time', 'working', TRUE, TRUE, 'web_form', '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, NULL, '2026-09-19 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T011', 'ORG-T002', 'Ellis', 'Testlead-Eleven', 'ellis.testlead11@example.com', '2009-04-04'::DATE, '07700900011', 'LS1 4DY', 10, PARSE_JSON('["bus"]')::ARRAY, 'full_time', 'school', TRUE, TRUE, 'web_form', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-21 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-22 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LEAD-T012', 'ORG-T002', 'Robin', 'Testlead-Twelve', 'robin.testlead12@example.com', '2004-08-08'::DATE, '07700900012', 'LS1 4DY', 20, PARSE_JSON('["train"]')::ARRAY, 'full_time', 'not_working', TRUE, TRUE, 'web_form', '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ, NULL, '2026-09-23 12:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.LEADID NOT IN (SELECT LEADID FROM CRM_DB.CRM.LEAD);

INSERT INTO CRM_DB.CRM.LEAD_INTEREST (INTERESTID, LEADID, ORGANISATIONID, TYPEDTEXT, SOCTITLE, SOC2020, ADDEDAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'LI-T001-1' AS INTERESTID, 'LEAD-T001' AS LEADID, 'ORG-T001' AS ORGANISATIONID, 'sports' AS TYPEDTEXT, 'Sports coaches, instructors and officials' AS SOCTITLE, '3432' AS SOC2020, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS ADDEDAT
  UNION ALL
  SELECT 'LI-T002-1', 'LEAD-T002', 'ORG-T001', 'care', 'Care workers and home carers', '6135', '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T003-1', 'LEAD-T003', 'ORG-T001', 'computers', 'IT user support technicians', '3132', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T004-1', 'LEAD-T004', 'ORG-T001', 'animals', 'Animal care services occupations n.e.c.', '6129', '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T005-1', 'LEAD-T005', 'ORG-T001', 'office', 'Other administrative occupations n.e.c.', '4159', '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T006-1', 'LEAD-T006', 'ORG-T001', 'cars', 'Vehicle technicians, mechanics and electricians', '5231', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T007-1', 'LEAD-T007', 'ORG-T001', 'animals', 'Animal care services occupations n.e.c.', '6129', '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T008-1', 'LEAD-T008', 'ORG-T001', 'office', 'Other administrative occupations n.e.c.', '4159', '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T009-1', 'LEAD-T009', 'ORG-T001', 'care', 'Care workers and home carers', '6135', '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T010-1', 'LEAD-T010', 'ORG-T001', 'football', 'Sports coaches, instructors and officials', '3432', '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T011-1', 'LEAD-T011', 'ORG-T002', 'care', 'Care workers and home carers', '6135', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LI-T012-1', 'LEAD-T012', 'ORG-T002', 'IT', 'IT user support technicians', '3132', '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.INTERESTID NOT IN (SELECT INTERESTID FROM CRM_DB.CRM.LEAD_INTEREST);

INSERT INTO CRM_DB.CRM.LEAD_CONSENT (CONSENTID, LEADID, ORGANISATIONID, KIND, NOTICEVERSION, GIVEN, RECORDEDAT, SUBMISSIONID, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'LC-T001-PRIVACY' AS CONSENTID, 'LEAD-T001' AS LEADID, 'ORG-T001' AS ORGANISATIONID, 'privacy_notice' AS KIND, 'TEST-1' AS NOTICEVERSION, TRUE AS GIVEN, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS RECORDEDAT, 'FS-T001' AS SUBMISSIONID
  UNION ALL
  SELECT 'LC-T001-EMAIL', 'LEAD-T001', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T001'
  UNION ALL
  SELECT 'LC-T002-PRIVACY', 'LEAD-T002', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T002'
  UNION ALL
  SELECT 'LC-T002-EMAIL', 'LEAD-T002', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T002'
  UNION ALL
  SELECT 'LC-T003-PRIVACY', 'LEAD-T003', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T003'
  UNION ALL
  SELECT 'LC-T003-EMAIL', 'LEAD-T003', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T003'
  UNION ALL
  SELECT 'LC-T004-PRIVACY', 'LEAD-T004', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T004'
  UNION ALL
  SELECT 'LC-T004-EMAIL', 'LEAD-T004', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T004'
  UNION ALL
  SELECT 'LC-T005-PRIVACY', 'LEAD-T005', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T005'
  UNION ALL
  SELECT 'LC-T005-EMAIL', 'LEAD-T005', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T005'
  UNION ALL
  SELECT 'LC-T006-PRIVACY', 'LEAD-T006', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T006'
  UNION ALL
  SELECT 'LC-T006-EMAIL', 'LEAD-T006', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T006'
  UNION ALL
  SELECT 'LC-T007-PRIVACY', 'LEAD-T007', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T007'
  UNION ALL
  SELECT 'LC-T007-EMAIL', 'LEAD-T007', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T007'
  UNION ALL
  SELECT 'LC-T008-PRIVACY', 'LEAD-T008', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T008'
  UNION ALL
  SELECT 'LC-T008-EMAIL', 'LEAD-T008', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T008'
  UNION ALL
  SELECT 'LC-T009-PRIVACY', 'LEAD-T009', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T009'
  UNION ALL
  SELECT 'LC-T009-EMAIL', 'LEAD-T009', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T009'
  UNION ALL
  SELECT 'LC-T010-PRIVACY', 'LEAD-T010', 'ORG-T001', 'privacy_notice', 'TEST-1', TRUE, '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T010'
  UNION ALL
  SELECT 'LC-T010-EMAIL', 'LEAD-T010', 'ORG-T001', 'contact_email', 'TEST-1', TRUE, '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T010'
  UNION ALL
  SELECT 'LC-T011-PRIVACY', 'LEAD-T011', 'ORG-T002', 'privacy_notice', 'TEST-1', TRUE, '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T011'
  UNION ALL
  SELECT 'LC-T011-EMAIL', 'LEAD-T011', 'ORG-T002', 'contact_email', 'TEST-1', TRUE, '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T011'
  UNION ALL
  SELECT 'LC-T012-PRIVACY', 'LEAD-T012', 'ORG-T002', 'privacy_notice', 'TEST-1', TRUE, '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T012'
  UNION ALL
  SELECT 'LC-T012-EMAIL', 'LEAD-T012', 'ORG-T002', 'contact_email', 'TEST-1', TRUE, '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ, 'FS-T012'
) v
WHERE v.CONSENTID NOT IN (SELECT CONSENTID FROM CRM_DB.CRM.LEAD_CONSENT);

INSERT INTO CRM_DB.CRM.CONFIRM_TOKEN (TOKENID, LEADID, ORGANISATIONID, TOKENHASH, CREATEDAT, EXPIRESAT, USEDAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'CT-T001' AS TOKENID, 'LEAD-T001' AS LEADID, 'ORG-T001' AS ORGANISATIONID, 'e56027c0d57759c41ebf3cea8cf58f4763f5e92c26af4f7fac8cf3aa9f3f8ebc' AS TOKENHASH, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT, DATEADD(day, 7, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ) AS EXPIRESAT, '2026-09-01 11:00:00 +01:00'::TIMESTAMP_LTZ AS USEDAT
  UNION ALL
  SELECT 'CT-T002', 'LEAD-T002', 'ORG-T001', '36d74f29d3c6e267e4e677c88b376ff9d2cbc1f900c2220700ea9cb60e9206c7', '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-03 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T003', 'LEAD-T003', 'ORG-T001', 'c58efffbb0548bb285f03c0307e752b33d2eea888958713acf5a597746989fba', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-05 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T004', 'LEAD-T004', 'ORG-T001', 'd63d4702abca77ca1ac9583300302b89e848dbbdcda962b51cec8839886130ac', '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-07 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T005', 'LEAD-T005', 'ORG-T001', '92bd4e9a9a21954b3769b5620ebc6c3f4efd72589492e7a703b1d19e6f97ab4f', '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ), NULL
  UNION ALL
  SELECT 'CT-T006', 'LEAD-T006', 'ORG-T001', 'cb9fa1c4bd47a852e24bbd074986a04a184637ef8103296ec0305658a5b18f4f', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-11 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T007', 'LEAD-T007', 'ORG-T001', '038fe4024fdab3c61472bb9215ab844e3a899b31d5fe35e73b2e5168db0d806d', '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-13 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T008', 'LEAD-T008', 'ORG-T001', 'a530d853e18b9c0b465d94aeb657fe4073d04de9dda892ab6dcdf3a7d07d1959', '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-15 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T009', 'LEAD-T009', 'ORG-T001', '242cd2877597af289270772a2c7f871182f1e712c2d1db8c8a1814a5a47ec7a3', '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-17 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T010', 'LEAD-T010', 'ORG-T001', '9e0a43ab61c94fab5ea4e8ef6bfbf30c62d42638d60b92becca8664c9d9fe98b', '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ), NULL
  UNION ALL
  SELECT 'CT-T011', 'LEAD-T011', 'ORG-T002', 'e8f5b648db37d753bdb20ca3dc7a86cee897f221fc4fec1122de3f1b006a768c', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ), '2026-09-21 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'CT-T012', 'LEAD-T012', 'ORG-T002', 'b32ef7c05ce01eff90cb6369bdac23148e1d352827aba7dbfab57e739877e51f', '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ, DATEADD(day, 7, '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ), NULL
) v
WHERE v.TOKENID NOT IN (SELECT TOKENID FROM CRM_DB.CRM.CONFIRM_TOKEN);

INSERT INTO CRM_DB.CRM.LEAD_MATCH (MATCHID, LEADID, ORGANISATIONID, VACANCYREFERENCE, SCORE, REASONS, EXCLUDEDREASON, MATCHEDAT, SHOWNTOLEADAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'LM-T001-1' AS MATCHID, 'LEAD-T001' AS LEADID, 'ORG-T001' AS ORGANISATIONID, '2000056632' AS VACANCYREFERENCE, 82 AS SCORE, PARSE_JSON('["interest: sports", "distance: over 30 miles"]') AS REASONS, NULL AS EXCLUDEDREASON, '2026-09-01 11:00:00 +01:00'::TIMESTAMP_LTZ AS MATCHEDAT, '2026-09-01 11:00:00 +01:00'::TIMESTAMP_LTZ AS SHOWNTOLEADAT
  UNION ALL
  SELECT 'LM-T002-2', 'LEAD-T002', 'ORG-T001', '2000052158', 74, PARSE_JSON('["interest: care", "hours: full time"]'), NULL, '2026-09-03 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-03 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LM-T004-3', 'LEAD-T004', 'ORG-T001', '2000053640', 40, PARSE_JSON('["interest: none"]'), 'You need to be 18 or over by the start date', '2026-09-07 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-07 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LM-T006-4', 'LEAD-T006', 'ORG-T001', '2000053640', 88, PARSE_JSON('["interest: cars", "drives"]'), NULL, '2026-09-11 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-11 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LM-T008-5', 'LEAD-T008', 'ORG-T001', '2000057845', 90, PARSE_JSON('["interest: office", "English and maths level 2"]'), NULL, '2026-09-15 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-15 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LM-T009-6', 'LEAD-T009', 'ORG-T001', '2000052158', 85, PARSE_JSON('["interest: care"]'), NULL, '2026-09-17 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-17 11:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'LM-T011-7', 'LEAD-T011', 'ORG-T002', '2000052158', 70, PARSE_JSON('["interest: care"]'), NULL, '2026-09-21 11:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-21 11:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.MATCHID NOT IN (SELECT MATCHID FROM CRM_DB.CRM.LEAD_MATCH);

INSERT INTO CRM_DB.CRM.EMAIL_MESSAGE (MESSAGEID, ORGANISATIONID, RECORDTYPE, RECORDID, TOADDRESS, TEMPLATE, SUBJECT, MODE, STATUS, CREATEDAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'EM-T001-CONFIRM' AS MESSAGEID, 'ORG-T001' AS ORGANISATIONID, 'lead' AS RECORDTYPE, 'LEAD-T001' AS RECORDID, 'jordan.testlead1@example.com' AS TOADDRESS, 'confirm_email' AS TEMPLATE, 'Please confirm your email' AS SUBJECT, 'outbox' AS MODE, 'outbox' AS STATUS, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT
  UNION ALL
  SELECT 'EM-T002-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T002', 'sam.testlead2@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T003-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T003', 'priya.testlead3@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T004-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T004', 'family.testlead@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T005-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T005', 'family.testlead@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T006-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T006', 'chris.testlead6@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T007-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T007', 'morgan.testlead7@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T008-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T008', 'casey.testlead8@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T009-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T009', 'jamie.testlead9@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T010-CONFIRM', 'ORG-T001', 'lead', 'LEAD-T010', 'drew.testlead10@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T011-CONFIRM', 'ORG-T002', 'lead', 'LEAD-T011', 'ellis.testlead11@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-T012-CONFIRM', 'ORG-T002', 'lead', 'LEAD-T012', 'robin.testlead12@example.com', 'confirm_email', 'Please confirm your email', 'outbox', 'outbox', '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'EM-CCON-001-INTRO', 'ORG-T001', 'contact', 'CCON-001', 'pat.contact1@example.com', 'employer_intro', 'Apprenticeships at Testshop', 'outbox', 'outbox', '2026-09-06 10:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.MESSAGEID NOT IN (SELECT MESSAGEID FROM CRM_DB.CRM.EMAIL_MESSAGE);

INSERT INTO CRM_DB.CRM.EMPLOYER (EMPLOYERID, ORGANISATIONID, NAME, COMPANYNUMBER, NOTONCOMPANIESHOUSE, ISACTIVE, CREATEDAT, CREATEDBY, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'CEMP-001' AS EMPLOYERID, 'ORG-T001' AS ORGANISATIONID, 'Testshop Retail Ltd' AS NAME, NULL AS COMPANYNUMBER, FALSE AS NOTONCOMPANIESHOUSE, TRUE AS ISACTIVE, '2026-09-02 10:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT, 'USR-T0008' AS CREATEDBY
  UNION ALL
  SELECT 'CEMP-002', 'ORG-T001', 'Testcare Homes Ltd', NULL, FALSE, TRUE, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009'
  UNION ALL
  SELECT 'CEMP-003', 'ORG-T001', 'Testgarage Motors', NULL, FALSE, TRUE, '2026-09-08 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008'
  UNION ALL
  SELECT 'CEMP-004', 'ORG-T002', 'Second Testcare Ltd', NULL, FALSE, TRUE, '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011'
) v
WHERE v.EMPLOYERID NOT IN (SELECT EMPLOYERID FROM CRM_DB.CRM.EMPLOYER);

INSERT INTO CRM_DB.CRM.EMPLOYER_SITE (SITEID, EMPLOYERID, ORGANISATIONID, NAME, ADDRESSLINE1, TOWN, POSTCODE, CREATEDAT, CREATEDBY, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'CSITE-001' AS SITEID, 'CEMP-001' AS EMPLOYERID, 'ORG-T001' AS ORGANISATIONID, 'Testshop Crosspool' AS NAME, '1 Test Road' AS ADDRESSLINE1, 'Sheffield' AS TOWN, 'S10 5AA' AS POSTCODE, '2026-09-02 10:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT, 'USR-T0008' AS CREATEDBY
  UNION ALL
  SELECT 'CSITE-002', 'CEMP-002', 'ORG-T001', 'Testcare House', '2 Test Street', 'Sheffield', 'S6 3AA', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009'
  UNION ALL
  SELECT 'CSITE-003', 'CEMP-003', 'ORG-T001', 'Testgarage', '3 Test Lane', 'Sheffield', 'S35 2YH', '2026-09-08 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008'
  UNION ALL
  SELECT 'CSITE-004', 'CEMP-004', 'ORG-T002', 'Second Testcare Leeds', '4 Test Row', 'Leeds', 'LS1 4DY', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011'
) v
WHERE v.SITEID NOT IN (SELECT SITEID FROM CRM_DB.CRM.EMPLOYER_SITE);

INSERT INTO CRM_DB.CRM.CONTACT (CONTACTID, EMPLOYERID, ORGANISATIONID, NAME, JOBTITLE, EMAIL, PHONE, SALESROLE, PREFERREDCONTACTMETHOD, MARKETINGCONSENT, MARKETINGCONSENTAT, CREATEDAT, CREATEDBY, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'CCON-001' AS CONTACTID, 'CEMP-001' AS EMPLOYERID, 'ORG-T001' AS ORGANISATIONID, 'Pat Testbuyer' AS NAME, 'Store manager' AS JOBTITLE, 'pat.contact1@example.com' AS EMAIL, '07700900001' AS PHONE, 'decision_maker' AS SALESROLE, 'email' AS PREFERREDCONTACTMETHOD, TRUE AS MARKETINGCONSENT, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ AS MARKETINGCONSENTAT, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT, 'USR-T0008' AS CREATEDBY
  UNION ALL
  SELECT 'CCON-002', 'CEMP-001', 'ORG-T001', 'Lee Testledger', 'Finance officer', 'lee.contact2@example.com', '07700900002', 'finance', 'email', FALSE, NULL, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008'
  UNION ALL
  SELECT 'CCON-003', 'CEMP-002', 'ORG-T001', 'Kim Testcarer', 'Registered manager', 'kim.contact3@example.com', '07700900003', 'decision_maker', 'phone', FALSE, NULL, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008'
  UNION ALL
  SELECT 'CCON-004', 'CEMP-003', 'ORG-T001', 'Alex Testmechanic', 'Owner', 'alex.contact4@example.com', '07700900004', 'decision_maker', 'phone', FALSE, NULL, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008'
  UNION ALL
  SELECT 'CCON-005', 'CEMP-004', 'ORG-T002', 'Jo Testleeds', 'HR adviser', 'jo.contact5@example.com', '07700900005', 'hr', 'email', TRUE, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011'
) v
WHERE v.CONTACTID NOT IN (SELECT CONTACTID FROM CRM_DB.CRM.CONTACT);

INSERT INTO CRM_DB.CRM.PIPELINE_ITEM (ITEMID, ORGANISATIONID, PIPELINEID, RECORDTYPE, RECORDID, STAGEID, OWNERUSERID, TITLE, OPENEDAT, OPENEDBY, CLOSEDAT, CLOSEREASONID, STAGECHANGEDAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'ITEM-T001' AS ITEMID, 'ORG-T001' AS ORGANISATIONID, 'PL-ORG-T001-CANDIDATE' AS PIPELINEID, 'lead' AS RECORDTYPE, 'LEAD-T001' AS RECORDID, 'ST-ORG-T001-CANDIDATE-CONFIRMED' AS STAGEID, 'USR-T0008' AS OWNERUSERID, NULL AS TITLE, '2026-09-01 10:00:00 +01:00'::TIMESTAMP_LTZ AS OPENEDAT, 'web-form' AS OPENEDBY, NULL AS CLOSEDAT, NULL AS CLOSEREASONID, '2026-09-02 12:00:00 +01:00'::TIMESTAMP_LTZ AS STAGECHANGEDAT
  UNION ALL
  SELECT 'ITEM-T002', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T002', 'ST-ORG-T001-CANDIDATE-CONTACTED', 'USR-T0008', NULL, '2026-09-03 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T003', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T003', 'ST-ORG-T001-CANDIDATE-MATCHED', 'USR-T0008', NULL, '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T004', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T004', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'USR-T0009', NULL, '2026-09-07 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T005', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T005', 'ST-ORG-T001-CANDIDATE-NEW', NULL, NULL, '2026-09-09 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-09 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T006', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T006', 'ST-ORG-T001-CANDIDATE-INTERVIEWING', 'USR-T0008', NULL, '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-15 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T007', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T007', 'ST-ORG-T001-CANDIDATE-LOST', 'USR-T0008', NULL, '2026-09-13 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', '2026-09-16 12:00:00 +01:00'::TIMESTAMP_LTZ, 'CR-ORG-T001-CANDIDATE-COLLEGE', '2026-09-16 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T008', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T008', 'ST-ORG-T001-CANDIDATE-OFFERED', 'USR-T0009', NULL, '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-20 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T009', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T009', 'ST-ORG-T001-CANDIDATE-ASSESSMENT', 'USR-T0008', NULL, '2026-09-17 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-23 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T010', 'ORG-T001', 'PL-ORG-T001-CANDIDATE', 'lead', 'LEAD-T010', 'ST-ORG-T001-CANDIDATE-NEW', NULL, NULL, '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-19 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T011', 'ORG-T002', 'PL-ORG-T002-CANDIDATE', 'lead', 'LEAD-T011', 'ST-ORG-T002-CANDIDATE-CONFIRMED', 'USR-T0011', NULL, '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-22 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-T012', 'ORG-T002', 'PL-ORG-T002-CANDIDATE', 'lead', 'LEAD-T012', 'ST-ORG-T002-CANDIDATE-NEW', NULL, NULL, '2026-09-23 10:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL, NULL, '2026-09-23 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-E001', 'ORG-T001', 'PL-ORG-T001-EMPLOYER', 'employer', 'CEMP-001', 'ST-ORG-T001-EMPLOYER-AGREED', 'USR-T0008', 'Retail apprentices, spring 2027', '2026-09-02 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL, NULL, '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-E002', 'ORG-T001', 'PL-ORG-T001-EMPLOYER', 'employer', 'CEMP-002', 'ST-ORG-T001-EMPLOYER-MEETING', 'USR-T0009', 'Care apprentices', '2026-09-05 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL, NULL, '2026-09-07 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-E003', 'ORG-T001', 'PL-ORG-T001-EMPLOYER', 'employer', 'CEMP-003', 'ST-ORG-T001-EMPLOYER-PROSPECT', 'USR-T0008', 'First apprentice', '2026-09-08 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL, NULL, '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ITEM-E004', 'ORG-T002', 'PL-ORG-T002-EMPLOYER', 'employer', 'CEMP-004', 'ST-ORG-T002-EMPLOYER-CONTACTED', 'USR-T0011', 'Care apprentices', '2026-09-11 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011', NULL, NULL, '2026-09-12 12:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.ITEMID NOT IN (SELECT ITEMID FROM CRM_DB.CRM.PIPELINE_ITEM);

INSERT INTO CRM_DB.CRM.STAGE_CHANGE (CHANGEID, ITEMID, ORGANISATIONID, FROMSTAGEID, TOSTAGEID, CHANGEDAT, CHANGEDBY, REASONID, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'SC-T001-1' AS CHANGEID, 'ITEM-T001' AS ITEMID, 'ORG-T001' AS ORGANISATIONID, NULL AS FROMSTAGEID, 'ST-ORG-T001-CANDIDATE-NEW' AS TOSTAGEID, '2026-09-01 12:00:00 +01:00'::TIMESTAMP_LTZ AS CHANGEDAT, 'web-form' AS CHANGEDBY, NULL AS REASONID
  UNION ALL
  SELECT 'SC-T001-2', 'ITEM-T001', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-02 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T002-1', 'ITEM-T002', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-03 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T002-2', 'ITEM-T002', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-04 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T002-3', 'ITEM-T002', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'ST-ORG-T001-CANDIDATE-CONTACTED', '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T003-1', 'ITEM-T003', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T003-2', 'ITEM-T003', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-06 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T003-3', 'ITEM-T003', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'ST-ORG-T001-CANDIDATE-CONTACTED', '2026-09-07 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T003-4', 'ITEM-T003', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONTACTED', 'ST-ORG-T001-CANDIDATE-MATCHED', '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T004-1', 'ITEM-T004', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-07 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T004-2', 'ITEM-T004', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T005-1', 'ITEM-T005', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-09 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T006-1', 'ITEM-T006', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-11 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T006-2', 'ITEM-T006', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-12 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T006-3', 'ITEM-T006', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'ST-ORG-T001-CANDIDATE-CONTACTED', '2026-09-13 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T006-4', 'ITEM-T006', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONTACTED', 'ST-ORG-T001-CANDIDATE-MATCHED', '2026-09-14 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T006-5', 'ITEM-T006', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-MATCHED', 'ST-ORG-T001-CANDIDATE-INTERVIEWING', '2026-09-15 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T007-1', 'ITEM-T007', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-13 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T007-2', 'ITEM-T007', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-14 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T007-3', 'ITEM-T007', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'ST-ORG-T001-CANDIDATE-CONTACTED', '2026-09-15 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T007-4', 'ITEM-T007', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONTACTED', 'ST-ORG-T001-CANDIDATE-LOST', '2026-09-16 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', 'CR-ORG-T001-CANDIDATE-COLLEGE'
  UNION ALL
  SELECT 'SC-T008-1', 'ITEM-T008', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-15 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T008-2', 'ITEM-T008', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-16 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T008-3', 'ITEM-T008', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'ST-ORG-T001-CANDIDATE-CONTACTED', '2026-09-17 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-T008-4', 'ITEM-T008', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONTACTED', 'ST-ORG-T001-CANDIDATE-MATCHED', '2026-09-18 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-T008-5', 'ITEM-T008', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-MATCHED', 'ST-ORG-T001-CANDIDATE-INTERVIEWING', '2026-09-19 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-T008-6', 'ITEM-T008', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-INTERVIEWING', 'ST-ORG-T001-CANDIDATE-OFFERED', '2026-09-20 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-T009-1', 'ITEM-T009', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-17 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T009-2', 'ITEM-T009', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-NEW', 'ST-ORG-T001-CANDIDATE-CONFIRMED', '2026-09-18 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T009-3', 'ITEM-T009', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONFIRMED', 'ST-ORG-T001-CANDIDATE-CONTACTED', '2026-09-19 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T009-4', 'ITEM-T009', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-CONTACTED', 'ST-ORG-T001-CANDIDATE-MATCHED', '2026-09-20 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T009-5', 'ITEM-T009', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-MATCHED', 'ST-ORG-T001-CANDIDATE-INTERVIEWING', '2026-09-21 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T009-6', 'ITEM-T009', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-INTERVIEWING', 'ST-ORG-T001-CANDIDATE-OFFERED', '2026-09-22 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T009-7', 'ITEM-T009', 'ORG-T001', 'ST-ORG-T001-CANDIDATE-OFFERED', 'ST-ORG-T001-CANDIDATE-ASSESSMENT', '2026-09-23 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-T010-1', 'ITEM-T010', 'ORG-T001', NULL, 'ST-ORG-T001-CANDIDATE-NEW', '2026-09-19 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T011-1', 'ITEM-T011', 'ORG-T002', NULL, 'ST-ORG-T002-CANDIDATE-NEW', '2026-09-21 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-T011-2', 'ITEM-T011', 'ORG-T002', 'ST-ORG-T002-CANDIDATE-NEW', 'ST-ORG-T002-CANDIDATE-CONFIRMED', '2026-09-22 12:00:00 +01:00'::TIMESTAMP_LTZ, 'system:email-confirmed', NULL
  UNION ALL
  SELECT 'SC-T012-1', 'ITEM-T012', 'ORG-T002', NULL, 'ST-ORG-T002-CANDIDATE-NEW', '2026-09-23 12:00:00 +01:00'::TIMESTAMP_LTZ, 'web-form', NULL
  UNION ALL
  SELECT 'SC-E001-1', 'ITEM-E001', 'ORG-T001', NULL, 'ST-ORG-T001-EMPLOYER-PROSPECT', '2026-09-02 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-E001-2', 'ITEM-E001', 'ORG-T001', 'ST-ORG-T001-EMPLOYER-PROSPECT', 'ST-ORG-T001-EMPLOYER-CONTACTED', '2026-09-03 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-E001-3', 'ITEM-E001', 'ORG-T001', 'ST-ORG-T001-EMPLOYER-CONTACTED', 'ST-ORG-T001-EMPLOYER-MEETING', '2026-09-04 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-E001-4', 'ITEM-E001', 'ORG-T001', 'ST-ORG-T001-EMPLOYER-MEETING', 'ST-ORG-T001-EMPLOYER-AGREED', '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-E002-1', 'ITEM-E002', 'ORG-T001', NULL, 'ST-ORG-T001-EMPLOYER-PROSPECT', '2026-09-05 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-E002-2', 'ITEM-E002', 'ORG-T001', 'ST-ORG-T001-EMPLOYER-PROSPECT', 'ST-ORG-T001-EMPLOYER-CONTACTED', '2026-09-06 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-E002-3', 'ITEM-E002', 'ORG-T001', 'ST-ORG-T001-EMPLOYER-CONTACTED', 'ST-ORG-T001-EMPLOYER-MEETING', '2026-09-07 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', NULL
  UNION ALL
  SELECT 'SC-E003-1', 'ITEM-E003', 'ORG-T001', NULL, 'ST-ORG-T001-EMPLOYER-PROSPECT', '2026-09-08 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', NULL
  UNION ALL
  SELECT 'SC-E004-1', 'ITEM-E004', 'ORG-T002', NULL, 'ST-ORG-T002-EMPLOYER-PROSPECT', '2026-09-11 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011', NULL
  UNION ALL
  SELECT 'SC-E004-2', 'ITEM-E004', 'ORG-T002', 'ST-ORG-T002-EMPLOYER-PROSPECT', 'ST-ORG-T002-EMPLOYER-CONTACTED', '2026-09-12 12:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011', NULL
) v
WHERE v.CHANGEID NOT IN (SELECT CHANGEID FROM CRM_DB.CRM.STAGE_CHANGE);

INSERT INTO CRM_DB.CRM.PLACEMENT (PLACEMENTID, ORGANISATIONID, LEADID, CANDIDATEITEMID, EMPLOYERID, EMPLOYERITEMID, VACANCYREFERENCE, STANDARDCODE, STATUS, PUTFORWARDAT, PUTFORWARDBY, STATUSCHANGEDAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'PLC-T006-1' AS PLACEMENTID, 'ORG-T001' AS ORGANISATIONID, 'LEAD-T006' AS LEADID, 'ITEM-T006' AS CANDIDATEITEMID, 'CEMP-003' AS EMPLOYERID, 'ITEM-E003' AS EMPLOYERITEMID, '2000053640' AS VACANCYREFERENCE, 59 AS STANDARDCODE, 'interviewing' AS STATUS, '2026-09-15 10:00:00 +01:00'::TIMESTAMP_LTZ AS PUTFORWARDAT, 'USR-T0008' AS PUTFORWARDBY, '2026-09-16 10:00:00 +01:00'::TIMESTAMP_LTZ AS STATUSCHANGEDAT
  UNION ALL
  SELECT 'PLC-T008-1', 'ORG-T001', 'LEAD-T008', 'ITEM-T008', 'CEMP-001', 'ITEM-E001', '2000057845', 196, 'offered', '2026-09-19 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'PLC-T009-1', 'ORG-T001', 'LEAD-T009', 'ITEM-T009', 'CEMP-002', 'ITEM-E002', '2000052158', 118, 'accepted', '2026-09-21 10:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', '2026-09-24 10:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.PLACEMENTID NOT IN (SELECT PLACEMENTID FROM CRM_DB.CRM.PLACEMENT);

INSERT INTO CRM_DB.CRM.ACTIVITY (ACTIVITYID, ORGANISATIONID, KIND, SUBJECT, BODY, OCCURREDAT, BYUSERID, CREATEDAT, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'ACT-001' AS ACTIVITYID, 'ORG-T001' AS ORGANISATIONID, 'call' AS KIND, 'First call' AS SUBJECT, 'Talked through apprenticeships in care.' AS BODY, '2026-09-04 14:00:00 +01:00'::TIMESTAMP_LTZ AS OCCURREDAT, 'USR-T0008' AS BYUSERID, '2026-09-04 14:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT
  UNION ALL
  SELECT 'ACT-002', 'ORG-T001', 'meeting', 'Visit to Testcare', 'Met the registered manager; two places possible.', '2026-09-09 14:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', '2026-09-09 14:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ACT-003', 'ORG-T001', 'note', 'Offer made', 'Testshop offered Casey the role.', '2026-09-21 14:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009', '2026-09-21 14:00:00 +01:00'::TIMESTAMP_LTZ
  UNION ALL
  SELECT 'ACT-004', 'ORG-T002', 'email', 'Intro email', 'Sent our employer pack.', '2026-09-07 14:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011', '2026-09-07 14:00:00 +01:00'::TIMESTAMP_LTZ
) v
WHERE v.ACTIVITYID NOT IN (SELECT ACTIVITYID FROM CRM_DB.CRM.ACTIVITY);

INSERT INTO CRM_DB.CRM.ACTIVITY_LINK (ACTIVITYID, ORGANISATIONID, RECORDTYPE, RECORDID, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'ACT-001' AS ACTIVITYID, 'ORG-T001' AS ORGANISATIONID, 'lead' AS RECORDTYPE, 'LEAD-T002' AS RECORDID
  UNION ALL
  SELECT 'ACT-001', 'ORG-T001', 'item', 'ITEM-T002'
  UNION ALL
  SELECT 'ACT-002', 'ORG-T001', 'employer', 'CEMP-002'
  UNION ALL
  SELECT 'ACT-002', 'ORG-T001', 'contact', 'CCON-003'
  UNION ALL
  SELECT 'ACT-002', 'ORG-T001', 'item', 'ITEM-E002'
  UNION ALL
  SELECT 'ACT-003', 'ORG-T001', 'lead', 'LEAD-T008'
  UNION ALL
  SELECT 'ACT-003', 'ORG-T001', 'employer', 'CEMP-001'
  UNION ALL
  SELECT 'ACT-003', 'ORG-T001', 'placement', 'PLC-T008-1'
  UNION ALL
  SELECT 'ACT-004', 'ORG-T002', 'employer', 'CEMP-004'
  UNION ALL
  SELECT 'ACT-004', 'ORG-T002', 'contact', 'CCON-005'
) v
WHERE (v.ACTIVITYID, v.RECORDTYPE, v.RECORDID) NOT IN (SELECT ACTIVITYID, RECORDTYPE, RECORDID FROM CRM_DB.CRM.ACTIVITY_LINK);

INSERT INTO CRM_DB.CRM.TASK (TASKID, ORGANISATIONID, TITLE, DUEDATE, OWNERUSERID, RECORDTYPE, RECORDID, STATUS, DONEAT, DONEBY, CREATEDAT, CREATEDBY, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'TASK-001' AS TASKID, 'ORG-T001' AS ORGANISATIONID, 'Call Sam about care vacancies' AS TITLE, '2026-10-14'::DATE AS DUEDATE, 'USR-T0008' AS OWNERUSERID, 'lead' AS RECORDTYPE, 'LEAD-T002' AS RECORDID, 'open' AS STATUS, NULL AS DONEAT, NULL AS DONEBY, '2026-09-30 09:00:00 +01:00'::TIMESTAMP_LTZ AS CREATEDAT, 'USR-T0008' AS CREATEDBY
  UNION ALL
  SELECT 'TASK-002', 'ORG-T001', 'Send Testcare the agreement draft', '2026-10-16'::DATE, 'USR-T0009', 'employer', 'CEMP-002', 'open', NULL, NULL, '2026-09-30 09:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0009'
  UNION ALL
  SELECT 'TASK-003', 'ORG-T001', 'Book Jamie''s initial assessment', '2026-10-10'::DATE, 'USR-T0008', 'lead', 'LEAD-T009', 'done', '2026-10-10 09:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008', '2026-09-30 09:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0008'
  UNION ALL
  SELECT 'TASK-004', 'ORG-T002', 'Follow up Second Testcare', '2026-10-20'::DATE, 'USR-T0011', 'employer', 'CEMP-004', 'open', NULL, NULL, '2026-09-30 09:00:00 +01:00'::TIMESTAMP_LTZ, 'USR-T0011'
) v
WHERE v.TASKID NOT IN (SELECT TASKID FROM CRM_DB.CRM.TASK);

INSERT INTO CRM_DB.CRM.RECORD_CHANGE (CHANGEID, ORGANISATIONID, RECORDTYPE, RECORDID, FIELD, OLDVALUE, NEWVALUE, CHANGEDAT, CHANGEDBY, ISTESTDATA)
SELECT v.*, TRUE FROM (
  SELECT 'RC-T002-1' AS CHANGEID, 'ORG-T001' AS ORGANISATIONID, 'lead' AS RECORDTYPE, 'LEAD-T002' AS RECORDID, 'MOBILE' AS FIELD, '07700900099' AS OLDVALUE, '07700900002' AS NEWVALUE, '2026-09-04 15:00:00 +01:00'::TIMESTAMP_LTZ AS CHANGEDAT, 'USR-T0008' AS CHANGEDBY
) v
WHERE v.CHANGEID NOT IN (SELECT CHANGEID FROM CRM_DB.CRM.RECORD_CHANGE);

-- ---------------------------------------------------------------------------
-- The test snapshot, for the test reset (sql/test_reset_02_reset.sql): every
-- CRM table's test rows as they are now. A snapshot table that already
-- exists is left as it is. To take a new one, drop the snapshot tables (not
-- the schema) and run this file again.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.FORM_SUBMISSION AS SELECT * FROM CRM_DB.BRONZE.FORM_SUBMISSION WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.PIPELINE AS SELECT * FROM CRM_DB.CRM.PIPELINE WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.PIPELINE_STAGE AS SELECT * FROM CRM_DB.CRM.PIPELINE_STAGE WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.CLOSE_REASON AS SELECT * FROM CRM_DB.CRM.CLOSE_REASON WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.LEAD AS SELECT * FROM CRM_DB.CRM.LEAD WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.LEAD_INTEREST AS SELECT * FROM CRM_DB.CRM.LEAD_INTEREST WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.LEAD_CONSENT AS SELECT * FROM CRM_DB.CRM.LEAD_CONSENT WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.CONFIRM_TOKEN AS SELECT * FROM CRM_DB.CRM.CONFIRM_TOKEN WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.LEAD_MATCH AS SELECT * FROM CRM_DB.CRM.LEAD_MATCH WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.EMAIL_MESSAGE AS SELECT * FROM CRM_DB.CRM.EMAIL_MESSAGE WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.EMPLOYER AS SELECT * FROM CRM_DB.CRM.EMPLOYER WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.EMPLOYER_SITE AS SELECT * FROM CRM_DB.CRM.EMPLOYER_SITE WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.CONTACT AS SELECT * FROM CRM_DB.CRM.CONTACT WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.PIPELINE_ITEM AS SELECT * FROM CRM_DB.CRM.PIPELINE_ITEM WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.STAGE_CHANGE AS SELECT * FROM CRM_DB.CRM.STAGE_CHANGE WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.PLACEMENT AS SELECT * FROM CRM_DB.CRM.PLACEMENT WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.ACTIVITY AS SELECT * FROM CRM_DB.CRM.ACTIVITY WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.ACTIVITY_LINK AS SELECT * FROM CRM_DB.CRM.ACTIVITY_LINK WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.TASK AS SELECT * FROM CRM_DB.CRM.TASK WHERE ISTESTDATA = TRUE;
CREATE TABLE IF NOT EXISTS CRM_DB.TEST_BASELINE.RECORD_CHANGE AS SELECT * FROM CRM_DB.CRM.RECORD_CHANGE WHERE ISTESTDATA = TRUE;

-- ---------------------------------------------------------------------------
-- CRM_APP_ROLE: explicit grants only. Nothing in CAPTURE_DB or OPTIONS_DB;
-- no DELETE anywhere (records are marked, never deleted); no CREATE.
-- ---------------------------------------------------------------------------
GRANT USAGE ON WAREHOUSE CRM_WH TO ROLE CRM_APP_ROLE;
GRANT USAGE ON DATABASE CRM_DB TO ROLE CRM_APP_ROLE;
GRANT USAGE ON SCHEMA CRM_DB.BRONZE TO ROLE CRM_APP_ROLE;
GRANT USAGE ON SCHEMA CRM_DB.CRM TO ROLE CRM_APP_ROLE;
-- BRONZE: add-only, as received.
GRANT INSERT ON TABLE CRM_DB.BRONZE.FORM_SUBMISSION TO ROLE CRM_APP_ROLE;
-- Pipelines, stages and close reasons: read-only (changed by hand-run SQL).
GRANT SELECT ON TABLE CRM_DB.CRM.PIPELINE TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE CRM_DB.CRM.PIPELINE_STAGE TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE CRM_DB.CRM.CLOSE_REASON TO ROLE CRM_APP_ROLE;
-- Add-only: consents, stage history, activity links, field history.
GRANT SELECT, INSERT ON TABLE CRM_DB.CRM.LEAD_CONSENT TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT ON TABLE CRM_DB.CRM.STAGE_CHANGE TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT ON TABLE CRM_DB.CRM.ACTIVITY_LINK TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT ON TABLE CRM_DB.CRM.RECORD_CHANGE TO ROLE CRM_APP_ROLE;
-- The rest: read, add and change (never delete).
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.LEAD TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.LEAD_INTEREST TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.CONFIRM_TOKEN TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.LEAD_MATCH TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.EMAIL_MESSAGE TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.EMPLOYER TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.EMPLOYER_SITE TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.CONTACT TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.PIPELINE_ITEM TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.PLACEMENT TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.ACTIVITY TO ROLE CRM_APP_ROLE;
GRANT SELECT, INSERT, UPDATE ON TABLE CRM_DB.CRM.TASK TO ROLE CRM_APP_ROLE;

-- SHARED_DB, read in place, read-only: REF, SKILLS, EXT.VACANCY, ACCESS.
GRANT USAGE ON DATABASE SHARED_DB TO ROLE CRM_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.REF TO ROLE CRM_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.SKILLS TO ROLE CRM_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.EXT TO ROLE CRM_APP_ROLE;
GRANT USAGE ON SCHEMA SHARED_DB.ACCESS TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.POSTCODE TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.SIC2007 TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.SIC2007_TO_SIC2026 TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.SOC2020_INDEX TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.SOC2020_SUB_UNIT_GROUP TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.SOC2020_UNIT_GROUP TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.REF.INTEREST_WORD TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_VERSION TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_KSB TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_DUTY TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_DUTY_KSB TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_OPTION TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.STANDARD_DUTY_OPTION TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.OCCUPATION_PROFILE TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.OCCUPATION_SOC TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.SKILLS.OCCUPATION_TERM TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.EXT.VACANCY TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.APP_USER TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.APP_USER_SITE TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.ORGANISATION TO ROLE CRM_APP_ROLE;
GRANT SELECT ON TABLE SHARED_DB.ACCESS.USER_ROLE TO ROLE CRM_APP_ROLE;

-- ---------------------------------------------------------------------------
-- FLOW_OWNER: for now only the flow log. Its rights on CAPTURE_DB and
-- CRM_DB come with each flow procedure, column by column.
-- ---------------------------------------------------------------------------
GRANT USAGE ON DATABASE SHARED_DB TO ROLE FLOW_OWNER;
GRANT USAGE ON SCHEMA SHARED_DB.OPS TO ROLE FLOW_OWNER;
GRANT USAGE ON SCHEMA SHARED_DB.FLOW TO ROLE FLOW_OWNER;
GRANT SELECT, INSERT, UPDATE ON TABLE SHARED_DB.OPS.FLOW_RUN TO ROLE FLOW_OWNER;
