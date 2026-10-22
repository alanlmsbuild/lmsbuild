// The UK Foreign Office travel advice (decision 57), from the GOV.UK Content
// API: the index https://www.gov.uk/api/content/foreign-travel-advice (the
// countries under links.children) and each country's page. No key.
// Crown copyright, published under the Open Government Licence v3.0.
//
// Fetched once a day by the official-travel-advice job (fetch-official.js,
// kind advice), and loaded by load:data step 51 into
// SHARED_DB.RAW.FCDO_TRAVEL_ADVICE (a country's page, as published, only
// when it changed) and FCDO_TRAVEL_ADVICE_INDEX (the index's list of
// countries, when that list or any date in it changed).
//
// What is kept: every page as the API gives it, except that email addresses
// and phone numbers in its text are taken out (many are honorary consuls,
// who are individuals). The map image and the PDF are kept as links only:
// nothing is downloaded until FCDO confirms their licence in writing
// (docs/licences/fcdo-travel-advice-2026-10/README.md).
//
// Only what changed: the index says when each page was last made public
// (public_updated_at), so a run asks for the index (one request, with the
// ETag from the last run) and fetches only the countries that are new or
// have a later date. The last index is in <dir>/state.json. A page's own
// updated_at is no use for this: every page is republished weekly.
//
// The API's limit is 10 requests a second per client; this uses 4.
import fs from 'node:fs'
import path from 'node:path'

export const ADVICE_INDEX_URL = 'https://www.gov.uk/api/content/foreign-travel-advice'
export const ADVICE_DIR = 'fcdo-travel-advice'
export const ADVICE_PAUSE_MS = 250
// A shrunken index is not saved: the whole list falling by more than this,
// or under the floor, means something is wrong (a real change: run once with
// TRAVEL_ADVICE_ACCEPT_CHANGES=1).
export const ADVICE_SHRINK_LIMIT = 0.05
export const ADVICE_MIN_COUNTRIES = 100

export const EMAIL_TEXT = '[email address removed]'
export const PHONE_TEXT = '[phone number removed]'

// ---------------------------------------------------------------- contact details
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g
// A link made only to email or call: the whole link goes.
const CONTACT_LINK = /<a\b[^>]*\bhref\s*=\s*["'](?:mailto|tel):[^"']*["'][^>]*>[\s\S]*?<\/a>/gi
// A run of digits with the usual separators (spaces, dots, hyphens, and
// brackets round a country or area code), not part of a word, a link or a
// number with a decimal point; checked in isPhoneNumber.
const DIGIT = String.raw`(?:\(\+?\d[\d ]{0,6}\)|\d)`
export const PHONE_RE = new RegExp(String.raw`(?<![\w./@:#-])(?:\+\s?)?${DIGIT}(?:[ .\u00a0-]{0,2}${DIGIT})+(?![\w@]|\.\d)`, 'g')

// Is this run of digits a telephone number, not a date, a year range, a
// figure with thousands or a short number (999, 112, 1500)?
export function isPhoneNumber(run) {
  const digits = run.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(run) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(run)) return false
  if (/^[1-9]\d{0,2}([\s\u00a0,]\d{3})+$/.test(run.trim())) return false // 1 000 000
  if (/^\d{4}\s*-\s*\d{4}$/.test(run.trim())) return false // 2023 - 2024
  if (/^\d+\.\d+$/.test(run.trim())) return false // a coordinate or figure, 50.84439
  return true
}

// A piece of text without email addresses and phone numbers; `found` counts them.
export function withoutContactText(text, found = { emails: 0, phones: 0 }) {
  let s = text.replace(CONTACT_LINK, (m) => {
    if (/href\s*=\s*["']mailto:/i.test(m)) found.emails++
    else found.phones++
    return /href\s*=\s*["']mailto:/i.test(m) ? EMAIL_TEXT : PHONE_TEXT
  })
  s = s.replace(EMAIL, () => { found.emails++; return EMAIL_TEXT })
  s = s.replace(PHONE_RE, (m) => {
    // A trailing space, dot or hyphen is not part of the number.
    const trimmed = m.replace(/[\s.\u00a0-]+$/, '')
    if (!isPhoneNumber(trimmed)) return m
    found.phones++
    return PHONE_TEXT + m.slice(trimmed.length)
  })
  return s
}

// A string that is a link or a path, an identifier or a date: left alone.
const isLinkOrId = (s) => /^(https?:\/\/\S+|\/[\w\-./]*|[0-9a-f-]{36}|\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})?)$/i.test(s.trim())

// The record (any JSON) with email addresses and phone numbers taken out of
// every piece of text; a new object. `found` counts what was taken out.
export function withoutContactDetails(value, found = { emails: 0, phones: 0 }) {
  if (typeof value === 'string') return isLinkOrId(value) ? value : withoutContactText(value, found)
  if (Array.isArray(value)) return value.map((v) => withoutContactDetails(v, found))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutContactDetails(v, found)]))
  return value
}

// What the loader says it left out (SOURCE_FILE.REMOVEDCOLUMNS).
export const ADVICE_REMOVED = ['email addresses in the page text', 'phone numbers in the page text']

// ---------------------------------------------------------------- fetching
const instant = (s) => (s ? new Date(s).getTime() : NaN)

// GET a JSON document: the status, ETag and body. 304 when `etag` still
// holds; a 429 or a server error is tried again (after Retry-After if given).
export async function getAdviceJson(url, { etag, tries = 5, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let t = 1; ; t++) {
    const res = await fetch(url, { headers: { 'user-agent': 'Rarebit data loader', accept: 'application/json', ...(etag ? { 'if-none-match': etag } : {}) } })
    if (res.status === 304) return { status: 304, etag }
    if (res.ok) return { status: res.status, etag: res.headers.get('etag'), json: await res.json() }
    if ((res.status === 429 || res.status >= 500) && t < tries) {
      const wait = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 3000 * t)
      continue
    }
    throw new Error(`${url}: ${res.status} ${res.statusText}`)
  }
}

const countryOf = (child) => child.details?.country?.slug ?? child.base_path?.split('/').at(-1)

// What is wrong with an index, as a list of sentences. Pure, for the tests.
export function indexProblems(children, previousCount, { acceptChanges = false } = {}) {
  const problems = []
  if (!Array.isArray(children) || !children.length) return ['the index lists no countries']
  const ids = children.map((c) => c.content_id)
  const slugs = children.map(countryOf)
  if (ids.some((i) => !i)) problems.push('a country has no content_id')
  if (new Set(ids).size !== ids.length) problems.push('a content_id is repeated')
  if (slugs.some((s) => !s) || new Set(slugs).size !== slugs.length) problems.push('a country name (slug) is missing or repeated')
  if (children.some((c) => !c.api_url?.startsWith('https://www.gov.uk/api/content/foreign-travel-advice/'))) problems.push('a country has an unexpected api_url')
  if (!acceptChanges) {
    if (children.length < ADVICE_MIN_COUNTRIES) problems.push(`only ${children.length} countries (fewer than ${ADVICE_MIN_COUNTRIES})`)
    if (previousCount && children.length < previousCount * (1 - ADVICE_SHRINK_LIMIT)) problems.push(`the list shrank from ${previousCount} to ${children.length} countries (more than ${ADVICE_SHRINK_LIMIT * 100}%)`)
  }
  return problems
}

// What is wrong with a country's page against its index entry.
export function pageProblems(page, child) {
  const problems = []
  if (page?.content_id !== child.content_id) problems.push(`its content_id is ${page?.content_id}, not the index's ${child.content_id}`)
  if (!Array.isArray(page?.details?.parts)) problems.push('it has no parts')
  if (!page?.public_updated_at || Number.isNaN(instant(page.public_updated_at))) problems.push('it has no public_updated_at')
  return problems
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
const writeJsonLines = (file, records) => {
  fs.writeFileSync(`${file}.part`, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  fs.renameSync(`${file}.part`, file)
}

// Fetch what changed: the index, then each new or newer country's page.
// Files saved (both only when there is something): fcdo_pages_<time>.jsonl,
// one page per line, and fcdo_index_<time>.jsonl, one index entry per line.
// Returns the file saved (pages, else the index) or null when nothing changed.
export async function fetchTravelAdvice({ root, log = console.log, getJson = getAdviceJson, pauseMs = ADVICE_PAUSE_MS, acceptChanges = process.env.TRAVEL_ADVICE_ACCEPT_CHANGES === '1' } = {}) {
  const dir = path.join(root, ADVICE_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const statePath = path.join(dir, 'state.json')
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { etag: null, pages: {}, index: {} }

  const idx = await getJson(ADVICE_INDEX_URL, { etag: state.etag })
  if (idx.status === 304) {
    log('  Travel advice: the index has not changed')
    return null
  }
  const children = idx.json?.links?.children
  const problems = indexProblems(children, Object.keys(state.index).length, { acceptChanges })
  if (problems.length) throw new Error(`Travel advice: not saved: ${problems.join('; ')}.${problems.some((p) => /shrank|only/.test(p)) ? ' (A real change: run once with TRAVEL_ADVICE_ACCEPT_CHANGES=1.)' : ''}`)

  // The index entry as listed, and the set of (country, date) it holds.
  const indexNow = Object.fromEntries(children.map((c) => [c.content_id, c.public_updated_at]))
  const indexChanged = children.length !== Object.keys(state.index).length || children.some((c) => instant(state.index[c.content_id]) !== instant(c.public_updated_at))
  const todo = children.filter((c) => instant(state.pages[c.content_id]) !== instant(c.public_updated_at) && !(instant(state.pages[c.content_id]) > instant(c.public_updated_at)))

  const found = { emails: 0, phones: 0 }
  const pages = []
  for (const [i, child] of todo.entries()) {
    if (i) await new Promise((r) => setTimeout(r, pauseMs))
    const { json } = await getJson(child.api_url)
    const bad = pageProblems(json, child)
    if (bad.length) throw new Error(`Travel advice: not saved: ${countryOf(child)}: ${bad.join('; ')}.`)
    pages.push(withoutContactDetails(json, found))
  }

  const tag = stamp()
  let saved = null
  if (pages.length) {
    saved = path.join(dir, `fcdo_pages_${tag}.jsonl`)
    writeJsonLines(saved, pages)
  }
  if (indexChanged) {
    const file = path.join(dir, `fcdo_index_${tag}.jsonl`)
    writeJsonLines(file, children.map((c) => withoutContactDetails(c)))
    saved ??= file
  }
  // The state moves on only after the files are written.
  const pagesNow = { ...state.pages }
  for (const p of pages) pagesNow[p.content_id] = p.public_updated_at
  fs.writeFileSync(statePath, JSON.stringify({ etag: idx.etag ?? null, pages: pagesNow, index: indexNow }))
  log(`  Travel advice: ${children.length} countries, ${pages.length} page(s) new or changed${pages.length ? ` (${found.emails} email addresses and ${found.phones} phone numbers taken out)` : ''}${indexChanged ? ', the index changed' : ''}`)
  return saved
}

// ---------------------------------------------------------------- load step 51
const OGL = 'Open Government Licence v3.0'
const savedFiles = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).sort().map((file) => ({ file: path.join(dir, file) })) : [])

export function adviceSteps(R) {
  return {
    51: { job: 'load-travel-advice', runLabel: 'UK Foreign Office travel advice (GOV.UK Content API, JSON lines)', run: async (loader) => {
      const dir = path.join(R, ADVICE_DIR)
      // The saved file is read again with the contact details taken out, so a
      // file saved before the fetch took them out never reaches Snowflake with
      // them; its original stays out of the stage.
      const lines = async ({ file }) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l, i) => ({ n: i + 1, item: withoutContactDetails(JSON.parse(l)) }))
      const base = { home: 'SHARED_DB', source: 'fcdo-travel-advice', publisher: 'Foreign, Commonwealth & Development Office (via GOV.UK)', licence: OGL,
        page: 'https://www.gov.uk/foreign-travel-advice', format: 'SHARED_DB.RAW.JSON_LINES', kind: 'columns-removed', removed: ADVICE_REMOVED, stageOriginal: false, rows: lines }
      return [
        ...await loader.loadJsonLines({ ...base, title: 'Foreign travel advice: each country page that is new or changed (GOV.UK Content API)', table: 'SHARED_DB.RAW.FCDO_TRAVEL_ADVICE',
          originals: savedFiles(dir, /^fcdo_pages_.*\.jsonl$/),
          cols: { LINENUMBER: '$1:n::number', CONTENT_ID: '$1:item:content_id::string', COUNTRY_SLUG: '$1:item:details:country:slug::string', PUBLIC_UPDATED_AT: '$1:item:public_updated_at::timestamp_tz', ITEM: '$1:item' } }),
        ...await loader.loadJsonLines({ ...base, title: 'Foreign travel advice: the index of countries (GOV.UK Content API)', table: 'SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX',
          originals: savedFiles(dir, /^fcdo_index_.*\.jsonl$/),
          cols: { LINENUMBER: '$1:n::number', CONTENT_ID: '$1:item:content_id::string', COUNTRY_SLUG: '$1:item:details:country:slug::string', PUBLIC_UPDATED_AT: '$1:item:public_updated_at::timestamp_tz', ITEM: '$1:item' } }),
      ]
    } },
  }
}
