# Travel times (decision 19)

Journey times between LSOA population-weighted centroids. Phase A: South
Yorkshire, walk, bus, coach and tram, Tuesday 10 November 2026, departures
07:30 to 08:30, 25th/50th/75th percentile minutes, capped at 90, with
walking-only times. Run by hand, in this order, from the repo root:

    .venv-travel/bin/python scripts/travel/fetch.py       # inputs into data/travel/ (git-ignored)
    .venv-travel/bin/python scripts/travel/clip_gtfs.py   # the feed clipped to South Yorkshire + 5 km
    .venv-travel/bin/python -I scripts/travel/cif_to_gtfs.py  # phase B: the rail GTFS for the day, and its checks (stations matched, trains against other Tuesdays)
    npm run load:data -- 41                                # the sources into SHARED_DB.RAW, originals in the stage
    node scripts/travel/origins.js                         # the 860 LSOAs and their centroids, and the input IDs
    # Stop the dev servers (3001, 5173) first: R5 takes a 4.5 GB Java heap.
    .venv-travel/bin/python scripts/travel/compute.py     # about an hour; writes data/travel/results/
    npm run load:data -- 42                                # the times into SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN

Then dbt builds silver and gold as usual (npm run silver:build).

## Set-up (once)

- **Java 21**: the portable Temurin JRE in `~/.cache/rarebit-java`,
  downloaded from Adoptium and checked against both the API's SHA-256 and
  the release's `.sha256.txt`. No sudo. `compute.py` finds it (or set
  `JAVA_HOME`).
- **Python**: `~/.cache/rarebit-uv/uv venv .venv-travel --python 3.12`, then
  `VIRTUAL_ENV=.venv-travel ~/.cache/rarebit-uv/uv pip install -r scripts/travel/requirements.txt`.
  r5py downloads R5's jar into `~/.cache/r5py` the first time it runs.

## Licences

The times are derived from OpenStreetMap, so they are under the ODbL
(decision 19): show results with "© OpenStreetMap contributors", and don't
hand the tables over except under the ODbL. Timetables: Bus Open Data Service
(OGL v3.0); Network Rail SCHEDULE and CORPUS (Network Rail Infrastructure
Limited Data Feeds Licence, `nr-open`; "Contains information of Network Rail
Infrastructure Limited licensed under the following licence"). Centroids: ONS (OGL v3.0; contains OS data © Crown copyright and
database right). r5py (GPL-3) and R5 (MIT) are only run here, not
distributed.
