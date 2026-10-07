# Plan: the diagnostic, interests, skills check and matching

The rest of the plan Alan approved on 28 September 2026 ("employers,
vacancies and the learner diagnostic"): steps 4 to 7. Steps 1 to 3 are
done (below). The plan said to do steps 4 to 7 after part 7 steps 3 and 4,
which are now done too.

Commit and stop after each step. Every step is proposed for Alan's OK
before anything is built.

## Where things stand

| Step | What | State |
|---|---|---|
| 1 | Reference data: SOC 2020 index, interest words, SIC lists, postcodes; Skills England occupations linked to SOC | Done (REF schema, `npm run import:ref`; SOC links from `npm run import:skills`) |
| 2 | Vacancy import | Done (`npm run import:vacancies`, EXT.VACANCY; scheduled since 7 October) |
| 3 | Employers with Companies House | Done (then employer sites and contacts) |
| 4 | Diagnostic: About you and Getting to know you, including candidates | Next |
| 5 | Interests | |
| 6 | Skills check | |
| 7 | Matching | |

What steps 4 to 7 build on, as of 7 October 2026:

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

## Decisions so far

From the approval (28 September 2026, Alan):

1. **Candidates as well as apprentices.** The diagnostic is for candidates
   (people without an apprenticeship yet, who can sign in to Burrow but
   have no ILR record) as well as current apprentices. Candidates answer
   the sensitive ILR questions (ethnicity, LLDD and its categories, NI
   number) only when they enrol, not before: collect the minimum until
   then.
2. **English and maths from an approved tool.** Record results from an
   approved assessment tool (level reached, date, tool), not a test of our
   own. The tool is a picklist the provider sets up, with "Other".
3. **Order.** Steps 1 to 3 first, then 4 to 7 after part 7 steps 3 and 4.

Decided since, in the steps already built, that change steps 4 to 7:

- **Nothing a manager sees may differ by whether another organisation has
  the same company** (2026-10-06, Alan). Companies House data in EXT is
  shared; each organisation sees its own copy of its employers' details.
- **Adverts are linked to employers only by a manager** (2026-10-06,
  approved with the vacancies plan). Warren suggests, a manager confirms,
  nothing is linked automatically; the links are the organisation's own
  (ILR.EMPLOYER_VACANCY). This replaces the plan's "SIC tag where the
  employer match is confident": an advert has a setting (SIC) only for an
  organisation that has linked it to one of its employers with a company.
- **Adverts live in EXT.VACANCY, not a JOBS schema** (2026-10-06). Employer
  contact details that adverts carry stay in RAW only (the plan said not
  stored at all).
- **KSBs come from the apprentice's version of their standard** (2026-10-07,
  Alan), chosen by start date (server/ksbVersions.js). The KSB self-rating
  in step 6 uses the same version; a candidate with no start date yet uses
  the version open to new starts.
- **Match on options' SOC codes too** (2026-10-07, Alan; moved here from
  docs/ideas.md). For a standard with options, match on the SOC codes of
  its options' occupations (SKILLS.STANDARD_OPTION's OCCUPATION_CODE, then
  OCCUPATION_SOC) as well as the standard's own. The occupational maps API
  lists most such standards only under their options' codes: in the first
  import (2026-10-07) 139 standards approved for delivery had no
  occupation under their own code, and for 136 of them it found at least
  one option's. Three approved standards have no occupation found at all,
  so no SOC codes: ST0389 Poultry worker (10 options, none found), ST0587
  Internal audit practitioner and ST1422 Bus, coach and heavy goods
  vehicle service and maintenance technician (no options). Matching needs
  another way in for those, or to say they can't be matched by SOC.
- **UK time everywhere** (2026-10-07, Alan): dates and times in
  Europe/London (src/ukTime.js), including any new scores' "as at" times.

## Step 4: the diagnostic, About you and Getting to know you

As approved, before the detailed proposal for this step:

- **About you** (required at onboarding):
  - ILR fields: name, date of birth, sex, ethnicity, LLDD and categories,
    NI number, address, postcodes, contact details, prior attainment,
    employment status. Candidates give the minimum (decision 1).
  - Eligibility from the 2026 to 2027 funding rules (Version 3): residency
    and right to work (Annex A), with any visa end date; at least 50% of
    working hours in England; not self-employed, IR35 or a director without
    a separate line manager; not on another apprenticeship or unit, a Skills
    Bootcamp, duplicate Adult Skills Fund training, a student loan or other
    DfE funding; care leaver (asked if 24 or under: the bursary); EHC plan.
  - Also at initial assessment: the prior learning discussion and personal
    learning record check (everyone), learning support screening, and the
    English and maths decision.
  - **Declared or verified**: each answer records whether the learner
    declared it or staff checked the evidence, and who.
- **Getting to know you**: goals, how they like to learn, how far and how
  they can travel, hours available, support they'd like. Mostly optional.
- For a candidate who enrols, About you becomes their ILR learner record.

## Step 5: Interests

- The learner types an interest ("sports"); Warren suggests job titles from
  the ONS SOC 2020 index plus our own interest words, grouped by SOC unit
  group. ("sports" finds 29 titles across 8+ unit groups.)
- They pick titles; Warren stores the SOC 2020 codes, with the sub-unit
  group where there is one.
- SOC codes lead to occupations (SKILLS.OCCUPATION_SOC, including options'
  occupations), occupations to standards (ST reference, then LARS code),
  standards to adverts.

## Step 6: Skills check

- **English and maths**: results from an approved tool (decision 2).
- **Digital**: a short self-check against DfE's Essential Digital Skills
  framework (our choice; the funding rules don't require it).
- **KSB self-rating**: 1 to 4 for each KSB of the standard's version (see
  above). Staff review it; it feeds prior learning (hours removed: ILR HRS
  4 and a RIP price reduction). The funding rules require a skills scan
  against the KSBs for learners aged 19 and over.

## Step 7: Matching

- **Hard filters**: closing date passed; age rules the learner doesn't meet
  (Level 7 16 to 21, ST1472 16 to 24); further than they can travel
  (national adverts always pass).
- **Score out of 100** (starting weights, to tune):

  | Part | Points | How it's scored |
  |---|---|---|
  | Interest | 40 | Same standard > same SOC unit group (the standard's or its options') > same route |
  | Location and travel | 25 | Straight-line distance bands against their travel limit (journey times later) |
  | Setting | 15 | The advert's SIC against the sectors they'd like, only where the organisation has linked the advert to an employer with a company |
  | Hours | 10 | Within their availability |
  | Level fit | 10 | Apprenticeship level against their prior attainment |

- **"Why it matched"** for every result, and **"What to work on"**: the
  advert's qualifications against their English and maths results, and the
  advert's skills and the standard's KSBs they rated lowest.
- Postcodes become coordinates from REF.POSTCODE, in Snowflake: learner
  postcodes are never sent to a third party.

## Data, roles and test data (as proposed, to confirm step by step)

- **Tables**: a DIAG schema: DIAGNOSTIC (learner or candidate, status,
  dates), ANSWER (question, value, declared or verified, by whom), INTEREST
  (text, chosen title, SOC 2020, sub-unit group), SKILL_RESULT (English,
  maths, digital: level, tool, date), KSB_RATING, MATCH (advert, score and
  its parts, when). Plus a CANDIDATE role in ACCESS.
- **Who sees what**: the learner or candidate their own diagnostic, matches
  and what to work on; tutors and assessors their caseload's (LLDD and
  health only where needed for support); managers the whole organisation;
  employer contacts their own apprentices' agreed skills-check outcome
  (learning support only with the apprentice's consent); IQA nothing new.
- **Test data**: about 20 test candidates and learners with complete
  diagnostics and a range of interests (sports, care, cars, IT, animals),
  and about 30 test adverts marked as test data so matching can be tested
  with fixed results.

## Open questions

- **Creating candidates.** The app can only read ACCESS (check:grants), so
  it can't create a candidate's sign-in yet. Until part 8 (or real sign-in),
  candidates are seeded by hand-run SQL, like other test users.
- **A data protection impact assessment.** The diagnostic collects special
  category data (ethnicity, health), so the 28 September proposal
  recommended a DPIA before real use. Not yet in docs/before-real-data.md.
- **Which English and maths tools** go on the provider's starting picklist.
- **Standards with no SOC codes** (the three above): another way in, or say
  so.

## Related ideas (in docs/ideas.md, not planned)

Maps and public transport routes for matches; a Functional Skills app; a CV
builder; signposting learners to local help; programme and exit surveys;
caseload allocation.
