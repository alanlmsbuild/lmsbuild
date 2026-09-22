import { useCallback, useEffect, useState } from 'react'
import './App.css'
import AddLearnerForm from './AddLearnerForm'
import EditLearnerForm from './EditLearnerForm'
import MarkCompletedForm from './MarkCompletedForm'
import WithdrawAimForm from './WithdrawAimForm'
import Dashboard from './Dashboard'
import LearnerDetail from './LearnerDetail'
import { STANDARD_OPTIONS } from './ilrCodes'
import { COMPLETION_STATUS_LABELS, describe, labelFromOptions, statusClassName } from './lookups'

function App() {
  const [learners, setLearners] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const [view, setView] = useState('learners') // 'learners' | 'dashboard'

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
        <h1>ILR Learner Tracker</h1>
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
                  <td>{labelFromOptions(STANDARD_OPTIONS, learner.STDCODE)}</td>
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
      {panel.mode === 'add' && <AddLearnerForm onLearnerAdded={loadLearners} />}

      {detailLearner && (
        <LearnerDetail
          learner={detailLearner}
          onClose={() => setDetailLearner(null)}
          onEdit={(learner) => {
            setDetailLearner(null)
            setPanel({ mode: 'edit', learner })
          }}
          onComplete={(learner) => {
            setDetailLearner(null)
            setPanel({ mode: 'complete', learner })
          }}
          onWithdraw={(learner) => {
            setDetailLearner(null)
            setPanel({ mode: 'withdraw', learner })
          }}
        />
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
      </main>
    </>
  )
}

export default App
