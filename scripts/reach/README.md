# Reach map data (Options app build brief, milestone 1)

The static files the reach map page reads, so it makes no Snowflake call per
click. Local use only for now: the per-origin files are the travel-time table
in another form (decision 19, ODbL question).

1. `node scripts/reach/fetch-boundaries.js` downloads the ONS LSOA (December
   2021) boundaries, BGC V5, England and Wales, to `data/reach/` and checks
   that all 860 South Yorkshire travel LSOAs have one.
2. `npm run load:data -- 45` loads them to `SHARED_DB.RAW.ONS_LSOA_BOUNDARY`
   (needs `sql/load_12_lsoa_boundaries.sql` run first).
3. `node scripts/reach/export.js` reads gold `TRAVEL_TIME`, the boundaries,
   silver `POSTCODE`, GIAS and Discover Uni, and writes `data/reach/export/`
   (not in git): `meta.json`, `origins/<LSOA>.json` (860), `boundaries.json`,
   `postcodes.json`, `places.json`. The file formats are described at the top
   of the script.
4. `node scripts/reach/check-export.js` checks every file against gold
   (every number, 5.9 million of them), that all 860 boundaries are loaded,
   and that postcodes and places point at real LSOAs.

Re-run 3 and 4 after each monthly travel-times refresh.

Dots: GIAS open colleges and establishments with a sixth form (special
schools left out) whose position is inside one of the 860 LSOAs, and Discover
Uni campuses of providers whose legal name includes "university" inside one
(colleges' higher-education centres are shown as their college).
