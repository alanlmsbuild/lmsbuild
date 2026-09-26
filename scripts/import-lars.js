// import-lars.js - load a LARS CSV extract into the CAPTURE_DB.LARS schema.
//
// Usage:
//   npm run import:lars -- --dry-run    check the files only, no database
//   npm run import:lars                 load into Snowflake
//
// Reads CSVs from data/lars (or --data <folder>). Ported from the tested
// Postgres importer in data/import_lars.py: same tables, columns, cleaning
// and checks. Snowflake does not enforce primary or foreign keys, so every
// key and link is checked here before anything is loaded.
//
// Safe to re-run: each table is bulk loaded into a temporary staging table
// and MERGEd into the real one, so existing rows are updated, not duplicated.
// All MERGEs run in one transaction - a failed run changes nothing.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data', 'lars')
const SCHEMA = 'LARS'
const STAGE_PATH = '@~/lars_import'

// ---------------------------------------------------------------- cleaning

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function blank(v) {
  return v == null || String(v).trim() === ''
}

function toNumber(v) {
  const s = String(v).trim()
  if (!NUMBER_PATTERN.test(s)) throw new Error(`invalid number '${s}'`)
  return Number(s)
}

function isoDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return d.toISOString().slice(0, 10)
}

// Same formats as the reference: 2026-09-24, 24 Sep 2026, 24/09/2026,
// 2026-09-24 10:09:08. Returned as an ISO date string.
function parseDate(s) {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?: \d{1,2}:\d{1,2}:\d{1,2})?$/)
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/)
  if (m) {
    const month = MONTHS.indexOf(m[2].toUpperCase()) + 1
    return month ? isoDate(Number(m[3]), month, Number(m[1])) : null
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

const CLEAN = {
  text: (v) => (blank(v) ? null : String(v).trim()),
  code: (v) => (blank(v) ? null : String(v).trim().toUpperCase()),
  int: (v) => (blank(v) ? null : Math.trunc(toNumber(v))),
  // Kept as a 2dp string so keys like '6.00' and '6.0' compare equal.
  num: (v) => (blank(v) ? null : toNumber(v).toFixed(2)),
  date: (v) => {
    if (blank(v)) return null
    const s = String(v).trim()
    const d = parseDate(s)
    if (!d) throw new Error(`unrecognised date '${s}'`)
    return d
  },
  bool: (v) => (blank(v) ? null : ['Y', 'YES', 'TRUE', '1'].includes(String(v).trim().toUpperCase())),
}

// ---------------------------------------------------------------- table specs
// cols: [db column, csv column(s), type, required]
// A csv column list means the first non-blank value wins.
// fks: { db column: parent table }

function lookup(table, csvFile, keyCol, keyDb, { keyType = 'code', desc2 = true, target = false } = {}) {
  const cols = [
    [keyDb, keyCol, keyType, true],
    ['description', [`${keyCol}Desc`, `${keyCol}Desc2`, keyCol], 'text', true],
  ]
  if (desc2) cols.push(['description_long', `${keyCol}Desc2`, 'text', false])
  if (target) cols.push(['target_indicator', 'TargetIndicator', 'text', false])
  cols.push(['effective_from', 'EffectiveFrom', 'date', true], ['effective_to', 'EffectiveTo', 'date', false])
  return { table, files: [csvFile], pk: [keyDb], cols, fks: {} }
}

// Lookup tables come first so their keys are known when core tables are checked.
const TABLES = [
  lookup('aim_type', 'LearnAimRefType.csv', 'LearnAimRefType', 'aim_type_code'),
  lookup('nvq_level_v2', 'NotionalNVQLevelv2.csv', 'NotionalNVQLevelV2', 'level_code'),
  lookup('ssa_tier1', 'SectorSubjectAreaTier1.csv', 'SectorSubjectAreaTier1', 'ssa_tier1', { keyType: 'num' }),
  {
    table: 'ssa_tier2', files: ['SectorSubjectArea.csv'], pk: ['ssa_tier2'],
    cols: [
      ['ssa_tier2', 'SectorSubjectAreaTier2', 'num', true],
      ['ssa_tier1', 'SectorSubjectAreaTier1', 'num', false],
      ['description', ['SectorSubjectAreaTier2Desc', 'SectorSubjectAreaTier2Desc2', 'SectorSubjectAreaTier2'], 'text', true],
      ['description_long', 'SectorSubjectAreaTier2Desc2', 'text', false],
      ['effective_from', 'SectorSubjectAreaTier2_EffFrom', 'date', true],
      ['effective_to', 'SectorSubjectAreaTier2_EffTo', 'date', false],
    ],
    fks: { ssa_tier1: 'ssa_tier1' },
  },
  {
    table: 'award_org', files: ['AwardOrgCode.csv'], pk: ['award_org_code'],
    cols: [
      ['award_org_code', 'AwardOrgCode', 'code', true],
      ['ukprn', 'AwardOrgUKPRN', 'int', false],
      ['name', ['AwardOrgName', 'AwardOrgShortName', 'AwardOrgCode'], 'text', true],
      ['short_name', 'AwardOrgShortName', 'text', false],
      ['acronym', 'AwardOrgAcronym', 'text', false],
      ['is_non_extant', 'AwardOrgNonExtant', 'bool', false],
      ['is_hei', 'AwardOrgHigherEducationInstitution', 'bool', false],
      ['notes', 'AwardOrgNotes', 'text', false],
      ['effective_from', 'EffectiveFrom', 'date', true],
      ['effective_to', 'EffectiveTo', 'date', false],
    ],
    fks: {},
  },
  lookup('standard_type', 'ApprenticeshipStandardTypeCode.csv', 'ApprenticeshipStandardTypeCode',
    'standard_type_code', { desc2: false }),
  lookup('standard_sector', 'StandardSectorCode.csv', 'StandardSectorCode', 'sector_code', { keyType: 'int' }),
  lookup('funding_category', 'FundingCategory.csv', 'FundingCategory', 'funding_category', { target: true }),
  lookup('validity_category', 'ValidityCategory.csv', 'ValidityCategory', 'validity_category', { target: true }),
  lookup('component_type', 'ApprenticeshipComponentType.csv', 'ApprenticeshipComponentType', 'component_type',
    { keyType: 'int' }),
  lookup('common_component', 'CommonComponent.csv', 'CommonComponent', 'common_component', { keyType: 'int' }),
  {
    table: 'learning_aim',
    files: ['LearningDelivery.csv', 'LearningDelivery_trimmed.csv', 'LearningDelivery_trimmed_slim.csv'],
    pk: ['learn_aim_ref'],
    cols: [
      ['learn_aim_ref', 'LearnAimRef', 'code', true],
      ['title', ['LearnAimRefTitle', 'LearnAimRef'], 'text', true],
      ['aim_type_code', 'LearnAimRefType', 'code', true],
      ['notional_nvq_level', 'NotionalNVQLevel', 'text', false],
      ['notional_nvq_level_v2', 'NotionalNVQLevelv2', 'code', false],
      ['award_org_code', 'AwardOrgCode', 'code', false],
      ['award_org_aim_ref', 'AwardOrgAimRef', 'text', false],
      ['ssa_tier1', 'SectorSubjectAreaTier1', 'num', false],
      ['ssa_tier2', 'SectorSubjectAreaTier2', 'num', false],
      ['guided_learning_hours', 'GuidedLearningHours', 'int', false],
      ['total_qualification_time', 'TotalQualificationTime', 'int', false],
      ['certification_end_date', 'CertificationEndDate', 'date', false],
      ['operational_start_date', 'OperationalStartDate', 'date', false],
      ['operational_end_date', 'OperationalEndDate', 'date', false],
      ['effective_from', 'EffectiveFrom', 'date', true],
      ['effective_to', 'EffectiveTo', 'date', false],
    ],
    fks: {
      aim_type_code: 'aim_type', notional_nvq_level_v2: 'nvq_level_v2',
      award_org_code: 'award_org', ssa_tier1: 'ssa_tier1', ssa_tier2: 'ssa_tier2',
    },
  },
  {
    table: 'standard', files: ['Standard.csv'], pk: ['standard_code'],
    cols: [
      ['standard_code', 'StandardCode', 'int', true],
      ['version', 'Version', 'int', true],
      ['standard_type_code', 'ApprenticeshipStandardTypeCode', 'code', true],
      ['name', 'StandardName', 'text', true],
      ['sector_code', 'StandardSectorCode', 'int', false],
      ['notional_end_level', 'NotionalEndLevel', 'int', false],
      ['reference', 'Reference', 'text', false],
      ['url', 'URLLink', 'text', false],
      ['ssa_tier1', 'SectorSubjectAreaTier1', 'num', false],
      ['ssa_tier2', 'SectorSubjectAreaTier2', 'num', false],
      ['is_integrated_degree', 'IntegratedDegreeStandard', 'bool', false],
      ['other_body_approval_required', 'OtherBodyApprovalRequired', 'bool', false],
      ['effective_from', 'EffectiveFrom', 'date', true],
      ['last_date_starts', 'LastDateStarts', 'date', false],
      ['effective_to', 'EffectiveTo', 'date', false],
    ],
    fks: {
      standard_type_code: 'standard_type', sector_code: 'standard_sector',
      ssa_tier1: 'ssa_tier1', ssa_tier2: 'ssa_tier2',
    },
  },
  {
    table: 'standard_funding', files: ['StandardFunding.csv'],
    pk: ['standard_code', 'funding_category', 'effective_from'],
    cols: [
      ['standard_code', 'StandardCode', 'int', true],
      ['funding_category', 'FundingCategory', 'code', true],
      ['effective_from', 'EffectiveFrom', 'date', true],
      ['effective_to', 'EffectiveTo', 'date', false],
      ['band_number', 'BandNumber', 'int', false],
      ['core_gov_contribution_cap', 'CoreGovContributionCap', 'num', false],
      ['incentive_16_18', '1618Incentive', 'num', false],
      ['small_business_incentive', 'SmallBusinessIncentive', 'num', false],
      ['achievement_incentive', 'AchievementIncentive', 'num', false],
      ['fundable_without_employer', 'FundableWithoutEmployer', 'bool', false],
    ],
    fks: { standard_code: 'standard', funding_category: 'funding_category' },
  },
  {
    table: 'standard_aim', files: ['StandardAims.csv'],
    pk: ['standard_code', 'learn_aim_ref', 'effective_from'],
    cols: [
      ['standard_code', 'StandardCode', 'int', true],
      ['learn_aim_ref', 'LearnAimRef', 'code', true],
      ['effective_from', 'EffectiveFrom', 'date', true],
      ['effective_to', 'EffectiveTo', 'date', false],
      ['component_type', 'StandardComponentType', 'int', false],
    ],
    fks: { standard_code: 'standard', learn_aim_ref: 'learning_aim', component_type: 'component_type' },
  },
  {
    table: 'standard_common_component', files: ['StandardCommonComponent.csv'],
    pk: ['standard_code', 'common_component', 'effective_from'],
    cols: [
      ['standard_code', 'StandardCode', 'int', true],
      ['common_component', 'CommonComponent', 'int', true],
      ['effective_from', 'EffectiveFrom', 'date', true],
      ['effective_to', 'EffectiveTo', 'date', false],
      ['min_level', 'MinLevel', 'int', false],
    ],
    fks: { standard_code: 'standard', common_component: 'common_component' },
  },
  {
    table: 'standard_validity', files: ['StandardValidity.csv'],
    pk: ['standard_code', 'validity_category'],
    cols: [
      ['standard_code', 'StandardCode', 'int', true],
      ['validity_category', 'ValidityCategory', 'code', true],
      ['start_date', 'StartDate', 'date', true],
      ['last_new_start_date', 'LastNewStartDate', 'date', false],
      ['end_date', 'EndDate', 'date', false],
    ],
    fks: { standard_code: 'standard', validity_category: 'validity_category' },
  },
]

// Columns that are NOT NULL with a default of false in the schema.
const FALSE_IF_BLANK = new Set([
  'award_org.is_non_extant', 'award_org.is_hei',
  'standard.is_integrated_degree', 'standard_funding.fundable_without_employer',
])

const SQL_TYPES = {
  text: 'varchar',
  code: 'varchar',
  int: 'number(38,0)',
  num: 'number(12,2)',
  date: 'date',
  bool: 'boolean',
}

// ---------------------------------------------------------------- reading

// RFC 4180 CSV: quoted fields may contain commas, "" and line breaks.
function parseCsv(text) {
  const rows = []
  let row = []
  let i = 0
  const n = text.length
  while (i < n) {
    let field
    if (text[i] === '"') {
      let value = ''
      i++
      for (;;) {
        const q = text.indexOf('"', i)
        if (q === -1) throw new Error('unterminated quoted field')
        value += text.slice(i, q)
        if (text[q + 1] === '"') {
          value += '"'
          i = q + 2
        } else {
          i = q + 1
          break
        }
      }
      field = value
    } else {
      let j = i
      while (j < n && text[j] !== ',' && text[j] !== '\n' && text[j] !== '\r') j++
      field = text.slice(i, j)
      i = j
    }
    row.push(field)
    if (text[i] === ',') {
      i++
      if (i === n) row.push('')
    } else {
      if (text[i] === '\r') i++
      if (text[i] === '\n') i++
      // Skip blank lines, as Python's csv.DictReader does.
      if (!(row.length === 1 && row[0] === '')) rows.push(row)
      row = []
    }
  }
  return rows
}

function readCsv(file) {
  const raw = fs.readFileSync(file)
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw) // strips a BOM
  } catch {
    text = new TextDecoder('windows-1252').decode(raw)
  }
  const [headerRow = [], ...dataRows] = parseCsv(text)
  const headers = headerRow.map((h) => h.trim())
  const rows = dataRows.map((values) => Object.fromEntries(headers.map((h, k) => [h, values[k]])))
  return { headers, rows }
}

function pickFile(dataDir, candidates) {
  for (const name of candidates) {
    const file = path.join(dataDir, name)
    if (fs.existsSync(file)) return file
  }
  throw new Error(`none of ${candidates.join(', ')} found in ${dataDir}`)
}

const asList = (csvCols) => (Array.isArray(csvCols) ? csvCols : [csvCols])
const pkKey = (spec, row) => JSON.stringify(spec.pk.map((c) => row[c]))

// Read, clean and validate one table. Returns { rows, stats, notes }.
function prepare(spec, dataDir, keys) {
  const file = pickFile(dataDir, spec.files)
  const { headers, rows: rawRows } = readCsv(file)
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]))
  const src = (name) => lower.get(name.toLowerCase())

  // Every csv column we need must exist.
  for (const [, csvCols] of spec.cols) {
    const options = asList(csvCols)
    if (!options.some(src)) throw new Error(`${path.basename(file)} has no column ${options[0]}`)
  }

  const stats = {
    file: path.basename(file), read: rawRows.length, loaded: 0,
    skipped: 0, links_blanked: 0, duplicates: 0,
  }
  const notes = []
  const out = new Map()

  rawRows.forEach((r, index) => {
    const line = index + 2
    const row = {}
    let problem = null
    for (const [dbCol, csvCols, type, required] of spec.cols) {
      let val = null
      for (const c of asList(csvCols)) {
        const h = src(c)
        if (h && !blank(r[h])) {
          val = r[h]
          break
        }
      }
      try {
        val = CLEAN[type](val)
      } catch (err) {
        val = null
        problem = `line ${line}: ${dbCol} ${err.message}`
      }
      if (val === null && FALSE_IF_BLANK.has(`${spec.table}.${dbCol}`)) val = false
      if (val === null && required) problem = problem || `line ${line}: missing ${dbCol}`
      row[dbCol] = val
    }

    // Links to other tables: blank unknown optional codes, skip unknown required ones.
    if (!problem) {
      for (const [col, parent] of Object.entries(spec.fks)) {
        const v = row[col]
        if (v === null || keys[parent].has(v)) continue
        const required = spec.cols.find((c) => c[0] === col)[3]
        if (required) {
          problem = `line ${line}: ${col} '${v}' not found in ${parent}`
          break
        }
        row[col] = null
        stats.links_blanked++
      }
    }

    if (problem) {
      stats.skipped++
      if (notes.length < 5) notes.push(problem)
      return
    }
    // Duplicate keys: the last row wins, as in the reference.
    const key = pkKey(spec, row)
    if (out.has(key)) stats.duplicates++
    out.set(key, row)
  })

  const rows = [...out.values()]
  stats.loaded = rows.length
  if (spec.pk.length === 1) keys[spec.table] = new Set(rows.map((row) => row[spec.pk[0]]))
  return { rows, stats, notes }
}

function sourceInfo(dataDir) {
  const file = path.join(dataDir, 'DataGeneration.csv')
  if (!fs.existsSync(file)) return { generatedOn: null, description: null, comment: null }
  const [r] = readCsv(file).rows
  if (!r) return { generatedOn: null, description: null, comment: null }
  let generatedOn = null
  try {
    generatedOn = CLEAN.date(r.DataGeneratedOn)
  } catch {
    // leave it blank rather than fail the whole import
  }
  return { generatedOn, description: CLEAN.text(r.Description), comment: CLEAN.text(r.Comment) }
}

// ---------------------------------------------------------------- loading

const ident = (name) => name.toUpperCase()
const tableName = (table) => `${SCHEMA}.${ident(table)}`
const stagingName = (table) => `${SCHEMA}.STG_${ident(table)}`
const specFor = (table) => TABLES.find((s) => s.table === table)

const CREATE_IMPORT_RUN = `
  create table if not exists ${SCHEMA}.IMPORT_RUN (
    ID number(38,0) not null,
    SOURCE_GENERATED_ON date,
    SOURCE_DESCRIPTION varchar,
    SOURCE_SCHEMA_NOTE varchar,
    STARTED_AT timestamp_ltz not null default current_timestamp(),
    FINISHED_AT timestamp_ltz,
    STATUS varchar not null default 'running',
    ROW_COUNTS variant,
    ERROR varchar,
    primary key (ID)
  )
`

// Primary and foreign keys are declared for documentation and tooling only;
// Snowflake does not enforce them, which is why prepare() checks them.
function createTableSql(spec) {
  const lines = spec.cols.map(([dbCol, , type, required]) => {
    const falseIfBlank = FALSE_IF_BLANK.has(`${spec.table}.${dbCol}`)
    const notNull = required || falseIfBlank ? ' not null' : ''
    const dflt = falseIfBlank ? ' default false' : ''
    return `${ident(dbCol)} ${SQL_TYPES[type]}${notNull}${dflt}`
  })
  lines.push('LAST_IMPORT_RUN_ID number(38,0) not null')
  lines.push(`primary key (${spec.pk.map(ident).join(', ')})`)
  for (const [col, parent] of Object.entries(spec.fks)) {
    lines.push(`foreign key (${ident(col)}) references ${tableName(parent)} (${ident(specFor(parent).pk[0])})`)
  }
  lines.push(`foreign key (LAST_IMPORT_RUN_ID) references ${SCHEMA}.IMPORT_RUN (ID)`)
  return `create table if not exists ${tableName(spec.table)} (\n  ${lines.join(',\n  ')}\n)`
}

// Staging CSV: every value quoted except NULL (\N) and booleans.
function csvValue(v) {
  if (v === null || v === undefined) return '\\N'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `"${String(v).replaceAll('"', '""')}"`
}

function writeStagingFile(dir, spec, rows, runId) {
  const cols = spec.cols.map((c) => c[0])
  const lines = rows.map((row) => [...cols.map((c) => csvValue(row[c])), csvValue(runId)].join(','))
  const file = path.join(dir, `${spec.table}.csv`)
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8')
  return file
}

const FILE_FORMAT = `
  type = csv
  field_optionally_enclosed_by = '"'
  null_if = ('\\\\N')
  encoding = 'UTF8'
`

function copySql(spec, runId) {
  const cols = [...spec.cols.map((c) => ident(c[0])), 'LAST_IMPORT_RUN_ID']
  return `
    copy into ${stagingName(spec.table)} (${cols.join(', ')})
    from ${STAGE_PATH}/run_${runId}/
    files = ('${spec.table}.csv.gz')
    file_format = (${FILE_FORMAT})
    on_error = abort_statement
    force = true
  `
}

function mergeSql(spec) {
  const cols = [...spec.cols.map((c) => ident(c[0])), 'LAST_IMPORT_RUN_ID']
  const pk = spec.pk.map(ident)
  const on = pk.map((c) => `t.${c} = s.${c}`).join(' and ')
  const updates = cols.filter((c) => !pk.includes(c)).map((c) => `${c} = s.${c}`).join(', ')
  return `
    merge into ${tableName(spec.table)} t
    using ${stagingName(spec.table)} s
      on ${on}
    when matched then update set ${updates}
    when not matched then insert (${cols.join(', ')})
      values (${cols.map((c) => `s.${c}`).join(', ')})
  `
}

async function load(prepared, counts, dataDir) {
  const { connect, execute, destroy } = await import('../server/db.js')

  let connection
  try {
    connection = await connect()
  } catch (err) {
    console.error(`\nCan't connect to Snowflake. Check server/.env.\n\nDetails: ${err.message}`)
    process.exit(1)
  }

  let runId
  let tmpDir
  try {
    const [{ DB }] = await execute(connection, 'select current_database() as DB')
    console.log(`\nConnected. Target schema ${DB}.${SCHEMA}`)

    // DDL commits implicitly in Snowflake, so it all happens before the transaction.
    await execute(connection, CREATE_IMPORT_RUN)
    for (const spec of TABLES) await execute(connection, createTableSql(spec))

    const [{ NEXT_ID }] = await execute(
      connection,
      `select coalesce(max(ID), 0) + 1 as NEXT_ID from ${SCHEMA}.IMPORT_RUN`,
    )
    runId = Number(NEXT_ID)
    const { generatedOn, description, comment } = sourceInfo(dataDir)
    await execute(
      connection,
      `insert into ${SCHEMA}.IMPORT_RUN (ID, SOURCE_GENERATED_ON, SOURCE_DESCRIPTION, SOURCE_SCHEMA_NOTE)
       values (?, ?, ?, ?)`,
      [runId, generatedOn, description, comment],
    )
    console.log(`Import run ${runId} started. Loading...`)

    try {
      // Bulk load: write cleaned files, upload them in one PUT, COPY into staging.
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lars-import-'))
      for (const { spec, rows } of prepared) writeStagingFile(tmpDir, spec, rows, runId)
      await execute(
        connection,
        `put 'file://${tmpDir}/*.csv' ${STAGE_PATH}/run_${runId}/ auto_compress = true overwrite = true`,
      )

      for (const { spec, rows } of prepared) {
        await execute(
          connection,
          `create or replace temporary table ${stagingName(spec.table)} like ${tableName(spec.table)}`,
        )
        const result = await execute(connection, copySql(spec, runId))
        const staged = result.reduce((sum, r) => sum + Number(r.rows_loaded ?? r.ROWS_LOADED ?? 0), 0)
        if (staged !== rows.length) {
          throw new Error(`${spec.table}: staged ${staged} rows but expected ${rows.length}`)
        }
      }

      await execute(connection, 'begin')
      for (const { spec } of prepared) {
        await execute(connection, mergeSql(spec))
        console.log(`  loaded ${spec.table}`)
      }
      await execute(
        connection,
        `update ${SCHEMA}.IMPORT_RUN
         set STATUS = 'succeeded', FINISHED_AT = current_timestamp(), ROW_COUNTS = parse_json(?)
         where ID = ?`,
        [JSON.stringify(counts), runId],
      )
      await execute(connection, 'commit')
    } catch (err) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
      await execute(
        connection,
        `update ${SCHEMA}.IMPORT_RUN
         set STATUS = 'failed', FINISHED_AT = current_timestamp(), ERROR = ?
         where ID = ?`,
        [err.message, runId],
      )
      console.error(`\nImport run ${runId} FAILED and nothing was changed.\nDetails: ${err.message}`)
      process.exitCode = 1
      return
    }

    console.log(`\nImport run ${runId} succeeded.`)
  } finally {
    if (runId) {
      try {
        await execute(connection, `remove ${STAGE_PATH}/run_${runId}/`)
      } catch (err) {
        console.error('Failed to clean up staged files:', err.message)
      }
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    await destroy(connection)
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const { values: args } = parseArgs({
    options: {
      data: { type: 'string', default: DEFAULT_DATA_DIR },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const dataDir = path.resolve(args.data)

  if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
    console.error(`Can't find the data folder: ${dataDir}`)
    process.exit(1)
  }

  console.log(`Reading LARS files from ${dataDir}`)
  const { generatedOn, comment } = sourceInfo(dataDir)
  if (generatedOn) console.log(`Extract generated ${generatedOn}${comment ? ` (${comment})` : ''}`)
  console.log()

  const keys = {}
  const prepared = []
  const counts = {}
  let allOk = true
  const fmt = (n) => n.toLocaleString('en-GB')

  for (const spec of TABLES) {
    let result
    try {
      result = prepare(spec, dataDir, keys)
    } catch (err) {
      console.log(`  ${spec.table.padEnd(26)} PROBLEM: ${err.message}`)
      allOk = false
      continue
    }
    const { rows, stats, notes } = result
    prepared.push({ spec, rows })
    counts[spec.table] = stats
    const extra = []
    if (stats.skipped) extra.push(`${fmt(stats.skipped)} skipped`)
    if (stats.links_blanked) extra.push(`${fmt(stats.links_blanked)} unknown codes blanked`)
    if (stats.duplicates) extra.push(`${fmt(stats.duplicates)} duplicates merged`)
    console.log(
      `  ${spec.table.padEnd(26)} ${fmt(stats.loaded).padStart(8)} rows ready` +
        (extra.length ? `  (${extra.join(', ')})` : ''),
    )
    for (const note of notes) console.log(`      e.g. ${note}`)
  }

  if (!allOk) {
    console.error('\nStopped: fix the problems above, then run again.')
    process.exit(1)
  }

  if (args['dry-run']) {
    console.log('\nDry run finished. Nothing was written to the database.')
    return
  }

  await load(prepared, counts, dataDir)
}

main().catch((err) => {
  console.error('Import failed:', err.message)
  process.exit(1)
})
