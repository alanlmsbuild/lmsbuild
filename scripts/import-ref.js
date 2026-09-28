// import-ref.js - load reference data into the CAPTURE_DB.REF schema:
//
//   soc        ONS SOC 2020 coding index (job titles -> SOC 2020 and extended
//              SOC 2020 codes) and the SOC 2020 structure (unit group titles)
//   interests  our interest words (scripts/ref/interest-words.csv), each a job
//              title and SOC 2020 unit group that must exist in the ONS index
//   sic        Companies House condensed SIC 2007 list, and the ONS SIC 2007 to
//              SIC 2026 correspondence table
//   postcodes  ONS Postcode Directory: every UK postcode, live and terminated,
//              with its latitude and longitude, country, region and local
//              authority, so learner postcodes never go to an outside service
//
// Usage:
//   npm run import:ref                          everything
//   npm run import:ref -- --only soc,interests  some parts
//   npm run import:ref -- --dry-run             download and check, write nothing
//   npm run import:ref -- --refresh             download the source files again
//
// Source files are downloaded from the official URLs below into data/ref/
// (not committed) and reused on later runs. Each run records the file's
// name, URL, version and SHA-256 in REF.IMPORT_RUN.
//
// Each part replaces its tables' contents in one transaction (these are
// published snapshots, so rows dropped from a new edition must go too). A
// failed run changes nothing. Needs the REF schema (sql/ref_01_schema.sql)
// and the unzip command.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import readline from 'node:readline'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data', 'ref')
const INTEREST_WORDS_FILE = path.join(__dirname, 'ref', 'interest-words.csv')
const STAGE_PATH = '@~/ref_import'

const SOURCES = {
  soc: {
    file: 'soc2020volume2thecodingindexzip20260827v2.zip',
    url: 'https://www.ons.gov.uk/file?uri=/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions/soc2020volume2thecodingindexzip20260827v2.zip',
    version: 'SOC 2020 Volume 2 coding index, Version 14 (file of 27 August 2026, v2)',
  },
  sicCh: {
    file: 'SIC07_CH_condensed_list_en.csv',
    url: 'https://assets.publishing.service.gov.uk/media/5a7f8639e5274a2e87db65e1/SIC07_CH_condensed_list_en.csv',
    version: 'Companies House condensed SIC 2007 list',
  },
  sicCorrespondence: {
    file: 'uksic2026correspondencetablesic2007tosic202603aug2026.xlsx',
    url: 'https://www.ons.gov.uk/file?uri=/methodology/classificationsandstandards/ukstandardindustrialclassificationofeconomicactivities/uksic2026/uksic2026correspondencetablesic2007tosic202603aug2026.xlsx',
    version: 'UK SIC 2026 correspondence table, SIC 2007 to SIC 2026 (3 August 2026)',
  },
  postcodes: {
    file: 'ONSPD_AUG_2026.zip',
    url: 'https://www.arcgis.com/sharing/rest/content/items/9e5a92a3cfb14dc7ad43d6ea7a7b8c7f/data',
    version: 'ONS Postcode Directory (August 2026)',
    member: 'Data/ONSPD_AUG_2026_UK.csv',
  },
}

// ---------------------------------------------------------------- tables

const TABLES = {
  SOC2020_UNIT_GROUP: {
    part: 'soc',
    cols: [['SOC2020', 'char(4) not null'], ['TITLE', 'varchar not null'], ['MINOR_GROUP', 'char(3) not null'],
      ['MINOR_GROUP_TITLE', 'varchar'], ['SUB_MAJOR_GROUP', 'char(2) not null'], ['SUB_MAJOR_GROUP_TITLE', 'varchar'],
      ['MAJOR_GROUP', 'char(1) not null'], ['MAJOR_GROUP_TITLE', 'varchar']],
    pk: ['SOC2020'],
    comment: 'SOC 2020 unit groups with their minor, sub-major and major groups (ONS SOC 2020 structure).',
  },
  SOC2020_SUB_UNIT_GROUP: {
    part: 'soc',
    cols: [['SOC2020_EXT', 'varchar(7) not null'], ['SOC2020', 'char(4) not null'], ['TITLE', 'varchar not null']],
    pk: ['SOC2020_EXT'],
    comment: 'Extended SOC 2020 sub-unit groups (e.g. 3432/01), as used by Skills England.',
  },
  SOC2020_INDEX: {
    part: 'soc',
    cols: [['UNIQUE_ID', 'varchar not null'], ['RECNO', 'number(10,0)'], ['DEFAULT_ENTRY', 'varchar(2)'],
      ['SOC2020', 'char(4) not null'], ['SOC2020_EXT', 'varchar(7)'], ['SOC2010', 'varchar(4)'],
      ['JOB_TITLE', 'varchar not null'], ['INDEX_TITLE', 'varchar'], ['ADDITIONAL_QUALIFIER', 'varchar'],
      ['INDUSTRY_QUALIFIER', 'varchar'], ['VERSION_ADDED', 'varchar']],
    pk: ['UNIQUE_ID'],
    comment: 'ONS SOC 2020 coding index: one row per job title (with its qualifiers), coded to SOC 2020 and extended SOC 2020.',
  },
  INTEREST_WORD: {
    part: 'interests',
    cols: [['WORD', 'varchar not null'], ['JOB_TITLE', 'varchar not null'], ['SOC2020', 'char(4) not null']],
    pk: ['WORD', 'JOB_TITLE'],
    comment: 'Our own everyday interest words, each linked to job titles and SOC 2020 unit groups in the ONS index.',
  },
  SIC2007: {
    part: 'sic',
    cols: [['SIC2007', 'char(5) not null'], ['DESCRIPTION', 'varchar not null'], ['SECTION', 'char(1) not null'],
      ['DIVISION', 'char(2) not null']],
    pk: ['SIC2007'],
    comment: 'SIC 2007 codes on the Companies House condensed list (the codes on the register).',
  },
  SIC2007_TO_SIC2026: {
    part: 'sic',
    cols: [['SIC2007', 'varchar(10) not null'], ['SIC2007_LEVEL', 'varchar'], ['SIC2007_HEADING', 'varchar'],
      ['SIC2026', 'varchar(10) not null'], ['SIC2026_HEADING', 'varchar'], ['CORRESPONDENCE', 'varchar']],
    pk: ['SIC2007', 'SIC2026'],
    comment: 'ONS correspondence table from SIC 2007 to UK SIC 2026 (codes like 01.11 for a class or 01.62/1 for a UK subclass).',
  },
  POSTCODE: {
    part: 'postcodes',
    cols: [['POSTCODE', 'varchar(8) not null'], ['POSTCODE_KEY', 'varchar(7) not null'], ['INTRODUCED', 'char(6)'],
      ['TERMINATED', 'char(6)'], ['COUNTRY', 'char(9)'], ['REGION', 'char(9)'], ['LOCAL_AUTHORITY', 'char(9)'],
      ['LATITUDE', 'number(9,6)'], ['LONGITUDE', 'number(9,6)'], ['GRID_QUALITY', 'char(1)']],
    pk: ['POSTCODE_KEY'],
    comment: 'ONS Postcode Directory: every UK postcode, live and terminated (TERMINATED is set), with its location. POSTCODE_KEY is the postcode in capitals without spaces.',
  },
}

// SIC 2007 sections by division (the first two digits).
const SECTIONS = [['A', 1, 3], ['B', 5, 9], ['C', 10, 33], ['D', 35, 35], ['E', 36, 39], ['F', 41, 43], ['G', 45, 47],
  ['H', 49, 53], ['I', 55, 56], ['J', 58, 63], ['K', 64, 66], ['L', 68, 68], ['M', 69, 75], ['N', 77, 82], ['O', 84, 84],
  ['P', 85, 85], ['Q', 86, 88], ['R', 90, 93], ['S', 94, 96], ['T', 97, 98], ['U', 99, 99]]
const sectionFor = (division) => SECTIONS.find(([, from, to]) => division >= from && division <= to)?.[0] ?? null

// ---------------------------------------------------------------- files

async function download(source, refresh) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const file = path.join(DATA_DIR, source.file)
  if (!refresh && fs.existsSync(file) && fs.statSync(file).size > 0) return file
  console.log(`  downloading ${source.file}...`)
  const res = await fetch(source.url)
  if (!res.ok) throw new Error(`Couldn't download ${source.url}: HTTP ${res.status}`)
  const tmp = `${file}.part`
  await fs.promises.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
  fs.renameSync(tmp, file)
  return file
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject)
  })
}

// One file out of a zip, as text (latin1: the ONS SOC files aren't UTF-8).
function unzipText(zip, member, encoding = 'latin1') {
  const out = spawnSync('unzip', ['-p', zip, member], { maxBuffer: 256 * 1024 * 1024 })
  if (out.status !== 0) throw new Error(`unzip failed for ${member}: ${out.stderr.toString()}`)
  return out.stdout.toString(encoding)
}

// A small CSV parser: quoted fields, doubled quotes, commas and newlines
// inside quotes. Returns an array of rows (arrays of strings).
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}
const clean = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())

// ---------------------------------------------------------------- parts

function readSoc(zip) {
  const index = parseCsv(unzipText(zip, 'SOC2020_volume2_thecodingindexv2.csv'))
  const header = index[0]
  const col = (name) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`SOC coding index has no ${name} column`)
    return i
  }
  const c = {
    id: col('UNIQUE ID'), recno: col('RECNO'), d: col('D'), soc2010: col('SOC_2010'), soc2020: col('SOC_2020'),
    ext: col('SOC_2020_ext'), indexocc: col('INDEXOCC'), add: col('ADD'), ind: col('IND'), versno: col('VERSNO'),
    extTitle: col('SOC2020_ext_SUG_title'), natural: col('INDEXOCC_-_natural_word_order'),
  }
  const entries = []
  const subUnitGroups = new Map()
  let references = 0
  for (const r of index.slice(1)) {
    if (!clean(r[c.id])) continue
    const soc2020 = clean(r[c.soc2020])
    // Rows coded }}}} point to another index word, not to an occupation.
    if (!soc2020 || !/^\d{4}$/.test(soc2020)) { references++; continue }
    const ext = clean(r[c.ext])
    entries.push({
      UNIQUE_ID: clean(r[c.id]), RECNO: clean(r[c.recno]) ? Number(r[c.recno]) : null, DEFAULT_ENTRY: clean(r[c.d]),
      SOC2020: soc2020, SOC2020_EXT: ext && /^\d{4}\/\d{2}$/.test(ext) ? ext : null,
      SOC2010: /^\d{4}$/.test(clean(r[c.soc2010]) ?? '') ? clean(r[c.soc2010]) : null,
      JOB_TITLE: clean(r[c.natural]) ?? clean(r[c.indexocc]), INDEX_TITLE: clean(r[c.indexocc]),
      ADDITIONAL_QUALIFIER: clean(r[c.add]), INDUSTRY_QUALIFIER: clean(r[c.ind]), VERSION_ADDED: clean(r[c.versno]),
    })
    if (ext && /^\d{4}\/\d{2}$/.test(ext) && clean(r[c.extTitle])) {
      subUnitGroups.set(ext, { SOC2020_EXT: ext, SOC2020: soc2020, TITLE: clean(r[c.extTitle]) })
    }
  }

  // The structure file lists major, sub-major, minor and unit groups in order.
  const structure = parseCsv(unzipText(zip, 'SOC2020_framework.csv'))
  const unitGroups = []
  let major, subMajor, minor
  for (const r of structure.slice(1)) {
    const [, maj, sub, min, unit, title] = r.map(clean)
    if (maj) major = { code: maj, title }
    else if (sub) subMajor = { code: sub, title }
    else if (min) minor = { code: min, title }
    else if (unit && /^\d{4}$/.test(unit)) {
      unitGroups.push({
        SOC2020: unit, TITLE: title, MINOR_GROUP: minor.code, MINOR_GROUP_TITLE: minor.title,
        SUB_MAJOR_GROUP: subMajor.code, SUB_MAJOR_GROUP_TITLE: subMajor.title, MAJOR_GROUP: major.code, MAJOR_GROUP_TITLE: major.title,
      })
    }
  }
  const unitCodes = new Set(unitGroups.map((u) => u.SOC2020))
  const problems = []
  const unknown = [...new Set(entries.filter((e) => !unitCodes.has(e.SOC2020)).map((e) => e.SOC2020))]
  if (unknown.length) problems.push(`index entries coded to unit groups missing from the structure: ${unknown.join(', ')}`)
  if (new Set(entries.map((e) => e.UNIQUE_ID)).size !== entries.length) problems.push('duplicate UNIQUE ID in the coding index')
  if (entries.length < 25000) problems.push(`only ${entries.length} index entries (expected over 25,000)`)
  return {
    tables: { SOC2020_UNIT_GROUP: unitGroups, SOC2020_SUB_UNIT_GROUP: [...subUnitGroups.values()], SOC2020_INDEX: entries },
    notes: [`${references} index rows that only refer to another word left out`],
    problems,
  }
}

function readInterests(socZip) {
  const { tables } = readSoc(socZip)
  const pairs = new Set(tables.SOC2020_INDEX.map((e) => `${e.JOB_TITLE.toLowerCase()}|${e.SOC2020}`))
  const rows = parseCsv(fs.readFileSync(INTEREST_WORDS_FILE, 'utf8')).filter((r) => r.some((v) => clean(v)))
  const header = rows[0].map(clean)
  if (header.join(',') !== 'WORD,JOB_TITLE,SOC2020') throw new Error('interest-words.csv must have the columns WORD,JOB_TITLE,SOC2020')
  const words = rows.slice(1).map(([word, title, soc]) => ({ WORD: clean(word).toLowerCase(), JOB_TITLE: clean(title), SOC2020: clean(soc) }))
  const problems = words
    .filter((w) => !pairs.has(`${w.JOB_TITLE.toLowerCase()}|${w.SOC2020}`))
    .map((w) => `"${w.WORD}": "${w.JOB_TITLE}" is not in the ONS index under SOC 2020 ${w.SOC2020}`)
  const keys = words.map((w) => `${w.WORD}|${w.JOB_TITLE.toLowerCase()}`)
  if (new Set(keys).size !== keys.length) problems.push('the same word and job title appear twice')
  return { tables: { INTEREST_WORD: words }, notes: [`${new Set(words.map((w) => w.WORD)).size} words`], problems }
}

async function readSic(chFile, correspondenceFile) {
  const rows = parseCsv(fs.readFileSync(chFile, 'utf8').replace(/^﻿/, ''))
  const codes = []
  const problems = []
  for (const [code, description] of rows.slice(1)) {
    if (!clean(code)) continue
    if (!/^\d{5}$/.test(clean(code))) { problems.push(`SIC code ${code} isn't 5 digits`); continue }
    const division = clean(code).slice(0, 2)
    codes.push({ SIC2007: clean(code), DESCRIPTION: clean(description), SECTION: sectionFor(Number(division)), DIVISION: division })
  }
  if (codes.some((c) => !c.SECTION)) problems.push('a SIC code has no section')

  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(correspondenceFile)
  const sheet = workbook.getWorksheet('SIC 2007 to SIC 2026')
  if (!sheet) throw new Error('the correspondence workbook has no "SIC 2007 to SIC 2026" sheet')
  const expected = ['SIC 2007 code', 'SIC 2007 level', 'SIC 2007 heading', 'SIC 2026 code', 'SIC 2026 heading', 'Correspondence type']
  if (sheet.getRow(1).values.slice(1).join('|') !== expected.join('|')) throw new Error('the correspondence sheet has unexpected columns')
  const correspondence = []
  sheet.eachRow((row, i) => {
    if (i === 1) return
    const [from, level, fromHeading, to, toHeading, type] = row.values.slice(1).map((v) => clean(typeof v === 'object' && v?.richText ? v.richText.map((t) => t.text).join('') : v))
    if (!from || !to) return
    correspondence.push({ SIC2007: from, SIC2007_LEVEL: level, SIC2007_HEADING: fromHeading, SIC2026: to, SIC2026_HEADING: toHeading, CORRESPONDENCE: type })
  })
  const keys = correspondence.map((r) => `${r.SIC2007}|${r.SIC2026}`)
  if (new Set(keys).size !== keys.length) problems.push('duplicate SIC 2007 -> SIC 2026 pairs in the correspondence table')
  return { tables: { SIC2007: codes, SIC2007_TO_SIC2026: correspondence }, notes: [], problems }
}

// The postcode directory is 1.5 GB, so it's streamed straight from the zip
// into a gzipped staging file rather than held in memory.
async function readPostcodes(zip, outDir) {
  const out = path.join(outDir, 'POSTCODE.csv.gz')
  const gzip = zlib.createGzip()
  const writer = fs.createWriteStream(out)
  gzip.pipe(writer)
  const unzip = spawn('unzip', ['-p', zip, SOURCES.postcodes.member])
  const lines = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity })
  let header
  let count = 0, live = 0, withLocation = 0
  const keys = new Set()
  const problems = []
  for await (const line of lines) {
    const r = parseCsv(line)[0]
    if (!header) { header = r; continue }
    const get = (name) => clean(r[header.indexOf(name)])
    const postcode = get('pcds')
    if (!postcode) continue
    const key = postcode.replace(/\s+/g, '').toUpperCase()
    if (keys.has(key)) { problems.push(`duplicate postcode ${postcode}`); continue }
    keys.add(key)
    const grid = get('gridind')
    const lat = Number(get('lat'))
    const long = Number(get('long'))
    // Postcodes without a grid reference have 99.999999 as their latitude.
    const located = grid !== '9' && lat > 49 && lat < 61 && long > -9 && long < 2
    const doterm = get('doterm')
    const row = [postcode, key, get('dointr'), doterm, get('ctry26cd'), get('rgn26cd'), get('lad26cd'),
      located ? lat : null, located ? long : null, grid]
    gzip.write(row.map(csvValue).join(',') + '\n')
    count++
    if (!doterm) live++
    if (located) withLocation++
  }
  gzip.end()
  await new Promise((resolve) => writer.on('finish', resolve))
  const needed = ['pcds', 'dointr', 'doterm', 'ctry26cd', 'rgn26cd', 'lad26cd', 'lat', 'long', 'gridind']
  const missing = needed.filter((n) => !header?.includes(n))
  if (missing.length) problems.push(`the postcode directory has no ${missing.join(', ')} column`)
  if (count < 2000000) problems.push(`only ${count} postcodes (expected over 2 million)`)
  return {
    staged: { POSTCODE: { file: out, rows: count } },
    notes: [`${live.toLocaleString('en-GB')} live, ${(count - live).toLocaleString('en-GB')} terminated, ${withLocation.toLocaleString('en-GB')} with a location`],
    problems: problems.slice(0, 20),
    count,
  }
}

// ---------------------------------------------------------------- loading

function csvValue(v) {
  if (v === null || v === undefined) return '\\N'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `"${String(v).replaceAll('"', '""')}"`
}

function writeStaged(dir, name, rows) {
  const cols = TABLES[name].cols.map(([c]) => c)
  const file = path.join(dir, `${name}.csv.gz`)
  fs.writeFileSync(file, zlib.gzipSync(rows.map((row) => cols.map((c) => csvValue(row[c])).join(',')).join('\n') + '\n'))
  return { file, rows: rows.length }
}

const FILE_FORMAT = `type = csv field_optionally_enclosed_by = '"' null_if = ('\\\\N') encoding = 'UTF8' compression = gzip`

async function load({ schema, temporary, parts, results, sources }) {
  const { connect, execute, destroy } = await import('../server/db.js')
  const connection = await connect()
  const run = (sql, binds) => execute(connection, sql, binds)
  const table = (name) => `${schema}.${name}`
  const create = temporary ? 'create temporary table if not exists' : 'create table if not exists'
  let runId
  try {
    await run(`${create} ${table('IMPORT_RUN')} (
      ID number(38,0) not null, PARTS varchar not null, SOURCES variant, STARTED_AT timestamp_ltz not null default current_timestamp(),
      FINISHED_AT timestamp_ltz, STATUS varchar not null default 'running', ROW_COUNTS variant, ERROR varchar, primary key (ID))`)
    for (const [name, spec] of Object.entries(TABLES)) {
      if (!parts.includes(spec.part)) continue
      await run(`${create} ${table(name)} (${spec.cols.map(([c, t]) => `${c} ${t}`).join(', ')},
        LAST_IMPORT_RUN_ID number(38,0) not null, primary key (${spec.pk.join(', ')}))
        comment = '${spec.comment.replaceAll("'", "''")}'`)
    }
    const [{ NEXT_ID }] = await run(`select coalesce(max(ID), 0) + 1 as NEXT_ID from ${table('IMPORT_RUN')}`)
    runId = Number(NEXT_ID)
    await run(`insert into ${table('IMPORT_RUN')} (ID, PARTS, SOURCES) select ?, ?, parse_json(?)`, [runId, parts.join(','), JSON.stringify(sources)])
    console.log(`\nImport run ${runId} started.`)

    const staged = Object.assign({}, ...results.map((r) => r.staged))
    await run(`put 'file://${path.dirname(Object.values(staged)[0].file)}/*.csv.gz' ${STAGE_PATH}/run_${runId}/ auto_compress = false overwrite = true`)
    for (const [name, { rows }] of Object.entries(staged)) {
      const cols = [...TABLES[name].cols.map(([c]) => c), 'LAST_IMPORT_RUN_ID']
      await run(`create or replace temporary table ${table(`STG_${name}`)} like ${table(name)}`)
      const loaded = await run(`copy into ${table(`STG_${name}`)} (${cols.join(', ')})
        from (select ${TABLES[name].cols.map((_, i) => `$${i + 1}`).join(', ')}, ${runId} from ${STAGE_PATH}/run_${runId}/${name}.csv.gz)
        file_format = (${FILE_FORMAT}) on_error = abort_statement force = true`)
      const n = loaded.reduce((sum, r) => sum + Number(r.rows_loaded ?? r.ROWS_LOADED ?? 0), 0)
      if (n !== rows) throw new Error(`${name}: staged ${n} rows but expected ${rows}`)
    }

    await run('begin')
    const counts = {}
    for (const name of Object.keys(staged)) {
      await run(`delete from ${table(name)}`)
      await run(`insert into ${table(name)} select * from ${table(`STG_${name}`)}`)
      counts[name] = staged[name].rows
      console.log(`  ${name}: ${staged[name].rows.toLocaleString('en-GB')} rows`)
    }
    await run(`update ${table('IMPORT_RUN')} set STATUS = 'succeeded', FINISHED_AT = current_timestamp(), ROW_COUNTS = parse_json(?) where ID = ?`,
      [JSON.stringify(counts), runId])
    await run('commit')
    console.log(`\nImport run ${runId} succeeded.`)
    return { runId, run, connection }
  } catch (err) {
    try { await run('rollback') } catch { /* nothing to roll back */ }
    if (runId) {
      await run(`update ${table('IMPORT_RUN')} set STATUS = 'failed', FINISHED_AT = current_timestamp(), ERROR = ? where ID = ?`, [err.message, runId])
    }
    console.error(`\nImport ${runId ? `run ${runId} ` : ''}FAILED and nothing was changed.\nDetails: ${err.message}`)
    process.exitCode = 1
    return { runId, run, connection }
  } finally {
    if (runId) {
      try { await run(`remove ${STAGE_PATH}/run_${runId}/`) } catch (err) { console.error('Failed to clean up staged files:', err.message) }
    }
    // Temporary tables only last as long as the connection, so a test run
    // keeps it open and closes it itself.
    if (!temporary) await destroy(connection)
  }
}

// ---------------------------------------------------------------- main

export async function main(argv = process.argv.slice(2)) {
  const { values: args } = parseArgs({
    args: argv,
    options: {
      only: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      refresh: { type: 'boolean', default: false },
      // For testing: load into session-only temporary tables in this schema.
      schema: { type: 'string', default: 'REF' },
      temporary: { type: 'boolean', default: false },
    },
  })
  const all = ['soc', 'interests', 'sic', 'postcodes']
  const parts = args.only ? args.only.split(',').map((p) => p.trim()) : all
  const unknownParts = parts.filter((p) => !all.includes(p))
  if (unknownParts.length) throw new Error(`Unknown part(s): ${unknownParts.join(', ')}. Use ${all.join(', ')}.`)
  if (spawnSync('unzip', ['-v']).status !== 0) throw new Error('This import needs the unzip command.')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-import-'))
  const sources = {}
  const results = []
  let ok = true
  try {
    const fetchSource = async (key) => {
      const file = await download(SOURCES[key], args.refresh)
      sources[key] = { file: SOURCES[key].file, url: SOURCES[key].url, version: SOURCES[key].version, sha256: await sha256(file) }
      return file
    }
    console.log('Reading reference data')
    for (const part of parts) {
      let result
      if (part === 'soc') result = readSoc(await fetchSource('soc'))
      if (part === 'interests') result = readInterests(await fetchSource('soc'))
      if (part === 'sic') result = await readSic(await fetchSource('sicCh'), await fetchSource('sicCorrespondence'))
      if (part === 'postcodes') result = await readPostcodes(await fetchSource('postcodes'), tmpDir)
      if (result.tables) {
        result.staged = Object.fromEntries(Object.entries(result.tables).map(([name, rows]) => [name, writeStaged(tmpDir, name, rows)]))
      }
      const counts = Object.entries(result.staged).map(([name, s]) => `${name} ${s.rows.toLocaleString('en-GB')}`).join(', ')
      console.log(`  ${part}: ${counts}${result.notes.length ? ` (${result.notes.join('; ')})` : ''}`)
      for (const p of result.problems) console.log(`    PROBLEM: ${p}`)
      if (result.problems.length) ok = false
      results.push(result)
    }
    for (const [key, s] of Object.entries(sources)) console.log(`  source ${key}: ${s.version}, sha256 ${s.sha256}`)
    if (!ok) {
      console.error('\nNothing was loaded: fix the problems above first.')
      process.exitCode = 1
      return { results }
    }
    if (args['dry-run']) {
      console.log('\nDry run: everything checked, nothing written.')
      return { results }
    }
    const loaded = await load({ schema: args.schema.toUpperCase(), temporary: args.temporary, parts, results, sources })
    return { results, ...loaded }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
