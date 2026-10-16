// gen-load-10-sql.js - writes sql/load_10_ilr_dummy.sql: the ILR dummy data
// workbook's tables (load:data step 43) and the governance tags (decision 21)
// on every bronze table, from what SOURCE_FILE and JOB_RUN say about each:
// its sources, their licences and the jobs that load them. Reads Snowflake as
// DATA_LOAD_USER; writes only the SQL file.   node scripts/gen-load-10-sql.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STEPS } from './load-data.js'
import { LOAD_STEPS } from './fetch-official.js'
import { JOB_SCHEDULE } from '../server/jobSchedule.js'
import { BRONZE_API_TABLES, BRONZE_SCHEMAS, BRONZE_RECORD_TABLES, TAG_SCHEMA } from './governance-tags.js'
import { connect, execute, destroy } from '../server/db.js'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'load_10_ilr_dummy.sql')
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`
const T = `${TAG_SCHEMA}.`
// Tag values are at most 256 characters (check:dbt enforces it for silver).
const MAX_TAG = 256

// ------------------------------------------------------------------ licences
// SOURCE_FILE.LICENCE (free text) as the LICENCE tag's allowed value.
const LICENCE_TAG = [
  [/^Open Government Licence v3\.0/, 'ogl-3'],
  [/^NESO Open Data Licence/, 'neso-odl'],
  [/^MIT/, 'mit'],
  [/^Open Database Licence/, 'odbl'],
  [/^CC0/, 'cc0'],
  [/^CC BY 4\.0/, 'cc-by-4'],
  [/^Test data/, 'test-data'],
]
const licenceTag = (text) => {
  const hit = LICENCE_TAG.find(([re]) => re.test(text))
  if (!hit) throw new Error(`No LICENCE tag for "${text}": add it to LICENCE_TAG`)
  return hit[1]
}

// -------------------------------------------------------------- attribution
// The same words silver uses for the same data (dbt/models/silver/*/*.yml).
const OGL = 'Contains public sector information licensed under the Open Government Licence v3.0.'
const ONS = 'Source: Office for National Statistics, licensed under the Open Government Licence v3.0.'
const ONSPD = 'Source: Office for National Statistics, licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2026. Contains Royal Mail data © Royal Mail copyright and database right 2026.'
const HESA = 'Credit: HESA (www.hesa.ac.uk). Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: none.'
const SKILLS_ENGLAND = '© Skills England 2025. This information is licensed under the Open Government Licence https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'
const OSM = '© OpenStreetMap contributors (ODbL).'
const TEST = 'None needed: test data made by Rarebit (fictional learners).'
const ATTRIBUTION = {
  onspd: ONSPD,
  'onspd-lookups': ONSPD,
  'ons-lsoa-pwc': 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.',
  'neso-dno-areas': 'Supported by National Energy SO Open Data',
  'nesta-skills-taxonomy': 'Nesta, skills taxonomy v2 (github.com/nestauk/skills-taxonomy-v2), MIT licence.',
  'geofabrik-osm': OSM,
  'rarebit-travel-time': OSM,
  'wikidata-places': 'None needed (CC0): from Wikidata.',
  'discover-uni': HESA,
  'graduate-outcomes': HESA,
  'historic-england-listed': '© Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. Licensed under the Open Government Licence v3.0.',
  'skills-england-lsip': SKILLS_ENGLAND,
  'skills-england-jobs-skills': SKILLS_ENGLAND,
  'skills-england': SKILLS_ENGLAND,
  'faa-vacancies': 'Contains public sector information licensed under the Open Government Licence v3.0. NHS Jobs and Civil Service Jobs adverts come through the same API; their re-use terms are assumed, not confirmed.',
  'companies-house': 'Contains public sector information licensed under the Open Government Licence v3.0 (Companies House).',
}
const attributionFor = (source, licence) => ATTRIBUTION[source]
  // Nomis and the ONS's own downloads are ONS data, whatever SOURCE_FILE's wording.
  ?? (/^Test data/.test(licence) ? TEST : /credit the Office for National Statistics/.test(licence) || /^(nomis|ons)-/.test(source) ? ONS
    : /^Open Government Licence v3\.0$/.test(licence) ? OGL : null)

// Tables whose sources' words together are too long for one tag value, or
// whose sources are under more than one licence: the one value they get.
const TABLE_OVERRIDES = {
  // Skills England's dashboards are MIT (the code); their figures, the rows
  // here, are under the OGL like the rest of the table.
  'SHARED_DB.RAW.PUBLISHED_CELL': {
    licence: 'ogl-3',
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (ONS, DWP, DESNZ, Ofgem, Skills England). Postcodes: OS data © Crown copyright and database right 2026; Royal Mail data © Royal Mail copyright and database right 2026.',
  },
  'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_GUIDE': {
    attribution: 'Test data made by Rarebit. Quotes the ILR 2026 to 2027 guidance (Department for Education): contains public sector information licensed under the Open Government Licence v3.0.',
  },
}

// ---------------------------------------------------------------- refresh
// A load step run by a scheduled job refreshes as often as that job runs.
const DAY = 86_400_000
const everyToRefresh = (ms) => (ms <= DAY ? 'daily' : ms <= 7 * DAY ? 'weekly' : ms <= 31 * DAY ? 'monthly' : ms <= 92 * DAY ? 'quarterly' : 'yearly')
const stepOfJob = Object.fromEntries(Object.entries(STEPS).map(([n, s]) => [s.job, Number(n)]))
const refreshOfStep = {}
for (const [kind, steps] of Object.entries(LOAD_STEPS)) {
  const job = JOB_SCHEDULE[`official-${kind}`]
  if (!job) throw new Error(`No official-${kind} in server/jobSchedule.js`)
  for (const n of steps) refreshOfStep[n] = everyToRefresh(job.every)
}
const REFRESH_ORDER = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'by-hand']
const mostOften = (values) => REFRESH_ORDER.find((r) => values.includes(r)) ?? 'by-hand'

// ------------------------------------------------------------ sensitivity
// Published open data is public; test data and the load records are
// internal. Columns that differ from their table (the dummy learners are
// fictional, but tagged as real ones would be, so the masking policies can
// be tested on them).
const COLUMN_SENSITIVITY = {
  'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNER': {
    personal: ['LearnRefNumber', 'ULN', 'FamilyName', 'GivenNames', 'DateOfBirth', 'Sex', 'NINumber', 'PostcodePrior', 'Postcode', 'TelNo', 'Email'],
    'special-category': ['Ethnicity', 'LLDDHealthProb'],
  },
  'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNING_DELIVERY': { personal: ['LearnRefNumber'] },
  // Who asked for the profile: a manager's USERID, or REFRESH.
  'SHARED_DB.RAW.CH_COMPANY_PROFILE': { internal: ['FETCHEDBY'] },
}

// ------------------------------------------------------------ the new tables
const NEW_TABLES = [
  { name: 'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNER', sheet: 'Learner',
    cols: ['LearnRefNumber', 'ULN', 'FamilyName', 'GivenNames', 'DateOfBirth', 'Ethnicity', 'Sex', 'LLDDHealthProb', 'NINumber', 'PostcodePrior', 'Postcode', 'TelNo', 'Email'] },
  { name: 'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNING_DELIVERY', sheet: 'LearningDelivery',
    cols: ['LearnRefNumber', 'LearnAimRef', 'AimType', 'AimSeqNumber', 'LearnStartDate', 'LearnPlanEndDate', 'FundModel', 'ProgType', 'StdCode', 'DelLocPostCode', 'CompStatus', 'LearnActEndDate', 'Outcome', 'AchDate'] },
]
const NEW_SOURCE = 'test-ilr-dummy'
const NEW_LICENCE = 'Test data (fictional learners); the Guide quotes the ILR 2026 to 2027 guidance (OGL v3.0)'

// ------------------------------------------------------------ what is there
const c = await connect({ as: 'loader', timeoutMs: 60000 })
const q = (sql, binds = []) => execute(c, sql, binds)
const tables = new Map()
try {
  for (const schema of BRONZE_SCHEMAS) {
    const [db, sc] = schema.split('.')
    for (const t of await q(`select TABLE_NAME from ${db}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ? order by 1`, [sc])) {
      tables.set(`${schema}.${t.TABLE_NAME}`, { sources: new Set(), licences: new Set(), licenceOf: new Map(), refresh: [] })
    }
    const runs = await q(`select f.TARGETTABLE, f.SOURCE, f.LICENCE, r.JOB from ${schema}.SOURCE_FILE f
      left join SHARED_DB.OPS.JOB_RUN r on r.JOBRUNID = f.JOBRUNID group by all`)
    for (const r of runs) {
      // Steps 1 and 2 load OPTIONS_DB.CONTENT: not bronze.
      if (!r.TARGETTABLE.startsWith(`${schema}.`)) continue
      const t = tables.get(r.TARGETTABLE)
      if (!t) throw new Error(`${r.TARGETTABLE} is in SOURCE_FILE but DATA_LOAD_ROLE can't see it`)
      t.sources.add(r.SOURCE)
      t.licences.add(r.LICENCE)
      t.licenceOf.set(r.SOURCE, r.LICENCE)
      t.refresh.push(refreshOfStep[stepOfJob[r.JOB]] ?? 'by-hand')
    }
  }
} finally {
  await destroy(c)
}
// TEST_BASELINE also keeps the test learner snapshot (not bronze, and not
// visible to DATA_LOAD_ROLE): only the tables loaded into it are tagged.
for (const [name, t] of tables) if (name.startsWith('CAPTURE_DB.TEST_BASELINE.') && !t.sources.size && !BRONZE_RECORD_TABLES.includes(name)) tables.delete(name)
const fixed = (source, licence, refresh) => ({ sources: new Set([source]), licences: new Set([licence]), licenceOf: new Map([[source, licence]]), refresh: [refresh] })
for (const name of [...NEW_TABLES.map((t) => t.name), 'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_GUIDE']) tables.set(name, fixed(NEW_SOURCE, NEW_LICENCE, 'by-hand'))
// Written by the app's jobs from an API, so not in SOURCE_FILE (and not
// visible to DATA_LOAD_ROLE).
for (const [name, a] of Object.entries(BRONZE_API_TABLES)) {
  tables.set(name, fixed(a.source, a.licenceText, everyToRefresh(JOB_SCHEDULE[a.job].every)))
}

// ------------------------------------------------------------ the tags
const tagged = []
const problems = []
for (const [name, t] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
  if (BRONZE_RECORD_TABLES.includes(name)) {
    tagged.push({ name, tags: { LAYER: 'bronze', OWNER: 'rarebit-data', REFRESH: 'daily', SENSITIVITY: 'internal' } })
    continue
  }
  if (!t.sources.size) { problems.push(`${name}: no SOURCE_FILE rows and not in BRONZE_API_TABLES`); continue }
  const o = TABLE_OVERRIDES[name] ?? {}
  const sources = [...t.sources].sort()
  const licences = [...new Set([...t.licences].map(licenceTag))]
  if (licences.length > 1 && !o.licence) problems.push(`${name}: licences ${licences.join(', ')}: give it one in TABLE_OVERRIDES`)
  const words = sources.map((s) => attributionFor(s, t.licenceOf.get(s)))
  if (words.includes(null) && !o.attribution) problems.push(`${name}: no attribution for ${sources.filter((_, i) => !words[i]).join(', ')}`)
  const attribution = o.attribution ?? [...new Set(words)].join(' ')
  const tags = {
    LAYER: 'bronze',
    OWNER: 'rarebit-data',
    SOURCE: sources.join(','),
    LICENCE: o.licence ?? licences[0],
    ATTRIBUTION: attribution,
    REFRESH: mostOften(t.refresh),
    SENSITIVITY: licences.includes('test-data') ? 'internal' : 'public',
  }
  for (const [k, v] of Object.entries(tags)) if (!v || v.length > MAX_TAG) problems.push(`${name}: ${k} is ${v ? `${v.length} characters` : 'empty'}`)
  tagged.push({ name, tags })
}
if (problems.length) {
  for (const p of problems) console.error(p)
  process.exit(1)
}

// ------------------------------------------------------------ the SQL
const tableSql = (t) => `CREATE TABLE IF NOT EXISTS ${t.name} (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The TEST_BASELINE.SOURCE_FILE row of the workbook sheet this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in the sheet, as COPY counts it (the header is row 1).',
  ISTESTDATA    BOOLEAN      DEFAULT TRUE NOT NULL COMMENT 'Always TRUE: fictional test learners.',
${t.cols.map((n) => `  "${n}" VARCHAR`).join(',\n')}
)
COMMENT = 'TEST DATA ONLY: the ${t.sheet} sheet of ilr-dummy-data.xlsx (fictional learners, made by Rarebit), as it is. Columns named exactly as in the sheet, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';`

const setTags = ({ name, tags }) => `ALTER TABLE ${name} SET TAG ${Object.entries(tags).map(([k, v]) => `${T}${k} = ${lit(v)}`).join(', ')};`
const columnTags = Object.entries(COLUMN_SENSITIVITY).flatMap(([table, bySensitivity]) => [`ALTER TABLE ${table} MODIFY
${Object.entries(bySensitivity).flatMap(([s, cols]) => cols.map((col) => `  COLUMN ${/^[A-Z0-9_]+$/.test(col) ? col : `"${col}"`} SET TAG ${T}SENSITIVITY = ${lit(s)}`)).join(',\n')};`])

const recordCount = tagged.filter((t) => BRONZE_RECORD_TABLES.includes(t.name)).length
const dataCount = tagged.length - recordCount
const bySchema = (s) => tagged.filter((t) => t.name.startsWith(`${s}.`)).length
const sample = ['SHARED_DB.RAW.LARS_STANDARD', 'SHARED_DB.RAW.ONSPD', 'SHARED_DB.RAW.PUBLISHED_CELL', 'SHARED_DB.RAW.CH_COMPANY_PROFILE', 'OPTIONS_DB.RAW.GIAS_ESTABLISHMENT', 'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNER']
const show = (n) => tagged.find((t) => t.name === n).tags

const sql = `-- The ILR dummy data workbook, and the governance tags on bronze (decision
-- 15 and decision 21). Written by scripts/gen-load-10-sql.js from SOURCE_FILE
-- and JOB_RUN: run that again rather than editing this file.
--
-- 1. CAPTURE_DB.TEST_BASELINE (TEST DATA ONLY): three tables for
--    ilr-dummy-data.xlsx, loaded as it is by npm run load:data step 43 as
--    DATA_LOAD_USER. Learner and LearningDelivery have a header row, so their
--    columns are named exactly as in the sheet, all text; the Guide sheet (a
--    title, notes and two lists) is one row per sheet row, its cells as an
--    array, like FIS_REPORT_ROW. DATA_LOAD_ROLE gets SELECT and INSERT;
--    nobody else gets anything (TRANSFORM_ROLE has nothing in CAPTURE_DB).
--
-- 2. Tags on every bronze table: ${tagged.length} in all (${bySchema('SHARED_DB.RAW')} in SHARED_DB.RAW,
--    ${bySchema('OPTIONS_DB.RAW')} in OPTIONS_DB.RAW, ${bySchema('CAPTURE_DB.TEST_BASELINE')} in CAPTURE_DB.TEST_BASELINE). Each data table gets
--    all seven: LAYER bronze; OWNER rarebit-data; SOURCE, the data sets
--    SOURCE_FILE names for it (or the API it comes from); LICENCE from their
--    licences; ATTRIBUTION in the words silver uses; REFRESH from the job
--    that loads it (weekly or monthly official jobs, the daily Companies
--    House refresh and vacancy import, by-hand for the rest); SENSITIVITY
--    public, or internal for test data. The three SOURCE_FILE tables (the
--    load records) get LAYER, OWNER, REFRESH and SENSITIVITY internal.
--    Columns take their table's SENSITIVITY, except the dummy learners'
--    (personal, Ethnicity and LLDDHealthProb special-category: fictional,
--    tagged as real ones would be, for testing the masking policies later)
--    and CH_COMPANY_PROFILE.FETCHEDBY (internal). SHARED_DB.RAW and
--    OPTIONS_DB.RAW get LAYER and OWNER too; TEST_BASELINE doesn't (it also
--    keeps the test learner snapshot, which isn't bronze).
--
-- Tags set by hand here stay until changed: a new RAW table needs its own
-- (npm run check:tags -- --bronze finds any without).
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- 1. The ILR dummy data workbook (TEST DATA ONLY)
-- ---------------------------------------------------------------------------
${NEW_TABLES.map(tableSql).join('\n\n')}

CREATE TABLE IF NOT EXISTS CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_GUIDE (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The TEST_BASELINE.SOURCE_FILE row of the workbook''s Guide sheet.',
  ISTESTDATA   BOOLEAN      DEFAULT TRUE NOT NULL COMMENT 'Always TRUE: test data.',
  ROWNUMBER    NUMBER(38,0) NOT NULL COMMENT 'Its row in the sheet, from 1 (the title). Empty rows are left out.',
  CELLS        ARRAY        NOT NULL COMMENT 'The row''s cells, as text, in order. A merged range''s text is in its first cell only.'
)
COMMENT = 'TEST DATA ONLY: the Guide sheet of ilr-dummy-data.xlsx (made by Rarebit): the ILR 2026 to 2027 Learner and LearningDelivery fields, whether the schema requires them and whether the dummy data has them, with notes. One row per sheet row. Add-only.';

GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNER TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNING_DELIVERY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_GUIDE TO ROLE DATA_LOAD_ROLE;

-- ---------------------------------------------------------------------------
-- 2. Governance tags on bronze
-- ---------------------------------------------------------------------------
${BRONZE_SCHEMAS.filter((s) => !s.startsWith('CAPTURE_DB.')).map((s) => `ALTER SCHEMA ${s} SET TAG ${T}LAYER = 'bronze', ${T}OWNER = 'rarebit-data';`).join('\n')}

${tagged.map(setTags).join('\n')}

${columnTags.join('\n\n')}

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: 3 rows, ROW_COUNT 0, COLUMNS_:
--      ILR_DUMMY_GUIDE 4, ILR_DUMMY_LEARNER 16, ILR_DUMMY_LEARNING_DELIVERY 17
SELECT TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME LIKE 'ILR_DUMMY_%'
ORDER BY 1;

-- 2. Who has rights on them. Expected: 2 rows, each on 3 tables:
--    INSERT DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM CAPTURE_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'TEST_BASELINE' AND TABLE_NAME LIKE 'ILR_DUMMY_%' AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. A sample of the table tags. Expected: 6 rows, as listed (every table is
--    checked afterwards by npm run check:tags -- --bronze):
${sample.map((n) => `--      ${n.split('.').at(-1)}: ${show(n).SOURCE}, ${show(n).LICENCE}, ${show(n).REFRESH}, ${show(n).SENSITIVITY}`).join('\n')}
${sample.map((n) => `SELECT ${lit(n)} AS TABLE_, SYSTEM$GET_TAG('${T}LAYER', ${lit(n)}, 'table') AS LAYER, SYSTEM$GET_TAG('${T}SOURCE', ${lit(n)}, 'table') AS SOURCE, SYSTEM$GET_TAG('${T}LICENCE', ${lit(n)}, 'table') AS LICENCE, SYSTEM$GET_TAG('${T}REFRESH', ${lit(n)}, 'table') AS REFRESH, SYSTEM$GET_TAG('${T}SENSITIVITY', ${lit(n)}, 'table') AS SENSITIVITY`).join('\nUNION ALL ')};

-- 4. The dummy learners' column tags. Expected: 13 rows: Ethnicity and
--    LLDDHealthProb special-category, the other 11 personal.
SELECT COLUMN_NAME, TAG_VALUE, LEVEL
FROM TABLE(CAPTURE_DB.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_LEARNER', 'table'))
WHERE TAG_NAME = 'SENSITIVITY' AND LEVEL = 'COLUMN'
ORDER BY 2, 1;
`
fs.writeFileSync(OUT, sql)
console.log(`${OUT}: ${tagged.length} tables tagged (${dataCount} data, ${recordCount} load records)`)
for (const r of REFRESH_ORDER) console.log(`  REFRESH ${r}: ${tagged.filter((t) => t.tags.REFRESH === r).length}`)
