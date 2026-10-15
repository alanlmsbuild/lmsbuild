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

  .venv-travel/bin/python scripts/travel/fetch.py
"""

import hashlib
import json
import os
import shutil
import sys
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


if __name__ == '__main__':
    fetch_gtfs()
    fetch_osm()
    fetch_pwc()
