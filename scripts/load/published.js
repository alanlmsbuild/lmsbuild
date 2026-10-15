// published.js - when a loaded file was published, as its publisher states
// it (SOURCE_FILE.PUBLISHEDON and PUBLISHEDONFROM; sql/load_07_published_on.sql).
// Read from the page or API the file came from (its PAGEURL), at load
// (scripts/load/loader.js) and for files already loaded
// (scripts/backfill-published-on.js). Empty where the source doesn't state
// a date. Never guessed.
//
//   Explore education statistics API (api.education.gov.uk data sets): the
//     version's published date, the version read from the file's name
//     (..._v1.0.csv), else the latest version's.
//   Explore education statistics pages (find-statistics, data-catalogue):
//     the release's "published" date the page carries.
//   GOV.UK (statistics and statistical data set pages): the content API's
//     public_updated_at, when the page says it was last updated. A
//     collection page states no date for its files: left empty.
//   ONS: the release date of the page's data (its /data, releaseDate).
//   Nomis: the data set's LastUpdated (Nomis states no other date).
//
// A page states the date of its latest version. If that is after we
// downloaded the file, the file is an older version and the date isn't its
// own: left empty.

const UA = { 'User-Agent': 'RarebitDataLoader/1.0' }
const TIMEOUT_MS = 30_000
const day = (iso) => (iso ? String(iso).slice(0, 10) : null)

async function getJson(url) {
  const res = await fetch(url, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}
async function getText(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.text()
}

// What the page says: { date: 'YYYY-MM-DD', from } or { date: null, why }.
export async function statedDate(pageUrl, { fileName = '' } = {}) {
  const page = String(pageUrl ?? '').split(' ')[0]
  let u
  try { u = new URL(page) } catch { return { date: null, why: 'no page address' } }
  if (u.host === 'api.education.gov.uk') {
    const m = u.pathname.match(/\/statistics\/v1\/data-sets\/([0-9a-f-]+)/)
    if (!m) return { date: null, why: 'not a data set address' }
    const version = String(fileName).match(/_v(\d+\.\d+(?:\.\d+)?)\.csv$/)?.[1]
    if (version) {
      const url = `https://api.education.gov.uk/statistics/v1/data-sets/${m[1]}/versions/${version}`
      return { date: day((await getJson(url)).published), from: `${url} published` }
    }
    const url = `https://api.education.gov.uk/statistics/v1/data-sets/${m[1]}`
    return { date: day((await getJson(url)).latestVersion?.published), from: `${url} latestVersion.published` }
  }
  if (u.host === 'explore-education-statistics.service.gov.uk' && /^\/(find-statistics|data-catalogue)\//.test(u.pathname)) {
    const html = await getText(page)
    const iso = html.match(/\\?"published\\?"\s*:\s*\\?"(\d{4}-\d{2}-\d{2})T/)?.[1]
    return iso ? { date: iso, from: `${page} (the release's published date on the page)` } : { date: null, why: 'the page states no published date' }
  }
  if (u.host === 'www.gov.uk') {
    if (u.pathname.startsWith('/government/collections/')) return { date: null, why: 'a GOV.UK collection page states no date for its files' }
    const url = `https://www.gov.uk/api/content${u.pathname}`
    const d = await getJson(url)
    return d.public_updated_at ? { date: day(d.public_updated_at), from: `${url} public_updated_at` } : { date: null, why: 'no public_updated_at' }
  }
  if (u.host === 'www.ons.gov.uk') {
    const url = `${page.replace(/\/$/, '')}/data`
    const d = await getJson(url)
    return d.description?.releaseDate ? { date: day(d.description.releaseDate), from: `${url} description.releaseDate` } : { date: null, why: 'no releaseDate' }
  }
  if (u.host === 'www.nomisweb.co.uk') {
    const id = u.pathname.match(/\/dataset\/(NM_\d+_\d+)/)?.[1]
    if (!id) return { date: null, why: 'not a Nomis data set' }
    const url = `https://www.nomisweb.co.uk/api/v01/dataset/${id}.def.sdmx.json`
    const text = JSON.stringify(await getJson(url))
    const updated = text.match(/"annotationtext":"(\d{4}-\d{2}-\d{2})[^"]*","annotationtitle":"LastUpdated"/)?.[1]
    return updated ? { date: updated, from: `${url} LastUpdated (the data set's last update)` } : { date: null, why: 'no LastUpdated' }
  }
  return { date: null, why: `${u.host} states no publication date we can read` }
}

// The date to record for a file downloaded at downloadedAt: the stated
// date, unless it is after the download (then the file is an older
// version). cache: a Map shared within a run (one request per page and
// file name). Never throws: a failed lookup records nothing.
export async function publishedOn(pageUrl, { fileName = '', downloadedAt = null, cache = null, log = () => {} } = {}) {
  const key = `${pageUrl}|${fileName}`
  let stated = cache?.get(key)
  if (!stated) {
    try {
      stated = await statedDate(pageUrl, { fileName })
    } catch (err) {
      const msg = String(err.message)
      stated = { date: null, why: / answered 404$/.test(msg) ? `${msg.replace(/ answered 404$/, '')} answers 404 (moved, removed, or no data release): no date to read` : `lookup failed: ${msg.slice(0, 160)}` }
    }
    cache?.set(key, stated)
  }
  if (!stated.date) return { date: null, from: null, why: stated.why }
  if (downloadedAt && stated.date > new Date(downloadedAt).toISOString().slice(0, 10)) {
    log(`  published date ${stated.date} is after the download: a newer version, not recorded`)
    return { date: null, from: null, why: `the page now states ${stated.date}, after we downloaded the file (a newer version)` }
  }
  return { date: stated.date, from: stated.from }
}
