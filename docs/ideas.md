# Ideas

Things worth doing one day that aren't planned yet. One line each: the
date it was raised, who raised it, and the idea. When one is planned or
built, move it out (or strike it through with where it went).

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