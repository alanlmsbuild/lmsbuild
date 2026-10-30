# Decisions

Decisions from the Rarebit plan, kept here so they're in the repo. Earlier
decisions are added as they come up.

## 19. Travel times

Journey times between LSOA population-weighted centroids, starting with South
Yorkshire (phase A: walk, bus and tram; rail in phase B after its licence is
reviewed). A typical term-time Tuesday, departures 07:30–08:30, stored as the
median with 25th and 75th percentiles, capped at 90 minutes, with walking-only
times alongside. Built from BODS timetables (OGL v3.0), OpenStreetMap (ODbL)
and ONS centroids (OGL v3.0; contains OS data © Crown copyright and database
right), computed with r5py and loaded through bronze, silver and gold like our
other data.

The travel-time tables are a database derived from OpenStreetMap, so they are
licensed under the ODbL (tagged `odbl`). Rarebit shows results from them as
Produced Works ("about 25 minutes by bus, weekday morning"), always with
"© OpenStreetMap contributors". We do not publish or hand over the tables
themselves. If we ever do, we will offer them under the ODbL with the method
that made them (`scripts/travel/`). Our other data joined to them for display
stays separate (a Collective Database) and is not affected.

Phase A settings (agreed 15 October 2026): Tuesday 10 November 2026; the
Yorkshire feed clipped to the trips that call in South Yorkshire and a 5 km
buffer; Java heap 4.5 GB; gold `travel_time` read by Warren, Meadow and the
school leavers site.

Phase B: rail (licence reviewed and agreed 15 October 2026). Network Rail's
SCHEDULE full extract and CORPUS are used under the Network Rail
Infrastructure Limited Data Feeds Licence (LICENCE tag `nr-open`). Network
Rail's licence page says the feeds are released under the terms of the Open
Government Licence; we attribute them with Network Rail's line, "Contains
information of Network Rail Infrastructure Limited licensed under the
following licence:" and a link to that page. Train fares are not included.

Phase B settings (agreed 20 October 2026): bus, tram and train computed
together, with bus-only and train-only times alongside; the modes a journey
used are estimated (within 2 minutes of the train-only or bus-only median),
and the notes say so. Refreshed monthly: each run uses the next term-time
Tuesday at least 14 days ahead, skipping school holidays and the week of the
13 December timetable change, the same date for bus and rail, and stops if
either feed doesn't cover it. The first run is on Tuesday 10 November 2026.

Reach map (agreed 21 October 2026; Options app build brief, milestone 1): a
local-only page that shades South Yorkshire's LSOAs by travel time from a
chosen area or postcode, with colleges, sixth forms and universities as dots.
The times are exported once from gold to static files, one per origin LSOA
(860 files of 860 destinations), so there is no Snowflake call per click.
Two questions are open and must be settled before it goes on a public site:

1. ODbL. The per-origin files are the travel-time table in another form, and
   that table is a database derived from OpenStreetMap, which we have said we
   do not publish or hand over (above). Shipping them to every visitor's
   browser would publish it. Either we offer the files under the ODbL with the
   method that made them (`scripts/travel/`), or the public site gets only
   what is shaded for the chosen area (a Produced Work). Local only is fine.
2. Map tiles. OpenStreetMap's own tile servers are not for a live site. For
   launch, self-host free tiles built from our Geofabrik extract (no paid map
   services). Local development uses OpenStreetMap's tiles with attribution.

The shading uses the ONS LSOA (December 2021) boundaries, BGC V5, loaded to
SHARED_DB.RAW.ONS_LSOA_BOUNDARY (`sql/load_12_lsoa_boundaries.sql`): the same
2021 LSOAs as the times, and all 860 travel LSOAs have one. The data.gov.uk
record says "No Licence Provided"; ONS boundaries are normally Open
Government Licence v3.0 with OS data, so the ONS portal page is to be
confirmed before launch. Dots: GIAS (41 open South Yorkshire colleges and
establishments with a sixth form, all with eastings and northings) and
Discover Uni's LOCATION table (latitude and longitude for each campus,
including Sheffield and Sheffield Hallam).

The reach page (session 2, 21 October 2026, local only; school-leavers-app,
src/pages/reach.astro, branch reach-map): the map is Leaflet 1.9.4 with
OpenStreetMap tiles, the one thing the page asks another site for (a tile's
address holds only its place on the map, and the browser test proves nothing
else leaves the page, and that a postcode never does). The knowledge bank's
privacy page says nothing is loaded from other websites, so this page cannot
go public until the tiles are self-hosted and that page is updated (a third
launch question beside the two above). Dots: special schools are left out;
independent schools are marked "Independent, charges fees". A place is
"within" a time by its median; one whose median is longer or empty but whose
25th percentile fits is listed as "possible if you catch the right
departure" ("Over 90 minutes for most departures; about N min if you catch
the right one" when the median is empty). Times are always a range, with
"weekday morning, timetable as at <date>", "fares not included in these times" and
"modes are estimated".

College campuses (21 October 2026): GIAS holds one record for each of the four
South Yorkshire colleges, so each was one dot at its head office (Sheffield
027B showed no college at 45 minutes because the single dot for The Sheffield
College, at City Campus, was 46 minutes away). Rarebit holds each college's
own published campuses in `SHARED_DB.RAW.COLLEGE_CAMPUS` (26 campuses from the
colleges' own pages, `scripts/reach/college-campuses.csv`, `sql/load_14`,
LICENCE tag `public-facts`: addresses are facts and each row names its page),
checked against Discover Uni's campuses (all within 500 m) and re-checked every
year (`docs/scheduling.md`). Campuses with no address found stay off the map.

Train fares, phase C (terms received 21 October 2026): the National Rail
Enquiries (NRE) information feeds' Terms & Conditions version 3.0, accepted
by Alan on 16 October 2026, are saved word for word in
`docs/licences/nre-terms-v3.0.md`. Rarebit's reading: use is worldwide and
royalty-free below "High Volume Usage" (defined in the Usage Charging
Document, not yet seen); the Information may be copied, published and used
commercially, including combined with other data in our own product; its
format may be adapted but its content must not be amended (fares are shown as
the feed publishes them; discounts only through the feed's own discount
tables); NRE must be acknowledged as the source as the Developer Guidelines
direct (not yet seen); "Time-Bound Data" is shown as the feed directs; nothing
may suggest NRE's endorsement or official status; personal data, third-party
rights and NRE's trademarks and logos are not licensed (use the logo only as
the guidelines allow); the licence is personal to Alan and can't be assigned,
so Rarebit registers its own account when it is incorporated; NRE gives no
support, may change the format, and will give at least 90 days' notice
before withdrawing the Information permanently; a later version of the terms
only applies if we opt in. The Developer Guidelines are the portal's brand
guidelines (saved in `docs/licences/nre-brand-guidelines-2026-09/`, read
21 October 2026): NRE is acknowledged "where possible, by providing a link to
the NRE website for more information and by displaying the 'Powered by
National Rail Enquiries' logo"; where the feed is combined with other feeds
and isn't the primary information, the branding may go on an attribution
page; the only wording given for text is "Powered by National Rail
Enquiries" (dot matrix screens). Rarebit credits in words with a link and no
logo (the logo is NRE's trademark, which the licence doesn't cover), and asked
NationalRailDatafeeds@raildeliverygroup.com to confirm words alone are
acceptable (confirmed 23 October 2026). RDG's fares data page (21 October 2026) said the fares data, "released three times each year", is available from the National Rail Data Portal "for use in proof of concept or development work", and asked whether a live public app was covered; until that was answered the fares stayed local only (loaded to bronze, `RDG_FARES_LINE`, load:data step 50, 24 files and 9.8 million lines of feed 924). **National Rail cleared the use on 27 October 2026** under the data feeds licence v3.0 (Alan's emails of 23 and 27 October, transcribed in `docs/licences/emails-2026-10.md` with Oak's of 27 October; on 23 October National Rail said both the logo and words with a link are fine from their side, with no process to grant logo permission, so Rarebit uses words and a link only), so the fares are built and shown (30 October 2026, branch `train-fares`): silver `rdg_*` models and gold `train_fare` and `train_discount` from the specification RSPS5045 version P-02-04 of 22 April 2026 (saved in `docs/licences/rsps5045/`, newer than the P-02-03 first named here), read by `SHARED_DB.GOLD_SITE` only, exported in `fares.json` and shown on the reach page's fares panel. Shown as the terms require: the adult fare exactly as the feed publishes it (a range across routes where the feed has several, with the routes named: plain-words names for the routes from a hand-checked seed, `train_route_name`, the feed's own names kept beside them), the feed's date, "Fares as published on <date>: check on National Rail", discounts only as the percentages in the feed's own discount tables ("from the discount table", no discounted price worked out), "No current fare: check National Rail" with a link where a fare in the feed has ended, the words "Powered by National Rail Enquiries" linked to nationalrail.co.uk (no logo) in the panel and the attributions list, train fares never added to bus or tram fares or to journey times, and nothing that suggests National Rail backs Rarebit. The 13 station pairs are in the `train_journey` seed. Not done: the feed gives no flow-precedence rule (every fare in force is shown as a range), the non-derivable overrides (NFO) are not applied because none apply to the 13 journeys (checked on feed 924, 30 October 2026: of 261,171 override records none has both ends in the journeys' stations, fare groups or clusters for the panel's ticket codes; the 98 with one end are Leeds or Greater Manchester local products to other places; all 48 flows have the standard-discount marker 0, so the non-standard discounts file (FNS) is not needed), but a new feed or a new journey needs the check again, the restriction text is not decoded (only a "restrictions apply" flag), and a railcard discount is not shown on season tickets (Rarebit's choice). The two models that read the whole feed (8.5 million lines) are rebuilt only when a newer feed is loaded or the seeds change (`rdg_reusable` in `dbt/macros/rdg.sql`); otherwise the daily build copies the live table. No Usage Charging Document is
published; our use (a few fares downloads a year, served from our own files)
is far below any high volume. The LICENCE tag value is `nre-feeds-v3`
(`sql/load_17_nre_licence_tag.sql`), separate from `nr-open` (Network Rail's
own feeds, a different licensor).

## 21. Governance built into Snowflake

Every object is described, tagged and controlled in Snowflake itself. Tags on
every database, schema, table and column: layer, source, licence and
attribution rule, owner, refresh schedule, sensitivity. Masking policies hang
on the sensitivity tags, so a column is masked the moment it's tagged
personal; Snowflake's data classification checks new tables for untagged
personal data. Row access policies keep each organisation's rows visible only
to it, backing up check:scoping. Least privilege as now. Every object has a
plain-English comment. Quality measured with dbt tests plus data metric
functions, results logged in OPS. Access history and lineage used for audit.
Retention set per layer. Resource monitors on each warehouse.

Added 14 October 2026:

- SENSITIVITY has a value for data about under-18s, `minor`, separate from
  `personal`.
- Masking and row access policies are planned but built when the first
  personal table arrives in silver (there is none yet).
- The tags are real Snowflake tags in SHARED_DB.GOVERNANCE (the account is
  Enterprise), made by `sql/silver_01_setup.sql`.

Added 22 October 2026, corrected 26 October 2026: clearing data out of
Snowflake.

When a clean-up has to remove data we shouldn't hold (a column of personal
data, a file), the table's old version stays reachable for a while, not just
the live rows:

- **Make the change and leave `DATA_RETENTION_TIME_IN_DAYS` as it is.**
  Setting retention to 0 does not purge the old version: on 22 October 2026
  retention was set to 0 before the update on `OFQUAL_ORGANISATION` and kept
  there for about 3 hours, the old version (748 rows) was still reachable with
  `AT(TIMESTAMP => a time before the update)`, and when retention was `UNSET`
  it came back under the table's 1-day retention. So expect the old version to
  stay reachable until the retention period ends (1 day here).
- **Confirm with an `AT(TIMESTAMP => <a time before the change>)` read, once
  the retention period has passed: it must error.** Note the time before
  the change, since the read needs it.
- A permanent table then has Fail-safe for 7 days: Snowflake's own copy, which
  we can't query or restore. So "gone from Snowflake" is the retention period
  plus 7 days (8 days for a table with 1 day's retention). Stage files have
  neither, and `REMOVE` is immediate.
- Remove the files in the load stage that hold the data (`LIST` the stage; the
  loader uploads originals and copies), clean the local copies, and keep the
  `SOURCE_FILE` rows true (`COPYKIND`, `REMOVEDCOLUMNS`, `ORIGINALSTAGED`, and
  `ORIGINALSHA256` of the cleaned file so the load doesn't repeat).
- The worked example is `sql/ofqual_01_remove_contact_details.sql`.

## 36. Consent from the options app to Meadow

From the Rarebit plan (kept outside the repo), dated 16 October 2026.

F0 options app → Meadow consent: consent lasts 12 months with a renewal
reminder; 16-17-year-olds share for themselves with a nudge to tell a parent
or carer; under-16s can't share; providers are asked to reply within 5
working days, and each provider's usual reply time is shown to families;
withdrawing closes the Meadow record and deletes the details, keeping only
the consent events as proof.

Decisions 37 to 56 are recorded in the Rarebit plan on claude.ai.

## 57. An Honest Guide to the World

An Honest Guide to the World (22 October 2026). The gap year work grows into a
Lonely Planet-style guide to every country, under the honesty rule.
Government advice always comes first and Rarebit never suggests ignoring it;
the guide shows exactly where and what the advice covers, other governments'
advice beside it (once licences are checked), how advice has changed over
time, and what each country offers regardless. Rarebit's own words from open
sources; no paid placements.

First step: the UK Foreign Office's travel advice, loaded daily into bronze
(`SHARED_DB.RAW.FCDO_TRAVEL_ADVICE`, `scripts/load/travel-advice.js`, load step
51, the `official-travel-advice` job). What is kept and dropped, and what the
licence allows: `docs/licences/fcdo-travel-advice-2026-10/README.md`.

## Recorded 14 October 2026: SYSADMIN holds ILR_APP_ROLE

ILR_APP_ROLE (the app's role) is held by ILR_APP_USER and also by the role
SYSADMIN (granted by ACCOUNTADMIN on 27 September 2026, outside the repo's
SQL). This stays, as the one named exception to the rule that each service
role is held only by its own service user (`check:grants`, rule 12;
`ROLE_HOLDER_EXCEPTIONS` in `scripts/check-grants.js`).

Why: the app creates and owns the 18 `CAPTURE_DB.LARS` tables
(`scripts/import-lars.js`), and nothing else is granted on them. ACCOUNTADMIN
reaches them only through ACCOUNTADMIN → SYSADMIN → ILR_APP_ROLE. Without it,
the test-data scripts run as ACCOUNTADMIN that join `LARS.STANDARD`
(`witness_test_statements.sql`, `iqa_test_signoffs.sql`,
`test_learners_more.sql`) would fail, and ACCOUNTADMIN couldn't manage the
LARS tables.

What it means: SYSADMIN, and so ACCOUNTADMIN, has everything ILR_APP_ROLE
has. Both are admin roles held only by Alan's own user.

To remove it later: make ACCOUNTADMIN the owner of the LARS tables, grant
ILR_APP_ROLE what the app and the LARS import need, then revoke the role
from SYSADMIN and take the exception out.


## Recorded 30 October 2026: data metric functions weekly, bookkeeping on the job's warehouse

Cost cuts (proposal A of 22 October). The data metric functions (decision 21)
are attached to the live SILVER and GOLD tables only, on one weekly schedule
(`USING CRON 0 7 * * 1 Europe/London`, `sql/dmf_01_weekly_schedule.sql`): no
5-minute schedule, no `TRIGGER_ON_CHANGES` (which keeps a hidden dynamic table
per table), no waiting loop in the transform job. Jobs are off most of the time
and nothing changes between builds. `npm run check:dmf` reads the latest
results and fails on any older than 8 days. A table swapped in since the last
Monday run has no measurement until the next one.

Each job's run is recorded in `OPS.JOB_RUN` on the connection of the user
whose warehouse the job wakes anyway (`connectAs` in `server/jobSchedule.js`:
loader or transform), so `CAPTURE_WH` is not woken as well. Companies House
and Skills England still use the app's connection.
