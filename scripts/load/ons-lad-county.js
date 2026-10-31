// The ONS "Local Authority District to County and Unitary Authority" lookup
// (Office for National Statistics, Open Geography portal): every local authority
// district in the UK with the county it is in, or itself where it is a unitary
// authority. Open Government Licence v3.0 (docs/licences/ons-lad-county-2025-04/).
// Load step 56 puts it into SHARED_DB.RAW.ONS_LAD_COUNTY
// (sql/ons_lad_county_01_tables.sql). Silver: local_authority_county.
//
// The portal publishes it as a feature service, so the saved file is the
// service's 361 rows written out as CSV, all columns, nothing changed:
// RAREBIT_DATA/ons-lad-county/lad-county-<year>-<month>.csv (the April 2025
// edition is the newest the ONS has published). No personal data: the names
// and codes of areas.
import fs from 'node:fs'
import path from 'node:path'

export const LAD_COUNTY_DIR = 'ons-lad-county'
export const LAD_COUNTY_PAGE = 'https://www.arcgis.com/home/item.html?id=3a815d3b4fa746a98390f52b1196d37d'

// The newest download: lad-county-<year>-<month>.csv.
export function latestLadCounty(dir) {
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^lad-county-\d{4}-\d{2}\.csv$/.test(n)).sort() : []
  if (!found.length) throw new Error(`No lad-county-<year>-<month>.csv in ${dir}: save the Local Authority District to County and Unitary Authority lookup from the Open Geography portal as CSV.`)
  return path.join(dir, found.at(-1))
}

export function ladCountySteps(R) {
  const dir = path.join(R, LAD_COUNTY_DIR)
  return {
    56: { job: 'load-ons-lad-county', runLabel: 'ONS district to county lookup', files: () => [{
      home: 'SHARED_DB', source: 'ons-lad-county', publisher: 'Office for National Statistics (Open Geography portal)',
      licence: 'Open Government Licence v3.0 (credit the Office for National Statistics)', format: 'SHARED_DB.RAW.CSV_UTF8', kind: 'as-downloaded',
      title: 'Local Authority District to County and Unitary Authority (April 2025) Lookup in the UK (V2)', page: LAD_COUNTY_PAGE,
      file: latestLadCounty(dir), table: 'SHARED_DB.RAW.ONS_LAD_COUNTY' }] },
  }
}
