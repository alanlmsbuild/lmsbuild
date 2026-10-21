"""Fetch the National Rail Data Portal's fares feed (the Rail Delivery Group's
RJIS fares data: flows, fares, ticket types, discounts, railcards, locations,
restrictions) for train fares (decision 19, phase C), for npm run load:data -- 50.

  python3 scripts/fares/fetch_rdg_fares.py            # saves the feed if it is a new one
  python3 scripts/fares/fetch_rdg_fares.py --check    # only says whether a new one is out

Terms: the National Rail Enquiries information feeds' Terms & Conditions v3.0
(docs/licences/nre-terms-v3.0.md). The licence is personal to Alan: the login
is his, NRDP_USERNAME and NRDP_PASSWORD in server/.env; the token it gives is
never printed or stored. Nothing from this feed is shown publicly until the
Rail Delivery Group has confirmed the attribution (docs/licences/
nre-brand-guidelines-2026-09/), and the portal's account expires if unused, so
a check is made at least every 14 days.

Saves data/fares/rdg/RJFAFnnn.ZIP, nnn being the feed's own sequence number
(924 on 20 October 2026), unchanged.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'data' / 'fares' / 'rdg'
FEED = 'https://opendata.nationalrail.co.uk/api/staticfeeds/2.0/fares'


def login():
    env = dict(re.findall(r'^([A-Z_]+)=(.*)$', (REPO / 'server' / '.env').read_text(), re.M))
    user, password = (env.get(k, '').strip().strip('"\'') for k in ('NRDP_USERNAME', 'NRDP_PASSWORD'))
    if not user or not password:
        sys.exit('NRDP_USERNAME and NRDP_PASSWORD are not in server/.env')
    req = urllib.request.Request('https://opendata.nationalrail.co.uk/authenticate', urllib.parse.urlencode({'username': user, 'password': password}).encode(),
                                 {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Rarebit fares fetch'})
    return json.load(urllib.request.urlopen(req, timeout=60))['token']


def feed(token, method):
    req = urllib.request.Request(FEED, headers={'X-Auth-Token': token, 'User-Agent': 'Rarebit fares fetch'}, method=method)
    return urllib.request.urlopen(req, timeout=900)


def main():
    token = login()
    with feed(token, 'HEAD') as head:
        name = re.search(r'filename="([^"]+)"', head.headers.get('Content-Disposition', '')).group(1)
        modified = head.headers.get('Last-Modified')
    have = (OUT / name).exists()
    print(f'{name}, modified {modified}: {"already here" if have else "new"}')
    if have or '--check' in sys.argv:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    with feed(token, 'GET') as f:
        data = f.read()
    (OUT / name).write_bytes(data)
    print(f'saved data/fares/rdg/{name} ({len(data) / 1e6:.1f} MB)')


main()
