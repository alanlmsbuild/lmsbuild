"""Compute journey times between South Yorkshire's LSOAs (decision 19, phase
A) with r5py, and write them as one CSV for npm run load:data -- 42.

  Origins and destinations: every South Yorkshire LSOA at its ONS
    population-weighted centroid (data/travel/origins/, from
    scripts/travel/origins.js).
  Network: the OpenStreetMap extract (streets and paths) and the BODS feed
    clipped to South Yorkshire (scripts/travel/clip_gtfs.py): walk, bus,
    coach and tram, as the feed has them. No rail (phase B).
  Departure: Tuesday 10 November 2026, any minute from 07:30 to 08:30;
    r5py gives the 25th, 50th and 75th percentile of the journey times over
    that window. Walking only, separately. Times over 90 minutes are left
    empty.

Memory: R5 runs in Java with a 4.5 GB heap (MAX_MEMORY). Stop the dev
servers first. JAVA_HOME defaults to the portable Temurin 21 in
~/.cache/rarebit-java.

  .venv-travel/bin/python scripts/travel/compute.py

Writes data/travel/results/travel_time_lsoa_<run date>_<run id>.csv.
"""

import csv
import datetime as dt
import json
import os
import sys
import time
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'data' / 'travel'
MAX_MEMORY = '4608M'  # 4.5 GB
DEPARTURE = dt.datetime(2026, 11, 10, 7, 30)
WINDOW = dt.timedelta(minutes=60)
MAX_MINUTES = 90
PERCENTILES = [25, 50, 75]

if 'JAVA_HOME' not in os.environ:
    jres = sorted(Path.home().glob('.cache/rarebit-java/jdk-21*'))
    if not jres:
        sys.exit('no Java 21: see scripts/travel/README.md')
    os.environ['JAVA_HOME'] = str(jres[-1])
# r5py reads its settings from the command line when it is imported.
sys.argv += ['--max-memory', MAX_MEMORY]

import geopandas as gpd  # noqa: E402
import pandas as pd  # noqa: E402
import r5py  # noqa: E402


def newest(folder, pattern):
    found = sorted(folder.glob(pattern))
    if not found:
        sys.exit(f'nothing matching {pattern} in {folder}: run fetch.py, clip_gtfs.py and origins.js first')
    return found[-1]


def minutes(v):
    return '' if pd.isna(v) else str(int(v))


def main():
    started = time.time()
    osm = newest(DATA / 'osm', 'south-yorkshire-*.osm.pbf')
    gtfs = DATA / 'bods' / 'itm_yorkshire_gtfs_south_yorkshire.zip'
    inputs = json.loads((DATA / 'origins' / 'inputs.json').read_text())
    lsoas = pd.read_csv(DATA / 'origins' / 'south_yorkshire_lsoas.csv')
    places = gpd.GeoDataFrame({'id': lsoas['lsoa21_code']}, geometry=gpd.points_from_xy(lsoas['x'], lsoas['y']), crs='EPSG:27700').to_crs('EPSG:4326')
    print(f'{len(places)} places; network from {osm.name} and {gtfs.name}', flush=True)

    network = r5py.TransportNetwork(osm, [gtfs])
    print(f'network built in {time.time() - started:.0f}s', flush=True)

    transit = r5py.TravelTimeMatrix(network, origins=places, destinations=places, departure=DEPARTURE, departure_time_window=WINDOW,
                                    percentiles=PERCENTILES, transport_modes=[r5py.TransportMode.TRANSIT, r5py.TransportMode.WALK],
                                    max_time=dt.timedelta(minutes=MAX_MINUTES))
    print(f'transit times done at {time.time() - started:.0f}s', flush=True)
    walk = r5py.TravelTimeMatrix(network, origins=places, destinations=places, departure=DEPARTURE,
                                 transport_modes=[r5py.TransportMode.WALK], max_time=dt.timedelta(minutes=MAX_MINUTES))
    print(f'walking times done at {time.time() - started:.0f}s', flush=True)

    times = transit.merge(walk.rename(columns={'travel_time': 'walk'}), on=['from_id', 'to_id'], how='outer')
    run_id = str(uuid.uuid4())
    computed_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    out = DATA / 'results' / f'travel_time_lsoa_{computed_at[:10]}_{run_id[:8]}.csv'
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['run_id', 'origin_lsoa21', 'destination_lsoa21', 'transit_minutes_p25', 'transit_minutes_p50', 'transit_minutes_p75', 'walk_minutes',
                    'departure_date', 'window_start', 'window_minutes', 'max_minutes', 'modes', 'gtfs_feed_version', 'gtfs_source_file_id',
                    'osm_source_file_id', 'centroid_source_file_id', 'r5py_version', 'computed_at'])
        for r in times.itertuples(index=False):
            w.writerow([run_id, r.from_id, r.to_id, minutes(r.travel_time_p25), minutes(r.travel_time_p50), minutes(r.travel_time_p75), minutes(r.walk),
                        DEPARTURE.date().isoformat(), DEPARTURE.strftime('%H:%M'), int(WINDOW.total_seconds() // 60), MAX_MINUTES, 'walk,bus,coach,tram',
                        inputs['gtfs_feed_version'], inputs['gtfs_source_file_id'], inputs['osm_source_file_id'], inputs['centroid_source_file_id'],
                        r5py.__version__, computed_at])
    print(f'{len(times):,} pairs written to {out.relative_to(REPO)} in {time.time() - started:.0f}s')


if __name__ == '__main__':
    main()
