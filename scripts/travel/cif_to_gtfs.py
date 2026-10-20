"""Build the rail GTFS for one day (decision 19, phase B) from Network Rail's
SCHEDULE full extract (CIF) and CORPUS, fetched by fetch.py into
data/travel/nr/. Nothing here touches Snowflake: npm run load:data -- 44
loads the files, originals and all.

  For the day (default Tuesday 10 November 2026):
  - each train's schedule that applies that day: of the schedules whose
    dates and days run include it, the one with the first STP indicator in
    C (cancelled), N (new), O (overlay), P (permanent); a C means it
    doesn't run
  - passenger trains only: train status P or 1, and an advertised passenger
    category (OO, OW, XX, XC, XD, XI, XZ); no buses, ships, empty or
    unadvertised trains
  - public calls only (a public time and a T, U, D, TB, TF or R activity),
    at stations in South Yorkshire's OpenStreetMap extract's bounding box
    plus 5 km (as clip_gtfs.py clips the buses); a train is kept if it makes
    two or more such calls, cut to those calls
  - each station matched to NaPTAN by its TIPLOC (ATCO code 9100 + TIPLOC),
    or failing that by its CRS code to another TIPLOC that is in NaPTAN; it
    takes the NaPTAN stop's position

  Writes data/travel/nr/gtfs/rail_south_yorkshire_<day>.zip (agency, stops,
  routes, trips, stop_times, calendar_dates, feed_info) and
  rail_south_yorkshire_<day>.report.json beside it: every NaPTAN rail
  station in the area and whether it matched, the timetable's TIPLOCs with
  public calls next to the area's that NaPTAN doesn't have, and the trains
  kept on the day and on the other term-time Tuesdays the comparison lists.
  Stops (exit 1) if a NaPTAN station in the area has trains in the extract
  but no match, if the day is outside the extract or the BODS feed, or if
  the day has under 90% of the other Tuesdays' median trains.

  .venv-travel/bin/python -I scripts/travel/cif_to_gtfs.py [YYYY-MM-DD]
"""

import csv
import datetime as dt
import gzip
import io
import json
import math
import os
import statistics
import sys
import zipfile
from pathlib import Path

import pyproj

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'data' / 'travel'
NR = DATA / 'nr'
RAREBIT_DATA = Path(os.environ.get('RAREBIT_DATA', '/mnt/c/Users/alanb/rarebit-data'))
BODS = DATA / 'bods' / 'itm_yorkshire_gtfs.zip'
BUFFER_KM = 5
DAY = dt.date(2026, 11, 10)
# Term-time Tuesdays to compare the day with: South Yorkshire's autumn term
# after half term, before the 13 December timetable change.
COMPARE = [dt.date(2026, 11, 3), dt.date(2026, 11, 17), dt.date(2026, 11, 24), dt.date(2026, 12, 1), dt.date(2026, 12, 8)]
PASSENGER_STATUS = {'P', '1'}
PASSENGER_CATEGORY = {'OO', 'OW', 'XX', 'XC', 'XD', 'XI', 'XZ'}
PUBLIC_ACTIVITY = {'T', 'U', 'D', 'TB', 'TF', 'R'}
STP_ORDER = 'CNOP'
# ATOC codes of the operators that run in or near South Yorkshire; others
# are named by their code.
OPERATORS = {
    'NT': 'Northern', 'TP': 'TransPennine Express', 'XC': 'CrossCountry', 'GR': 'London North Eastern Railway',
    'EM': 'East Midlands Railway', 'GC': 'Grand Central', 'HT': 'Hull Trains', 'LD': 'Lumo',
}


def area():
    """The South Yorkshire extract's bounding box, plus BUFFER_KM (as clip_gtfs.py)."""
    headers = sorted((DATA / 'osm').glob('south-yorkshire-*.osm.pbf.header.json'))
    if not headers:
        sys.exit('no OpenStreetMap extract: run scripts/travel/fetch.py first')
    box = json.loads(headers[-1].read_text())['bounding_box']
    dlat = BUFFER_KM / 111.32
    dlon = BUFFER_KM / (111.32 * math.cos(math.radians((box['min_lat'] + box['max_lat']) / 2)))
    return box['min_lat'] - dlat, box['max_lat'] + dlat, box['min_lon'] - dlon, box['max_lon'] + dlon


def latest(folder, pattern):
    files = sorted(folder.glob(pattern))
    if not files:
        sys.exit(f'no {pattern} in {folder}: run scripts/travel/fetch.py first')
    return files[-1]


def naptan_stations():
    """NaPTAN's active rail stations (ATCO 9100 + TIPLOC): TIPLOC -> stop."""
    path = latest(RAREBIT_DATA / 'naptan', 'naptan_stops_*.csv')
    out = {}
    # A few stops give only British National Grid easting and northing.
    to_wgs84 = pyproj.Transformer.from_crs('EPSG:27700', 'EPSG:4326', always_xy=True).transform
    with open(path, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if r['StopType'] == 'RLY' and r['ATCOCode'].startswith('9100') and r['Status'] == 'active':
                lon, lat = (float(r['Longitude']), float(r['Latitude'])) if r['Latitude'] else to_wgs84(float(r['Easting']), float(r['Northing']))
                out[r['ATCOCode'][4:]] = {'atco': r['ATCOCode'], 'name': r['CommonName'], 'lat': lat, 'lon': lon}
    return path.name, out


def corpus():
    """CORPUS: TIPLOC -> {crs, stanox, name}."""
    path = latest(NR, 'corpus-*.json.gz')
    out = {}
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        for r in json.load(f)['TIPLOCDATA']:
            t = (r.get('TIPLOC') or '').strip()
            if t:
                out[t] = {'crs': (r.get('3ALPHA') or '').strip(), 'stanox': (r.get('STANOX') or '').strip(),
                          'name': (r.get('NLCDESC') or '').strip()}
    return path.name, out


def cif_date(s):
    return dt.date(2000 + int(s[0:2]), int(s[2:4]), int(s[4:6]))


def public_time(s):
    """CIF public time HHMM as minutes, or None ('0000' or blank: not advertised)."""
    s = s.strip()
    return None if not s or s == '0000' else int(s[:2]) * 60 + int(s[2:4])


def activities(s):
    return {s[i:i + 2].strip() for i in range(0, len(s), 2)} - {''}


def read_schedules(cif, keep_tiplocs):
    """One pass over the extract. Returns every schedule header (by train
    UID) and, for schedules that make a public call at one of keep_tiplocs,
    their locations; plus the TIPLOCs the TI records describe."""
    schedules, tiplocs = {}, {}
    current, locations, header_line = None, [], None

    def close():
        if current is not None:
            current['calls'] = locations if any(l['tiploc'] in keep_tiplocs for l in locations) else None
            schedules.setdefault(current['uid'], []).append(current)

    with gzip.open(cif, 'rt', encoding='ascii', errors='replace') as f:
        for line in f:
            kind = line[:2]
            if kind == 'HD':
                header_line = line.rstrip('\n')
            elif kind == 'TI':
                tiplocs[line[2:9].strip()] = {'stanox': line[44:49].strip(), 'crs': line[53:56].strip(), 'name': line[18:44].strip()}
            elif kind == 'BS':
                close()
                stp = line[79]
                current = {'uid': line[3:9], 'stp': stp, 'from': cif_date(line[9:15]), 'to': cif_date(line[15:21]),
                           'days': line[21:28], 'status': line[29], 'category': line[30:32], 'headcode': line[32:36].strip(),
                           'atoc': ''}
                locations = []
            elif kind == 'BX' and current is not None:
                current['atoc'] = line[11:13].strip()
            elif kind == 'LO' and current is not None:
                locations.append({'tiploc': line[2:9].strip(), 'arr': None, 'dep': public_time(line[15:19]), 'act': activities(line[29:41])})
            elif kind == 'LI' and current is not None:
                locations.append({'tiploc': line[2:9].strip(), 'arr': public_time(line[25:29]), 'dep': public_time(line[29:33]), 'act': activities(line[42:54])})
            elif kind == 'LT' and current is not None:
                locations.append({'tiploc': line[2:9].strip(), 'arr': public_time(line[15:19]), 'dep': None, 'act': activities(line[25:37])})
            elif kind == 'ZZ':
                break
    close()
    return header_line, schedules, tiplocs


def applies(s, day):
    return s['from'] <= day <= s['to'] and s['days'][day.weekday()] == '1'


def running(schedules, day):
    """Each train UID's schedule for the day, or none (cancelled, or none applies)."""
    out = []
    for versions in schedules.values():
        on = [s for s in versions if applies(s, day)]
        if not on:
            continue
        s = min(on, key=lambda s: STP_ORDER.index(s['stp']) if s['stp'] in STP_ORDER else 9)
        if s['stp'] != 'C':
            out.append(s)
    return out


def public_calls(s):
    """The train's public calls, with times running on past midnight."""
    calls, last = [], None
    for l in s['calls'] or []:
        if not (l['act'] & PUBLIC_ACTIVITY) or (l['arr'] is None and l['dep'] is None):
            continue
        arr, dep = l['arr'] if l['arr'] is not None else l['dep'], l['dep'] if l['dep'] is not None else l['arr']
        while last is not None and arr < last:
            arr, dep = arr + 1440, dep + 1440
        while dep < arr:
            dep += 1440
        last = dep
        calls.append({**l, 'arr_min': arr, 'dep_min': dep})
    return calls


def kept_trains(schedules, day, in_area):
    """Passenger trains running on the day with two or more public calls in the area, cut to those calls."""
    out = []
    for s in running(schedules, day):
        if s['status'] not in PASSENGER_STATUS or s['category'] not in PASSENGER_CATEGORY or not s['calls']:
            continue
        calls = public_calls(s)
        local = [c for c in calls if c['tiploc'] in in_area]
        if len(local) >= 2:
            out.append((s, calls, local))
    return out


def hhmmss(minutes):
    return f'{minutes // 60:02d}:{minutes % 60:02d}:00'


def write_csv(z, name, header, rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    w.writerow(header)
    w.writerows(rows)
    # A fixed date in the zip, so the same timetable makes the same file (load:data skips it).
    z.writestr(zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0)), buf.getvalue(), compress_type=zipfile.ZIP_DEFLATED)
    return len(rows)


def bods_covers(day):
    with zipfile.ZipFile(BODS) as z, z.open('feed_info.txt') as f:
        info = next(csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')))
    start, end = (dt.datetime.strptime(info[k], '%Y%m%d').date() for k in ('feed_start_date', 'feed_end_date'))
    return start <= day <= end, info['feed_version'], start.isoformat(), end.isoformat()


def main():
    day = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else DAY
    cif = latest(NR, 'toc-full-*.CIF.gz')
    head = json.loads((NR / f'{cif.name}.header.json').read_text())
    problems = []
    if not dt.date.fromisoformat(head['user_start_date']) <= day <= dt.date.fromisoformat(head['user_end_date']):
        problems.append(f"{day} is outside the SCHEDULE extract ({head['user_start_date']} to {head['user_end_date']})")
    bods_ok, bods_version, bods_start, bods_end = bods_covers(day)
    if not bods_ok:
        problems.append(f'{day} is outside the BODS feed ({bods_start} to {bods_end})')

    lat0, lat1, lon0, lon1 = area()
    naptan_file, naptan = naptan_stations()
    corpus_file, codes = corpus()
    inside = {t: s for t, s in naptan.items() if lat0 <= s['lat'] <= lat1 and lon0 <= s['lon'] <= lon1}
    by_crs = {}
    for t, s in inside.items():
        crs = codes.get(t, {}).get('crs')
        if crs:
            by_crs.setdefault(crs, t)
    # The area's TIPLOCs: NaPTAN's own, and any other TIPLOC with one of their CRS codes.
    stop_of = {t: t for t in inside}
    for t, c in codes.items():
        if t not in stop_of and c['crs'] in by_crs:
            stop_of[t] = by_crs[c['crs']]

    print(f'reading {cif.name} ...', flush=True)
    header_line, schedules, ti = read_schedules(cif, set(stop_of))
    print(f'  {sum(len(v) for v in schedules.values()):,} schedules, {len(schedules):,} train UIDs', flush=True)

    trains = kept_trains(schedules, day, stop_of)
    compare = {d.isoformat(): len(kept_trains(schedules, d, stop_of)) for d in COMPARE}
    median = statistics.median(compare.values())
    if len(trains) < 0.9 * median:
        problems.append(f'{day} has {len(trains)} trains in the area, under 90% of the other Tuesdays\' median ({median})')

    # Every NaPTAN station in the area: matched if a public call in the extract uses it.
    used = {stop_of[c['tiploc']] for vs in schedules.values() for s in vs for c in (s['calls'] or [])
            if c['tiploc'] in stop_of and c['act'] & PUBLIC_ACTIVITY}
    used_on_day = {stop_of[c['tiploc']] for _, _, local in trains for c in local}
    stations = []
    for t, s in sorted(inside.items(), key=lambda kv: kv[1]['name']):
        stations.append({'tiploc': t, 'atco': s['atco'], 'name': s['name'], 'crs': codes.get(t, {}).get('crs', ''),
                         'in_timetable': t in used, 'trains_on_day': sum(1 for _, _, local in trains if any(stop_of[c['tiploc']] == t for c in local))})
    # Stations NaPTAN has in the area but the timetable never calls at, by TIPLOC or CRS:
    # matched to nothing (they may be closed, or under another TIPLOC).
    no_calls = [s for s in stations if not s['in_timetable']]
    # TIPLOCs the kept trains call at publicly, next to the area's calls, that NaPTAN doesn't have at all.
    unknown = {}
    for _, calls, _ in kept_trains(schedules, day, stop_of):
        for c in calls:
            if c['tiploc'] not in stop_of and c['tiploc'] not in naptan:
                crs = codes.get(c['tiploc'], {}).get('crs') or ti.get(c['tiploc'], {}).get('crs', '')
                if not any(crs and codes.get(t, {}).get('crs') == crs for t in naptan):
                    unknown[c['tiploc']] = codes.get(c['tiploc'], {}).get('name') or ti.get(c['tiploc'], {}).get('name', '')
    for s in no_calls:
        problems.append(f"{s['name']} ({s['tiploc']}) is in NaPTAN and the area but has no public calls in the extract under its TIPLOC or CRS")

    # GTFS
    out_dir = NR / 'gtfs'
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f'rail_south_yorkshire_{day.isoformat()}'
    service = f'D{day:%Y%m%d}'
    version = f"{head['date_of_extract'].replace('-', '')}_{head['time_of_extract'].replace(':', '')}"
    name_of = lambda t: inside[stop_of[t]]['name'].removesuffix(' Rail Station') if t in stop_of else (codes.get(t, {}).get('name') or t).title()
    routes, trip_rows, time_rows, agencies = {}, [], [], set()
    for s, calls, local in sorted(trains, key=lambda x: (x[2][0]['dep_min'], x[0]['uid'])):
        atoc = s['atoc'] or 'ZZ'
        agencies.add(atoc)
        first, last = name_of(calls[0]['tiploc']), name_of(calls[-1]['tiploc'])
        route_id = f'{atoc}_{calls[0]["tiploc"]}_{calls[-1]["tiploc"]}'
        routes.setdefault(route_id, [route_id, atoc, '', f'{first} – {last}', '2'])
        trip_id = f"{s['uid']}_{day:%Y%m%d}"
        trip_rows.append([route_id, service, trip_id, last, s['uid'], s['stp'], s['category'], s['headcode']])
        for i, c in enumerate(local, 1):
            pickup = 1 if ({'D', 'TF'} & c['act'] and not {'T', 'U', 'R'} & c['act']) or i == len(local) else 0
            drop = 1 if ({'U', 'TB'} & c['act'] and not {'T', 'D', 'R'} & c['act']) or i == 1 else 0
            time_rows.append([trip_id, hhmmss(c['arr_min']), hhmmss(c['dep_min']), stop_of[c['tiploc']], i, pickup, drop])
    stop_rows = []
    for t in sorted(used_on_day):
        s = inside[t]
        stop_rows.append([t, codes.get(t, {}).get('crs', ''), s['name'], f"{s['lat']:.6f}", f"{s['lon']:.6f}", '0',
                          t, codes.get(t, {}).get('stanox', '') or ti.get(t, {}).get('stanox', ''), s['atco']])
    counts = {}
    zpath = out_dir / f'{stem}.zip'
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        counts['agency'] = write_csv(z, 'agency.txt', ['agency_id', 'agency_name', 'agency_url', 'agency_timezone'],
                                     [[a, OPERATORS.get(a, a), 'https://www.nationalrail.co.uk/', 'Europe/London'] for a in sorted(agencies)])
        counts['stops'] = write_csv(z, 'stops.txt', ['stop_id', 'stop_code', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'tiploc', 'stanox', 'naptan_atco'], stop_rows)
        counts['routes'] = write_csv(z, 'routes.txt', ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type'], list(routes.values()))
        counts['trips'] = write_csv(z, 'trips.txt', ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'train_uid', 'stp_indicator', 'train_category', 'headcode'], trip_rows)
        counts['stop_times'] = write_csv(z, 'stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type'], time_rows)
        counts['calendar_dates'] = write_csv(z, 'calendar_dates.txt', ['service_id', 'date', 'exception_type'], [[service, f'{day:%Y%m%d}', '1']])
        counts['feed_info'] = write_csv(z, 'feed_info.txt', ['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'feed_start_date', 'feed_end_date', 'feed_version'],
                                        [['Rarebit, from Network Rail SCHEDULE', 'https://www.networkrail.co.uk/', 'en', f'{day:%Y%m%d}', f'{day:%Y%m%d}', version]])

    report = {
        'day': day.isoformat(), 'schedule_file': cif.name, 'schedule_header': head, 'corpus_file': corpus_file, 'naptan_file': naptan_file,
        'bods_feed_version': bods_version, 'bods_covers': [bods_start, bods_end], 'area_box': [lat0, lat1, lon0, lon1],
        'gtfs_file': zpath.name, 'rows': counts, 'trains_on_day': len(trains), 'trains_on_other_tuesdays': compare,
        'stations': stations, 'naptan_stations_without_calls': [s['name'] for s in no_calls],
        'tiplocs_not_in_naptan': unknown, 'problems': problems,
    }
    (out_dir / f'{stem}.report.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(f'  {zpath.name}: ' + ', '.join(f'{k} {v:,}' for k, v in counts.items()))
    print(f'  trains in the area on {day}: {len(trains)}; other Tuesdays: ' + ', '.join(f'{k} {v}' for k, v in compare.items()))
    print(f'  NaPTAN stations in the area: {len(stations)}, with trains on the day: {len(used_on_day)}')
    if problems:
        print('PROBLEMS:\n  ' + '\n  '.join(problems))
        sys.exit(1)


if __name__ == '__main__':
    main()
