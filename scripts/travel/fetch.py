"""Fetch the travel-time inputs (decision 19, phase A: South Yorkshire) into
data/travel/ (git-ignored). Nothing here touches Snowflake: npm run
load:data -- 41 loads them, originals and all.

  bods/itm_yorkshire_gtfs.zip   the BODS GTFS feed for Yorkshire, copied from
                                RAREBIT_DATA (Alan downloads it by hand)
  osm/south-yorkshire-<date>.osm.pbf
                                Geofabrik's South Yorkshire extract, checked
                                against its .md5, named by the date of its
                                OpenStreetMap data; with <file>.header.json
                                (the file's header) beside it
  ons-pwc/lsoa21_pwc_v4.csv     ONS LSOA (December 2021) population-weighted
                                centroids (V4), England and Wales
  nr/toc-full-<extract date>.CIF.gz
                                Network Rail's SCHEDULE full extract (phase
                                B), named by the date its HD record states;
                                with <file>.header.json (that record) beside it
  nr/corpus-<date fetched>.json.gz
                                Network Rail's CORPUS location codes

The Network Rail files need the login in server/.env (NETWORK_RAIL_USERNAME,
NETWORK_RAIL_PASSWORD).

  .venv-travel/bin/python scripts/travel/fetch.py
"""

import base64
import datetime as dt
import gzip
import hashlib
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

import osmium

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / 'data' / 'travel'
RAREBIT_DATA = Path(os.environ.get('RAREBIT_DATA', '/mnt/c/Users/alanb/rarebit-data'))
GTFS_NAME = 'itm_yorkshire_gtfs.zip'
GEOFABRIK = 'https://download.geofabrik.de/europe/united-kingdom/england/south-yorkshire-latest.osm.pbf'
ONS_PWC = 'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/32729e42d05e4e23bc7e43a36aa4ae8b/csv?layers=0'
UA = {'User-Agent': 'RarebitDataLoader/1.0'}
NR_FEEDS = 'https://publicdatafeeds.networkrail.co.uk/ntrod/'
NR_SCHEDULE = NR_FEEDS + 'CifFileAuthenticate?type=CIF_ALL_FULL_DAILY&day=toc-full.CIF.gz'
NR_CORPUS = NR_FEEDS + 'SupportingFileAuthenticate?type=CORPUS'


def get(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as res, open(dest, 'wb') as out:
        shutil.copyfileobj(res, out)


def digest(path, algo):
    h = hashlib.new(algo)
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def header_of(pbf):
    """The .osm.pbf header, as the file states it."""
    h = osmium.io.Reader(osmium.io.File(str(pbf), 'pbf'), osmium.osm.osm_entity_bits.NOTHING).header()
    box = h.box()
    return {
        'bounding_box': {'min_lon': box.bottom_left.lon, 'min_lat': box.bottom_left.lat,
                         'max_lon': box.top_right.lon, 'max_lat': box.top_right.lat} if box.valid() else None,
        'osmosis_replication_timestamp': h.get('osmosis_replication_timestamp'),
        'osmosis_replication_sequence_number': h.get('osmosis_replication_sequence_number'),
        'osmosis_replication_base_url': h.get('osmosis_replication_base_url'),
        'generator': h.get('generator'),
    }


def fetch_gtfs():
    src, dest = RAREBIT_DATA / GTFS_NAME, DATA / 'bods' / GTFS_NAME
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size == src.stat().st_size and digest(dest, 'sha256') == digest(src, 'sha256'):
        print(f'  {GTFS_NAME}: already copied')
        return
    shutil.copy2(src, dest)  # keeps the download's date
    print(f'  {GTFS_NAME}: copied ({dest.stat().st_size:,} bytes)')


def fetch_osm():
    folder = DATA / 'osm'
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / 'south-yorkshire-latest.osm.pbf.part'
    get(GEOFABRIK, tmp)
    md5 = urllib.request.urlopen(urllib.request.Request(GEOFABRIK + '.md5', headers=UA), timeout=60).read().decode().split()[0]
    if digest(tmp, 'md5') != md5:
        tmp.unlink()
        sys.exit('the Geofabrik extract does not match its .md5')
    head = header_of(tmp)
    day = (head['osmosis_replication_timestamp'] or '')[:10]
    if not day:
        sys.exit('the extract states no replication timestamp')
    dest = folder / f'south-yorkshire-{day}.osm.pbf'
    if dest.exists() and digest(dest, 'md5') == md5:
        tmp.unlink()
        print(f'  {dest.name}: already fetched')
    else:
        tmp.rename(dest)
        print(f'  {dest.name}: fetched ({dest.stat().st_size:,} bytes, md5 checked)')
    (folder / f'{dest.name}.header.json').write_text(json.dumps(head, indent=1))


def fetch_pwc():
    dest = DATA / 'ons-pwc' / 'lsoa21_pwc_v4.csv'
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f'  {dest.name}: already fetched')
        return
    get(ONS_PWC, dest)
    with open(dest, encoding='utf-8-sig') as f:
        if not f.readline().startswith('FID,LSOA21CD,'):
            sys.exit('the ONS centroids file is not the CSV expected')
    print(f'  {dest.name}: fetched ({dest.stat().st_size:,} bytes)')


def nr_login():
    """NETWORK_RAIL_USERNAME and NETWORK_RAIL_PASSWORD from server/.env."""
    env = {}
    for line in (REPO / 'server' / '.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    if not env.get('NETWORK_RAIL_USERNAME') or not env.get('NETWORK_RAIL_PASSWORD'):
        sys.exit('NETWORK_RAIL_USERNAME and NETWORK_RAIL_PASSWORD must be set in server/.env')
    return env['NETWORK_RAIL_USERNAME'], env['NETWORK_RAIL_PASSWORD']


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def get_nr(url, dest):
    """Network Rail answers with a redirect to a signed download link, which
    must be fetched without the login (it carries its own)."""
    user, password = nr_login()
    auth = base64.b64encode(f'{user}:{password}'.encode()).decode()
    req = urllib.request.Request(url, headers={**UA, 'Authorization': f'Basic {auth}'})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=120) as res:
            with open(dest, 'wb') as out:
                shutil.copyfileobj(res, out)
            return
    except urllib.error.HTTPError as e:
        if e.code not in (301, 302, 303, 307, 308):
            sys.exit(f'Network Rail refused {url.split("?")[1]}: HTTP {e.code} (check the login and the feed subscription)')
        location = e.headers['Location']
    get(location, dest)


def cif_header(path):
    """The extract's HD record, as the file states it (CIF end user
    specification: fixed-width fields)."""
    with gzip.open(path, 'rt', encoding='ascii', errors='replace') as f:
        hd = f.readline().rstrip('\n')
    if not hd.startswith('HD'):
        sys.exit('the SCHEDULE extract does not start with an HD record')
    day = lambda s: dt.datetime.strptime(s, '%d%m%y').date().isoformat()
    return {
        'record': hd,
        'file_mainframe_identity': hd[2:22].strip(),
        'date_of_extract': day(hd[22:28]),
        'time_of_extract': f'{hd[28:30]}:{hd[30:32]}',
        'current_file_reference': hd[32:39].strip(),
        'last_file_reference': hd[39:46].strip(),
        'update_indicator': hd[46],
        'version': hd[47],
        'user_start_date': day(hd[48:54]),
        'user_end_date': day(hd[54:60]),
    }


def fetch_rail():
    folder = DATA / 'nr'
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / 'toc-full.CIF.gz.part'
    get_nr(NR_SCHEDULE, tmp)
    head = cif_header(tmp)
    if head['update_indicator'] != 'F':
        tmp.unlink()
        sys.exit(f"the SCHEDULE extract is not a full extract (update indicator {head['update_indicator']})")
    dest = folder / f"toc-full-{head['date_of_extract']}.CIF.gz"
    if dest.exists() and digest(dest, 'sha256') == digest(tmp, 'sha256'):
        tmp.unlink()
        print(f'  {dest.name}: already fetched')
    else:
        tmp.rename(dest)
        print(f"  {dest.name}: fetched ({dest.stat().st_size:,} bytes; covers {head['user_start_date']} to {head['user_end_date']})")
    (folder / f'{dest.name}.header.json').write_text(json.dumps(head, indent=1))

    dest = folder / f'corpus-{dt.date.today().isoformat()}.json.gz'
    if dest.exists():
        print(f'  {dest.name}: already fetched')
        return
    tmp = folder / 'corpus.json.gz.part'
    get_nr(NR_CORPUS, tmp)
    with gzip.open(tmp, 'rt', encoding='utf-8') as f:
        if 'TIPLOCDATA' not in json.load(f):
            tmp.unlink()
            sys.exit('CORPUS is not the JSON expected (no TIPLOCDATA)')
    tmp.rename(dest)
    print(f'  {dest.name}: fetched ({dest.stat().st_size:,} bytes)')


if __name__ == '__main__':
    fetch_gtfs()
    fetch_osm()
    fetch_pwc()
    fetch_rail()
