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
import Reports from './Reports'
import MyDay from './MyDay'
import IqaSignOffs from './IqaSignOffs'
import DevUserSwitcher from './DevUserSwitcher'
import SkillsEnglandFooter from './SkillsEnglandFooter'
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

  // My day is the home page at /app.
  const [view, setView] = useState('myday') // 'myday' | 'learners' | 'dashboard' | 'officers' | 'reports' | 'iqa'

  // The signed-in user and their roles, for showing the tabs they can use
  // and whose My day to open. The server checks every request itself.
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState(null)
  const roles = me?.roles ?? []

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
    async function loadMe() {
      try {
        const res = await fetch('/api/me')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        setMe(data)
      } catch (err) {
        setMeError(err.message)
      }
    }
    loadMe()
  }, [])

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

  function openLearnerByRef(learnRefNumber) {
    const learner = learners.find((l) => l.LEARNREFNUMBER === learnRefNumber)
    if (learner) setDetailLearner(learner)
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
      <DevUserSwitcher />
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
            className={view === 'myday' ? 'tab active' : 'tab'}
            onClick={() => setView('myday')}
          >
            My day
          </button>
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
          <button
            type="button"
            className={view === 'reports' ? 'tab active' : 'tab'}
            onClick={() => setView('reports')}
          >
            Reports
          </button>
          {roles.includes('IQA') && (
            <button
              type="button"
              className={view === 'iqa' ? 'tab active' : 'tab'}
              onClick={() => setView('iqa')}
            >
              Sign-offs to check
            </button>
          )}
        </nav>
      </header>

      <main className="app-main">
      {meError && (
        <p className="error-banner" role="alert">
          {meError}
        </p>
      )}
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

      {/* My day and Reports link to learners by reference, so look up the
          full row App already holds for the detail panel. */}
      {view === 'myday' && <MyDay me={me} onOpenLearner={openLearnerByRef} />}
      {view === 'reports' && <Reports onOpenLearner={openLearnerByRef} />}
      {view === 'iqa' && <IqaSignOffs onOpenLearner={openLearnerByRef} />}

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

      <SkillsEnglandFooter />
    </>
  )
}

export default App
