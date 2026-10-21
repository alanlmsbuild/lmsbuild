"""Draft the bus fare product map (dbt/seeds/bus_fare_product_map.csv) from the
product names in the loaded BODS fares files, by simple rules, and list what
the rules can't classify (the unmapped list). The CSV is then checked by hand
and is the source of truth: re-running this does not overwrite rows already in
the file (add new products only).

  .venv-travel/bin/python scripts/fares/build_product_map.py [--rewrite]

The categories: single, return, day, week, 28-day (and 'other period' is NOT
a guess: such products stay unmapped). Who: child, 16-18, 18-21, student,
adult, young-person (the operator's own "YP"/"young person", no age stated in
the file). Pass name: the scheme the product belongs to (Zoom, Zoom Beyond,
YP, Student, Megarider, MyDay ...), blank when it is just that operator's
ordinary adult or child ticket. A product is mapped only when BOTH its
category and its who are clear from its name; anything else is unmapped.
"""
import csv, glob, json, re, sys, zipfile, collections
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'dbt' / 'seeds' / 'bus_fare_product_map.csv'
UNMAPPED = REPO / 'data' / 'fares' / 'unmapped-draft.csv'

def tag(e): return e.tag.rsplit('}', 1)[-1]

def catalogue():
    listing = {str(r['id']): r for r in json.load(open(sorted(glob.glob(str(REPO / 'data/fares/bods/listing-*.json')))[-1]))}
    seen = {}
    for zp in sorted(glob.glob(str(REPO / 'data/fares/bods/*.zip'))):
        ds = Path(zp).name.split('_')[0]
        op = listing[ds]['operatorName']
        for n in zipfile.ZipFile(zp).namelist():
            if not n.lower().endswith('.xml'): continue
            r = ET.fromstring(zipfile.ZipFile(zp).read(n))
            users = {}
            for e in r.iter():
                if tag(e) == 'UserProfile':
                    users[e.get('id')] = next((c.text for c in e if tag(c) == 'UserType'), None) or next((c.text for c in e if tag(c) == 'Name'), None)
            prods = {e.get('id'): (next((c.text for c in e if tag(c) == 'Name'), None), next((c.get('ref') for c in e if tag(c) == 'TypeOfFareProductRef'), None)) for e in r.iter() if tag(e) == 'PreassignedFareProduct'}
            for t in (e for e in r.iter() if tag(e) == 'FareTable'):
                pr = t.find('{*}pricesFor')
                if pr is None: continue
                us = [users.get(c.get('ref'), c.get('ref')) for c in pr if tag(c) == 'UserProfileRef']
                for c in pr:
                    if tag(c) == 'PreassignedFareProductRef':
                        nm, ty = prods.get(c.get('ref'), (c.get('ref'), None))
                        k = (op, nm)
                        d = seen.setdefault(k, {'types': set(), 'users': set(), 'files': 0})
                        d['types'].add(ty.split('@')[-1] if ty else None); d['users'].update(u for u in us if u); d['files'] += 1
    return seen

def classify(name, types, users):
    n = ' ' + re.sub(r'[_\-+/.()&]', ' ', name or '').lower() + ' '
    # Never guessed: packs of tickets, passes for 2 to 6 days, weekends.
    blocked = bool(re.search(r'\bx ?\d+\b|\b[2-6] ?days?\b|weekend|wkend|wkendr', n))
    cat = None
    if blocked: cat = None
    elif re.search(r'\b28 ?(day|d)s?\b|\b4 ?(week|wk)s?\b|\b4 ?weekly\b|\bmonth(ly)?\b|\b28d\b|\b4wk\b', n): cat = '28-day'
    elif re.search(r'\b(week|weekly|wk|wkly|wk ?1|1wk|7 ?day|7d)s?\b|weeksaver', n): cat = 'week'
    elif re.search(r'\bday ?(saver|rider|ticket|ranger)?s?\b|\b1 ?day\b|\b1d\b|dayrider|daysaver|day pass|\bday\b', n) and not re.search(r'weekday', n): cat = 'day'
    elif re.search(r'\b(return|rtn|ret|rtrn)\b', n): cat = 'return'
    elif re.search(r'\b(single|sgl|sgle|sing)\b', n): cat = 'single'
    # who: the most specific age words first; then children; then the operator's own "young person"
    who = None
    if re.search(r'18 ?21|zoom beyond', n): who = '18-21'
    elif re.search(r'16 ?18|16 ?19', n): who = '16-18'
    elif re.search(r'student|\bstu\b', n): who = 'student'
    elif re.search(r'\bchild(ren)?\b|\bchd\b|\bch\b|\bcd\b|\bu ?16\b|\bu ?11\b|under 16|school', n): who = 'child'
    elif re.search(r'\byp\b|young person|youth|\bzoom\b|\bu ?19\b|under 19|my ?day', n) and not re.search(r'\badult\b', n): who = 'young-person'
    elif re.search(r'\badult\b|\bad\b', n): who = 'adult'
    from_name = who is not None
    if who is None and users:
        u = {x.lower() for x in users}
        if u <= {'adult', 'anyone'} and 'adult' in u: who = 'adult'
        elif u == {'child'}: who = 'child'
        elif u == {'student'}: who = 'student'
    pn = ''
    for pat, label in ((r'zoom beyond', 'Zoom Beyond'), (r'zoom', 'Zoom'), (r'megarider', 'Megarider'), (r'my ?day', 'MyDay'), (r'wayfarer', 'Wayfarer'),
                       (r'get ?about|getabt', 'GetAbout'), (r'day ?saver', 'Daysaver'), (r'week ?saver', 'Weeksaver'), (r'\byp\b|young person', 'YP'), (r'tram', 'Tram'), (r'student|\bstu\b', 'Student')):
        if re.search(pat, n): pn = label; break
    note = ''
    # No ticket word in the name: a single trip, a day return or a day pass is as NeTEx says it is (not a guess);
    # a period pass (week? 28 days?) never is.
    if not cat and not blocked:
        kinds = {t for t in types if t in ('single', 'day_return', 'day')}
        if len(kinds) == 1 and 'period' not in types and from_name and who != 'adult':
            cat = {'single': 'single', 'day_return': 'return', 'day': 'day'}[kinds.pop()]
            note = 'category from the NeTEx product type'
    if cat and who: return cat, who, pn, note
    why = []
    if blocked: why.append('pack of tickets, 2-6 day pass or weekend')
    elif not cat: why.append('category unclear')
    if not who: why.append('who unclear')
    return None, None, None, '; '.join(why)


def main():
    cat = catalogue()
    have = {}
    if OUT.exists() and '--rewrite' not in sys.argv:
        for r in csv.DictReader(open(OUT)): have[(r['operator'], r['product_name'])] = r
    rows, un = [], []
    for (op, nm), d in sorted(cat.items()):
        if (op, nm) in have: rows.append(have[(op, nm)]); continue
        c, w, p, why = classify(nm, d['types'], d['users'])
        if c: rows.append({'operator': op, 'product_name': nm, 'category': c, 'who': w, 'pass_name': p, 'note': why})
        else: un.append((op, nm, ','.join(sorted(x for x in d['types'] if x)), ','.join(sorted(d['users'])), d['files'], why))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w', newline='') as f:
        w = csv.DictWriter(f, ['operator', 'product_name', 'category', 'who', 'pass_name', 'note'], lineterminator='\n'); w.writeheader(); w.writerows(rows)
    with open(UNMAPPED, 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['operator', 'product_name', 'product_type', 'users_in_file', 'files', 'why']); w.writerows(un)
    print(f'{len(cat)} distinct (operator, product name): {len(rows)} mapped, {len(un)} unmapped')
    print(collections.Counter((r['category'], r['who']) for r in rows).most_common(30))
main()
