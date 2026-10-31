# Local authority code changes (ONS Code History Database)

Written 31 October 2026, on the branch `real-data-v1`. The data is the ONS Code History Database,
June 2026 release (as at 31 December 2025), `Changes.csv`; licence notes in
`docs/licences/ons-code-history-2026-06/`. **The SQL and the load have not been run yet** (see "What
Alan has to run"). The numbers below were worked out by running the models' own SQL on the real
file in a temporary table that Snowflake drops when the session ends, so nothing was written.

## The short answers

- **Barnsley and Sheffield changed code on 1 April 2025** (The Barnsley and Sheffield (Boundary
  Changes) Order 2024): Barnsley **E08000016 → E08000038**, Sheffield **E08000019 → E08000039**.
  The order also moved land between them, so the old Barnsley code has two successors (Barnsley
  and Sheffield). The lookup follows only the same-name successor and flags the boundary change,
  with its date, so figures before 1 April 2025 are labelled as being for the old boundary.
- **Sheffield is in the picker, under E08000039.** So is Barnsley, under E08000038. Neither old code
  is in the picker, and none should be.
- **No authority is missing from the picker, and none is extra.** The picker holds 361 local
  authorities (296 England, 32 Scotland, 22 Wales, 11 Northern Ireland). The June 2026 database
  lists exactly 361 live local authority codes (E06 63, E07 164, E08 36, E09 33, S12 32, W06 22,
  N09 11). The two sets are identical, code for code.
- **The problem was in the NEET data, not the picker.** In our NEET gold table all eight years of
  Barnsley (2019 to 2026) are under E08000016 and all eight of Sheffield under E08000019, the old
  codes. Someone who picks Barnsley (E08000038) would have found no NEET rows. Bournemouth
  (E06000028) and Poole (E06000029) appear for 2019 only; later years are under Bournemouth,
  Christchurch and Poole (E06000058). With the lookup, `neet_la_year` has a `current_area_code` column
  that puts Barnsley and Sheffield's eight years under their current codes.
- **Every other data set already uses today's codes.** I scanned every silver and gold table that
  has a local authority or area code column: the only old codes are in NEET.
  `labour_demand` and `local_authority_population` keep the published code in a `…_published`
  column (E08000016 and E08000019 there too), and their main code column is already today's.

## Codes that changed and still line up with an authority that exists today

20 old codes (the same authority carrying on under a new code, followed through as many changes as
it took). `boundary changed` is the latest change of boundary on the way.

| Old code | Name then | Code today | Name today | Last change | Changes | Boundary changed |
|---|---|---|---|---|---|---|
| E07000025 | Isles of Scilly | E06000053 | Isles of Scilly | 2009-04-01 | 1 | none |
| E07000002 | Bedford | E06000055 | Bedford | 2009-04-01 | 1 | none |
| E06000048 | Northumberland | E06000057 | Northumberland | 2013-04-01 | 1 | 2013-04-01 |
| E07000100 | St Albans | E07000240 | St Albans | 2012-04-01 | 1 | 2012-04-01 |
| E07000104 | Welwyn Hatfield | E07000241 | Welwyn Hatfield | 2012-04-01 | 1 | 2012-04-01 |
| E07000097 | East Hertfordshire | E07000242 | East Hertfordshire | 2013-04-01 | 1 | 2013-04-01 |
| E07000101 | Stevenage | E07000243 | Stevenage | 2013-04-01 | 1 | 2013-04-01 |
| E08000020 | Gateshead | E08000037 | Gateshead | 2013-04-01 | 1 | 2013-04-01 |
| E08000016 | Barnsley | E08000038 | Barnsley | 2025-04-01 | 1 | 2025-04-01 |
| E08000019 | Sheffield | E08000039 | Sheffield | 2025-04-01 | 1 | 2025-04-01 |
| S12000003 | Angus | S12000041 | Angus | 2010-04-01 | 1 | 2010-04-01 |
| S12000007 | Dundee City | S12000042 | Dundee City | 2010-04-01 | 1 | 2010-04-01 |
| S12000009 | East Dunbartonshire | S12000045 | East Dunbartonshire | 2011-04-01 | 1 | 2011-04-01 |
| S12000015 | Fife | S12000047 | Fife | 2018-02-02 | 1 | 2018-02-02 |
| S12000024 | Perth and Kinross | S12000048 | Perth and Kinross | 2018-02-02 | 1 | 2018-02-02 |
| S12000037 | Glasgow City | S12000049 | Glasgow City | 2019-04-01 | 3 | 2019-04-01 |
| S12000043 | Glasgow City | S12000049 | Glasgow City | 2019-04-01 | 2 | 2019-04-01 |
| S12000046 | Glasgow City | S12000049 | Glasgow City | 2019-04-01 | 1 | 2019-04-01 |
| S12000022 | North Lanarkshire | S12000050 | North Lanarkshire | 2019-04-01 | 2 | 2019-04-01 |
| S12000044 | North Lanarkshire | S12000050 | North Lanarkshire | 2019-04-01 | 1 | 2019-04-01 |

Glasgow City had four codes since 2009 (S12000037 → S12000043 → S12000046 → S12000049); the
lookup follows the chain to the end.

## Changes that do not line up (merged or split)

Their figures are **never combined or shared out**; they stay under the code they were published
with, with a note. One row per order.

| Date | Order | Areas → areas | Became | Kind |
|---|---|---|---|---|
| 2009-04-01 | The Bedfordshire (Structural Changes) Order 2008 | 2 → 1 | Central Bedfordshire | merged |
| 2009-04-01 | The Cheshire (Structural Changes) Order 2008 | 6 → 2 | Cheshire East, Cheshire West and Chester | merged |
| 2009-04-01 | The Cornwall (Structural Change) Order 2008 | 6 → 1 | Cornwall | merged |
| 2009-04-01 | The County Durham (Structural Change) Order 2008 | 7 → 1 | County Durham | merged |
| 2009-04-01 | The Northumberland (Structural Change) Order 2008 | 6 → 1 | Northumberland | merged |
| 2009-04-01 | The Shropshire (Structural Change) Order 2008 | 5 → 1 | Shropshire | merged |
| 2009-04-01 | The Wiltshire (Structural Change) Order 2008 | 4 → 1 | Wiltshire | merged |
| 2009-06-01 | The Merthyr Tydfil and Powys (Areas) Order 2009 | 2 → 2 | Merthyr Tydfil, Powys | split |
| 2011-04-01 | The East Dunbartonshire Council Area and Glasgow City Council Area (Princes Gate and Greenacres by Robroyston) Boundaries Alteration Order 2010 | 2 → 2 | East Dunbartonshire, Glasgow City | boundary_change |
| 2013-04-01 | The East Hertfordshire and Stevenage (Boundary Change) Order 2013 | 1 → 1 | Stevenage | boundary_change |
| 2013-04-01 | The Gateshead and Northumberland (Boundary Change) Order 2013 | 1 → 1 | Northumberland | boundary_change |
| 2018-02-02 | The Fife Council Area and Perth and Kinross Council Area (Keltybridge and Fife Environmental Energy Park at Westfield) Boundaries Amendment Order 2017 | 2 → 2 | Fife, Perth and Kinross | boundary_change |
| 2019-04-01 | The Bournemouth, Dorset and Poole (Structural Changes) Order 2018 | 8 → 2 | Bournemouth, Christchurch and Poole, Dorset | merged |
| 2019-04-01 | The East Suffolk (Local Government Changes) Order 2018 | 2 → 1 | East Suffolk | merged |
| 2019-04-01 | The Somerset West and Taunton (Local Government Changes) Order 2018 | 2 → 1 | Somerset West and Taunton | merged |
| 2019-04-01 | The West Suffolk (Local Government Changes) Order 2018 | 2 → 1 | West Suffolk | merged |
| 2020-04-01 | The Buckinghamshire (Structural Changes) Order 2019 | 4 → 1 | Buckinghamshire | merged |
| 2021-04-01 | The Northamptonshire (Structural Changes) Order 2020 | 7 → 2 | North Northamptonshire, West Northamptonshire | merged |
| 2023-04-01 | The Cumbria (Structural Changes) Order 2022 | 6 → 2 | Cumberland, Westmorland and Furness | merged |
| 2023-04-01 | The North Yorkshire (Structural Changes) Order 2022 | 7 → 1 | North Yorkshire | merged |
| 2023-04-01 | The Somerset (Structural Changes) Order 2022 | 4 → 1 | Somerset | merged |
| 2025-04-01 | The Barnsley and Sheffield (Boundary Changes) Order 2024 | 1 → 1 | Sheffield | boundary_change |

## Two things this shows about NEET

1. **NEET is published for upper-tier councils.** The NEET gold table has rows for 24 county councils
   (E10…, for example Kent, Essex, Lancashire) and 130 of the 361 live authorities, and nothing under
   their own code for the other 231: the 65 outside England (the Department for Education publishes
   NEET for England only) and 166 English districts inside those counties (E07…). A person who picks Cambridge or
   Amber Valley therefore has no NEET row under their own code; their council for NEET is the county
   (silver `local_authority` has each district's `county_code`). That is a separate lookup
   (district to county) and is not built here.
2. **Counties that were abolished are not lined up.** Cumbria (E10000006), Northamptonshire
   (E10000021), Dorset (E10000009) and Buckinghamshire are in the NEET table under their old county
   codes; Cumbria split into Cumberland and Westmorland and Furness in 2023, and the others became
   unitary councils. Those are merges and splits, so by the rule above they are left as published.

## What was built (nothing merged)

- `sql/ons_chd_01_tables.sql`: the bronze table `SHARED_DB.RAW.ONS_CODE_CHANGE`, grants and tags.
  **Not run.**
- `scripts/load/ons-chd.js`, load step 55: `Changes.csv` from the zip in `RAREBIT_DATA/ons-chd/` as
  UTF-8 (tested on the real file: 640,599 rows). **Not run.**
- dbt silver `local_authority_code_change` (108 local authority changes since 2009, with the kind of
  change and whether it lines up) and `local_authority_code_current` (today's code for each old
  code), gold `local_authority_code_lookup` (read by `SHARED_DB.GOLD_SITE`), and `neet_la_year`
  with `current_area_code` and `code_change_note`. `check:dbt` passes (79 models); `dbt parse` is
  clean. Not built in Snowflake yet.
- dbt tests: the lookup is unique per old code, every current code is a live authority and is final,
  a merge or split never lines up, and Barnsley and Sheffield map as above with 1 April 2025 as the
  boundary change.
- The school leavers site: `/sources` has an entry for the database, with the credit.

## What Alan has to run

1. Paste `sql/ons_chd_01_tables.sql` into a worksheet as ACCOUNTADMIN, and check its three checks.
2. `npm run load:data -- 55` (about 640,000 rows; expect it to take a few minutes).
3. `npm run transform:silver` (builds the two silver models, the gold lookup and `neet_la_year`).
4. Then `npm run export:site` can carry the lookup to the site's `data/site/` when a page needs
   NEET (no page does yet).

## District to county (31 October 2026)

NEET is published for upper-tier councils, so the 166 English districts have no row of their own.
`SHARED_DB.RAW.ONS_LAD_COUNTY` (load step 56, `sql/ons_lad_county_01_tables.sql`, **not run**) holds
the ONS "Local Authority District to County and Unitary Authority (April 2025) Lookup in the UK
(V2)" (361 rows; licence notes in `docs/licences/ons-lad-county-2025-04/`). Silver
`local_authority_county` has one row per district; gold `neet_area_for_la` (read by
`SHARED_DB.GOLD_SITE`) says for each live authority which NEET rows answer: `own`, `county` (with
the sentence "This figure is for Cambridgeshire County Council. NEET figures aren't published for
Cambridge on its own.") or `none` (outside England, or a county with no rows in this release, with
the reason). The county's figure is read as published; nothing is shared out or estimated.

To run, after `sql/ons_chd_01_tables.sql`: paste `sql/ons_lad_county_01_tables.sql` as ACCOUNTADMIN,
`npm run load:data -- 56`, `npm run transform:silver`, then grant the new gold table to
`SHARED_DB.GOLD_SITE` (the gold grants step) and `npm run export:site` when a page needs it.

### Run on 31 October 2026

Load steps 55 (640,599 rows) and 56 (361 rows) and `transform:silver` ran: 81 models built, 882 tests
passed, none failed. The build granted `neet_area_for_la` to `SHARED_DB.GOLD_SITE` itself (the site
export login reads it; `check:grants` passes, 1,498 checks). `neet_area_for_la` has 361 rows: 132
`own`, 164 `county`, 65 `none`. Data quality entries added for the five new tables.
