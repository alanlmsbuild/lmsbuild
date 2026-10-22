# Ofqual Register of Regulated Qualifications: what the terms say

Read on 22 October 2026. Rarebit loads the register from its public API
(`https://register-api.ofqual.gov.uk/api/Qualifications` and `/api/Organisations`,
no key) into `SHARED_DB.RAW.OFQUAL_QUALIFICATION` and `OFQUAL_ORGANISATION`
(`load:data` step 27, the `official-ofqual` job).

## What was found, and where

1. **The register's own site.** `https://register.ofqual.gov.uk` redirects
   (301) to the new *Find a regulated qualification* service,
   `https://find-a-qualification.services.ofqual.gov.uk`. Its footer says:

   > All content is available under the Open Government Licence v3.0, except
   > where otherwise stated
   > © Crown copyright

   with links to the Open Government Licence v3.0
   (`https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/`)
   and to the National Archives' Crown copyright page. The footer's other links
   are Cookies, Privacy, Accessibility statement and Provide feedback. The old
   site's `/help/terms-conditions` page is no longer served, and the new
   service has no terms and conditions page that I could find.
2. **The API.** It is listed in the government API catalogue
   (`https://api.gov.uk/ofqual/ofqual-register-of-regulated-qualifications-api/`:
   overview, endpoint, contact the Ofqual developers' GitHub team). Its
   documentation is the README of `https://github.com/OfqualGovUK/ofqual-register-api`
   (last pushed 17 September 2026). It has **no licence, terms of use,
   attribution wording or rate limit**. It states the page limit is a setting
   (`QualificationsPagingLimit`, 10,000); tested: 10,000 is accepted and above
   it the API answers 400. GitHub shows the code repository's licence as
   "NOASSERTION", which concerns the code, not the data.
3. **The register's page of downloads** (the legacy page, before the redirect)
   offered the same data as CSV files under the same footer.

## Rarebit's reading

- The register data is under the **Open Government Licence v3.0**: Rarebit may
  copy, publish, distribute, adapt and use it commercially, including combined
  with other data in its products, provided it acknowledges the source.
- No attribution wording is specified by Ofqual (its footer gives none), so
  Rarebit uses the standard OGL statement, with a link to the licence:
  **"Contains public sector information licensed under the Open Government
  Licence v3.0."** It is already the table's `ATTRIBUTION` tag (`ogl-3`). When
  Ofqual's data is shown, also say it comes from Ofqual's Register of Regulated
  Qualifications, and say nothing that suggests Ofqual endorses Rarebit (OGL
  v3.0's non-endorsement condition).
- The licence does **not** cover personal data in the information, logos and
  crests, or third parties' rights ("except where otherwise stated").
- The API has no published rate limit; Rarebit asks politely anyway (the
  whole register is 6 calls a week at 10,000 a page).

## Open points

- **The organisations records hold contact details**: `contactEmail` (366 of
  374; about 200 have a personal-looking name before the @), `phoneNumber` (all
  374; 41 are mobile numbers) and a postal address (all 374; some small
  awarding organisations may be run from a home). These are published by
  Ofqual under the OGL, but the licence does not cover personal data, and the
  standing rule is that no personal data is loaded (CLAUDE.md). The bronze table
  is tagged `SENSITIVITY = public`. To decide: leave them out of the
  organisations file, or tag and mask them. See `docs/before-real-data.md`.
  The qualifications records hold no personal data (organisation names and
  links only).
- Ofqual could be asked (via the developers' team above) whether it states any
  attribution it prefers, and the API's terms of use.
