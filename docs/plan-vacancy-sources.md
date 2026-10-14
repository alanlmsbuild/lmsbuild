# Plan: vacancy sources beyond Find an apprenticeship

Started 14 October 2026. Nothing is built until Adzuna and Reed reply (see
"Waiting on").

## Where things stand

- **Find an apprenticeship** is imported already (`npm run import:vacancies`,
  nightly in full and every 2 hours for new adverts), with its NHS Jobs and
  Civil Service Jobs passes: sources FAA, NHS and CSJ in `SHARED_DB.EXT.VACANCY`.
  On 14 October 2026, 4,163 live adverts (4,130 FAA, 32 NHS, 1 CSJ).
- Rarebit is software for training providers and colleges (LMS, e-portfolio,
  CRM, school leavers options app), in development. Adverts are public data,
  fetched once centrally and shown to each organisation's candidates and
  staff in its own area of the app.

## Decisions (Alan, 14 October 2026)

1. **Scope: apprenticeships and entry-level jobs.** A job is labelled "Job",
   never shown as a funded apprenticeship.
2. **Jobs and 16 to 17 year olds:** a suitability check and a filter before
   jobs are shown to them (docs/before-real-data.md).
3. **Adzuna licence:** undecided until the price is known.
4. **No count during Adzuna's trial** until Adzuna confirms in writing that
   an evaluation count is allowed (its terms forbid using trial data "in
   aggregation").

## The sources

| Source | Access | Terms that matter | Status |
|---|---|---|---|
| Adzuna API | Free key; default 25 a minute, 250 a day, 2,500 a month | Commercial use beyond a 14-day trial may need a licence; each advert shows the Adzuna logo linked to Adzuna; trial data not used for counts; all data removed if access ends | Email drafted 14 October; Alan to send (terms, pricing, platform use, an evaluation count) |
| Reed Jobseeker API | Free key, basic auth | No published API terms; Reed's website terms forbid copying for commercial use | Email drafted 14 October; Alan to send (written terms) |
| DWP Find a Job | No public API for reading adverts (partners send jobs in by SFTP) | | Not available |
| Indeed, LinkedIn, Totaljobs and others | No public API; scraping not allowed | | Out |

ONS online job adverts (Textkernel counts by SOC 2020 and area) are already
loaded (`SHARED_DB.RAW.PUBLISHED_CELL`): counts for local demand, not
adverts.

Reed, one test call (14 October 2026, "apprentice" near Sheffield): the
key works, but its keyword search returns adverts that only mention the word
(apprenticeship tutors, lecturers, technicians with an apprenticeship
background): none of the five returned was an apprenticeship. So Reed would
mainly add entry-level jobs, not apprenticeships; finding real
apprenticeships there would need more than a keyword. Its locations are
sometimes a postcode, sometimes a town.

Adzuna: its sign-up page now offers a self-serve plan at £8 a month (5,000
calls a month, 500 a day); the account is on 25 test calls until then. Not
called yet.

## Waiting on

- Alan registers for both keys and sends the two emails.
- Adzuna: written terms (storing, showing, counting), whether several
  organisations on one platform need a different licence, pricing and rate
  limits (about 2,000 requests a day for England, fetched once for all
  organisations), and whether a short evaluation count is allowed.
- Reed: written terms (storing, showing, counting), platform use, charges.

## Once a source is agreed

- Responses go to `SHARED_DB.RAW.<SOURCE>_VACANCY_PAGE` as returned
  (add-only); adverts are cleaned into `EXT.VACANCY` with their SOURCE.
- Every advert is coded to SOC 2020 (below), so all sources match the same
  way.
- An advert seen in more than one source is kept once (employer, title,
  postcode and closing date), with the source that won recorded.
- Each source's display rules are kept (Adzuna's logo and link on every
  Adzuna advert); its adverts are removed when they expire or access ends.
- A scheduled job per source within its rate limits. Public data: no
  organisation's data, `check:scoping` as it is.
- The SQL is shown to Alan before anything changes.

## SOC 2020 coding (decision 18), the prototype of 14 October 2026

Read-only, on the 4,163 live adverts, nothing written. Two ways to a SOC
2020 unit group:

- **A, the advert's standard**: LARS code to Skills England occupation
  (`SKILLS.STANDARD_VERSION`), its SOC codes and its options'
  (`SKILLS.OCCUPATION_SOC`, `SOC2020`). Authoritative, but only for
  apprenticeships: 4,048 adverts have one (some standards have several SOC
  codes, up to 34).
- **B, the title**, through the ONS coding index as published
  (`SHARED_DB.RAW.SOC2020_CODING_INDEX`, natural word order), after taking
  out "apprentice", "level 3", places after a dash and the like: the
  whole title, else the longest index title inside it (a one-word match
  only if that word means one SOC). This is what jobs will need.

What B does on these titles: 65% coded (1,960 whole titles, 747 by a title
inside them), 3% ambiguous (140, e.g. "teaching assistant": 6113, 3231,
2311 or 6112), 35% not coded (1,456: mostly activity words, "Childcare",
"Business Administration", "Dental Nursing", "Groundwork", "Human
Resources"). Where both A and B give a code: the same unit group for 1,659
(67%), the same minor group for 46, different for 790. Many differences are
about level rather than error (nursery practitioner 3232 against the early
years standard's 6111); some are errors.

The rule (Alan, 14 October 2026), not built yet:
- Apprenticeships: the standard wins over the title. When the title's code
  is one of the standard's, that one is kept; when it isn't (or the title
  can't be coded, or is ambiguous), every one of the standard's codes is
  kept and the advert is flagged. With REF fixed: 1,659 title-confirmed,
  2,389 flagged (1,515 title uncoded, 186 ambiguous, 688 disagreeing), 72
  coded by title alone (no standard's codes), 43 not coded.
- Jobs: B alone, helped by a reviewed list of activity words
  (`scripts/ref/activity-words.csv`: the 203 phrases covering 80% of the
  1,557 uncoded adverts, each with the SOC its adverts' standards most often
  have, for Alan to review); adverts it can't code (or codes ambiguously)
  kept uncoded and listed for review, never guessed.
- Stored in `SHARED_DB.EXT.VACANCY_SOC`, one row per advert and code, with how
  each was found and any flag (`sql/vacancies_02_soc.sql`, run 14 October
  2026).

Built 14 October 2026 (`scripts/vacancy-soc.js`, `npm run code:vacancies`;
run after every vacancy import, as DATA_LOAD_USER; test/db/vacancy-soc.mjs),
with the activity words as Alan reviewed them (149 OK, 40 changed codes, 14
NOT A JOB). First run, 4,232 live adverts: 2,792 title-confirmed, 1,323 with
all their standard's codes and flagged (384 title not coded, 189 ambiguous,
750 disagreeing), 92 by title alone, 25 not coded (67 titles were NOT A
JOB); 5,711 rows.

Found on the way, and fixed: `SHARED_DB.REF.SOC2020_INDEX` had broken
apostrophes ("Chef\x92s assistant"): `npm run import:ref` read the
Windows-1252 file as Latin-1. It now reads each SOC file as UTF-8 if it is,
otherwise Windows-1252; re-imported 14 October 2026 (REF import run 5).

## Meanwhile (no source needed)

1. SOC coding of the adverts we have (above): next, the list of activity
   words, then the SQL for the codes table.
2. Duplicate rules, tried on FAA against its NHS and CSJ passes.
3. The "Job" label and each source's credit on the Vacancies screens.
