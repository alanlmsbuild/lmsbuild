# Person ID audit (decision 62)

Written 31 October 2026. Updated the same day with Alan's answer: everyone gets an ID, including staff and employer contacts. **Read-only:** nothing was run in Snowflake and nothing was changed. This file is the only thing added.

## How this was done, and what it can't tell you

- Built from the repo: every file in `sql/`, the dbt models, `server/*.js`, `scripts/`, `docs/`, and the school leavers site (`~/school-leavers-app`). No Snowflake connection was opened, so **a table or column below is what the code says, not what the account holds** (the same caveat as `docs/data-journey.md`).
- The original `CREATE TABLE` for `ILR.LEARNER`, `LEARNING_DELIVERY`, `OFFICER`, `EMPLOYER`, `LEARNER_EMPLOYER` and `OFFICER_ASSIGNMENT` is not in the repo (made before the SQL files were kept). Their columns are known only from later `ALTER`s, the test-data inserts and the queries in `server/`. Check them with `DESCRIBE TABLE` before the build.
- The text of decision 62 is not in `docs/decisions.md` (decisions 37 to 62 live in the Rarebit plan on claude.ai). This audit works from the summary in your request.
- Gold, silver, bronze reference data and the options site's exports hold **no personal data** and are left out below, except to say so.

---

## 1. Every table that holds a person or a person's data

"Own key" is the table's primary key. "Shares" is the ID it has in common with another table today. `ORG` means the table carries `ORGANISATIONID`. All have `ISTESTDATA` unless said.

### Meadow: `CRM_DB` (role `CRM_APP_ROLE`; nothing in `CAPTURE_DB`)

| Table | Own key | Shares / points at | Person data held | Notes |
|---|---|---|---|---|
| `BRONZE.FORM_SUBMISSION` | `SUBMISSIONID` | `LEADID` (set as the lead is stored), `ORG` | `PAYLOAD` VARIANT: the whole form as submitted | The only copy of the raw answers. Retention clears the payload of anonymised leads (rule "later"). |
| `CRM.LEAD` | `LEADID` | `ORG`; `LEARNREFNUMBER` (set at enrolment); natural key is **email + date of birth per organisation** | name, email, mobile, DOB, postcode, travel, English/maths level | Table tag `minor`; six columns tagged `personal`. `ANONYMISEDAT` clears them. |
| `CRM.LEAD_INTEREST` | `INTERESTID` | `LEADID`, `ORG` | job interests (SOC) | |
| `CRM.LEAD_CONSENT` | `CONSENTID` | `LEADID`, `SUBMISSIONID`, `ORG` | consent kind, notice version, given/withdrawn | Add-only. This is the "keep the consent events as proof" table (decision 36), but it is keyed by a lead that is later anonymised. |
| `CRM.CONFIRM_TOKEN` | `TOKENID` | `LEADID` | hash of the confirm link | |
| `CRM.LEAD_MATCH` | `MATCHID` | `LEADID`, `VACANCYREFERENCE` | advert matches and reasons | A profile of the person's wants. |
| `CRM.PIPELINE_ITEM` | `ITEMID` | `RECORDTYPE` + `RECORDID` (= `LEADID` or `EMPLOYERID`), `OWNERUSERID` | where the person is in the pipeline | Polymorphic link: no FK. |
| `CRM.STAGE_CHANGE` | `CHANGEID` | `ITEMID` | stage history, free-text `NOTE` | |
| `CRM.PLACEMENT` | `PLACEMENTID` | `LEADID`, `CANDIDATEITEMID`, `EMPLOYERID` | candidate put forward | `ONBOARDING` points back at it. |
| `CRM.ACTIVITY` / `ACTIVITY_LINK` | `ACTIVITYID` / (activity, `RECORDTYPE`, `RECORDID`) | the lead, via the link | `BODY` free text (tagged `personal`) | Link is polymorphic. |
| `CRM.TASK` | `TASKID` | `RECORDTYPE` + `RECORDID` | task text, may name a person | |
| `CRM.EMAIL_MESSAGE` | `MESSAGEID` | `RECORDTYPE` + `RECORDID` | `TOADDRESS` (tagged `personal`), subject | |
| `CRM.RECORD_CHANGE` | `CHANGEID` | `RECORDTYPE` + `RECORDID` | `OLDVALUE` / `NEWVALUE`: **copies of any changed field, including names, email, DOB** | Easy to miss in an erasure. |
| `CRM.RECORD_VIEW` | `VIEWID` | `RECORDID` (the lead), `VIEWEDBY` (a user) | who opened whose record | Add-only. |
| `CRM.CONTACT` | `CONTACTID` | `EMPLOYERID`, `WARRENCONTACTID` (by ID only) | employer staff: name, email, phone, marketing consent | Persons, but employer-side (see decision 3 below). |
| `TEST_BASELINE.*` (CRM) | same | same | dummy copies of every table above | `ISTESTDATA = TRUE` only. |

Not about people: `PIPELINE`, `PIPELINE_STAGE`, `CLOSE_REASON`, `EMPLOYER`, `EMPLOYER_SITE`. (`EMPLOYER` can be a sole trader; the licence notes already cover that.)

### Warren: `CAPTURE_DB.ILR` (role `ILR_APP_ROLE`)

| Table | Own key | Shares / points at | Person data held | Notes |
|---|---|---|---|---|
| `LEARNER` | `LEARNREFNUMBER` (globally unique) | `ORG`; `ULN` (**unique only inside an organisation**); `NINUMBER` | names, DOB, sex, ethnicity, LLDD, postcode, email, ULN, NI number | `NINUMBER` and `ETHNICITY` are manager-only (`MANAGER_ONLY_LEARNER_COLUMNS`). Read once, in `LEARNER_ROWS`, as `select * replace (...)`. |
| `LEARNING_DELIVERY` | (learner, aim) | `LEARNREFNUMBER`, `SWSUPAIMID` (a GUID per aim) | the programme: dates, outcome, standard | |
| `PRIOR_ATTAINMENT`, `LLDD_HEALTH_PROBLEM`, `LEARNER_FAM`, `EMPLOYMENT_STATUS`, `EMPLOYMENT_STATUS_MONITORING`, `LEARNING_DELIVERY_FAM`, `APP_FIN_RECORD`, `HOURS_RECORD` | row ID | `LEARNREFNUMBER` | the ILR records | LLDD and `LEARNER_FAM` are special-category. |
| `PROGRESS_REVIEW` | review ID | `LEARNREFNUMBER`, `OFFICERREFNUMBER` | reviews | |
| `LEARNER_EMPLOYER` | (learner, employer, from) | `LEARNREFNUMBER`, `EMPLOYERID`, `SITEID`, `LINEMANAGERCONTACTID` | who they work for | |
| `OFFICER`, `OFFICER_ASSIGNMENT` (and the older `LEARNER_OFFICER`) | `OFFICERREFNUMBER` | `LEARNREFNUMBER`, `ORG` | staff, and who looks after which learner | Staff are persons too. |
| `EMPLOYER_CONTACT` | `CONTACTID` | `EMPLOYERID`, `SITEID`, `USERID` | employer staff | The Warren side of `CRM.CONTACT`. |
| `ONBOARDING` | `ONBOARDINGID` | `LEADID`, `PLACEMENTID`, `CANDIDATEUSERID`, `LEARNREFNUMBER`, `EMPLOYERID`, `ORG` | **copy of the lead's name, email, mobile, DOB, postcode** taken at hand-over | Not covered by the lead's anonymisation. |
| `RECORD_CHANGE` | `CHANGEID` | `LEARNREFNUMBER` | old and new values of corrected fields | Same erasure point as the CRM one. |
| `TEST_BASELINE.*` (ILR) | same | same | dummy copies | Plus the three DfE dummy sheets `ILR_DUMMY_LEARNER`, `_LEARNING_DELIVERY`, `_GUIDE` (fictional ULNs, names; tagged personal / special-category to test masking). |

### Sign-ins and roles: `SHARED_DB.ACCESS` (read-only for the app; written by the flow procedures and by hand)

| Table | Own key | Shares / points at | Notes |
|---|---|---|---|
| `APP_USER` | `USERID` | `EMAIL` (**unique across all organisations**), `SSOSUBJECT`, `LEARNREFNUMBER`, `OFFICERREFNUMBER`, `EMPLOYERID`, `ORG` | The one table that already carries a learner, an officer and an employer reference. F6 makes the candidate's row; F7 adds `LEARNREFNUMBER`. |
| `USER_ROLE`, `APP_USER_SITE` | `ROLEGRANTID`, (user, site, from) | `USERID` | |
| `ORGANISATION` | `ORGANISATIONID` | `UKPRN` | Not a person. |

### Burrow: `CAPTURE_DB.BURROW`

| Table | Own key | Shares / points at | Notes |
|---|---|---|---|
| `EVIDENCE` | `EVIDENCE_ID` (UUID) | `LEARNREFNUMBER`, `CREATED_BY` (a USERID) | The portfolio. **No `ORGANISATIONID`:** isolation is by joining to `LEARNER`. |
| `EVIDENCE_REVIEW`, `EVIDENCE_FILE`, `EVIDENCE_KSB` | UUIDs | `EVIDENCE_ID` | The files themselves are in an internal stage, found by evidence ID. |
| `WITNESS_CONFIRMATION`, `IQA_CHECK` | UUIDs | `EVIDENCE_ID`, `CONFIRMED_BY` / `IQA_USERID` (USERIDs) | |

### Elsewhere

- `SHARED_DB.OPS.FLOW_RUN`: record IDs and the user ID, counts only. No personal fields, but it links a user to a lead and a placement.
- `SHARED_DB.EXT.*`, `SKILLS`, `REF`, gold, silver, bronze reference data, `OPTIONS_DB.*`: **no person data.**
- **The options site** (`~/school-leavers-app`): no database and no server. It keeps pills, kept cards, grades and the local authority in the visitor's own `localStorage` (keys `leavers-v2`, `adults-v2`, `parents-v2`, `site-area`). Nothing is sent. **There is no identity, and no F0 consent code, anywhere.**
- **Not built yet, so nothing to list:** badges, outcome check-ins, ontology data points (the only mention is a line in `docs/ideas.md`), college ILR, HESA IDs. `server/outcomes.js` records the programme outcome on `LEARNING_DELIVERY`, not a check-in.

---

## 2. Where the journey breaks today

The chain that exists is: **form → `FORM_SUBMISSION` → `LEAD` → `PIPELINE_ITEM` / `PLACEMENT` → (F6) `ONBOARDING` + `APP_USER` → (Warren, at enrolment) `LEARNER` → (F7) back to `LEAD.LEARNREFNUMBER`, and `APP_USER.LEARNREFNUMBER` → Burrow `EVIDENCE`.** Each hop works, but by a different ID, and no one table joins them.

| # | Break | What happens now |
|---|---|---|
| 1 | **Options app → Meadow** | Doesn't exist. The site has no identity by design, and the F0 consent flow (decision 36) is not built. The first person record starts at the provider's own form, with nothing linking it to anything the person did on the options site. |
| 2 | **Same person, two providers** | Two leads, two learners, no link. A lead is "one per email + date of birth **per organisation**". `ULN` is only checked for clashes inside one organisation, so the same ULN can sit in two `LEARNER` rows. Nothing says they're one person (and, for privacy, nothing should say so by accident, see section 4). |
| 3 | **Lead → learner is three IDs and two copies of one link** | `LEADID` → `ONBOARDINGID` → `LEARNREFNUMBER`, plus a third identity, the sign-in `USERID`. The link is stored twice (`ONBOARDING.LEARNREFNUMBER` and `LEAD.LEARNREFNUMBER`) and kept in step by F7 and its nightly reconcile. They can drift. |
| 4 | **Hand-over copies the person** | `ONBOARDING` takes a copy of the lead's name, email, DOB and postcode. After that there are two live copies with no shared key except `LEADID`, and the lead's retention rule doesn't reach the copy. |
| 5 | **Withdrawal proof** | Decision 36 says withdrawal deletes the details and keeps the consent events. `LEAD_CONSENT` is keyed by `LEADID`, so the proof is only as good as the lead row it points at. Without a person ID that survives, "whose consent was this" can't be shown after erasure. |
| 6 | **Warren → Burrow** | Works, inside one organisation, by `LEARNREFNUMBER` (and `USERID` for who created it). A learner who changes provider gets a new `LEARNER` row, and their portfolio can't follow. Burrow tables have no organisation column. |
| 7 | **Sign-in vs person** | `APP_USER.EMAIL` is unique across all organisations, and F6 refuses if the email already has a sign-in. A person who is a candidate at one provider and a learner at another is blocked by the second hand-over. |
| 8 | **Learner reference is not a durable ID** | `LEARNREFNUMBER` is the global primary key but is made by "highest existing `TESTL…` + 1" across all organisations. The real numbering scheme isn't decided. It's an organisation-issued reference, which is what the ILR wants, but not a person ID. |
| 9 | **College ILR, HESA, badges, check-ins** | No tables, no IDs. They'd start with no way to say who the person is. |
| 10 | **Employer contacts and staff** | A person appears as `CRM.CONTACT`, `ILR.EMPLOYER_CONTACT` and `APP_USER` (linked by `WARRENCONTACTID` and `USERID`), and officers as `OFFICER` and `APP_USER.OFFICERREFNUMBER`. Same pattern, different people. |

---

## 3. Proposed link table, and the columns to add

### Decisions for you first

1. **Who gets a person ID.** Everyone (Alan's answer, 31 October 2026): leads, learners and candidates, and also staff (officers) and employer contacts. So the columns below also go on `OFFICER`, `OFFICER_ASSIGNMENT`, `CRM.CONTACT`, `ILR.EMPLOYER_CONTACT`, and `APP_USER` for every kind of sign-in, and the link table has a `SYSTEM` value for each (`warren_officer`, `meadow_contact`, `warren_employer_contact`). The extra work is about a day and a half on top of the estimate below.
2. **When a second provider meets an existing person.** This is the one real design choice (see section 4, item 1). My recommendation: **mint a new ID per sign-up; reuse an existing one only when the person themselves presents it** (the Burrow account, or the options app after consent). Never match on email + DOB across organisations.
3. **Where the ID is minted.** Meadow's form handler for a public form; Burrow for a person who signs in first. Warren and the flows never mint, only look up.

### The table

Put it in its **own database**, `PERSON_DB` (schema `LINK`), not in `CRM_DB`, `CAPTURE_DB` or `SHARED_DB`. That follows the "three databases" separation: neither app role has any right in it, so there is nothing to revoke later. Owner `ACCOUNTADMIN`; written only through `FLOW_OWNER`-style procedures (`EXECUTE AS OWNER`) that take IDs, check the caller's organisation, and log.

`PERSON_DB.LINK.PERSON` (one row per person)

| Column | Type | Meaning |
|---|---|---|
| `PERSONID` | `VARCHAR(36)` PK, default `UUID_STRING()` | The Rarebit person ID. Random, no meaning, never derived from anything. |
| `MINTEDAT`, `MINTEDIN` | timestamp, `VARCHAR(20)` | When, and in `meadow` / `burrow` / `options`. |
| `ERASEDAT` | timestamp | Set when erased. The row stays as proof; the link rows go. |
| `ISTESTDATA` | boolean | As everywhere. |

`PERSON_DB.LINK.PERSON_LINK` (one row per system record)

| Column | Type | Meaning |
|---|---|---|
| `LINKID` | `VARCHAR(36)` PK | |
| `PERSONID` | `VARCHAR(36)` FK | |
| `SYSTEM` | `VARCHAR(30)` | `meadow_lead`, `warren_onboarding`, `warren_learner`, `app_user`, `burrow_portfolio`, later `college_ilr`, `hesa`, `badge`, `checkin`. |
| `ORGANISATIONID` | `VARCHAR(20)` NOT NULL | Whose record it is. Always set. |
| `SYSTEMKEY` | `VARCHAR(100)` | That system's own ID: `LEADID`, `LEARNREFNUMBER`, `USERID`… |
| `LINKEDAT`, `LINKEDBY` | timestamp, `VARCHAR(40)` | Who and when (a user ID or a flow name). |
| `ENDEDAT` | timestamp | Soft end (a learner leaves); never deleted except by erasure. |
| `ISTESTDATA` | boolean | |

Constraint: `UNIQUE (SYSTEM, ORGANISATIONID, SYSTEMKEY)`.

**Never in this table:** ULN, NI number, name, email, DOB, postcode. Those stay where they are, in the organisation's own record. If a ULN lookup is ever needed it is done inside one organisation, on `LEARNER`.

`PERSON_DB.LINK.LINK_ACCESS` is an add-only log of every lookup (who, which org, which system, when), like `RECORD_VIEW`.

An ontology data point is `PERSON_DB.ONTOLOGY.PERSON_FACT (PERSONID, CONCEPTID, VALUE, SOURCE, ORGANISATIONID, RECORDEDAT, ISTESTDATA)`. Add it later, in the same database, never in an organisation's.

### Roles, tags and masking

- **Roles:** no app role (`CRM_APP_ROLE`, `ILR_APP_ROLE`, the `GOLD_*` roles, `SITE_EXPORT_ROLE`, `TRANSFORM_ROLE`, `DATA_LOAD_ROLE`) gets anything on `PERSON_DB`. A new `PERSON_OWNER` role is held by `SYSADMIN` only (as `FLOW_OWNER` is). Each app role gets `USAGE` on exactly the procedures it calls: `PERSON_MINT` (Meadow, Burrow), `PERSON_LINK_ADD` (the flows), `PERSON_LOOKUP` (returns the ID only for a record in the caller's own organisation).
- **Tags** (`SHARED_DB.GOVERNANCE`): table `SENSITIVITY = 'minor'` (some are under 18, as on `LEAD`); `PERSONID` and `SYSTEMKEY` `personal`. A GUID is still personal data under UK GDPR while the link exists.
- **Masking:** a masking policy on `PERSONID` and `SYSTEMKEY` that shows the value only to `PERSON_OWNER`, and a SHA-256 hash to everyone else, including `ACCOUNTADMIN` when not acting as owner. A **row access policy** on `PERSON_LINK` limiting rows to the caller's organisation (through a small role-to-organisation table) as defence in depth, since no one but the procedures should read it anyway.
- **Retention and erasure** follow decision 21: erase the link rows and set `ERASEDAT`; the old versions stay reachable for the retention period, then 7 days Fail-safe.

### The column to add to each table (the ID beside its own reference)

`PERSONID VARCHAR(36)`, nullable at first, `NOT NULL` once backfilled, tagged `personal`, on:

- **Meadow:** `FORM_SUBMISSION`, `LEAD`, `LEAD_INTEREST`, `LEAD_CONSENT` (this one matters most: it keeps the proof after the lead is anonymised), `CONFIRM_TOKEN`, `LEAD_MATCH`, `PLACEMENT`, and `PIPELINE_ITEM`, `TASK`, `EMAIL_MESSAGE`, `RECORD_CHANGE`, `RECORD_VIEW` where the record is a lead. `STAGE_CHANGE` and `ACTIVITY_LINK` reach it through their item or record.
- **Warren:** `ONBOARDING`, `LEARNER`, and the child tables `LEARNING_DELIVERY`, `PRIOR_ATTAINMENT`, `LLDD_HEALTH_PROBLEM`, `LEARNER_FAM`, `EMPLOYMENT_STATUS`, `EMPLOYMENT_STATUS_MONITORING`, `LEARNING_DELIVERY_FAM`, `APP_FIN_RECORD`, `HOURS_RECORD`, `PROGRESS_REVIEW`, `LEARNER_EMPLOYER`, `OFFICER_ASSIGNMENT`, `RECORD_CHANGE`.
- **Sign-ins:** `ACCESS.APP_USER` (every sign-in: learner, candidate, staff, employer contact), `OFFICER`, `CRM.CONTACT`, `ILR.EMPLOYER_CONTACT` (staff and employer contacts, from Alan's answer).
- **Burrow:** `EVIDENCE` (and, so each can be found alone, `EVIDENCE_REVIEW`, `EVIDENCE_FILE`, `EVIDENCE_KSB`, `WITNESS_CONFIRMATION`, `IQA_CHECK`). I'd also add `ORGANISATIONID` to the Burrow tables while they're being changed.
- **TEST_BASELINE:** every copy of the above, and `scripts/journeys/*`, `test_reset_*` and `journeys_02_snapshot.sql` which copy them.

The sensible rule for children: the column is **copied from the parent at insert** (`LEARNER.PERSONID` into every row written for that learner). The Warren insert statements already use `select l.LEARNREFNUMBER … from LEARNER l`, so adding `l.PERSONID` is one extra column in each.

### Build order and rough size

Sizes are for one person working with Alan running the SQL, including `check:sql`, `check:tags`, `check:scoping` and the test journeys.

| Step | What | Rough size |
|---|---|---|
| 0 | The three decisions above, and a read of the live columns (`DESCRIBE`) | half a day |
| 1 | `PERSON_DB`, `PERSON`, `PERSON_LINK`, `LINK_ACCESS`, roles, the three procedures, tags, masking and row access policy, checks. Worksheet SQL for you to run. | 1.5 days |
| 2 | **Meadow:** `PERSONID` on the lead and its children; mint when a lead is created; `LEAD_CONSENT` and the form submission carry it; anonymisation keeps the consent rows | 2 days |
| 3 | **Flows:** F6 copies it to `ONBOARDING` and the candidate's `APP_USER`; Warren sets `LEARNER.PERSONID` at enrolment and adds the link rows; F7's reconcile checks the two sides agree | 2 days |
| 4 | **Warren children and Burrow:** the columns, the backfill from `LEARNER`, the insert statements, `ORGANISATIONID` on Burrow | 2 days |
| 5 | **Tests and baselines:** snapshot, reset, journeys generator, `check:scoping` and `check:tags` rules for the new column, tests that no API response contains `PERSONID` | 1.5 days |
| 6 | A **person-level erase** procedure that clears every table by `PERSONID`, copies included | 1 day |
| 7 | **F0, the options app → Meadow consent** (decision 36) | separate project: 3 days or more, and needs the decision in section 4, item 8 first |
| 8 | Later: ontology facts, badges, check-ins, college ILR, HESA IDs, each as a new `SYSTEM` or table | each ½ to 1 day once the link table exists |

Total for the link table and the columns, steps 0 to 6: **about 10 working days**, most of it mechanical, plus about a day and a half now that staff and employer contacts get IDs too (**about 11 to 12 days**).

---

## 4. What would expose a person across organisations

Today the only things that cross organisations are the global `LEARNREFNUMBER` key, the global `APP_USER.EMAIL` uniqueness, and the shared `SHARED_DB` reference data. **A person ID is the first deliberate cross-organisation key**, so the points below matter.

1. **The ID itself is a correlation key.** If two providers hold the same `PERSONID`, anyone who can read both organisations' tables (an analyst, `ACCOUNTADMIN`, a scoping bug) can see that one person is at both. Worse, if Meadow reuses an ID by matching email + DOB across organisations, **the act of matching tells provider B that provider A knows this person.** Mint per sign-up and reuse only when the person presents the ID (decision 2 above). Never expose the ID in any API response, export or screen.
2. **Isolation is in the app, not in Snowflake.** `ILR_APP_ROLE` can read every organisation's ILR rows and `CRM_APP_ROLE` every organisation's CRM rows; separation relies on `ORGANISATIONID` binds and session variables and on `check:scoping`. There are no row access or masking policies yet (`silver_01_setup.sql` says "later"). Putting the same ID in every table makes a single missed filter a cross-system, cross-organisation join. The row access policy on the link table and, ideally, on `LEARNER` and `LEAD` in step 1 and later is what closes this.
3. **`select *` will carry the new column.** `LEARNER_ROWS` in `server/access.js` is `select * replace (...) from ILR.LEARNER`. A new `PERSONID` column flows into it automatically. It needs the same treatment as `NINUMBER` and `ETHNICITY` (removed unless the caller is a manager, and never returned by the API) and a `check:scoping` rule that no response includes it. Employer contacts, who see learners in Burrow, must never get it.
4. **`APP_USER.EMAIL` is unique across all organisations.** Adding a user at provider B with an email already used at provider A fails (and F6 says why). That error reveals that the email exists elsewhere. Today this is a quiet leak; with a person ID it is the obvious place to fix (make the sign-in unique per organisation and person, or return one neutral error).
5. **`ULN` is unique per organisation, not across them, and must stay out of the link table.** It is the one ID the same person legitimately has everywhere; as a join key it would defeat the isolation. The same goes for `NINUMBER`. The decision already says this; the link-table design above keeps them out.
6. **Burrow tables have no `ORGANISATIONID`.** Their isolation is "join to `LEARNER` and filter its organisation". Adding `PERSONID` here would give a way to read a portfolio with no organisation test at all. Add `ORGANISATIONID` at the same time.
7. **Copies of personal data outlive the record.** `ONBOARDING`, both `RECORD_CHANGE` tables (old and new values), `FORM_SUBMISSION.PAYLOAD`, `EMAIL_MESSAGE.TOADDRESS`, free-text `ACTIVITY.BODY` and `STAGE_CHANGE.NOTE`, and Time Travel copies all hold names and emails. A person-level erase (step 6) has to cover every one of them, or erasure by `PERSONID` will leave some behind.
8. **The options app and the GUID.** The site's rules are: no tracking, answers on the device only, no network calls except same-origin static files. A GUID stored on the visitor's device and sent with each request is exactly a tracking identifier, and F0 needs a server to send to. This needs your decision before step 7: for example, the ID is made only at the moment of consent, held in the Meadow/Burrow account and never in the site's `localStorage`, and under-16s never get one (decision 36). Until then the site must keep the rule that it holds no identity.
9. **Ontology facts keyed by person ID are a profile.** Concepts such as health, ethnicity or needs are special-category data. In `PERSON_DB` they are joinable across organisations by design, so each row needs its `ORGANISATIONID` and the consent it rests on, and the table should be tagged `special-category` and masked from day one.
10. **Roles that read widely must not get near it.** `TRANSFORM_ROLE` has nothing in `CAPTURE_DB` today and `DATA_LOAD_ROLE` can read `TEST_BASELINE`. Keep it that way for `PERSON_DB` and `CRM_DB`: the check in `scripts/check-grants.js` should list `PERSON_DB` as having no holders but `PERSON_OWNER`. `SITE_EXPORT_ROLE` reads only the two `GOLD_SITE` roles and is unaffected.
11. **Staff and employer contacts have IDs too.** An employer contact with Burrow access, or a tutor who works for two providers, would carry the same ID in both places. That is by design for the person, but it makes the point in item 1 sharper: the ID is never returned to any screen or API, and an employer contact's `PERSONID` is never joinable to a learner's through anything the contact can query. Keep them on their own `SYSTEM` values and out of the learner join.
12. **Test data.** `ISTESTDATA` is on every table, which helps: the baseline, reset and journey scripts must also write test people into `PERSON`/`PERSON_LINK` with `ISTESTDATA = TRUE`, and the "test never meets real" rule in the flows applies to the link table too.

---

## What I'd do next, if you approve

Nothing has been started. The first piece is the three decisions in section 3. After that, step 1 is a worksheet SQL file for you to run, then steps 2 onwards on a branch (`SQL work on a branch`: code that needs SQL stays unmerged until you confirm the SQL ran).
