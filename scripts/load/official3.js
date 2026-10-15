// Batch 6 (sql/load_06_official_tables.sql): the official data sets of the
// plan of 14 October 2026, as load:data steps 32 to 39, in the agreed order.
// Downloads in RAREBIT_DATA/<source>/, only read. Typed tables: columns as in
// the file's header, all text. Spreadsheets and the postcode directory's
// lookups go to RAW.PUBLISHED_CELL (scripts/load/official2.js, toCells).
//
// police.uk: the latest 3-year archive only (Alan, 14 October 2026). Its
// thousands of monthly files are joined into one copy per kind (street
// crimes, outcomes), each row with the file it came from (MEMBER). Stop and
// search is left out: individual stops with each person's gender, age range
// and ethnicity (no personal data in Snowflake).

import fs from 'node:fs'
import path from 'node:path'
import { csvLine, csvRecords, writeLines, zipEntry, zipNames } from './files.js'
import { NOMIS_SETS } from '../fetch-official.js'
import { toCells } from './official2.js'

const OGL = 'Open Government Licence v3.0'
const OGL_ONS = 'Open Government Licence v3.0 (credit ONS; postcodes also Royal Mail and OS copyright)'
const DFE = 'Department for Education'

function files(dir, re) {
  const out = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).sort().map((n) => path.join(dir, n)) : []
  if (!out.length) throw new Error(`No file matching ${re} in ${dir}`)
  return out
}
const latest = (dir, re) => files(dir, re).at(-1)
const extract = (zip, member) => async (out) => { const { pipeline } = await import('node:stream/promises'); await pipeline(await zipEntry(zip, member), fs.createWriteStream(out)) }

// One kind of police.uk monthly file (street, outcomes), every month and
// force, as one CSV with MEMBER first. Every file must have the same header.
// after: a month (YYYY-MM); only later months are taken (each archive
// repeats the previous 3 years, so a monthly archive adds only its new ones).
const policeKind = (zip, kind, after = '') => async (out) => {
  const members = (await zipNames(zip)).filter((n) => n.endsWith(`-${kind}.csv`) && n.slice(0, 7) > after).sort()
  if (!members.length) throw new Error(`${path.basename(zip)}: no ${kind} files after ${after}`)
  let header = null
  async function* lines() {
    for (const m of members) {
      let first = true
      for await (const r of csvRecords(await zipEntry(zip, m))) {
        if (first) {
          first = false
          if (!header) { header = r; yield csvLine(['MEMBER', ...r]) } else if (r.join('\u0001') !== header.join('\u0001')) throw new Error(`${m}: a different header from the other ${kind} files`)
          continue
        }
        yield csvLine([m, ...r])
      }
    }
  }
  await writeLines(out, lines())
  return { removed: null }
}

export function officialSteps3(R) {
  const shared = { home: 'SHARED_DB', format: 'SHARED_DB.RAW.CSV_UTF8' }
  const options = { home: 'OPTIONS_DB', format: 'OPTIONS_DB.RAW.CSV_UTF8' }
  const csv = (base, source, file, title, publisher, page, table, licence = OGL) => ({ ...base, source, publisher, licence, page, title, file, kind: 'as-downloaded', table })
  const cells = (base, source, file, member, title, publisher, page, licence = OGL) => ({ ...base, source, publisher, licence, page, title, file, member: member ?? path.basename(file),
    kind: 'converted', table: `${base.home}.RAW.PUBLISHED_CELL`, make: toCells(file, member) })
  const nomisFiles = (id, base) => {
    const set = NOMIS_SETS.find((s) => s.id === id && (!base || s.base === base))
    const dir = path.join(R, set.dir)
    return (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((n) => n.startsWith(set.base) && n.endsWith('.csv') && fs.existsSync(path.join(dir, `${n}.source.txt`))).sort().map((n) => path.join(dir, n))
  }
  return {
    32: { job: 'load-onspd', files: async () => {
      const zip = latest(path.join(R, 'onspd'), /^ONSPD_.*\.zip$/)
      const main = (await zipNames(zip)).find((n) => /^Data\/ONSPD_[A-Z]{3}_\d{4}_UK\.csv$/.test(n))
      const page = 'https://geoportal.statistics.gov.uk (ONS Postcode Directory)'
      return [
        { ...shared, source: 'onspd', publisher: 'Office for National Statistics', licence: OGL_ONS, page, title: `ONS Postcode Directory: ${path.basename(main)}`,
          file: zip, member: main, kind: 'extracted', table: 'SHARED_DB.RAW.ONSPD', make: extract(zip, main) },
        ...(await zipNames(zip)).filter((n) => /^Documents\/.*\.csv$/.test(n)).sort().map((m) =>
          cells(shared, 'onspd-lookups', zip, m, `ONS Postcode Directory lookup: ${path.basename(m)}`, 'Office for National Statistics', page, OGL_ONS)),
      ]
    } },
    33: { job: 'load-population', files: () => [
      ...nomisFiles('NM_2014_1').map((f) => ({ ...shared, source: 'nomis-nm-2014-1', publisher: 'Office for National Statistics, via Nomis', licence: OGL, kind: 'as-downloaded',
        title: 'Population estimates, small area (2021 based), broad age groups (Nomis NM_2014_1)', file: f, table: 'SHARED_DB.RAW.NOMIS_POPULATION_LSOA',
        page: `https://www.nomisweb.co.uk/api/v01/dataset/NM_2014_1.data.csv (query: ${path.basename(f)}.source.txt beside it in the stage)`, sidecar: `${f}.source.txt` })),
      ...nomisFiles('NM_31_1', 'population_la_nm_31_1').map((f) => ({ ...shared, source: 'nomis-nm-31-1', publisher: 'Office for National Statistics, via Nomis', licence: OGL, kind: 'as-downloaded',
        title: 'Population estimates, local authority, five-year age bands (Nomis NM_31_1)', file: f, table: 'SHARED_DB.RAW.NOMIS_POPULATION_LA',
        page: `https://www.nomisweb.co.uk/api/v01/dataset/NM_31_1.data.csv (query: ${path.basename(f)}.source.txt beside it in the stage)`, sidecar: `${f}.source.txt` })),
      ...nomisFiles('NM_31_1', 'population_la_wales_nm_31_1').map((f) => ({ ...shared, source: 'nomis-nm-31-1', publisher: 'Office for National Statistics, via Nomis', licence: OGL, kind: 'as-downloaded',
        title: 'Population estimates, local authority, five-year age bands, Wales (Nomis NM_31_1)', file: f, table: 'SHARED_DB.RAW.NOMIS_POPULATION_LA',
        page: `https://www.nomisweb.co.uk/api/v01/dataset/NM_31_1.data.csv (query: ${path.basename(f)}.source.txt beside it in the stage)`, sidecar: `${f}.source.txt` })),
    ] },
    34: { job: 'load-apar', files: () => [
      csv(shared, 'apar', latest(path.join(R, 'apar'), /^apar-.*\.csv$/), 'Apprenticeship provider and assessment register', DFE, 'https://download.apprenticeships.education.gov.uk', 'SHARED_DB.RAW.APAR_PROVIDER'),
    ] },
    // The latest archive; if there's an earlier one, only the months after
    // its last (the earlier ones are loaded already).
    35: { job: 'load-police-uk', files: async () => {
      const zips = files(path.join(R, 'police-uk'), /^police-uk-archive-.*\.zip$/)
      const zip = zips.at(-1)
      const after = zips.length > 1 ? (await zipNames(zips.at(-2))).filter((n) => /^\d{4}-\d{2}\//.test(n)).map((n) => n.slice(0, 7)).sort().at(-1) : ''
      const k = (kind, table, title) => ({ ...shared, source: `police-uk-${kind}`, publisher: 'police.uk (Home Office)', licence: OGL, page: 'https://data.police.uk/data/archive/',
        title, file: zip, member: `*-${kind}.csv (every month and force${after ? ` after ${after}` : ''}, joined)`, kind: 'converted', table, make: policeKind(zip, kind, after) })
      return [
        k('street', 'SHARED_DB.RAW.POLICE_STREET_CRIME', 'police.uk street-level crimes, latest 3-year archive'),
        k('outcomes', 'SHARED_DB.RAW.POLICE_OUTCOME', 'police.uk outcomes, latest 3-year archive'),
      ]
    } },
    36: { job: 'load-naptan', files: () => [
      csv(shared, 'naptan', latest(path.join(R, 'naptan'), /^naptan_stops_.*\.csv$/), 'NaPTAN: every public transport stop', 'Department for Transport', 'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv', 'SHARED_DB.RAW.NAPTAN_STOP'),
    ] },
    37: { job: 'load-graduate-outcomes', files: () => [
      csv(options, 'graduate-outcomes', latest(path.join(R, 'graduate-outcomes'), /^hesa_graduate_outcomes_.*\.csv$/), 'HESA Graduate Outcomes data (Explore education statistics data set 8067a649)',
        'HESA, via the Department for Education', 'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/8067a649-9929-43a1-931a-4e58ae04a3f8', 'OPTIONS_DB.RAW.GRADUATE_OUTCOMES', 'CC BY 4.0 (credit HESA)'),
    ] },
    38: { job: 'load-places', files: () => [
      csv(shared, 'historic-england-listed', latest(path.join(R, 'historic-england'), /^listed_building_points_.*\.csv$/), 'National Heritage List for England: listed building points',
        'Historic England', 'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/0', 'SHARED_DB.RAW.HE_LISTED_BUILDING',
        `${OGL} (credit Historic England)`),
      csv(shared, 'wikidata-places', latest(path.join(R, 'wikidata'), /^wikidata_england_gss_places_.*\.csv$/), 'Wikidata: items with an English GSS code (parishes, wards, local authorities...), with description, inception and coordinates',
        'Wikidata', 'https://query.wikidata.org (query beside the file)', 'SHARED_DB.RAW.WIKIDATA_PLACE', 'CC0 1.0'),
    ] },
    39: { job: 'load-energy', run: async (loader) => {
      const results = []
      const ofgem = files(path.join(R, 'ofgem'), /\.xlsx$/)
      const fuel = files(path.join(R, 'fuel-poverty'), /\.xlsx$/)
      for (const f of ofgem) results.push(await loader.loadCsv(cells(shared, 'ofgem-price-cap', f, null, `Ofgem energy price cap: ${path.basename(f)}`, 'Ofgem',
        'https://www.ofgem.gov.uk/energy-policy-and-regulation/policy-and-regulatory-programmes/energy-price-cap-default-tariff-policy/energy-price-cap-default-tariff-levels')))
      for (const f of fuel) results.push(await loader.loadCsv(cells(shared, 'fuel-poverty-sub-regional', f, null, `Sub-regional fuel poverty: ${path.basename(f)}`,
        'Department for Energy Security and Net Zero', 'https://www.gov.uk/government/collections/fuel-poverty-sub-regional-statistics')))
      results.push(...await loader.loadJsonLines({ home: 'SHARED_DB', source: 'neso-dno-areas', publisher: 'National Energy System Operator', licence: 'NESO Open Data Licence',
        page: 'https://www.neso.energy/data-portal/gis-boundaries-gb-dno-license-areas', title: 'GB DNO licence areas (the 14 electricity regions), approximate boundaries, British National Grid',
        format: 'SHARED_DB.RAW.JSON_LINES', table: 'SHARED_DB.RAW.NESO_DNO_AREA', originals: files(path.join(R, 'neso'), /\.geojson$/).map((file) => ({ file })),
        rows: async ({ file }) => JSON.parse(fs.readFileSync(file, 'utf8')).features.map((f, i) => ({ n: i + 1, properties: f.properties, geometry: f.geometry })),
        cols: { FEATURENUMBER: '$1:n::number', PROPERTIES: '$1:properties', GEOMETRY: '$1:geometry' } }))
      return results
    }, runLabel: 'Ofgem price caps, fuel poverty, electricity regions' },
  }
}
