"""Compute journey times between South Yorkshire's LSOAs (decision 19, phases
A and B) with r5py, and write them as one CSV for npm run load:data -- 42.

  Origins and destinations: every South Yorkshire LSOA at its ONS
    population-weighted centroid (data/travel/origins/, from
    scripts/travel/origins.js).
  Network: the OpenStreetMap extract (streets and paths), the BODS feed
    clipped to South Yorkshire (scripts/travel/clip_gtfs.py: bus, coach and
    tram) and the rail feed for the day (scripts/travel/cif_to_gtfs.py).
  Departure: the rail feed's day (it is built for one; the first run is
    Tuesday 10 November 2026), any minute from 07:30 to 08:30. Stops if the
    BODS feed doesn't cover the same day: bus and rail always use the same
    date. r5py gives the 25th, 50th and 75th percentile of the journey
    times over that window. Four runs:
      all modes      walk, bus, coach, tram and train together
      bus only       walk, bus, coach and tram (no train)
      train only     walk and train
      walking only
    modes_used is estimated from the medians (agreed 20 October 2026):
    walk when walking alone is within 2 minutes of the all-modes time; bus
    when the bus-only time is; train when the train-only time is; train and
    bus when the all-modes time beats both by more than 2 minutes. Walking
    at 4.8 km/h (DfT's journey time statistics figure; r5py's default is
    3.6). Any time over 90 minutes is left empty, in every column (R5 can
    report a little over its cap once waiting is counted).

Memory: R5 runs in Java with a 4.5 GB heap (MAX_MEMORY). Stop the dev
servers first (3001, 5173 and any test servers) for a full run. JAVA_HOME defaults to the portable Temurin 21 in
~/.cache/rarebit-java.

  .venv-travel/bin/python scripts/travel/compute.py
  .venv-travel/bin/python scripts/travel/compute.py --only E01...,E01...

Writes data/travel/results/travel_time_lsoa_<run date>_<run id>.csv. With
--only, just those LSOAs (to and from each other), into
data/travel/test-results/ instead, where load:data doesn't look.
"""

import argparse
import csv
import datetime as dt
import json
import os
import sys
import time
import uuid
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'data' / 'travel'
MAX_MEMORY = '4608M'  # 4.5 GB
WINDOW_START = dt.time(7, 30)
WINDOW = dt.timedelta(minutes=60)
MAX_MINUTES = 90
PERCENTILES = [25, 50, 75]
WALK_KMH = 4.8
SAME_WITHIN = 2  # minutes: "about as fast" for modes_used

if 'JAVA_HOME' not in os.environ:
    jres = sorted(Path.home().glob('.cache/rarebit-java/jdk-21*'))
    if not jres:
        sys.exit('no Java 21: see scripts/travel/README.md')
    os.environ['JAVA_HOME'] = str(jres[-1])
ARGS = argparse.ArgumentParser(description='Journey times between South Yorkshire LSOAs.')
ARGS.add_argument('--only', help='comma-separated LSOA codes: a test run between just these, not for loading')
ARGS = ARGS.parse_args()
# r5py reads its settings from the command line when it is imported.
sys.argv = sys.argv[:1] + ['--max-memory', MAX_MEMORY]

import geopandas as gpd  # noqa: E402
import pandas as pd  # noqa: E402
import r5py  # noqa: E402


def newest(folder, pattern):
    found = sorted(folder.glob(pattern))
    if not found:
        sys.exit(f'nothing matching {pattern} in {folder}: run fetch.py, clip_gtfs.py and origins.js first')
    return found[-1]


def minutes(v):
    return '' if pd.isna(v) or v > MAX_MINUTES else str(int(v))


def capped(v):
    return None if pd.isna(v) or v > MAX_MINUTES else int(v)


def modes_used(all_modes, bus, rail, walk):
    """The modes a journey used, estimated from the medians (see above)."""
    if all_modes is None:
        return ''
    near = lambda t: t is not None and t <= all_modes + SAME_WITHIN
    if near(walk):
        return 'walk'
    if near(bus):
        return 'bus'
    if near(rail):
        return 'train'
    return 'train and bus'


def feed_csv(zpath, name):
    with zipfile.ZipFile(zpath) as z, z.open(name) as f:
        return list(csv.DictReader(line.decode('utf-8-sig') for line in f))


def the_day(bods, rail):
    """The rail feed's one day, if the BODS feed covers it too; else stop."""
    days = {r['date'] for r in feed_csv(rail, 'calendar_dates.txt') if r['exception_type'] == '1'}
    if len(days) != 1:
        sys.exit(f'{rail.name} should cover exactly one day, not {sorted(days)}')
    day = dt.datetime.strptime(days.pop(), '%Y%m%d').date()
    info = feed_csv(bods, 'feed_info.txt')[0]
    start, end = (dt.datetime.strptime(info[k], '%Y%m%d').date() for k in ('feed_start_date', 'feed_end_date'))
    if not start <= day <= end:
        sys.exit(f'the BODS feed ({start} to {end}) does not cover {day}, the rail feed\'s day: bus and rail must use the same date')
    return day, feed_csv(rail, 'feed_info.txt')[0]['feed_version']


def matrix(network, places, departure, modes, **kw):
    return r5py.TravelTimeMatrix(network, origins=places, destinations=places, departure=departure, transport_modes=modes,
                                 max_time=dt.timedelta(minutes=MAX_MINUTES), speed_walking=WALK_KMH, **kw)


def main():
    started = time.time()
    osm = newest(DATA / 'osm', 'south-yorkshire-*.osm.pbf')
    bods = DATA / 'bods' / 'itm_yorkshire_gtfs_south_yorkshire.zip'
    rail = newest(DATA / 'nr' / 'gtfs', 'rail_south_yorkshire_*.zip')
    day, rail_version = the_day(bods, rail)
    departure = dt.datetime.combine(day, WINDOW_START)
    inputs = json.loads((DATA / 'origins' / 'inputs.json').read_text())
    if not ARGS.only and not inputs.get('rail_source_file_id'):
        sys.exit('inputs.json has no rail_source_file_id: load the rail sources (load:data step 44), then run origins.js')
    lsoas = pd.read_csv(DATA / 'origins' / 'south_yorkshire_lsoas.csv')
    if ARGS.only:
        only = ARGS.only.split(',')
        lsoas = lsoas[lsoas['lsoa21_code'].isin(only)]
        missing = set(only) - set(lsoas['lsoa21_code'])
        if missing:
            sys.exit(f'not South Yorkshire LSOAs: {sorted(missing)}')
    places = gpd.GeoDataFrame({'id': lsoas['lsoa21_code']}, geometry=gpd.points_from_xy(lsoas['x'], lsoas['y']), crs='EPSG:27700').to_crs('EPSG:4326')
    print(f'{len(places)} places on {day}; network from {osm.name}, {bods.name} and {rail.name}', flush=True)

    network = r5py.TransportNetwork(osm, [bods, rail])
    print(f'network built in {time.time() - started:.0f}s', flush=True)

    M = r5py.TransportMode
    window = {'departure_time_window': WINDOW, 'percentiles': PERCENTILES}
    runs = {
        'all': matrix(network, places, departure, [M.TRANSIT, M.WALK], **window),
        'bus': matrix(network, places, departure, [M.BUS, M.TRAM, M.WALK], **window),
        'rail': matrix(network, places, departure, [M.RAIL, M.WALK], **window),
        'walk': matrix(network, places, departure, [M.WALK]),
    }
    print(f'four runs done at {time.time() - started:.0f}s', flush=True)

    keys = ['from_id', 'to_id']
    times = runs['all']
    for name in ('bus', 'rail'):
        times = times.merge(runs[name].rename(columns={f'travel_time_p{p}': f'{name}_p{p}' for p in PERCENTILES}), on=keys, how='outer')
    times = times.merge(runs['walk'].rename(columns={'travel_time': 'walk'}), on=keys, how='outer')

    run_id = str(uuid.uuid4())
    computed_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    folder = DATA / ('test-results' if ARGS.only else 'results')
    out = folder / f'travel_time_lsoa_{computed_at[:10]}_{run_id[:8]}.csv'
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['run_id', 'origin_lsoa21', 'destination_lsoa21', 'transit_minutes_p25', 'transit_minutes_p50', 'transit_minutes_p75', 'walk_minutes',
                    'departure_date', 'window_start', 'window_minutes', 'max_minutes', 'modes', 'gtfs_feed_version', 'gtfs_source_file_id',
                    'osm_source_file_id', 'centroid_source_file_id', 'r5py_version', 'computed_at',
                    'bus_minutes_p25', 'bus_minutes_p50', 'bus_minutes_p75', 'rail_minutes_p25', 'rail_minutes_p50', 'rail_minutes_p75',
                    'modes_used', 'rail_feed_version', 'rail_source_file_id'])
        for r in times.itertuples(index=False):
            used = modes_used(capped(r.travel_time_p50), capped(r.bus_p50), capped(r.rail_p50), capped(r.walk))
            w.writerow([run_id, r.from_id, r.to_id, minutes(r.travel_time_p25), minutes(r.travel_time_p50), minutes(r.travel_time_p75), minutes(r.walk),
                        day.isoformat(), WINDOW_START.strftime('%H:%M'), int(WINDOW.total_seconds() // 60), MAX_MINUTES, 'walk,bus,coach,tram,rail',
                        inputs['gtfs_feed_version'], inputs['gtfs_source_file_id'], inputs['osm_source_file_id'], inputs['centroid_source_file_id'],
                        r5py.__version__, computed_at,
                        minutes(r.bus_p25), minutes(r.bus_p50), minutes(r.bus_p75), minutes(r.rail_p25), minutes(r.rail_p50), minutes(r.rail_p75),
                        used, rail_version, inputs.get('rail_source_file_id', '')])
    print(f'{len(times):,} pairs written to {out.relative_to(REPO)} in {time.time() - started:.0f}s')

if __name__ == '__main__':
    main()
