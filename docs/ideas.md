# Ideas

Things worth doing one day that aren't planned yet. One line each: the
date it was raised, who raised it, and the idea. When one is planned or
built, move it out (or strike it through with where it went).

- 2026-10-09, Alan: next time the school leavers app's page data is
  reloaded (npm run load:data -- 2), bundle the 2,689 institution files
  into one file before uploading, so it takes seconds, not 25 minutes.
- 2026-10-05, Alan: when an apprentice returns from a break on a
  different standard, record that properly (left out of 4g-2, which
  covers returning on the same standard).
- 2026-10-05, Claude: with session reuse, keep a session whose browser
  gave up when no query was still running on it, instead of always
  throwing it away (about 12% of requests in a test run).
- 2026-10-05, Claude: write each save's history rows (ILR.RECORD_CHANGE)
  in one insert instead of one per change, so saves make fewer trips to
  Snowflake.
- 2026-10-04, Claude: the employer on an apprentice's employment status
  record and the employer who sees them in Burrow (ILR.LEARNER_EMPLOYER)
  are kept separately; changing one doesn't change the other. Decide
  whether one should follow the other.
- 2026-09-28, Claude: other vacancy sources besides Find an apprenticeship
  (Adzuna, Reed). Their terms of use haven't been checked.
- 2026-10-06, Alan: move the LARS, SKILLS and REF imports to the layered
  pattern (raw responses in RAW, cleaned tables built from them), like
  Companies House and the vacancy import.
- 2026-10-06, Claude: Companies House's Streaming API (real-time changes to
  every company) instead of the nightly refresh, if the number of employers
  grows a lot. At most two connections per account.
- 2026-10-06, Alan: a CRM for employers, kept in mind but not built yet. So
  that it fits later: one employer table for prospects and clients (a
  status, not a second table), room for a parent employer link (group
  companies and franchises), and permanent IDs (EMPLOYERID, SITEID,
  CONTACTID never reused or changed) so an outside CRM could be matched up.
  Contacts are already one record per person (ILR.EMPLOYER_CONTACT, step 5).
- 2026-10-06, Claude: show managers what changed at Companies House for
  their employers ("name changed on 3 October"). The nightly refresh logs
  each employer's changes but doesn't keep them per organisation yet; it
  needs its own table, since EXT.COMPANY_CHANGE is shared.
- 2026-10-06, Alan: when an employer contact has no access (not head office
  and no current site assignment), Burrow should say "You haven't been given
  access to any sites yet; contact your training provider" instead of "You
  have no current apprentices".
- 2026-10-06, Alan: dashboards at three levels: site (a site contact sees
  their site's apprentices: progress, overdue reviews, off-the-job hours,
  witness statements waiting), company (head office sees every site side by
  side and drills into one), and across companies (Warren managers compare
  employers). Built on the existing Burrow and Warren visibility rules, and
  a natural use for the gold reporting layer.
  Every dashboard can be broken down and filtered by postcode area (region,
  local authority, combined authority) from REF.POSTCODE, grouped either by
  site postcode (where people work) or learner home postcode (where they
  live, allowing deprivation index reporting).
  Compare against local area data by local authority code: median pay from
  ONS ASHE via Nomis, claimant count and unemployment (useful for Restart
  Scheme context), qualification levels, and the deprivation index. Imported
  through the RAW/EXT layers like Companies House, refreshed yearly.
  (Claude: home postcodes are personal data, so group them, never show them,
  and hide small groups so individuals can't be identified, as for the
  reporting-by-ethnicity idea.)
- 2026-10-07, Alan: an apprentice's standard version is taken from their
  start date, but providers can move an apprentice onto a newer version
  partway through, and the EPA is against that version. A manager needs to
  record the apprentice's actual version, overriding the start-date
  default, with the change in the history (audit log). KSB claims already
  store the version they were made against, so they're unaffected.
## Ideas from Alan, 5 October 2026

### Learners and matching
- Vacancy matching with maps showing the distance between the employer's and the participant's postcodes, including public transport routes. (Claude: builds on the planned vacancy import and matching steps; ONS postcodes are already loaded in REF.)
- Diagnostic assessments and skills onboarding. (Claude: overlaps the four-part diagnostic already drafted.)
- Functional Skills app. 2 Options, create own in first instance and then find the cheapest alternative
- Programme and exit interview surveys.
- Gamification ideas.
- Calandar view for appointments and reviews, taking into account back holidays and weekends for funding regulations
- CV Builder
- Signposting Learners if they have issues or needs ie Confidence issues, find a company nearby that can help

### Staff and organisation
- Add sites. (Claude: fits with part 8 teams and regions; decide how sites relate to teams. These read as the provider's own centres; employers' workplaces are "employer sites", proposed for employers step 5.)
- Photos of staff.
- A clear weekly manager view to use in one-to-ones.
- Safeguarding coverage. (Claude: needs its own access rules and audit, like the sensitive fields.)
- Traning videos for each Role and System
- Create an amazing Demo video for each system

### Communication and evidence
- Text message functionality.
- Record audio of reviews and other conversations, and pick out important words. (Claude: needs consent from everyone recorded, GDPR retention rules, and care with where audio is processed.) - Eleven Labs
- Digital signatures inline in PDFs.

### Reporting and dashboards
- Reporting of each metric as a % against regions, sites, managers, tutors, assessors, qualifications, gender and ethnicity, with AI suggesting where gaps are and offering help. (Claude: ethnicity is managers-only today; small groups need hiding so individuals can't be identified.)
- Interactive dashboards with drill-down on basic charts.
- Quality team reports.
- Budgets against actuals for finance directors.
- Everything Ofsted needs, at the click of a button.

### Sales
- CRM for sales: employers, Sales pipeline, email integration, as little free text as possible. (Claude: ties in with the Companies House employer lookup.)

### Look and feel
- Themed skins depending on the date and the company.
- Make the system a tool that people don't shy away from and they get something back from

### Data architecture
- Bronze, silver and gold layers in Snowflake. (Claude: raw imports, cleaned data, then reporting tables; worth deciding before the reporting ideas above.)
- Data defination Libary 
- internal business ontology coupled with an agentic data platform built inside Snowflake to manage its large-scale semantic data integration
- Have a look within Snowflakes Apps to see if we can get data from the Apps section
- Any Outstanding API's we need such as LRS

### Afters
- A list of all different Learning institutions and contracts (University, College, School, Sixth Form, summer camps, anything that is funding, and also Look at companies like ITS in Manchester)
- For business development team to have all contracts released for tender to drop into a CRM
- Create visio type data model how every System and Software element Joins - (Maybe can be done with coco and Snowflake)
- Training Platform like Udemy, either create (impossible) or get them to sign up to the Product
- Costings of a Demo (Beta) System by Each different module (Apprenticeships, Traineeships, restart etc)

- 2026-10-07, Alan: just a note for the Caseload tool for Apprenticships. Allocating a certain amount against a tutor or assessor is based on Location, What they deliver, current caseload (dependant on targets set by Managers) and learner ability eg Prior Attainment

- 2026-10-14, Alan (parked): the UK Register of Learning Providers (UKRLP) as the source for the websites of training providers outside GIAS. About 2,900 providers in OPTIONS_DB.SILVER.PROVIDER have no website (1,150 on APAR, 1,474 in Ofsted's FE list). To look into: registering for its web service (a stakeholder ID), and why its provider query service (webservices.ukrlp.co.uk, versions 5 and 6) answered 502 on 14 October 2026.

- 2026-10-15 (noted while building provider_benchmark): the school leavers app's education and training achievement rates (OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER_SUMMARY, silver achievement_rate) come from the 2024/25 release (2021/22 to 2023/24). The 2025/26 release (2022/23 to 2024/25, with provision type) is now loaded as ACHIEVEMENT_ET_PROVIDER for provider_benchmark. Moving the app on to it would bring 2024/25 in, and needs the app's own figures and compare:gold-site checked at the same time.

- 2026-10-15 (travel times, decision 19): operators missing from the BODS Yorkshire GTFS (feed 20261015_030627).
  - Stagecoach Yorkshire: resolved. The 31 routes bustimes.org lists but the feed doesn't have (3, 5, 15, 16, 39, 48, 48A, 49, 51, 54, 56A, 63, 65A, 74A, 75, 77, 84, 90, 90A, 90B, 91, 157, 158, 159, 160, 169, 170, 470, 583, 584, X66) are its Chesterfield-area services (licence PC1118599), filed under the East Midlands region and running in Derbyshire, not South Yorkshire. Its cross-boundary routes 21, 65, 73, 74 and 130 are already in the feed (Alan checked the BODS data catalogue, 15 October 2026).
  - Powells: still to check. It isn't on BODS at all; it may have stopped running or been renamed.
  - When the travel times add Derbyshire, include the BODS East Midlands GTFS file.

- 2026-10-20, Alan (travel times; after rail is merged, as its own job): Chapeltown to Sheffield by bus comes out at 68 minutes (median, 07:30-08:30, LSOA E01007894 to E01033274, the areas nearest each station), in phase A and in the phase B bus-only column. That looks too slow. Investigate the bus-only times: which routes and stops r5py uses for it (detailed itineraries for a sample of pairs), and whether BODS services are missing from the clipped feed (clip_gtfs.py) or from the feed itself.
  - Checked 2026-10-21: no fault. The time matches the published peak timetable plus walking and waiting. r5py takes the 2A or the 1 from Ecclesfield Road to Arundel Gate (38-54 min in the feed between 07:30 and 08:30), with a 3-15 min walk to the first stop and a short hop and walk at the far end. Every Chapeltown service is in the BODS feed and in the clipped copy (same counts for 10 November), and there are 49 stops within 1 km of the centroid. No pipeline change: the app will show the p25-p75 range instead of one number.
- 2026-10-20 (travel times phase B): Deighton and Ravensthorpe have only rail replacement buses (category BR) in the 16 October SCHEDULE extract, most likely for the TransPennine Route Upgrade works, so they get no rail. Replacement buses are left out on purpose (cif_to_gtfs.py); revisit if they run for long.
- 2026-10-21, Alan (reach map; decision 42): a "show specialist provision" filter. The reach map's dots leave out special schools by default (GIAS types with "special" in them, including academies and non-maintained and independent special schools with a sixth form), so the list is the general options for school leavers. A later filter would show them, for young people and families who need specialist provision.
- 2026-10-21 (train fares, phase C; plan only, under the NRE terms v3.0 in docs/licences/nre-terms-v3.0.md): download: the portal's fares data changes about three times a year, so check for a new version every 14 days from the travel-monthly job (the portal login must also be used within its expiry window: confirm it, a public source says 30 days) and load only a changed one (about 3 loads a year: far below High Volume Usage, but the Usage Charging Document is still to read); keep the version and the date we accepted it (v3.0). Show: the fares exactly as the feed publishes them for the 75 South Yorkshire stations' pairs people ask about (nearest station to Sheffield, Barnsley, Doncaster, Rotherham), adult and child singles and returns by the feed's own ticket types and restrictions, with the feed's own dates (Time-Bound Data as directed); the 16-17 Saver and 16-25 Railcard only through the feed's own discount tables, labelled "from the discount table"; nothing averaged, rounded or summed (content must not be amended: selecting rows is fine); never added to bus or tram fares or to journey times; no wording that suggests NRE endorses Rarebit; NRE's logo only as the Developer Guidelines allow. Attribution (Developer Guidelines read 21 October 2026, docs/licences/nre-brand-guidelines-2026-09/): the words "Powered by National Rail Enquiries" with a link to the NRE website, on the data sources (attribution) page since the fares are combined with other feeds, no logo; ask NationalRailDatafeeds@raildeliverygroup.com to confirm words alone are acceptable before showing any train fare publicly. Gaps to close first: NRE's answer on words-only attribution, that Fares is a feed on Alan's account, and the portal's expiry rule (no Usage Charging Document is published). The terms are personal to Alan: register Rarebit's own account when it is incorporated. Sessions 3; Snowflake credits about 1 to 3; SQL: sql/load_17_nre_licence_tag.sql (the LICENCE tag value) now, then bronze tables with the fares load.
- 2026-10-21, Alan (train fares; paused): download the RSPS5045 specification ("Fares and associated data feed interface specification", version P-02-03, 3 June 2025) when rspaccreditation.org is back (it returned 503 to every client on 21 October; link on RDG's fares data page, https://www.raildeliverygroup.com/our-services/rail-data/fares-data.html, to https://www.rspaccreditation.org/publicDocumentation.php; a search found https://www.rspaccreditation.org/downloadPublic.php?did=TzHg97WTRws7xr3kABaIuF9ZM2QkgAN7hmdpJRwBpyNbFXFadb ; the RDG-hosted copy of version 02-00 is a 404). Save it in docs/licences/rsps5045/ and read it before planning silver for train fares (flow precedence, status and usage codes, non-derivable overrides, discounts). Train fares stay paused until RDG confirms whether a live public app is covered by the portal's fares data ("for use in proof of concept or development work"); the bronze load (RDG_FARES_LINE) is done and nothing is built on it. The fares panel says "Train fares coming soon".
- 2026-10-21, Alan (tidy-jobs, from docs/data-journey.md; after the move to Max): two retention jobs, planned and not built. Answers recorded in docs/before-real-data.md.
  - Gap 4, F7's nightly reconcile: a daily `onboarding-reconcile` job as `ILR_APP_ROLE`. List the onboarding records that have a status, call `SHARED_DB.FLOW.F7_ONBOARDING_STATUS(id, NULL)` for each (the procedure already treats a null user as the scheduler: it copies Warren's status into the CRM and never touches sign-ins or roles), record counts in `OPS.JOB_RUN`, count a refused call as a failure. Dry run first, and a test on test records only.
  - Gap 5, retention, as one `RETENTION_ROLE` owned by the procedures and held only by a new service user (a new key pair, `check:grants` rule for it, `ALTER USER ... SET TIMEZONE = 'Europe/London'`). `crm-retention` anonymises a lead with no activity (form, email, activity, task or stage move) for 12 months (decision 36): blank `PERSONAL_LEAD_FIELDS`, set `ANONYMISEDAT`, log counts only; test leads only when a flag says so; leads handed over to the learning side follow the learning record's retention instead. `vacancy-retention` deletes adverts whose closing date, or else `GONEAT`, is more than 2 years ago, from `EXT.VACANCY` and its `RAW.FAA_VACANCY_PAGE` responses. Both need a dry-run count, and `check:tags --crm`, `check:grants` and `check:scoping` extended to cover the new objects. Needs SQL that Alan runs in a worksheet, so it stays on a branch until he confirms.
  - Gap 3, the reach export job, is next and is built on `tidy-jobs`: it runs `export.js` and `check-export.js` after `transform-silver`, then `reach:data` in `~/school-leavers-app` if that folder exists; if it skips, it logs the skip in `OPS.JOB_RUN`.
- 2026-10-21, Alan (postcodes; gap 6 of docs/data-journey.md): use silver's postcode list, not `SHARED_DB.REF.POSTCODE`. Switch the apps over as part of gap 1 (moving the apps onto gold), not before. `npm run check:postcodes` found the two lists agree on all 2,729,090 postcodes (same live or terminated state, terminated month and location); the only difference is 13,173 local authority codes, which are the Channel Islands' `L99999999` and the Isle of Man's `M99999999` in `REF` against empty in silver. The apps use `REF.POSTCODE` in `server/vacancies.js` (latitude and longitude) and `server/employerSites.js` (a live postcode), and the CRM's postcode column comment names it; gold's `postcode_area` is the place to read it from. After the switch, `REF.POSTCODE`, the `TRANSFORM_ROLE` read on it (`sql/postcode_check_01_grant.sql`, the `check:grants` allowance) and `check:postcodes` can go.
- 2026-10-21, Alan (parked until he is on Max; from the official-api failure since 21 Oct): plan 3, Key stage 4 v2.0. DfE's new versions of the two Key stage 4 data sets (`19e39901…` school, 90 columns against 156; `b3e19901…` geography, 144 against 200) can't load into the existing tables. Decided: keep the v1 tables and their history (including 2022/23); add separate `_V2` RAW tables for the new layout (`sql/load_19_ks4_v2_tables.sql`, generated from the v2.0 headers, with grants and bronze tags; Alan runs it); the loader pins a major version per table (v1 files to the old tables, v2 to the new, v3 fails loudly); silver combines them on shared columns by year (v2 where it has the year, otherwise v1) in a new `ks4_school_result` (school, year, measure, value, status), and `school` reads its latest year from it; measures DfE dropped (the EBacc family and others: the v1 and v2 header difference, tested) show "not published for 2025/26", never blank. The geography v2 goes to bronze only until silver uses it. About 550k Claude tokens; Snowflake cost negligible. Needs SQL run first, so the code waits on a branch.
- 2026-10-21, Alan (parked until he is on Max): the source-health job, in two halves. **First half (sessions 1 and 2, about 900k tokens):** the registry (`scripts/health/sources.json`, synced to `OPS.SOURCE_REGISTRY` when it changes: name, owner URL, kind, probe type, refresh, tolerance); the FAILING state in `check:jobs` (3 failed runs in a row, or failing for 6 hours; the latest error shown; non-zero exit; retry backoff 1h, 2h, 4h, up to daily); job health for all 14 jobs from `OPS.JOB_RUN`; green, amber or red per source, logged to `OPS.SOURCE_PROBE` and `SOURCE_PROBE_LOG` in one batch a day, or at once when a status changes; live probes of the API sources (reachable, auth, format, new data), including the DfE data sets' version check (`latestVersion`, which `fetch-official.js` already reads), which would have flagged the Key stage 4 change on 21 Oct. **Second half (sessions 3 and 4, about 700k tokens):** probes for the monthly and quarterly feeds (Network Rail, BODS timetables and fares, OpenStreetMap, police.uk, APAR, NaPTAN, listed buildings, Wikidata, the National Rail Data Portal), the "due for re-check" reminders for hand-fetched files (ONS postcodes, IoD, Graduate Outcomes, Ofgem, fuel poverty, GIAS, Ofsted, 16-18 performance, achievement rates, Discover Uni, LEO) and hand-checked ones (Supertram fares, college campuses, term dates, the licence and terms pages), and the daily email only when something is amber or red: a Snowflake email notification integration (`RAREBIT_HEALTH_EMAIL`, with `ALLOWED_RECIPIENTS`) and a procedure `SHARED_DB.OPS.SEND_HEALTH_EMAIL(subject, body)` run with its owner's rights, granted to `DATA_LOAD_ROLE` only; the SQL is Alan's to run as ACCOUNTADMIN, and the address must be verified on his Snowflake user. **The health email address is still to decide:** Alan is moving all Rarebit accounts to alanlmsbuild@gmail.com later, so the address goes in last. Snowflake cost about 1 to 4 credits a month (probes run on the laptop and cost nothing; only the daily batch write and any email use the warehouse).
  - Ofqual register entry for the registry (2026-10-22, Alan): name Ofqual Register of Regulated Qualifications; owner URL `https://register-api.ofqual.gov.uk`; kind `api`, no key; expected refresh **weekly**, tolerance **2 days**; probes: reachable (`GET /api/Qualifications?page=1&limit=1` answers 200), format (the record's field list is unchanged: 40 fields for qualifications, 26 for organisations), new data arrived (`count` differs from the last load), size (the count is within 5% of the last load). Amber if the count falls more than 5% or the fields change, or the last good load is more than 9 days old; red if the API answers 4xx or 5xx on 3 probes in a row or returns invalid JSON. The loader's own checks (`docs/scheduling.md`) already fail the run on these.
- 2026-10-22, Alan (qualification cards; branch `qualification-cards`): the other-vocational qualifications (7,478 rows with `card_family = 'Other vocational'`, Levels 1 to 3) stay in `SHARED_DB.SILVER.QUALIFICATION_CARD` but are off the cards (`on_cards` false). Later they are filtered with the LARS Section 96 16-18 approval (qualifications approved for funding for 16-18 year-olds), so only those can get a card. Needs LARS loaded in bronze first (`scripts/import-lars.js` holds the approvals today). "Not yet available to learners" qualifications are left out on purpose.
- 2026-10-22, Alan (Snowflake spend; B1 of the spend check): **Key stage 4 performance is paused in the `official-api` job** until plan 3 (Key stage 4 v2 tables, above) is built. It failed on every run since DfE's version 2.0 changed the layout, so the job ended "partial" and was retried every hour (about 12 runs a day, about 0.55 credits a day on 22 October). Out of the run: load step 17 and the two data sets `19e39901-a96c-be76-b9c2-6af54ae076d2` and `b3e19901-5d2b-b676-bb4c-e60937d74725`. **To put them back when plan 3 is built:** in `scripts/fetch-official.js` add `...KS4_EES_SETS` to `EES_SETS`, put `17` back in `LOAD_STEPS.api` (`[17, 18, 19]`), and put the Key stage 4 checks in `test/official-partial.mjs` back (the tests now use steps 18 and 19, and 4 fetches). `npm run load:data -- 17` still runs the step by hand. The KS4 tables keep what is loaded (v1 and the v2.0 data already in Snowflake).
- 2026-10-22, Alan (travel advice for the Honest Guide, decision 57): the FCDO travel advice is loaded **daily for now** (`official-travel-advice`, overdue after 30 hours). **Switch it to every 2 hours before the Honest Guide goes live** (`every` and `overdueAfter` in `server/jobSchedule.js`, and the table in `docs/scheduling.md`): a no-change run is one request and does not touch Snowflake, so it costs almost nothing. Parked with it: the source-health registry entry for the FCDO advice (name FCDO foreign travel advice; owner URL `https://www.gov.uk/api/content/foreign-travel-advice`; kind `api`, no key; expected refresh daily, tolerance 3 days; probes: the index answers 200, the country count is within 5% of 226, the newest `public_updated_at` is under 14 days old); the FCDO map image and PDF (links only until FCDO confirms the licence in writing); telling GOV.UK its terms page links OGL v1 where its footer and API page say v3; other governments' travel advice beside the UK's (licences to check first); silver and gold models for the advice (latest page per `content_id`, alert level by country, change history by date).
