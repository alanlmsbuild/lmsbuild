import { useEffect, useState } from 'react'
import { useShell, usePageTitle } from '../shell/navigation'
import { formatDate } from '../lookups'
import { Notice, StatusBadge } from '../ui/components'
import './vacancies.css'

// The Vacancies tab: open apprenticeship adverts from Find an
// apprenticeship, NHS Jobs and Civil Service Jobs (GET /api/vacancies),
// nearest first from a chosen postcode. The search is in the address
// (/app/vacancies?postcode=...), so it can be shared and Back works. The
// last postcode used is remembered in this browser only. Advert text is
// shown as text.

export const SOURCE_LABELS = { FAA: 'Find an apprenticeship', NHS: 'NHS Jobs', CSJ: 'Civil Service Jobs' }
const MILES = [2, 5, 10, 20, 50]
const FIELDS = ['postcode', 'miles', 'larsCode', 'route', 'level', 'source', 'q']
const REMEMBERED = 'warren.vacancies.postcode'

export function SourceBadge({ source }) {
  return <StatusBadge tone={source === 'FAA' ? 'neutral' : 'due'}>{SOURCE_LABELS[source] ?? source}</StatusBadge>
}

function remembered() {
  try {
    return window.localStorage.getItem(REMEMBERED) ?? ''
  } catch {
    return ''
  }
}
function remember(postcode) {
  try {
    if (postcode) window.localStorage.setItem(REMEMBERED, postcode)
  } catch {
    // Not remembered (private browsing): the search still works.
  }
}

function Vacancies({ search }) {
  usePageTitle('Vacancies')
  const { navigate } = useShell()
  const params = new URLSearchParams(search)
  const [form, setForm] = useState(() => {
    const f = Object.fromEntries(FIELDS.map((k) => [k, params.get(k) ?? '']))
    if (!f.postcode && !search) f.postcode = remembered()
    if (!f.miles) f.miles = '10'
    return f
  })
  const [filters, setFilters] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/vacancies/filters').then((r) => (r.ok ? r.json() : null)).then(setFilters).catch(() => setFilters(null))
  }, [])

  // Search whenever the address changes (and first, with the remembered postcode).
  useEffect(() => {
    let live = true
    const q = new URLSearchParams(search)
    if (!search && form.postcode) q.set('postcode', form.postcode)
    setLoading(true)
    setError(null)
    fetch(`/api/vacancies?${q}`)
      .then(async (res) => {
        const body = await res.json()
        if (!live) return
        if (!res.ok) {
          setFieldErrors(body.fields ?? {})
          setError(body.fields ? null : body.error)
          setData(null)
          return
        }
        setFieldErrors({})
        setData(body)
      })
      .catch(() => live && setError('Could not reach the server. Please try again.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // form.postcode is only read for the very first search.
  }, [search])

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  function submit(e, page = 1) {
    e?.preventDefault()
    const q = new URLSearchParams()
    for (const k of FIELDS) if (form[k]) q.set(k, form[k])
    if (page > 1) q.set('page', String(page))
    remember(form.postcode.trim())
    navigate(`/app/vacancies?${q}`, { replace: true })
  }

  const pages = data ? Math.ceil(data.total / data.pageSize) : 0
  return (
    <section id="vacancies">
      <h2>Vacancies</h2>
      <p className="section-intro">
        Open apprenticeship adverts from Find an apprenticeship, NHS Jobs and Civil Service Jobs.
        {filters?.lastImport && ` Last updated ${formatDate(filters.lastImport)}.`}
      </p>
      <form className="vacancy-search" onSubmit={submit} noValidate>
        <label className="field">
          <span>Near postcode</span>
          <input type="text" value={form.postcode} onChange={(e) => update('postcode', e.target.value)} autoComplete="postal-code" />
          {fieldErrors.postcode && <span className="field-error">{fieldErrors.postcode}</span>}
        </label>
        <label className="field">
          <span>Within</span>
          <select value={form.miles} onChange={(e) => update('miles', e.target.value)}>
            {MILES.map((m) => (
              <option key={m} value={m}>
                {m} miles
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Apprenticeship</span>
          <select value={form.larsCode} onChange={(e) => update('larsCode', e.target.value)}>
            <option value="">Any</option>
            {filters?.standards.map((s) => (
              <option key={s.LARSCODE} value={s.LARSCODE}>
                {s.TITLE} ({s.N})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Route</span>
          <select value={form.route} onChange={(e) => update('route', e.target.value)}>
            <option value="">Any</option>
            {filters?.routes.map((r) => (
              <option key={r.ROUTE} value={r.ROUTE}>
                {r.ROUTE} ({r.N})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Level</span>
          <select value={form.level} onChange={(e) => update('level', e.target.value)}>
            <option value="">Any</option>
            {filters?.levels.map((l) => (
              <option key={l.LEVEL} value={l.LEVEL}>
                Level {l.LEVEL} ({l.N})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Source</span>
          <select value={form.source} onChange={(e) => update('source', e.target.value)}>
            <option value="">Any</option>
            {filters?.sources.map((s) => (
              <option key={s.SOURCE} value={s.SOURCE}>
                {SOURCE_LABELS[s.SOURCE] ?? s.SOURCE} ({s.N})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Title or employer</span>
          <input type="search" value={form.q} onChange={(e) => update('q', e.target.value)} />
        </label>
        <div className="vacancy-search-actions">
          <button type="submit">Search</button>
        </div>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && !data && <p>Searching…</p>}
      {data && (
        <>
          <p className="vacancy-count" role="status">
            {data.total === 0 ? 'No open adverts match.' : `${data.total} open advert${data.total === 1 ? '' : 's'}`}
            {data.from && data.total > 0 && ` within ${data.from.miles} miles of ${data.from.postcode}, nearest first (national adverts last)`}
            {!data.from && data.total > 0 && ', closing soonest first. Enter a postcode to see the nearest.'}
          </p>
          <ul className="vacancy-results">
            {data.results.map((v) => (
              <li key={v.VACANCYREFERENCE}>
                <a className="vacancy-title" href={`/app/vacancies/${encodeURIComponent(v.VACANCYREFERENCE)}`}>
                  {v.TITLE}
                </a>
                <span className="vacancy-employer">{v.EMPLOYERNAME}</span>
                <span className="vacancy-meta">
                  <SourceBadge source={v.SOURCE} />
                  {v.MILES !== null && <span>{v.MILES} miles</span>}
                  {v.MILES === null && v.ISNATIONALVACANCY && <span>National</span>}
                  {v.COURSETITLE && <span>{v.COURSETITLE}</span>}
                  {v.POSTCODE && <span>{v.POSTCODE}</span>}
                  <span>Closes {formatDate(v.CLOSINGDATE)}</span>
                </span>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="vacancy-pages" aria-label="Pages">
              <button type="button" className="secondary" disabled={data.page <= 1} onClick={() => submit(null, data.page - 1)}>
                Previous
              </button>
              <span>
                Page {data.page} of {pages}
              </span>
              <button type="button" className="secondary" disabled={data.page >= pages} onClick={() => submit(null, data.page + 1)}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}

export default Vacancies
