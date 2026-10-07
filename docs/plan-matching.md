# Plan: the onboarding journey and matching

The rest of the plan Alan approved on 28 September 2026 ("employers,
vacancies and the learner diagnostic"). Steps 1 to 3 are done. On 7 October
2026 Alan redesigned steps 4 to 7 as an **onboarding journey in three
stages**, based on the apprenticeship funding rules for August 2026 to July
2027 (Version 3, July 2026; DWP): an interest form with matching, the
initial assessment, and generated documents. The proposal, checked against
the rules, is the doc "Onboarding journey proposal"
(https://claude.ai/code/artifact/63c89b93-d6b8-4308-8925-a624f4e83872);
this file is the plan of record.

Commit and stop after each step. Every step is proposed for Alan's OK
before anything is built.

## Where things stand

| Step | What | State |
|---|---|---|
| 1 | Reference data: SOC 2020 index, interest words, SIC lists, postcodes; Skills England occupations linked to SOC | Done (REF schema, `npm run import:ref`; SOC links from `npm run import:skills`) |
| 2 | Vacancy import | Done (`npm run import:vacancies`, EXT.VACANCY; scheduled since 7 October) |
| 3 | Employers with Companies House | Done (then employer sites and contacts) |
| Stage 1 | Interest form, CRM leads, interests and matching (was steps 5 and 7) | Next, to propose |
| Stage 2 | Initial assessment (was steps 4 and 6) | |
| Stage 3 | Documents: training plan, apprenticeship agreement, ILR record | |

What the stages build on, as of 7 October 2026:

- **REF**: SOC2020_INDEX (32,439 job titles, ONS coding index Version 14),
  SOC2020_UNIT_GROUP (412), SOC2020_SUB_UNIT_GROUP (1,384), INTEREST_WORD
  (69 everyday words, 212 word-to-title pairs, each checked against the
  index), SIC2007 (731) and SIC2007_TO_SIC2026, POSTCODE (the ONS Postcode
  Directory, 2.7 million postcodes with coordinates).
- **SKILLS** (Skills England, weekly): every version of every standard with
  its KSBs, duties and options; OCCUPATION_PROFILE (1,167 occupations),
  OCCUPATION_SOC (3,508 SOC codes for 1,106 occupations), OCCUPATION_TERM
  (typical job titles and keywords).
- **EXT.VACANCY**: open adverts from Find an apprenticeship, NHS Jobs and
  Civil Service Jobs, refreshed every 2 hours (new) and 24 hours (all).
- **ILR.EMPLOYER_VACANCY**: an organisation's own, manager-confirmed links
  from adverts to its employers (and their sites).
- **The ILR record screens** (part 7 step 4): staff already capture and edit
  the learner record and its aims on the Record tab.

## Decisions

From the approval (28 September 2026, Alan):

1. **Candidates as well as apprentices.** Sensitive ILR questions
   (ethnicity, LLDD and its categories, NI number) are asked only at
   enrolment (now stage 2): collect the minimum until then.
2. **English and maths from an approved tool.** Record results from an
   approved assessment tool (level reached, date, tool), not a test of our
   own. The tool is a picklist the provider sets up, with "Other".
3. **Order.** Steps 1 to 3 first, the rest after part 7 steps 3 and 4.

Decided since, in the steps already built:

- **Nothing a manager sees may differ by whether another organisation has
  the same company** (2026-10-06, Alan).
- **Adverts are linked to employers only by a manager** (2026-10-06): an
  advert has a setting (SIC) only for an organisation that has linked it to
  one of its employers with a company.
- **Adverts live in EXT.VACANCY, not a JOBS schema** (2026-10-06); employer
  contact details in adverts stay in RAW only.
- **KSBs come from the apprentice's version of their standard** (2026-10-07,
  Alan), chosen by start date (server/ksbVersions.js). The skills scan uses
  the same version; someone not yet started uses the version open to new
  starts.
- **Match on options' SOC codes too** (2026-10-07, Alan). For a standard
  with options, match on the SOC codes of its options' occupations
  (SKILLS.STANDARD_OPTION's OCCUPATION_CODE, then OCCUPATION_SOC) as well as
  the standard's own. In the first import 139 standards approved for
  delivery had no occupation under their own code, and for 136 of them at
  least one option's was found. Three approved standards have no occupation
  found at all, so no SOC codes: ST0389 Poultry worker (10 options, none
  found), ST0587 Internal audit practitioner and ST1422 Bus, coach and heavy
  goods vehicle service and maintenance technician (no options). Matching
  needs another way in for those, or to say they can't be matched by SOC.
- **UK time everywhere** (2026-10-07, Alan): Europe/London (src/ukTime.js).

The onboarding journey (2026-10-07, Alan):

- **Three stages**: an interest form on the Rarebit website feeding a CRM
  (candidate and lead records), with matching; the initial assessment once
  there's an employer and a job; generated documents.
- **Ask once, then confirm.** Every question maps to where it ends up (ILR
  field, eligibility evidence, skills scan, training plan or apprenticeship
  agreement). Later stages show earlier answers pre-filled to confirm; a
  change updates the record and keeps the history.
- **Date of birth at stage 1.** When an age rule (Level 7, ST1472,
  foundation apprenticeships) rules a vacancy out, it's still shown, with
  the reason.
- **The interest form is public, with no sign-in**: a privacy notice and
  consent, a confirmation email, and matching on email so the same person
  doesn't become two leads.
- **Stage 1 shows who can get a funded apprenticeship** in a short,
  plain-language note, without asking about nationality or immigration
  status (those wait for stage 2, with staff).
- **The privacy notice must be readable by someone aged 15**: people can
  start from the end of June in the school year they turn 16 (rules 30.1).
- **Documents as PDFs first.** The training plan and the apprenticeship
  agreement are generated as PDFs; signing in Rarebit is a later sub-step
  (rules 347 allow electronic signatures if irrefutable). They must be
  separate documents (99.4); the agreement is signed by the employer and the
  apprentice only, never the same person (71.1).
- **The ILR care leaver field** is confirmed from the 2026 to 2027 ILR
  specification before building.

## The funding rules each stage must meet

Paragraph numbers are from the funding rules, Version 3.

- **Initial assessment, four areas (27)**: learner eligibility (29 to 34,
  Annex A), recognition of prior learning (35 to 39), learning support
  screening (40 to 46), English and maths (47 to 62). The provider records
  the type of evidence it saw for eligibility (page 14).
- **Prior learning for everyone**: the personal learning record check and a
  discussion (37, 38.1); a skills scan against the standard's KSBs for 19+,
  and for 16 to 18 if appropriate (38.2). Hours and price come down (39);
  under 8 months or 187 hours left is not fundable (39.1.1).
- **English and maths**: mandatory for 16 to 18 without a suitable
  equivalent; for 19+ only if the employer agrees, and the apprentice must
  be told it's funded if so (47). The decision is documented for everyone
  (48). Current-level assessment only when a standalone qualification is
  funded and there's no acceptable evidence (52). SEND exception to Entry
  Level 3 (58 to 62).
- **Care leavers' bursary** for ages 16 to 24 (64, 127): £3,000 in three
  parts, tax-free, not counted in Universal Credit, no need to tell the
  employer; a local authority letter and a signed declaration; for 19 to
  24, consent before the employer is told (127.4).
- **The outcome agreed with the employer (63)**, the provider's six points
  (65) and the employer's four (66), in the signed training plan or the
  contract for services.
- **Residency (Annex A)**: three years' ordinary residence in the UK and
  Islands before the start (358, 361), with EUSS, Irish, family-member and
  protection-status routes (364 to 370); asylum seekers, student or visitor
  visas and overstayers are not eligible (372, 377); a visa must last long
  enough to finish (30.2).
- **Hiring payment for non-levy employers** (133), from 1 October 2026:
  ages 16 to 24, employed no more than 90 days before the practical period
  starts.
- **Documents**: the training plan's contents (100), the agreement's (72),
  fully signed within 42 days if training starts on broad agreement
  (99.1.1).

## Every question, and where it ends up

● = the stage asks it; ✓ = shown pre-filled to confirm. By: P = the person,
S = staff, E = employer. Rule = funding rules paragraph.

| # | Area | Question | 1 | 2 | 3 | By | Ends up in | Rule |
|---|---|---|---|---|---|---|---|---|
| 1 | Contact | Given and family names | ● | ✓ | ✓ | P | CRM, then ILR GivenNames, FamilyName; training plan; agreement | 72.1, 100.1 |
| 2 | Contact | Email; mobile | ● | ✓ | | P | CRM (email also matches duplicate leads), then ILR Email, TelNo | |
| 3 | Contact | Home postcode | ● | ✓ | | P | CRM (matching), then ILR Postcode | |
| 4 | Contact | Date of birth | ● | ✓ | | P, S | CRM (age rules in matching, with reasons), then ILR DateOfBirth; eligibility evidence (ID seen) | 29.2 |
| 5 | Contact | Privacy notice consent; marketing and contact consent | ● | ✓ | | P | CRM; ILR contact preferences | |
| 6 | Identity | Full address; postcode before starting | | ● | | P | ILR address, PostcodePrior | |
| 7 | Identity | Sex | | ● | | P | ILR Sex | |
| 8 | Identity | Ethnicity | | ● | | P | ILR Ethnicity | |
| 9 | Identity | NI number | | ● | | P, S | ILR NINumber (must be accurate; checked for the hiring payment) | 350, 136.1 |
| 10 | Identity | ULN (Learning Records Service lookup) | | ● | | S | ILR ULN; personal learning record check | 344 |
| 11 | Identity | Emergency contact | | ● | | P | Provider record | |
| 12 | Interests | Jobs or sectors they're interested in, coded to SOC 2020 | ● | ✓ | | P | CRM; matching | |
| 13 | Interests | How far they'll travel, and how | ● | ✓ | | P | CRM; matching | |
| 14 | Interests | Hours they want | ● | | | P | CRM; matching (actual hours: 31) | |
| 15 | Interests | What they're doing now (school, college, work, not working) | ● | ✓ | | P | CRM, then ILR employment status before the start | |
| 16 | Interests | English and maths: GCSE 4+ or Functional Skills level 2? Other qualifications | ● | ✓ | | P, S | CRM (level fit, what to work on), then ILR PriorAttain; English and maths decision (46); certificates seen | 47.3 |
| 17 | Eligibility | Nationality; right of abode | | ● | | P, S | Eligibility evidence (ID seen) | 354, 358 |
| 18 | Eligibility | Lived in the UK and Islands for the 3 years before the start? | | ● | | P | Eligibility evidence | 358, 361.1 |
| 19 | Eligibility | If not a UK or Irish citizen: immigration status (EUSS settled or pre-settled, refugee, humanitarian protection, discretionary leave, Ukraine or Afghan scheme, other visa) | | ● | | P, S | Eligibility evidence (permission or share code seen) | 364 to 370 |
| 20 | Eligibility | Visa or permission end date | | ● | | P, S | Eligibility evidence; checked against the planned end date | 30.2 |
| 21 | Eligibility | Any of those 3 years mainly for full-time study? On a student visa? An asylum seeker? | | ● | | P | Eligibility evidence | 361.2, 372, 377 |
| 22 | Employment | Employer and job title | ● (vacancy) | ✓ | ✓ | E | ILR employer (ERN); training plan; agreement | 72.1, 100.1 |
| 23 | Employment | Employment start date; contract end date if fixed-term | | ● | ✓ | E | Eligibility evidence (covers the whole apprenticeship); ILR employment status; hiring payment | 69, 133.4 |
| 24 | Employment | Included in the PAYE scheme on the apprenticeship service account | | ● | | E | Eligibility evidence | 69.2 |
| 25 | Employment | At least 50% of working hours in England, or an exception | | ● | | E | Eligibility evidence (employer statement) | 30.5, 374.6 |
| 26 | Employment | Paid a lawful wage | | ● | ✓ | E | Eligibility evidence; training plan statement | 76 |
| 27 | Eligibility | Self-employed? IR35? A director, shareholder or person with significant control? | | ● | | P | Eligibility evidence | 34.1 to 34.3 |
| 28 | Employment | Separate, identifiable line manager (name) | | ● | ✓ | E | Agreement signatory; training plan | 71.1, 71.2 |
| 29 | Eligibility | On another apprenticeship or unit; a Skills Bootcamp; Adult Skills Fund training that overlaps or is in working hours (or under 4 weeks left); other DfE, DWP or OfS funding, student finance or a student loan; a sandwich placement | | ● | | P | Eligibility evidence | 30.3, 34.4 to 34.8 |
| 30 | Employment | Does the employer pay the levy? (hiring payment) | | ● | | E, S | ILR and the funding claim | 133 |
| 31 | Employment | Normal weekly working hours (paid, excluding overtime) | | ● | ✓ | E | Training plan; ILR employment hours; a realistic duration if under 30 | 80, 100.1 |
| 32 | Eligibility | EHC plan, now or before | | ● | | P | ILR (EHC); evidence for Level 7 at 22 to 24, foundation, the 19 to 24 payments, the English and maths exception | 32.2, 59.1, 125.2 |
| 33 | Bursary | In care, or left care (asked of ages 16 to 24 only) | | ● | | P | ILR care leaver field (to confirm); evidence (local authority letter) | 64, 127.3 |
| 34 | Bursary | Told the bursary facts; would like it; hasn't had it before | | ● | | P | Signed declaration (evidence); bursary payments | 127.1 |
| 35 | Bursary | Consent to tell the employer about an EHC plan or care (ages 19 to 24) | | ● | | P | ILR (no consent: provider payment only); evidence | 127.4 |
| 36 | Prior learning | Personal learning record checked | | ● | | S | Prior learning evidence | 37, 38.1 |
| 37 | Prior learning | Discussion: earlier apprenticeships, related qualifications, work experience in this job (pre-filled from 15 and 16) | | ● | | P, S | Prior learning evidence; training plan summary | 36, 100.3 |
| 38 | Prior learning | Completed a T Level? | | ● | | P | Prior learning (progression profiles) | 38.3 |
| 39 | Prior learning | Skills scan: self-rating against each KSB of the standard's version (19+; 16 to 18 if appropriate), checked by staff | | ● | | P, S | Skills scan; prior learning percentage | 38.2 |
| 40 | Prior learning | Outcome: hours removed, percentage and price reduction, agreed with the employer | | ● | ✓ | S, E | Training plan; ILR off-the-job hours, prior learning hours, TNP1 and TNP2 | 39.1, 39.3 |
| 41 | Learning support | Long-term illness, disability or learning difficulty? Which, and the main one? | | ● | | P | ILR LLDDHealthProb and categories | |
| 42 | Learning support | Screening: reading, writing, numbers, memory, adjustments used before, exam access arrangements | | ● | | P | Screening evidence; may lead to a detailed assessment | 43 |
| 43 | Learning support | Consent to share learning support needs with the employer | | ● | | P | Evidence; the training plan and reviews show them only with consent | 44.5.2, 63.2 |
| 44 | English and maths | Qualifications confirmed (from 16) | | ✓ | | S | Evidence (acceptable equivalents list) | 47.3 |
| 45 | English and maths | 19+: does the employer agree to English and maths in the plan? (apprentice told it's funded if so) | | ● | ✓ | E | Training plan; evidence | 47.2, 50 |
| 46 | English and maths | Decision: standalone English and/or maths? (from age, 44 and 45) | | ● | ✓ | S | Training plan (outside off-the-job hours); ILR English and maths aims | 48, 100.8 |
| 47 | English and maths | Current level, if studying with no evidence: tool (provider picklist with Other), level, date | | ● | | S | Evidence; starting level (one above) | 52 |
| 48 | English and maths | Entry Level 3 exception (SEND, judged by a professional) | | ● | | S | Evidence | 59, 60 |
| 49 | Programme | Standard, version, level (from the vacancy or job) | ● | ✓ | ✓ | S, E | ILR StdCode; training plan; agreement | 72.2, 100.4 |
| 50 | Programme | Apprenticeship start and end; practical period start and end | | ● | ✓ | S, E | Agreement; training plan; ILR LearnStartDate, LearnPlanEndDate | 72.3 to 72.5, 100.4 |
| 51 | Programme | Planned off-the-job hours (at least the published minimum, less prior learning) | | ● | ✓ | S | Training plan; agreement; ILR planned hours | 72.6, 100.5 |
| 52 | Programme | Delivery model; content and when; who delivers each part; subcontractors; EPAO | | ● | ✓ | S | Training plan; ILR (EPAO, subcontractor) | 100.2, 100.6 to 100.11 |
| 53 | Programme | Place of work (site) | ● (vacancy) | ✓ | ✓ | E | Agreement; ILR DelLocPostCode | 72.1 |
| 54 | Agreement | Initial assessment outcome agreed by the employer; the provider's six points and the employer's four | | ● | ✓ | E | Training plan, or the contract for services | 63, 65, 66 |
| 55 | Agreement | Price; employer contribution | | ● | | S, E | ILR TNP1, TNP2; contract | 65.6, 39.3.4 |
| 56 | Documents | Employer confirms off-the-job training happens in working hours | | | ● | E | Training plan | 100.12 |
| 57 | Documents | Progress reviews (how often, format); complaints route | | | ● | S | Training plan (from provider settings) | 100.13, 100.14 |
| 58 | Documents | Signatures (a later sub-step; PDFs first) | | | ● | P, E, S | Training plan: all three. Agreement: employer and apprentice only, different people | 71, 99.4, 347 |

## Stage 1: the interest form, leads and matching

- **The form**: public on the Rarebit website, no sign-in. Questions 1 to
  5 and 12 to 16 above. It shows the privacy notice (readable at age 15)
  and asks for consent, shows the plain-language note on who can get a
  funded apprenticeship, and sends a confirmation email. A lead whose email
  is already known updates that lead rather than making a second one.
- **Interests** (was step 5): the person types an interest ("sports");
  Warren suggests job titles from the ONS SOC 2020 index plus our interest
  words, grouped by SOC unit group; their picks are stored as SOC 2020
  codes, with the sub-unit group where there is one. SOC codes lead to
  occupations (SKILLS.OCCUPATION_SOC, including options' occupations), then
  standards, then adverts.
- **Matching** (was step 7):
  - Shown with the reason, not hidden: closing date passed; an age rule
    the person doesn't meet (Level 7, ST1472, foundation apprenticeships);
    further than they'll travel (national adverts always pass).
  - Score out of 100 (starting weights, to tune):

    | Part | Points | How it's scored |
    |---|---|---|
    | Interest | 40 | Same standard > same SOC unit group (the standard's or its options') > same route |
    | Location and travel | 25 | Straight-line distance bands against their travel limit (journey times later) |
    | Setting | 15 | The advert's SIC against the sectors they'd like, only where the organisation has linked the advert to an employer with a company |
    | Hours | 10 | Within their availability |
    | Level fit | 10 | Apprenticeship level against their prior attainment |

  - "Why it matched" for every result, and "What to work on": the advert's
    qualifications against their English and maths answers, and its skills.
  - Postcodes become coordinates from REF.POSTCODE, in Snowflake: a
    person's postcode is never sent to a third party.
- **The CRM**: lead records (a person's answers, consents, source, status,
  matches, and the staff member following them up), one per email per
  organisation. A lead becomes a candidate who can sign in to Burrow when
  staff take it forward. This is separate from the employer CRM ideas in
  docs/ideas.md.

## Stage 2: the initial assessment

Once there's an employer and a job. Questions 6 to 11 and 17 to 55 above,
with stage 1's answers pre-filled to confirm, grouped by the rules' four
areas (eligibility, prior learning, learning support, English and maths),
plus the care leavers' bursary and the outcome agreed with the employer.
Each answer records whether the person declared it or staff verified it,
by whom, when, and the type of evidence seen. Questions for the employer
(E) are answered by the employer contact in Burrow, or by staff on their
behalf with a note of how it was confirmed.

## Stage 3: documents

- **Training plan**: a PDF built from stages 1 and 2 with everything in
  rules 100 (names, job role and hours, parties, the initial assessment
  summary, the standard, dates, planned off-the-job hours, delivery model,
  content, English and maths, who delivers what, the employer's
  confirmation, reviews, the complaints route).
- **Apprenticeship agreement**: a PDF in the shape of the GOV.UK template
  with everything in rules 72, for the employer and the apprentice. It's
  the employer's document: the employer gives the signed copy to the
  provider (70.3).
- **ILR record**: the learner, their aim and employment, created or updated
  from the confirmed answers, on the existing Record tab screens.
- **Signing in Rarebit**: a later sub-step (who signed, when, and a hash of
  the exact document; rules 347).

## Data, roles and test data (to confirm stage by stage)

- **Tables** (names to settle in each stage's proposal): CRM leads, their
  interests (SOC 2020) and matches (advert, score and its parts, when);
  the assessment's answers (question, stage, value, declared or verified,
  by whom, evidence type) with history kept; skills scan ratings; English
  and maths results; generated documents (which version, when, and later
  the signatures). All with ISTESTDATA, never deleted.
- **Who sees what**: a lead or candidate, their own answers and matches;
  staff, the leads and learners they look after (managers, the whole
  organisation); employer contacts, only what the employer is asked and
  agreed outcomes (learning support only with consent); IQA nothing new.
- **Test data**: test leads with a range of interests, ages and travel
  limits, and test adverts marked as test data, so matching can be tested
  with fixed results. Test emails end @example.com and are never sent.

## Open questions

- **Leads into sign-ins.** The app can only read ACCESS (check:grants), so
  turning a lead into a candidate who can sign in to Burrow needs ACCESS
  writes (part 8) or real sign-in. Until then, test candidates are seeded by
  hand-run SQL.
- **Sending email.** The confirmation email needs an email service, and a
  way to stop test data ever being sent.
- **A data protection impact assessment.** Stage 2 collects special
  category data (ethnicity, health) and immigration status, so the 28
  September proposal recommended a DPIA before real use. Not yet in
  docs/before-real-data.md.
- **Which English and maths tools** go on the provider's starting picklist.
- **Standards with no SOC codes** (the three above): another way in, or say
  so.

## Related ideas (in docs/ideas.md, not planned)

Maps and public transport routes for matches; a Functional Skills app; a CV
builder; signposting learners to local help; programme and exit surveys;
caseload allocation.
