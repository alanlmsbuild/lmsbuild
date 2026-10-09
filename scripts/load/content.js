// Loading a copy of the school leavers app's repo files into
// OPTIONS_DB.CONTENT (steps 1 and 2): the knowledge bank (content/) and the
// page data (data/). The repo is the source of truth; this copy is never
// edited in Snowflake. Files with uncommitted changes are refused, so every
// load is a commit. A part whose files are unchanged since its latest load
// is skipped. Each load is one transaction: its rows in every table, a
// SOURCE_FILE row per file (data/institutions/ counts as one), and a
// CONTENT_LOAD row; the *_CURRENT views then show it.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import YAML from 'yaml'
import { sha256File, sha256Text, writeLines } from './files.js'

export const SLA_REPO = process.env.SCHOOL_LEAVERS_REPO || path.join(process.env.HOME, 'school-leavers-app')

const yamlList = (file) => YAML.parse(fs.readFileSync(file, 'utf8'))
const mdEntry = (file) => {
  const text = fs.readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) throw new Error(`${file}: no front matter`)
  return { frontmatter: YAML.parse(m[1]), body: m[2] }
}

// Each table: where its rows come from, and how COPY picks the columns out
// of each JSON line ({ sf, k: {...}, item }).
const KNOWLEDGE_BANK = [
  { table: 'TOPIC', files: ['content/topics.yaml'], rows: (f) => yamlList(f).map((item) => ({ k: { id: item.id, step: item.step, name: item.name }, item })),
    cols: { ID: '$1:k:id::string', STEP: '$1:k:step::number', NAME: '$1:k:name::string', ITEM: '$1:item' } },
  { table: 'QUESTION', files: ['content/questions.yaml'], rows: (f) => yamlList(f).map((item) => ({ k: { id: item.id, number: item.number, question: item.question, topic: item.topic, state: item.state }, item })),
    cols: { ID: '$1:k:id::string', QUESTIONNUMBER: '$1:k:number::number', QUESTION: '$1:k:question::string', TOPIC: '$1:k:topic::string', STATE: '$1:k:state::string', ITEM: '$1:item' } },
  { table: 'GLOSSARY_TERM', files: ['content/glossary.yaml'], rows: (f) => yamlList(f).map((item) => ({ k: { id: item.id, term: item.term }, item })),
    cols: { ID: '$1:k:id::string', TERM: '$1:k:term::string', ITEM: '$1:item' } },
  { table: 'SYNONYM', files: ['content/synonyms.yaml'], rows: (f) => yamlList(f).map((item) => ({ k: { means: item.means, kind: item.kind }, item })),
    cols: { MEANS: '$1:k:means::string', KIND: '$1:k:kind::string', ITEM: '$1:item' } },
  { table: 'JOB', files: ['content/jobs.yaml'], rows: (f) => yamlList(f).map((item) => ({ k: { id: item.id, name: item.name }, item })),
    cols: { ID: '$1:k:id::string', NAME: '$1:k:name::string', ITEM: '$1:item' } },
  { table: 'ENTRY', files: (repo) => fs.readdirSync(path.join(repo, 'content/entries')).filter((n) => n.endsWith('.md')).sort().map((n) => `content/entries/${n}`),
    rows: (f) => { const { frontmatter: fm, body } = mdEntry(f); return [{ k: { id: fm.id, number: fm.number, question: fm.question, topic: fm.topic, status: fm.status }, fm, body }] },
    cols: { ID: '$1:k:id::string', QUESTIONNUMBER: '$1:k:number::number', QUESTION: '$1:k:question::string', TOPIC: '$1:k:topic::string', STATUS: '$1:k:status::string', FRONTMATTER: '$1:fm', BODY: '$1:body::string' } },
]

const institutionFiles = (repo) => fs.readdirSync(path.join(repo, 'data/institutions')).filter((n) => n.endsWith('.json')).sort().map((n) => `data/institutions/${n}`)
const PAGE_DATA = [
  { table: 'INSTITUTION_PAGE', folder: 'data/institutions', files: institutionFiles,
    rows: (f) => { const item = JSON.parse(fs.readFileSync(f, 'utf8')); return [{ k: { urn: String(item.urn), ukprn: item.ukprn == null ? null : String(item.ukprn), name: item.name, kind: item.kind }, item }] },
    cols: { URN: '$1:k:urn::string', UKPRN: '$1:k:ukprn::string', NAME: '$1:k:name::string', KIND: '$1:k:kind::string', ITEM: '$1:item' } },
  { table: 'PAGE_DATA_FILE', files: ['data/institutions.json', 'data/national.json', 'data/sources.json'],
    rows: (f) => [{ k: { filename: path.basename(f) }, item: JSON.parse(fs.readFileSync(f, 'utf8')) }],
    cols: { FILENAME: '$1:k:filename::string', ITEM: '$1:item' } },
  { table: 'IMPORT_LOG_LINE', files: ['data/import-log.jsonl'],
    rows: (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l, i) => ({ k: { line: i + 1 }, item: JSON.parse(l) })),
    cols: { LINENUMBER: '$1:k:line::number', ITEM: '$1:item' } },
]

export const PARTS = {
  'knowledge-bank': { dir: 'content', tables: KNOWLEDGE_BANK, licence: "Rarebit's own content", title: 'The knowledge bank' },
  'page-data': { dir: 'data', tables: PAGE_DATA, licence: 'Open Government Licence v3.0 (derived from official data; sources in data/sources.json)', title: 'Colleges and sixth forms page data' },
}

export async function loadContent(loader, part, repo = SLA_REPO) {
  const spec = PARTS[part]
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
  const dirty = git('status', '--porcelain', '--', spec.dir)
  if (dirty) throw new Error(`${spec.dir}/ has uncommitted changes in ${repo}: commit them first (the repo is the source of truth).\n${dirty}`)
  const commit = git('rev-parse', 'HEAD')

  // Every original, with its checksum; a folder (data/institutions) counts
  // as one, its checksum taken over its files' names and checksums.
  const tables = []
  const lines = []
  for (const t of spec.tables) {
    const files = typeof t.files === 'function' ? t.files(repo) : t.files
    const sums = []
    for (const f of files) {
      const s = await sha256File(path.join(repo, f))
      sums.push({ f, ...s })
      lines.push(`${f} ${s.sha256}`)
    }
    tables.push({ ...t, sums })
  }
  const setSha = sha256Text(lines.sort().join('\n'))
  const [latest] = await loader.q(`select SETSHA256 from OPTIONS_DB.CONTENT.CONTENT_LOAD where PART = ? order by LOADEDAT desc limit 1`, [part])
  if (latest?.SETSHA256 === setSha) {
    loader.log(`  ${part}: unchanged since its latest load (commit ${commit.slice(0, 7)}), skipped`)
    return { part, skipped: true, commit }
  }

  const contentLoadId = crypto.randomUUID()
  const dir = `content/${part}/${commit.slice(0, 12)}-${setSha.slice(0, 12)}`
  const results = []
  // Originals into the stage as they are, then one JSON-lines copy per table.
  const plans = []
  for (const t of tables) {
    const originals = t.folder
      ? [{ name: `${t.folder}/*.json (${t.sums.length} files)`, sha256: sha256Text(t.sums.map((s) => `${s.f} ${s.sha256}`).join('\n')), bytes: t.sums.reduce((n, s) => n + s.bytes, 0), files: t.sums }]
      : t.sums.map((s) => ({ name: s.f, sha256: s.sha256, bytes: s.bytes, files: [s] }))
    if (t.folder) await loader.put('OPTIONS_DB', path.join(repo, t.folder, '*.json'), `${dir}/${t.folder}`)
    else for (const s of t.sums) await loader.put('OPTIONS_DB', path.join(repo, s.f), `${dir}/${path.dirname(s.f)}`)

    const rows = []
    for (const o of originals) {
      o.id = crypto.randomUUID()
      o.rowsRead = 0
      for (const s of o.files) for (const r of t.rows(path.join(repo, s.f))) { rows.push({ sf: o.id, ...r }); o.rowsRead++ }
    }
    const copy = path.join(loader.tmp, `${part}-${t.table}.jsonl`)
    await writeLines(copy, rows.map((r) => JSON.stringify(r) + '\n'))
    const staged = await sha256File(copy)
    const stagedPath = await loader.put('OPTIONS_DB', copy, dir, { compress: true, overwrite: true })
    plans.push({ t, originals, stagedPath, staged })
  }

  await loader.q('begin')
  try {
    const rowsLoaded = {}
    for (const { t, originals, stagedPath, staged } of plans) {
      const names = Object.keys(t.cols)
      await loader.q(`copy into OPTIONS_DB.CONTENT.${t.table} (CONTENTLOADID, SOURCEFILEID, ${names.join(', ')})
        from (select '${contentLoadId}', $1:sf::string, ${names.map((n) => t.cols[n]).join(', ')} from @OPTIONS_DB.RAW.DOWNLOADS/${stagedPath})
        file_format = (format_name = 'OPTIONS_DB.RAW.JSON_LINES') on_error = abort_statement force = true`)
      const counts = Object.fromEntries((await loader.q(`select SOURCEFILEID, count(*) as N from OPTIONS_DB.CONTENT.${t.table} where CONTENTLOADID = ? group by 1`, [contentLoadId]))
        .map((r) => [r.SOURCEFILEID, Number(r.N)]))
      rowsLoaded[t.table] = 0
      for (const o of originals) {
        const loaded = counts[o.id] ?? 0
        if (loaded !== o.rowsRead) throw new Error(`${o.name}: read ${o.rowsRead} rows, loaded ${loaded}.`)
        rowsLoaded[t.table] += loaded
        const modified = new Date(Math.max(...o.files.map((s) => fs.statSync(path.join(repo, s.f)).mtimeMs)))
        await loader.q(`insert into OPTIONS_DB.RAW.SOURCE_FILE (SOURCEFILEID, SOURCE, TITLE, PUBLISHER, PAGEURL, LICENCE, ORIGINALNAME, ORIGINALSHA256,
            ORIGINALBYTES, ORIGINALMODIFIEDAT, ORIGINALSTAGED, MEMBER, COPYKIND, STAGEDPATH, STAGEDSHA256, STAGEDBYTES, TARGETTABLE, ROWSREAD, ROWSLOADED, JOBRUNID)
          select ?, ?, ?, 'Rarebit', ?, ?, ?, ?, ?, ?::timestamp_ltz, TRUE, NULL, 'converted', ?, ?, ?, ?, ?, ?, ?`,
        [o.id, part, spec.title, `school-leavers-app commit ${commit}`, spec.licence, o.name, o.sha256, o.bytes, modified.toISOString(),
          stagedPath, staged.sha256, staged.bytes, `OPTIONS_DB.CONTENT.${t.table}`, o.rowsRead, loaded, loader.jobRunId])
        results.push({ file: o.name, table: `CONTENT.${t.table}`, rowsRead: o.rowsRead, rowsLoaded: loaded })
      }
      loader.log(`  ${part}: ${t.table} ${rowsLoaded[t.table]} rows from ${originals.length} file(s)`)
    }
    await loader.q(`insert into OPTIONS_DB.CONTENT.CONTENT_LOAD (CONTENTLOADID, PART, GITCOMMIT, SETSHA256, FILECOUNT, ROWSLOADED, JOBRUNID)
      select ?, ?, ?, ?, ?, parse_json(?), ?`, [contentLoadId, part, commit, setSha, lines.length, JSON.stringify(rowsLoaded), loader.jobRunId])
    await loader.q('commit')
  } catch (err) {
    await loader.q('rollback')
    throw err
  }
  return { part, commit, results }
}
