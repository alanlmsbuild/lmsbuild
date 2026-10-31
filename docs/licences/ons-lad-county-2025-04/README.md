# ONS district to county lookup: licence notes

Checked 31 October 2026. Loaded as load:data step 56 (`scripts/load/ons-lad-county.js`,
`sql/ons_lad_county_01_tables.sql`; not run yet), used by silver `local_authority_county` and gold
`neet_area_for_la`.

- **What it is.** The Office for National Statistics' "Local Authority District to County and
  Unitary Authority (April 2025) Lookup in the UK (V2)", from the Open Geography portal
  (https://www.arcgis.com/home/item.html?id=3a815d3b4fa746a98390f52b1196d37d, modified 4 December
  2025; it is the newest edition published: the search for a 2026 edition found none). 361 rows,
  one per district or unitary authority in the UK, with its county (E10 code) or itself where it is
  a unitary authority: 164 districts are inside a county. Fields: LAD25CD, LAD25NM, LAD25NMW,
  CTYUA25CD, CTYUA25NM, CTYUA25NMW. The 361 codes are the same 361 live authority codes as the
  Code History Database (docs/la-code-changes.md).
- **How it was saved.** The portal offers it as a feature service, so the 361 rows were read from
  the service (all six fields, ordered by LAD25CD) and written as
  `RAREBIT_DATA/ons-lad-county/lad-county-2025-04.csv`. Nothing else was changed.
- **Licence.** Open Government Licence v3.0. The item's licence field points to
  https://www.ons.gov.uk/methodology/geography/licences, which says lookup products are supplied
  under the Open Government Licence.
- **Attribution.** "Contains public sector information licensed under the Open Government Licence
  v3.0. Source: Office for National Statistics, licensed under the Open Government Licence v3.0."
  In every gold row (`attribution`), with the address (`source_url`); on the site, on `/sources`
  and in "Data on this page" wherever the lookup is used.
- **Why this and not the postcode directory.** Silver `local_authority` also has a county code per
  district, but that is taken from the most common county among the district's postcodes. This
  lookup is the ONS's own statement of which county a district is in.
- **Personal data.** None: the names and codes of areas.
