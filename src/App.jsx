import { useCallback, useEffect, useState } from 'react'
import './App.css'
import AddLearnerForm from './AddLearnerForm'
import EditLearnerForm from './EditLearnerForm'
import MarkCompletedForm from './MarkCompletedForm'
import WithdrawAimForm from './WithdrawAimForm'
import Dashboard from './Dashboard'
import Officers from './Officers'
import warrenMark from './assets/warren-mark.svg'
import LearnerDetail from './LearnerDetail'
import { COMPLETION_STATUS_LABELS, describe, standardLabel, statusClassName } from './lookups'

function App() {
  const [learners, setLearners] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  // The full LARS standards list for the add / edit forms' standard picker.
  // Fetched once here rather than by each form, since it doesn't change
  // while the app is open.
  const [standards, setStandards] = useState([])
  const [standardsStatus, setStandardsStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  const [view, setView] = useState('learners') // 'learners' | 'dashboard' | 'officers'

  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'continuing' | 'completed'

  // The learner currently shown in the detail side panel, or null if it's
  // closed. Kept separate from `panel` below since the detail view is an
  // overlay on top of the list, not something that replaces it.
  const [detailLearner, setDetailLearner] = useState(null)

  // What the panel below the table is showing: adding a new learner
  // (the default), editing an existing one, marking an aim completed, or
  // withdrawing an aim.
  const [panel, setPanel] = useState({ mode: 'add' })

  // Also used to refresh the list after a learner is added, edited, or an
  // aim is marked completed, so the table stays in place instead of
  // flashing back to "Loading…".
  const loadLearners = useCallback(async () => {
    try {
      const res = await fetch('/api/learners')
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      const data = await res.json()
      setLearners(data)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadLearners()
  }, [loadLearners])

  useEffect(() => {
    async function loadStandards() {
      try {
        const res = await fetch('/api/standards')
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        setStandards(await res.json())
        setStandardsStatus('ready')
      } catch (err) {
        console.error('Failed to load standards:', err.message)
        setStandardsStatus('error')
      }
    }
    loadStandards()
  }, [])

  function handleSaved() {
    setPanel({ mode: 'add' })
    loadLearners()
  }

  function handleClearFilters() {
    setSearchText('')
    setStatusFilter('all')
  }

  const filteredLearners = learners.filter((learner) => {
    const query = searchText.trim().toLowerCase()
    const matchesSearch =
      !query ||
      learner.LEARNREFNUMBER?.toLowerCase().includes(query) ||
      learner.GIVENNAMES?.toLowerCase().includes(query) ||
      learner.FAMILYNAME?.toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'continuing' && learner.COMPSTATUS === 1) ||
      (statusFilter === 'completed' && learner.COMPSTATUS === 2)

    return matchesSearch && matchesStatus
  })

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <img src={warrenMark} alt="" className="brand-mark" />
          <div>
            <h1 className="brand-name">Warren</h1>
            <p className="brand-byline">by rarebit</p>
          </div>
        </div>
        <nav className="app-tabs" aria-label="Views">
          <button
            type="button"
            className={view === 'learners' ? 'tab active' : 'tab'}
            onClick={() => setView('learners')}
          >
            Learners
          </button>
          <button
            type="button"
            className={view === 'dashboard' ? 'tab active' : 'tab'}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={view === 'officers' ? 'tab active' : 'tab'}
            onClick={() => setView('officers')}
          >
            Officers
          </button>
        </nav>
      </header>

      <main className="app-main">
      {view === 'learners' && (
      <>
      <section id="learners">
        <p>Dummy ILR apprenticeship learners and their programme aim details.</p>

        {status === 'loading' && <p>Loading learners…</p>}
        {status === 'error' && (
          <p role="alert">Couldn't load learners: {error}</p>
        )}

        {status === 'ready' && (
          <>
            <div className="learner-filters">
              <input
                type="search"
                className="search-input"
                placeholder="Search by learner ref or name"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Search by learner ref or name"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All</option>
                <option value="continuing">Continuing</option>
                <option value="completed">Completed</option>
              </select>
              <button type="button" className="secondary" onClick={handleClearFilters}>
                Clear
              </button>
            </div>

            <p className="filter-count">
              Showing {filteredLearners.length} of {learners.length} learners
            </p>
          </>
        )}

        {status === 'ready' && filteredLearners.length === 0 && (
          <p>No learners match your search</p>
        )}

        {status === 'ready' && filteredLearners.length > 0 && (
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Learner ref</th>
                <th>Name</th>
                <th>Standard</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLearners.map((learner) => (
                <tr key={`${learner.LEARNREFNUMBER}-${learner.LEARNAIMREF}`}>
                  <td>{learner.LEARNREFNUMBER}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setDetailLearner(learner)}
                    >
                      {learner.GIVENNAMES} {learner.FAMILYNAME}
                    </button>
                  </td>
                  <td>{standardLabel(learner, { withLevel: false })}</td>
                  <td>
                    <span className={statusClassName(learner.COMPSTATUS)}>
                      {describe(COMPLETION_STATUS_LABELS, learner.COMPSTATUS)}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button type="button" className="secondary" onClick={() => setPanel({ mode: 'edit', learner })}>
                      Edit
                    </button>
                    {learner.COMPSTATUS === 1 && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setPanel({ mode: 'complete', learner })}
                      >
                        Mark completed
                      </button>
                    )}
                    {learner.COMPSTATUS === 1 && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setPanel({ mode: 'withdraw', learner })}
                      >
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {panel.mode === 'edit' && (
        <EditLearnerForm
          learner={panel.learner}
          standards={standards}
          standardsStatus={standardsStatus}
          onSaved={handleSaved}
          onCancel={() => setPanel({ mode: 'add' })}
        />
      )}
      {panel.mode === 'complete' && (
        <MarkCompletedForm
          learner={panel.learner}
          onSaved={handleSaved}
          onCancel={() => setPanel({ mode: 'add' })}
        />
      )}
      {panel.mode === 'withdraw' && (
        <WithdrawAimForm
          learner={panel.learner}
          onSaved={handleSaved}
          onCancel={() => setPanel({ mode: 'add' })}
        />
      )}
      {panel.mode === 'add' && (
        <AddLearnerForm standards={standards} standardsStatus={standardsStatus} onLearnerAdded={loadLearners} />
      )}

      </>
      )}

      {view === 'dashboard' && (
        <>
          {status === 'loading' && <p className="status-message">Loading dashboard…</p>}
          {status === 'error' && (
            <p className="status-message" role="alert">
              Couldn't load dashboard data: {error}
            </p>
          )}
          {status === 'ready' && <Dashboard learners={learners} />}
        </>
      )}

      {view === 'officers' && (
        <Officers learners={learners} learnersStatus={status} onOpenLearner={setDetailLearner} />
      )}

      {/* Rendered outside the tabs since it can be opened from either the
          Learners list or an officer's detail panel. Edit / Mark completed /
          Withdraw switch back to the Learners tab, where those forms live. */}
      {detailLearner && (
        <LearnerDetail
          learner={detailLearner}
          onClose={() => setDetailLearner(null)}
          onEdit={(learner) => {
            setDetailLearner(null)
            setView('learners')
            setPanel({ mode: 'edit', learner })
          }}
          onComplete={(learner) => {
            setDetailLearner(null)
            setView('learners')
            setPanel({ mode: 'complete', learner })
          }}
          onWithdraw={(learner) => {
            setDetailLearner(null)
            setView('learners')
            setPanel({ mode: 'withdraw', learner })
          }}
        />
      )}
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          {/* Skills England's official colourways, used unchanged: the blue
              stacked logo normally, their all-white landscape one in dark mode. */}
          <picture>
            <source
              media="(prefers-color-scheme: dark)"
              srcSet="/brand/skills-england_lesser_arms_landscape-se-logo-white.svg"
            />
            <img
              src="/brand/skills-england_lesser_arms_stacked-dfe-blue-se-logo.svg"
              alt="Skills England"
              className="footer-logo"
            />
          </picture>
          {/* Attribution statement for online publications, worded exactly
              as Skills England's public API terms require:
              https://occupational-maps.skillsengland.education.gov.uk/public-api/#licence */}
          <div className="footer-attribution">
            <p>© Skills England 2025</p>
            <p>
              This information is licensed under the Open Government Licence{' '}
              <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
                https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3
              </a>
            </p>
            {/* Standard OGL attribution for the LARS data, which DfE publishes. */}
            <p className="footer-ogl">
              Contains public sector information licensed under the{' '}
              <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">
                Open Government Licence v3.0
              </a>
              .
            </p>
          </div>
          <p className="footer-copyright">© 2026 Rarebit</p>
        </div>
      </footer>
    </>
  )
}

export default App
