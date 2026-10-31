# ONS Code History Database: licence notes

Checked 31 October 2026. Loaded as load:data step 55 (`scripts/load/ons-chd.js`,
`sql/ons_chd_01_tables.sql`; not run yet), used by silver `local_authority_code_change` and
`local_authority_code_current` and gold `local_authority_code_lookup`.

- **What it is.** The Office for National Statistics' Code History Database (CHD), part of the
  Register of Geographic Codes: every change of a statistical geography's code since 1 January
  2009, with the statutory instrument and the date. The June 2026 release is "as at 31st December
  2025" (the Open Geography portal's description of it). Downloaded 31 October 2026 as
  `Code_History_Database_(June_2026).zip` (36 MB) from the item
  https://www.arcgis.com/sharing/rest/content/items/e0bc41722b1a4b76a6ecfff14f91cbb4 on the
  ONS Open Geography portal, and kept as `RAREBIT_DATA/ons-chd/chd-2026-06.zip`. Only
  `Changes.csv` (640,599 rows, 11 columns) is loaded. `ChangeHistory.csv`, `Equivalents.csv`
  and the Access database in the zip are not.
- **Licence.** Open Government Licence v3.0. The item's licence field points to
  https://www.ons.gov.uk/methodology/geography/licences, which says "Lookup products are
  supplied under the Open Government Licence" and gives no Ordnance Survey or Royal Mail
  statement for lookups (those are for boundaries and postcode and UPRN products). That page
  does not name the Code History Database, so it is treated as a lookup product; if Alan wants
  it confirmed, the contact is ons.geography@ons.gov.uk.
- **Attribution.** "Contains public sector information licensed under the Open Government Licence
  v3.0. Source: Office for National Statistics, licensed under the Open Government Licence
  v3.0." (The wording ONS asks for on lookups is "Source: Office for National Statistics licensed
  under the Open Government Licence v.3.0".) In every gold row (`attribution`), with the portal
  address (`source_url`); on the site, on `/sources` and in "Data on this page" wherever the
  lookup is used.
- **What we use.** Local authority rows only (E06 unitary, E07 district, E08 metropolitan, E09
  London borough, W06 Wales, S12 Scotland, N09 Northern Ireland), old and new code both in the
  nine-character form, which leaves 108 changes. Silver says what kind of change each was and
  follows only the ones where the same authority carries on under a new code.
- **A caution carried in the model.** A merge or a split never lines up: Bournemouth and Poole
  became Bournemouth, Christchurch and Poole (2019), and the old counties and districts became
  new unitary councils (2019 to 2023). Their figures are left under the code they were published
  with and are never added together or shared out.
- **Encoding.** The CSV is UTF-8 with a few stray bytes of another encoding in rows that are not
  local authorities; the converted copy that is loaded turns them into the replacement character.
  Nothing else is changed.
- **Personal data.** None: the names and codes of areas.
