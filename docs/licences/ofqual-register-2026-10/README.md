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

## Fields Rarebit drops (decided 22 October 2026, Alan)

The organisations records hold contact details: `contactEmail` (366 of 374;
about 200 with a personal-looking name before the @), `phoneNumber` (all 374;
41 mobile numbers) and a postal address (all 374; a small awarding
organisation may be run from a home). Ofqual publishes them under the OGL, but
**the OGL does not cover personal data**, Rarebit's standing rule is that no
personal data is loaded, and Rarebit doesn't need them. So these eight fields
are dropped from every organisation record before the file is saved, and again
when it is loaded (`scripts/load/ofqual.js`):

    contactEmail, phoneNumber,
    addressLine1, addressLine2, addressCity, addressCounty, addressCountry, addressPostCode

Kept: `name`, `legalName`, `acronym`, `recognitionNumber`, both regulators'
statuses and dates (`ofqualOrganisationStatus`, `ofqualRecognisedOn`,
`ofqualRecognisedTo`, `ofqualSurrenderedOn`, `ofqualWithdrawnOn`, and the
`ccea…` five), `website`, `feesUrl`, `canonicalUrl` and `lastUpdatedDate`
(18 fields). The bronze table is therefore the register without those fields,
and its `SOURCE_FILE` rows say so (`COPYKIND = columns-removed`,
`REMOVEDCOLUMNS`, original not staged), as GIAS does. The qualifications
records hold no personal data and are kept whole. Data loaded before the
change was cleaned by `sql/ofqual_01_remove_contact_details.sql`, and the
saved files by `node scripts/strip-ofqual-contacts.js`.

## Open points

- Ofqual could be asked (via the developers' team above) whether it states any
  attribution it prefers, and the API's terms of use.
