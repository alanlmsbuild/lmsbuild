import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import AddLearnerForm from './AddLearnerForm'
import EditLearnerForm from './EditLearnerForm'
import MarkCompletedForm from './MarkCompletedForm'
import WithdrawAimForm from './WithdrawAimForm'
import Dashboard from './Dashboard'
import Officers from './Officers'
import LearnerDetail from './LearnerDetail'
import Reports from './Reports'
import MyDay from './MyDay'
import IqaSignOffs from './IqaSignOffs'
import { useShell } from './shell/navigation'
import { Card, Notice } from './ui/components'
import { standardLabel } from './lookups'
import CompletionStatus from './CompletionStatus'

// Warren's tabs, and which roles see each one.
const TABS = [
  { view: 'myday', label: 'My day', shows: (r) => r.hasCaseload },
  { view: 'learners', label: 'Learners', shows: () => true },
  { view: 'dashboard', label: 'Dashboard', shows: () => true },
  { view: 'officers', label: 'Officers', shows: (r) => r.isManager },
  { view: 'reports', label: 'Reports', shows: (r) => r.hasCaseload },
  { view: 'iqa', label: 'Sign-offs to check', shows: (r) => r.isIqa },
]

function App() {
  const [learners, setLearners] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  // The full LARS standards list for the add / edit forms' standard picker.
  // Fetched once here rather than by each form, since it doesn't change
  // while the app is open.
  const [standards, setStandards] = useState([])
  const [standardsStatus, setStandardsStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  // The tab picked, or null for the user's home tab (below).
  const [pickedView, setView] = useState(null) // 'myday' | 'learners' | 'dashboard' | 'officers' | 'reports' | 'iqa'

  // The signed-in user and their roles, for showing the tabs and actions
  // they can use and whose My day to open. The server checks every request
  // itself. Roles add together:
  //   Manager            everything, and the only one who changes ILR
  //                      records, officers and caseloads
  //   Tutor, Assessor    My day, Reports and their own learners, read only
  //                      apart from recording progress reviews
  //   IQA                Sign-offs to check, and every learner, read only
  //   Learner, Employer  nothing here: Warren is for staff, they use Burrow
  // The shell loads the signed-in user, and holds the header's tab slot.
  const { me, meError, tabSlot } = useShell()
  const roles = me?.roles ?? []
  const isManager = roles.includes('MANAGER')
  const hasCaseload = roles.some((r) => ['MANAGER', 'TUTOR', 'ASSESSOR'].includes(r))
  const isIqa = roles.includes('IQA')
  const isStaff = hasCaseload || isIqa
  const homeView = hasCaseload ? 'myday' : isIqa ? 'iqa' : 'learners'
  const view = pickedView ?? homeView

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
    if (isStaff) loadLearners()
  }, [isStaff, loadLearners])

  // Only the add and edit forms use standards, and only managers get those.
  useEffect(() => {
    if (!isManager) return
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
  }, [isManager])

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
    <div className="warren">
      {isStaff &&
        tabSlot &&
        createPortal(
          <nav aria-label="Warren">
            {TABS.filter((t) => t.shows({ isManager, hasCaseload, isIqa })).map((t) => (
              <button
                key={t.view}
                type="button"
                className={view === t.view ? 'shell-tab is-active' : 'shell-tab'}
                aria-current={view === t.view ? 'page' : undefined}
                onClick={() => setView(t.view)}
              >
                {t.label}
              </button>
            ))}
          </nav>,
          tabSlot,
        )}

      <main className="app-main">
      {meError && (
        <p className="error-banner" role="alert">
          {meError}
        </p>
      )}
      {me && !isStaff && (
        <Card title="Warren is for staff">
          <Notice>
            Your account can use Burrow, where you&apos;ll find{' '}
            {roles.includes('LEARNER') ? 'your portfolio' : 'your apprentices'}. <a href="/burrow">Go to Burrow</a>
          </Notice>
        </Card>
      )}
      {isStaff && view === 'learners' && (
      <>
      <section id="learners">
        <p>Dummy ILR apprenticeship learners and their programme aim details.</p>
        {!isManager && (
          <p className="section-intro">
            {isIqa ? 'Every learner in your organisation' : 'The learners on your caseload'}, to read. Only a manager can
            change their details.
          </p>
        )}

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
                {isManager && <th>Actions</th>}
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
                    <CompletionStatus compstatus={learner.COMPSTATUS} />
                  </td>
                  {isManager && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {isManager && panel.mode === 'edit' && (
        <EditLearnerForm
          learner={panel.learner}
          standards={standards}
          standardsStatus={standardsStatus}
          onSaved={handleSaved}
          onCancel={() => setPanel({ mode: 'add' })}
        />
      )}
      {isManager && panel.mode === 'complete' && (
        <MarkCompletedForm
          learner={panel.learner}
          onSaved={handleSaved}
          onCancel={() => setPanel({ mode: 'add' })}
        />
      )}
      {isManager && panel.mode === 'withdraw' && (
        <WithdrawAimForm
          learner={panel.learner}
          onSaved={handleSaved}
          onCancel={() => setPanel({ mode: 'add' })}
        />
      )}
      {isManager && panel.mode === 'add' && (
        <AddLearnerForm standards={standards} standardsStatus={standardsStatus} onLearnerAdded={loadLearners} />
      )}

      </>
      )}

      {isStaff && view === 'dashboard' && (
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

      {isManager && view === 'officers' && (
        <Officers learners={learners} learnersStatus={status} onOpenLearner={setDetailLearner} />
      )}

      {/* My day and Reports link to learners by reference, so look up the
          full row App already holds for the detail panel. */}
      {hasCaseload && view === 'myday' && <MyDay me={me} onOpenLearner={openLearnerByRef} />}
      {hasCaseload && view === 'reports' && <Reports onOpenLearner={openLearnerByRef} />}
      {isIqa && view === 'iqa' && <IqaSignOffs onOpenLearner={openLearnerByRef} />}

      {/* Rendered outside the tabs since it can be opened from either the
          Learners list or an officer's detail panel. Edit / Mark completed /
          Withdraw switch back to the Learners tab, where those forms live. */}
      {detailLearner && (
        <LearnerDetail
          learner={detailLearner}
          canManage={isManager}
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
    </div>
  )
}

export default App
