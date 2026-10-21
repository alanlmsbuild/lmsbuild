# Bus and tram fares (decision 19, phase C)

The Bus Open Data Service's fares data (NeTEx XML, UK bus fares profile) for
South Yorkshire's operators. Open Government Licence v3.0 (the DfT catalogue's
entry for "Bus Open Data - Bus Fares datasets"; BODS states all its content is
OGL v3.0 unless said otherwise). The BODS website refuses scripts (403), so
check its terms page in a browser if the wording matters. Needs
`BODS_API_KEY` in `server/.env` (never printed or stored).

1. `.venv-travel/bin/python scripts/fares/fetch_bus_fares.py` lists the datasets
   it would take; add `--fetch` to download them to `data/fares/bods/` (not in
   git): the area's operators come from the clipped timetable feed's agencies,
   less other regions' (see the script).
2. `npm run load:data -- 48` loads them (needs `sql/load_15_bus_fares.sql` run):
   the listing to `SHARED_DB.RAW.BODS_FARES_DATASET`, every XML file to
   `BODS_FARES_NETEX` as VARIANT. A dataset whose zip is byte-identical to one
   already loaded is skipped (12291 is 12280, 23153 is 10893). Silver takes each
   dataset's rows from its latest SOURCEFILEID.

No tram operator has a BODS fares dataset: tram tickets appear as products in
bus operators' datasets (First South Yorkshire's, for example).
Train fares (RDG) are separate and on hold until the portal terms are on file.
