"""Fetch the Bus Open Data Service's bus fares (NeTEx) for South Yorkshire's
operators (decision 19, phase C), for npm run load:data -- 48.

  .venv-travel/bin/python scripts/fares/fetch_bus_fares.py          # list what it would fetch
  .venv-travel/bin/python scripts/fares/fetch_bus_fares.py --fetch  # and download it

Which operators: the national operator codes (NOC) of the agencies in the
clipped timetable feed (data/travel/bods/itm_yorkshire_gtfs_south_yorkshire.zip),
less the operators of other regions whose routes only reach the edge of the
area (SKIP below). BODS lists a fares dataset against every NOC an operator
group has, so a group's regional datasets all match: of those, only a dataset
whose own description names one of the area's NOCs is taken (First's "FSYO",
Arriva's "WRAY"), or Stagecoach's "Stagecoach Yorkshire"; datasets of small
operators (at most 2 NOCs) are all taken.

Licence: the Open Government Licence v3.0 (the DfT's catalogue entry for
"Bus Open Data - Bus Fares datasets", and the BODS site's own statement).
BODS API key: BODS_API_KEY in server/.env. It is never printed or stored (the
API's "next" links contain it, so only each dataset's own record is kept).

Writes data/fares/bods/:
  listing-<date>.json     the chosen datasets' listing records, as BODS gives them
  <id>_<name>.zip         each dataset as downloaded (NeTEx XML files)
"""
import csv
import datetime as dt
import io
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'data' / 'fares' / 'bods'
API = 'https://data.bus-data.dft.gov.uk/api/v1/fares/dataset'
# Operators of other regions (or no fares data, or coach): their routes reach the edge of the area only.
SKIP = {'BNSM': 'Bee Network (Greater Manchester)', 'NATX': 'National Express (coach)', 'FLIX': 'FlixBus (coach)',
        'SCEM': 'Stagecoach East Midlands', 'GAWY': 'East Yorkshire', 'EYMS': 'East Yorkshire', 'FHAL': 'First Halifax',
        'FHUD': 'First Huddersfield', 'FLDS': 'First Leeds', 'FBRA': 'First Bradford', 'SYFT': 'South Yorkshire Future Tram (no BODS fares)'}


def key():
    env = dict(re.findall(r'^([A-Z_]+)=(.*)$', (REPO / 'server' / '.env').read_text(), re.M))
    k = env.get('BODS_API_KEY', '').strip().strip('"\'')
    if not k:
        sys.exit('BODS_API_KEY is not in server/.env')
    return k


def get(url, params, binary=False):
    req = urllib.request.Request(f'{url}?{urllib.parse.urlencode({**params, "api_key": key()})}', headers={'User-Agent': 'Rarebit fares fetch'})
    with urllib.request.urlopen(req, timeout=600) as f:
        return f.read() if binary else json.loads(f.read())


def area_nocs():
    z = zipfile.ZipFile(REPO / 'data' / 'travel' / 'bods' / 'itm_yorkshire_gtfs_south_yorkshire.zip')
    return {r['agency_noc'] for r in csv.DictReader(io.TextIOWrapper(z.open('agency.txt'), 'utf-8-sig'))}


def choose():
    nocs = area_nocs() - set(SKIP)
    found = {}
    for noc in sorted(nocs):
        offset = 0
        while True:
            page = get(API, {'noc': noc, 'status': 'published', 'limit': 100, 'offset': offset})
            for r in page['results']:
                found.setdefault(r['id'], r)
            offset += 100
            if not page.get('next'):
                break
    picked = []
    for r in found.values():
        mine = nocs & set(r['noc'])
        words = set(re.findall(r'[A-Z]{3,5}', r['description']))
        small = len(r["noc"]) <= 2
        named = bool(mine & words) or (r['operatorName'] == 'Stagecoach' and r['description'] == 'Stagecoach Yorkshire')
        if mine and (small or named):
            picked.append(r)
    return sorted(picked, key=lambda r: (r['operatorName'], r['id'])), nocs


def main():
    picked, nocs = choose()
    print(f'{len(nocs)} operators in the area (less {len(SKIP)} skipped); {len(picked)} published fares datasets chosen:')
    for r in picked:
        print(f"  {r['id']:>6} {r['operatorName'][:28]:<28} {r['description'][:48]:<48} modified {r['modified'][:10]}, {r['numOfLines']} lines, {r['numOfFareProducts']} products")
    if '--fetch' not in sys.argv:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    day = dt.date.today().isoformat()
    (OUT / f'listing-{day}.json').write_text(json.dumps(picked, separators=(',', ':')) + '\n')
    for r in picked:
        name = re.sub(r'[^A-Za-z0-9]+', '-', r['operatorName']).strip('-')
        dest = OUT / f"{r['id']}_{name}.zip"
        if dest.exists():
            print(f'  {dest.name}: already here')
            continue
        data = get(f"https://data.bus-data.dft.gov.uk/fares/dataset/{r['id']}/download/", {}, binary=True)
        dest.write_bytes(data)
        z = zipfile.ZipFile(dest)
        print(f'  {dest.name}: {len(data) / 1e6:.1f} MB, {len(z.infolist())} files, {sum(i.file_size for i in z.infolist()) / 1e6:.0f} MB of XML')


main()
