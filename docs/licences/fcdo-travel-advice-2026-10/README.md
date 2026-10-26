# Foreign Office travel advice (GOV.UK Content API): what the terms say

Read on 22 October 2026. Rarebit loads the Foreign, Commonwealth & Development
Office's travel advice from the GOV.UK Content API: the index
`https://www.gov.uk/api/content/foreign-travel-advice` (the countries are under
`links.children`) and each country's page, e.g.
`https://www.gov.uk/api/content/foreign-travel-advice/laos`. No key. Into
`SHARED_DB.RAW.FCDO_TRAVEL_ADVICE` and `FCDO_TRAVEL_ADVICE_INDEX` (`load:data`
step 51, the `official-travel-advice` job; decision 57).

## What was found, and where

1. **Licence of the content.** GOV.UK's terms (`https://www.gov.uk/help/terms-conditions`,
   "Using GOV.UK content"): most content is Crown copyright and published under
   the Open Government Licence, "which also sets out which content is exempt";
   content that is not under it is usually credited to its author. The footer of
   every page says "All content is available under the Open Government Licence
   v3.0, except where otherwise stated". The page `https://www.gov.uk/api` says
   reusing content "you must meet the conditions of the Open Government Licence"
   and links **version 3**. Rarebit's tag is `ogl-3`, with the standard line:
   *Contains public sector information licensed under the Open Government
   Licence v3.0.*
2. **OGL v1 or v3 (a discrepancy in GOV.UK's own pages).** The terms page links
   `.../open-government-licence/version/1/...`. The footer and the `/api` page link
   version 3. We use v3.0, as the footer and the API page say. Worth telling GOV.UK
   the terms page links version 1 (`/contact/govuk`); not done yet.
3. **The API.** The Content API documentation
   (`https://content-api.publishing.service.gov.uk`) says: a maximum of **10 requests
   a second per client**. No key, no terms of its own beyond the above. Rarebit asks
   for 4 a second at most, sends the index's ETag (a 304 means nothing changed),
   waits for `Retry-After` on a 429 and tries again, and says who it is
   (`user-agent: Rarebit data loader`). The index and pages answer with
   `cache-control: max-age=10, public`; the job runs once a day.
4. **No guarantee.** GOV.UK's terms say it gives no guarantees that the content is
   accurate, current or complete, that its "feeds" may be cached copies, and that
   "the most up to date version of our content will always be on GOV.UK". So
   anything Rarebit shows from this must show **when the advice was last updated**
   (`public_updated_at`) and **link to the GOV.UK page**, and Rarebit never suggests
   ignoring it (decision 57).

## What is kept, and what is not

- **Kept, as published:** the whole JSON of each country's page and of the index:
  `alert_status`, `change_description`, `change_history` (the full history, e.g.
  424 entries for France), the parts (warnings and insurance, entry requirements,
  safety and security, regional risks, health, getting help and others),
  `public_updated_at`, `reviewed_at` and the rest. A country's page is added again
  each time it changes, so the history stays in Snowflake.
- **Dropped: email addresses in the text.** The pages' text lists contact
  details for embassies, ministries, hospitals and, for some countries,
  honorary consuls, who may be individuals. The OGL does not cover personal data
  and Rarebit loads none (CLAUDE.md), so every email address (and every
  `mailto:` link, whole) is replaced by `[email address removed]`, before the file
  is written (`scripts/load/travel-advice.js`) and again when it is loaded. The
  load is recorded as `columns-removed` in `SOURCE_FILE` and the original file is
  not staged, as for GIAS and Ofqual's organisations. On the 226 pages read on
  22 October 2026 that was **62 email addresses**, none left.
- **Kept: phone numbers, as published** (decision of 26 October 2026; the first
  version took them out too, 513 of them on the 226 pages). Embassy, hospital,
  police and ambulance numbers are safety information, and only one page
  mentions an honorary consul, with no name. So phone numbers, `tel:` links,
  names, postal addresses and website links all stay as the FCDO wrote them.
  If a page ever puts a private individual's number in the text, that is a case
  for taking that number out then (and, as with the emails, the load records it).
- **Links only: the map image and the PDF.** 68 of the 226 pages have an `image`
  (the FCDO's country map, a 430 x 540 JPEG on
  `assets.publishing.service.gov.uk`, stamped "© Crown Copyright 2023" on the
  picture) and a `document` (the same advice as a PDF). Nothing on the asset says
  the map is under the OGL, and GOV.UK's licence is "except where otherwise
  stated", so **only the links are kept (they are in the JSON); nothing is
  downloaded or hosted until FCDO confirms the licence in writing.** The map's
  information is also in the text and `alert_status`.

## Tests

`test/travel-advice.mjs` (fake API, no network): what is fetched and when, the
checks that stop a bad index or page being saved, the rate limit and retries, the
email rules (what goes, and what must stay, phone numbers included) and the load step.
