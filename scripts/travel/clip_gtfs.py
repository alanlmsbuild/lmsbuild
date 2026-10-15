"""Clip the BODS GTFS feed for Yorkshire to South Yorkshire (decision 19,
phase A), so R5 fits in a 4.5 GB Java heap: every trip that calls at a stop
inside the OpenStreetMap extract's bounding box plus BUFFER_KM is kept whole
(so a journey that leaves the area and comes back is right), with the stops,
routes, agencies and services those trips use. shapes.txt (the drawn route
lines, 1 GB) is left out: R5 doesn't use it. Reads the feed a row at a time.

  .venv-travel/bin/python scripts/travel/clip_gtfs.py

Writes data/travel/bods/<feed>_south_yorkshire.zip and prints what it kept.
"""

import csv
import io
import json
import math
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'data' / 'travel'
FEED = DATA / 'bods' / 'itm_yorkshire_gtfs.zip'
BUFFER_KM = 5


def area():
    """The South Yorkshire extract's bounding box, plus BUFFER_KM."""
    headers = sorted((DATA / 'osm').glob('south-yorkshire-*.osm.pbf.header.json'))
    if not headers:
        sys.exit('no OpenStreetMap extract: run scripts/travel/fetch.py first')
    box = json.loads(headers[-1].read_text())['bounding_box']
    dlat = BUFFER_KM / 111.32
    dlon = BUFFER_KM / (111.32 * math.cos(math.radians((box['min_lat'] + box['max_lat']) / 2)))
    return box['min_lat'] - dlat, box['max_lat'] + dlat, box['min_lon'] - dlon, box['max_lon'] + dlon


def rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig', newline=''))


def header(z, name):
    with z.open(name) as f:
        return next(csv.reader(io.TextIOWrapper(f, encoding='utf-8-sig', newline='')))


def write(out, z, name, keep):
    """Copies the rows of name for which keep(row) is true; returns the count."""
    cols = header(z, name)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator='\n')
    w.writeheader()
    n = 0
    with out.open(name, 'w') as dest:
        dest.write(buf.getvalue().encode())
        for r in rows(z, name):
            if not keep(r):
                continue
            buf.seek(0)
            buf.truncate()
            w.writerow(r)
            dest.write(buf.getvalue().encode())
            n += 1
    return n


def main():
    lat0, lat1, lon0, lon1 = area()
    with zipfile.ZipFile(FEED) as z:
        version = next(rows(z, 'feed_info.txt'))['feed_version']
        inside = {r['stop_id'] for r in rows(z, 'stops.txt')
                  if r['stop_lat'] and lat0 <= float(r['stop_lat']) <= lat1 and lon0 <= float(r['stop_lon']) <= lon1}
        # Pass 1: the trips that call inside the area.
        trips = set()
        for r in rows(z, 'stop_times.txt'):
            if r['stop_id'] in inside:
                trips.add(r['trip_id'])
        # What those trips use.
        stops, routes, services = set(), set(), set()
        for r in rows(z, 'trips.txt'):
            if r['trip_id'] in trips:
                routes.add(r['route_id'])
                services.add(r['service_id'])
        for r in rows(z, 'stop_times.txt'):
            if r['trip_id'] in trips:
                stops.add(r['stop_id'])
        parents = {r['parent_station'] for r in rows(z, 'stops.txt') if r['stop_id'] in stops and r['parent_station']}
        agencies = {r['agency_id'] for r in rows(z, 'routes.txt') if r['route_id'] in routes}

        dest = DATA / 'bods' / f'{FEED.stem}_south_yorkshire.zip'
        counts = {}
        with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as out:
            counts['agency'] = write(out, z, 'agency.txt', lambda r: r['agency_id'] in agencies)
            counts['stops'] = write(out, z, 'stops.txt', lambda r: r['stop_id'] in stops or r['stop_id'] in parents)
            counts['routes'] = write(out, z, 'routes.txt', lambda r: r['route_id'] in routes)
            # No shapes.txt, so no shape_id either.
            counts['trips'] = write(out, z, 'trips.txt', lambda r: r['trip_id'] in trips and (r.update(shape_id='') or True))
            counts['stop_times'] = write(out, z, 'stop_times.txt', lambda r: r['trip_id'] in trips)
            counts['calendar'] = write(out, z, 'calendar.txt', lambda r: r['service_id'] in services)
            counts['calendar_dates'] = write(out, z, 'calendar_dates.txt', lambda r: r['service_id'] in services)
            counts['feed_info'] = write(out, z, 'feed_info.txt', lambda r: True)
    print(json.dumps({'feed_version': version, 'area': {'lat': [round(lat0, 4), round(lat1, 4)], 'lon': [round(lon0, 4), round(lon1, 4)]},
                      'stops_inside': len(inside), 'kept': counts, 'file': dest.name, 'bytes': dest.stat().st_size}, indent=1))


if __name__ == '__main__':
    main()
