"""Cut the National Rail fares feed (RJFAFnnn.ZIP) down to the stations in
dbt/seeds/train_journey.csv, for developing and testing the silver and gold
train fares models without reading the whole feed in Snowflake (30 October 2026).

Reads the newest data/fares/rdg/RJFAF*.ZIP and writes data/fares/rdg-slice/
RJFAFnnn_slice.csv in the same shape as SHARED_DB.RAW.RDG_FARES_LINE's
file_type and line columns (every line as published, none changed):
  LOC  every version of the seed stations' location records
  FSC  the clusters those stations (and their fare groups) belong to
  FFL  the flows between seed stations or their clusters, and those flows' fares
  TTY, DIS, RLC, RCM  whole (a few thousand lines); RTE the route records
Layouts: RSPS5045 P-02-04 (docs/licences/rsps5045/), sections 4.1, 4.2, 4.19.

  .venv-travel/bin/python scripts/fares/rdg_slice.py
"""
import csv, glob, os, sys, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
zips = sorted(glob.glob(os.path.join(ROOT, 'data', 'fares', 'rdg', 'RJFAF*.ZIP')))
if not zips:
    sys.exit('No RJFAFnnn.ZIP in data/fares/rdg: run scripts/fares/fetch_rdg_fares.py')
zf = zipfile.ZipFile(zips[-1])
feed = os.path.basename(zips[-1])[:-4]

with open(os.path.join(ROOT, 'dbt', 'seeds', 'train_journey.csv'), newline='') as f:
    crs = {c for r in csv.DictReader(f) for c in (r['from_crs'], r['to_crs'])}

def lines(ext):
    name = next(n for n in zf.namelist() if n.endswith('.' + ext))
    for raw in zf.open(name):
        yield raw.decode('latin1').rstrip('\r\n')

# 4.19.2 location record: type L at 2, NLC 37-40, CRS 57-59
loc = [l for l in lines('LOC') if len(l) > 59 and l[1] == 'L' and l[56:59] in crs]
nlcs = {l[36:40] for l in loc}
# 4.19.2 fare group 70-75: flows can be set for the group the station belongs to
nlcs |= {l[69:75].strip() for l in loc}
missing = crs - {l[56:59] for l in loc}
if missing:
    sys.exit(f'No location for CRS {sorted(missing)}')
# 4.2.2 cluster record: cluster id 2-5, member NLC 6-9
fsc = [l for l in lines('FSC') if len(l) > 8 and l[5:9] in nlcs]
places = nlcs | {l[1:5] for l in fsc}
fsc = [l for l in lines('FSC') if len(l) > 8 and l[1:5] in places or l[5:9] in places]
# 4.1.2 flow record: type F at 2, origin 3-6, destination 7-10, flow id 43-49
flows = {}
for l in lines('FFL'):
    if l[1:2] == 'F' and l[2:6] in places and l[6:10] in places:
        flows[l[42:49]] = l
ffl = list(flows.values())
for l in lines('FFL'):
    if l[1:2] == 'T' and l[2:9] in flows:
        ffl.append(l)

out = os.path.join(ROOT, 'data', 'fares', 'rdg-slice')
os.makedirs(out, exist_ok=True)
path = os.path.join(out, f'{feed}_slice.csv')
n = 0
with open(path, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['file_type', 'line'])
    for t, ls in (('LOC', loc), ('FSC', fsc), ('FFL', ffl), ('TTY', list(lines('TTY'))), ('DIS', list(lines('DIS'))), ('RLC', list(lines('RLC'))), ('RCM', list(lines('RCM'))), ('RTE', [l for l in lines('RTE') if len(l) > 7 and l[1] == 'R'])):
        for l in ls:
            w.writerow([t, l]); n += 1
        print(f'{t}: {len(ls):,} lines')
print(f'{feed}: {len(crs)} stations ({", ".join(sorted(crs))}), {len(places)} places with clusters, {len(flows):,} flows; {n:,} lines in {path}')
