// The data loaders' common steps (sql/load_00_setup.sql): runs logged in
// SHARED_DB.OPS.JOB_RUN, files put into a stage untouched, COPY INTO a RAW
// table, and one SOURCE_FILE row per file, the COPY and the SOURCE_FILE row
// in one transaction (a failed load leaves nothing, and is simply run
// again). Connects as DATA_LOAD_USER, never as the app.
//
// A file whose checksum is already in SOURCE_FILE for the same table (and
// sheet or zip entry) is skipped, so every load is safe to run again.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { connect, execute, destroy } from '../../server/db.js'
import { sha256File, csvRecords } from './files.js'

// Where each database keeps its load stage and SOURCE_FILE.
export const HOMES = {
  OPTIONS_DB: 'OPTIONS_DB.RAW',
  SHARED_DB: 'SHARED_DB.RAW',
  CAPTURE_DB: 'CAPTURE_DB.TEST_BASELINE',
}
// An open load run younger than this stops another starting (one older
// didn't finish: the laptop slept or was shut down).
const LOCK_HOURS = 3

const day = (d) => d.toISOString().slice(0, 10)
const quote = (name) => `"${name.replaceAll('"', '""')}"`

export class Loader {
  constructor(connection, log) {
    this.connection = connection
    this.log = log
    this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rarebit-load-'))
  }

  static async open(log = console.log) {
    return new Loader(await connect({ as: 'loader', timeoutMs: 30000 }), log)
  }

  async close() {
    fs.rmSync(this.tmp, { recursive: true, force: true })
    await destroy(this.connection)
  }

  q(sql, binds = []) {
    return execute(this.connection, sql, binds)
  }

  // ------------------------------------------------------------ job runs

  async startRun(job) {
    this.jobRunId = crypto.randomUUID()
    await this.q(`insert into SHARED_DB.OPS.JOB_RUN (JOBRUNID, JOB, TRIGGEREDBY, HOST, STARTEDAT)
      values (?, ?, 'manual', ?, current_timestamp())`, [this.jobRunId, job, os.hostname()])
    const open = await this.q(`select JOB from SHARED_DB.OPS.JOB_RUN
      where FINISHEDAT is null and JOB like 'load-%' and JOBRUNID <> ? and STARTEDAT > dateadd(hour, -?, current_timestamp())`,
    [this.jobRunId, LOCK_HOURS])
    if (open.length) {
      await this.finishRun('refused', `Another load (${open[0].JOB}) is running.`)
      throw new Error(`Another load (${open[0].JOB}) is running: not started.`)
    }
    this.log(`${job}: started (JOB_RUN ${this.jobRunId})`)
    return this.jobRunId
  }

  async finishRun(outcome, error = null, summary = null) {
    await this.q(`update SHARED_DB.OPS.JOB_RUN set FINISHEDAT = current_timestamp(), OUTCOME = ?, ERROR = ?, SUMMARY = parse_json(?)
      where JOBRUNID = ?`, [outcome, error ? String(error).slice(0, 1000) : null, JSON.stringify(summary), this.jobRunId])
  }

  // ------------------------------------------------------------ pieces

  async columns(table) {
    const [db, schema, name] = table.split('.')
    const rows = await this.q(`select COLUMN_NAME from ${db}.INFORMATION_SCHEMA.COLUMNS
      where TABLE_SCHEMA = ? and TABLE_NAME = ? order by ORDINAL_POSITION`, [schema, name])
    if (!rows.length) throw new Error(`${table} doesn't exist, or DATA_LOAD_ROLE can't see it.`)
    return rows.map((r) => r.COLUMN_NAME)
  }

  async alreadyLoaded(home, { source, sha256, member, table }) {
    const rows = await this.q(`select LOADEDAT from ${HOMES[home]}.SOURCE_FILE
      where SOURCE = ? and ORIGINALSHA256 = ? and coalesce(MEMBER, '') = ? and TARGETTABLE = ?`, [source, sha256, member ?? '', table])
    return rows.length > 0
  }

  // PUTs a local file into the home's stage under dir; returns its path in
  // the stage. compress: gzip it on the way (the copies COPY reads);
  // originals go up as they are.
  async put(home, file, dir, { compress = false, overwrite = false } = {}) {
    if (file.includes("'")) throw new Error(`Can't PUT a path with a quote in it: ${file}`)
    // (file may be a wildcard: a folder's files in one PUT.)
    const rows = await this.q(`PUT 'file://${file}' @${HOMES[home]}.DOWNLOADS/${dir}/ AUTO_COMPRESS = ${compress ? 'TRUE' : 'FALSE'} OVERWRITE = ${overwrite ? 'TRUE' : 'FALSE'} PARALLEL = 8`)
    const bad = rows.find((r) => !['UPLOADED', 'SKIPPED'].includes(r.status))
    if (!rows.length || bad) throw new Error(`PUT ${file}: ${bad ? `${bad.status} ${bad.message ?? ''}` : 'no files'}`)
    return `${dir}/${rows[0].target}`
  }

  // Header and row widths of a CSV against the table's columns; returns the
  // data rows. Stops at the first difference.
  async checkCsv(file, columns, encoding) {
    let header = null
    let rows = 0
    for await (const record of csvRecords(file, encoding)) {
      if (!header) {
        header = record
        if (header.join('\u0001') !== columns.join('\u0001')) {
          const i = header.findIndex((h, n) => h !== columns[n])
          throw new Error(`${path.basename(file)}: the header doesn't match the table at column ${i + 1} ("${header[i]}" in the file, "${columns[i]}" in the table; ${header.length} columns against ${columns.length}).`)
        }
        continue
      }
      if (record.length !== columns.length) throw new Error(`${path.basename(file)}: row ${rows + 1} has ${record.length} fields, not ${columns.length}.`)
      rows++
    }
    return rows
  }

  // ------------------------------------------------------------ one file

  // Loads one CSV into a RAW table (see the file's head). spec:
  //   home, source, title, publisher, page, licence, table, format
  //   file      the download on disk (never changed)
  //   member    the zip entry or sheet the copy is made from, if any
  //   kind      as-downloaded, extracted, converted or columns-removed
  //   make      (out) => { removed }: writes the copy COPY reads (not for
  //             as-downloaded)
  //   stageOriginal  false: the original never goes into Snowflake (GIAS)
  //   encoding  utf8 (default) or latin1 (Windows-1252 files, byte for byte)
  async loadCsv(spec) {
    const { home, source, table, file, member = null, kind } = spec
    const label = `${path.basename(file)}${member ? ` [${member}]` : ''} -> ${table}`
    const original = await sha256File(file)
    if (await this.alreadyLoaded(home, { source, sha256: original.sha256, member, table })) {
      this.log(`  ${label}: already loaded, skipped`)
      return { file: path.basename(file), member, table, skipped: true }
    }
    const modified = fs.statSync(file).mtime
    const dir = `${source}/${day(modified)}-${original.sha256.slice(0, 12)}`
    const columns = (await this.columns(table)).filter((c) => c !== 'SOURCEFILEID' && c !== 'FILEROWNUMBER')

    let loadable = file
    let removed = null
    if (kind !== 'as-downloaded') {
      loadable = path.join(this.tmp, `${source}-${(member ?? path.basename(file)).replace(/[^A-Za-z0-9_.-]+/g, '_')}.csv`.replace(/\.csv\.csv$/, '.csv'))
      ;({ removed = null } = (await spec.make(loadable)) ?? {})
    }
    const rowsRead = await this.checkCsv(loadable, columns, spec.encoding)
    const staged = loadable === file ? original : await sha256File(loadable)

    const stageOriginal = spec.stageOriginal !== false
    if (stageOriginal) await this.put(home, file, dir)
    const stagedPath = loadable === file ? `${dir}/${path.basename(file)}` : await this.put(home, loadable, dir, { compress: true, overwrite: true })

    const sourceFileId = crypto.randomUUID()
    const select = columns.map((_, i) => `$${i + 1}`).join(', ')
    await this.q('begin')
    try {
      const result = await this.q(`copy into ${table} (SOURCEFILEID, FILEROWNUMBER, ${columns.map(quote).join(', ')})
        from (select '${sourceFileId}', METADATA$FILE_ROW_NUMBER, ${select} from @${HOMES[home]}.DOWNLOADS/${stagedPath})
        file_format = (format_name = '${spec.format}') on_error = abort_statement force = true`)
      const rowsLoaded = result.reduce((n, r) => n + Number(r.rows_loaded ?? 0), 0)
      if (rowsLoaded !== rowsRead || result.some((r) => r.status !== 'LOADED')) {
        throw new Error(`${label}: read ${rowsRead} rows, COPY loaded ${rowsLoaded} (${result.map((r) => r.status).join(', ')}).`)
      }
      await this.q(`insert into ${HOMES[home]}.SOURCE_FILE (SOURCEFILEID, SOURCE, TITLE, PUBLISHER, PAGEURL, LICENCE, ORIGINALNAME, ORIGINALSHA256,
          ORIGINALBYTES, ORIGINALMODIFIEDAT, ORIGINALSTAGED, MEMBER, COPYKIND, REMOVEDCOLUMNS, STAGEDPATH, STAGEDSHA256, STAGEDBYTES, TARGETTABLE,
          ROWSREAD, ROWSLOADED, JOBRUNID)
        select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamp_ltz, ?, ?, ?, parse_json(?), ?, ?, ?, ?, ?, ?, ?`,
      [sourceFileId, source, spec.title ?? null, spec.publisher ?? null, spec.page ?? null, spec.licence, path.basename(file), original.sha256,
        original.bytes, modified.toISOString(), stageOriginal, member, kind, JSON.stringify(removed), stagedPath, staged.sha256, staged.bytes, table,
        rowsRead, rowsLoaded, this.jobRunId])
      await this.q('commit')
      this.log(`  ${label}: ${rowsLoaded} of ${rowsRead} rows loaded`)
      return { file: path.basename(file), member, table, rowsRead, rowsLoaded, sourceFileId }
    } catch (err) {
      await this.q('rollback')
      throw err
    }
  }
}
