import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import AddLearnerForm from './AddLearnerForm'
import EditLearnerForm from './EditLearnerForm'
import MarkCompletedForm from './MarkCompletedForm'
import WithdrawAimForm from './WithdrawAimForm'
import Dashboard from './Dashboard'
import Officers from './Officers'
import LearnerRecord from './learner/LearnerRecord'
import LearnerHeader from './learner/LearnerHeader'
import { learnerPath, learnerActionPath, safeBack } from './learner/links'
import Reports from './Reports'
import MyDay from './MyDay'
import IqaSignOffs from './IqaSignOffs'
import { usePageTitle, useShell, warrenHome } from './shell/navigation'
import { Notice } from './ui/components'
import { standardLabel } from './lookups'
import CompletionStatus from './CompletionStatus'

// Warren's tabs: their addresses (/app/<slug>), and which roles see each
// one.
const TABS = [
  { slug: 'my-day', label: 'My day', shows: (r) => r.hasCaseload },
  { slug: 'learners', label: 'Learners', shows: () => true },
  { slug: 'dashboard', label: 'Dashboard', shows: () => true },
  { slug: 'officers', label: 'Officers', shows: (r) => r.isManager },
  { slug: 'reports', label: 'Reports', shows: (r) => r.hasCaseload },
  { slug: 'sign-offs', label: 'Sign-offs to check', shows: (r) => r.isIqa },
]

const LEARNER_ACTIONS = ['edit', 'complete', 'withdraw']
const REPORTS = ['qar', 'caseload', 'ilr']

// Every Warren view has its own address:
//   /app/my-day, /app/dashboard, /app/sign-offs
//   /app/learners?q=&status=         the list, with its search and filter
//   /app/learners/<ref>?back=<path>  the learner page's Record tab, with
//                                    Back to the page it was opened from
//                                    (the list, My day, a report...). The
//                                    Portfolio tab is Burrow's
//                                    /burrow/learners/<ref>.
//   /app/learners/<ref>/edit         (and /complete, /withdraw) a manager's
//                                    form on the learner page
//   /app/officers[/<officer ref>]
//   /app/reports/qar?year=, /app/reports/caseload[/<officer ref>],
//   /app/reports/ilr
// /app goes to the person's first tab (warrenHome), and a tab or form they
// can't use goes there or back to the learner.
function parseWarren(path) {
  const [pathname, search = ''] = path.split('?')
  const segments = pathname.split('/').filter(Boolean).slice(1)
  let parts
  try {
    parts = segments.map(decodeURIComponent)
  } catch {
    parts = segments
  }
  return { tab: parts[0] ?? null, rest: parts.slice(1), params: new URLSearchParams(search) }
}

function learnersQuery(params) {
  const q = new URLSearchParams()
  if (params.get('q')) q.set('q', params.get('q'))
  if (params.get('status') && params.get('status') !== 'all') q.set('status', params.get('status'))
  const text = q.toString()
  return text ? `?${text}` : ''
}

// Where an address should go instead, for this person, or null if it's
// fine.
function redirectFor(view, can, me) {
  const { tab, rest } = view
  if (!tab) return warrenHome(me)
  const tabDef = TABS.find((t) => t.slug === tab)
  if (!tabDef) return null // not found, shown by the page
  if (!tabDef.shows(can)) return warrenHome(me)
  if (tab === 'reports') {
    if (rest.length === 0 || (rest[0] === 'ilr' && !can.isManager)) return '/app/reports/qar'
  }
  if (tab === 'learners' && rest[1] && LEARNER_ACTIONS.includes(rest[1]) && !can.isManager) {
    return `/app/learners/${encodeURIComponent(rest[0])}`
  }
  return null
}

// True when this address is one of Warren's pages (for the not-found note).
function isKnownView({ tab, rest }) {
  switch (tab) {
    case 'my-day':
    case 'dashboard':
    case 'sign-offs':
      return rest.length === 0
    case 'learners':
      return rest.length <= 1 || (rest.length === 2 && LEARNER_ACTIONS.includes(rest[1]))
    case 'officers':
      return rest.length <= 1
    case 'reports':
      return (
        REPORTS.includes(rest[0]) && (rest.length === 1 || (rest[0] === 'caseload' && rest.length === 2))
      )
    default:
      return false
  }
}

function App() {
  const [learners, setLearners] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  // The full LARS standards list for the add / edit forms' standard picker.
  // Fetched once here rather than by each form, since it doesn't change
  // while the app is open.
  const [standards, setStandards] = useState([])
  const [standardsStatus, setStandardsStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  // The signed-in user and their roles, for showing the tabs and actions
  // they can use and whose My day to open. The server checks every request
  // itself. Roles add together:
  //   Manager            everything, and the only one who changes ILR
  //                      records, officers and caseloads
  //   Tutor, Assessor    My day, Reports and their own learners, read only
  //                      apart from recording progress reviews
  //   IQA                Sign-offs to check, and every learner, read only
  // Learners and employers never get here: the shell sends them to Burrow.
  // The shell also holds the address, and the header's tab slot.
  const { path, navigate, me, tabSlot } = useShell()
  const roles = me?.roles ?? []
  const isManager = roles.includes('MANAGER')
  const hasCaseload = roles.some((r) => ['MANAGER', 'TUTOR', 'ASSESSOR'].includes(r))
  const isIqa = roles.includes('IQA')
  const can = { isManager, hasCaseload, isIqa }

  // What the address asks for. On a learner page, the header's tab is the
  // one Back goes to (Learners unless it's another Warren tab).
  const current = parseWarren(path)
  const learnerRef = current.tab === 'learners' ? (current.rest[0] ?? null) : null
  const learnerAction = learnerRef && LEARNER_ACTIONS.includes(current.rest[1]) ? current.rest[1] : null
  const listQuery = learnersQuery(current.params)
  // Step 3's learner addresses carried the list's filters instead of ?back=.
  const back = safeBack(current.params.get('back')) ?? `/app/learners${listQuery}`
  const backTab = back.startsWith('/app/') ? parseWarren(back).tab : 'learners'
  const view = current
  const activeTab = learnerRef ? backTab : current.tab
  const searchText = current.params.get('q') ?? ''
  const statusFilter = current.params.get('status') ?? 'all' // 'all' | 'continuing' | 'completed'

  const redirect = redirectFor(current, can, me)
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true })
  }, [redirect, navigate])

  // The learner on the learner page, once the list has loaded (the list
  // has a row per aim; any of the learner's rows will do).
  const learnerRow = learnerRef ? learners.find((l) => l.LEARNREFNUMBER === learnerRef) : null
  const learnerMissing = learnerRef && status === 'ready' && !learnerRow
  const learnerName = learnerRow ? `${learnerRow.GIVENNAMES} ${learnerRow.FAMILYNAME}` : learnerRef

  const tabLabel = TABS.find((t) => t.slug === view.tab)?.label
  const reportTitles = { qar: 'QAR', caseload: 'Caseload report', ilr: 'ILR return' }
  const actionTitles = { edit: 'Edit', complete: 'Mark completed', withdraw: 'Withdraw' }
  usePageTitle(
    redirect
      ? null
      : learnerAction
        ? `${actionTitles[learnerAction]}: ${learnerName}`
        : learnerRef
          ? learnerName
          : view.tab === 'reports'
            ? reportTitles[view.rest[0]]
            : isKnownView(view)
              ? tabLabel
              : 'Not found',
  )

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

  // A form goes back to the learner page, keeping its Back.
  function closeForm() {
    navigate(`/app/learners/${encodeURIComponent(learnerRef)}?back=${encodeURIComponent(back)}`)
  }

  function handleSaved() {
    closeForm()
    loadLearners()
  }

  // Opens a learner's page from wherever they were picked, with Back to
  // here, on the tab this person used last.
  function openLearner(learnRefNumber, backTo = path) {
    navigate(learnerPath(me, learnRefNumber, backTo))
  }

  // The search and filter live in the address, replaced as they change
  // rather than each adding a step to Back.
  function setFilters(q, statusValue) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (statusValue && statusValue !== 'all') params.set('status', statusValue)
    const text = params.toString()
    navigate(`${path.split('?')[0]}${text ? `?${text}` : ''}`, { replace: true })
  }

  function handleClearFilters() {
    setFilters('', 'all')
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

  // The learner list, the learner page, or another tab.
  const onList = view.tab === 'learners' && !learnerRef
  const tab = view.tab
  const [report, caseloadOfficer] = tab === 'reports' ? view.rest : []
  const listPath = `/app/learners${listQuery}`

  return (
    <div className="warren">
      {tabSlot &&
        createPortal(
          <nav aria-label="Warren">
            {TABS.filter((t) => t.shows(can)).map((t) => (
              <a
                key={t.slug}
                href={`/app/${t.slug}`}
                className={activeTab === t.slug ? 'shell-tab is-active' : 'shell-tab'}
                aria-current={activeTab === t.slug && !learnerRef ? 'page' : undefined}
              >
                {t.label}
              </a>
            ))}
          </nav>,
          tabSlot,
        )}

      <main className="app-main">
      {!redirect && !isKnownView(view) && (
        <Notice tone="error">
          There&apos;s nothing at this address in Warren. <a href={warrenHome(me)}>Go to your first page</a>.
        </Notice>
      )}
      {!redirect && learnerMissing && (
        <Notice tone="error">
          There&apos;s no learner {learnerRef} that you can see. <a href={back}>Go back</a>
        </Notice>
      )}
      {!redirect && learnerRef && status === 'loading' && <p>Loading…</p>}
      {!redirect && learnerRef && status === 'error' && <p role="alert">Couldn&apos;t load this learner: {error}</p>}
      {!redirect && learnerRow && isKnownView(view) && (
        <div className="learner-page">
          <LearnerHeader
            learnRefNumber={learnerRef}
            name={learnerName}
            detail={standardLabel(learnerRow, { withLevel: false })}
            tab="record"
            back={back}
          />
          {!learnerAction && <LearnerRecord key={learnerRef} learner={learnerRow} canManage={isManager} back={back} />}
          {isManager && learnerAction === 'edit' && (
            <EditLearnerForm
              key={learnerRef}
              learner={learnerRow}
              standards={standards}
              standardsStatus={standardsStatus}
              onSaved={handleSaved}
              onCancel={closeForm}
            />
          )}
          {isManager && learnerAction === 'complete' && (
            <MarkCompletedForm key={learnerRef} learner={learnerRow} onSaved={handleSaved} onCancel={closeForm} />
          )}
          {isManager && learnerAction === 'withdraw' && (
            <WithdrawAimForm key={learnerRef} learner={learnerRow} onSaved={handleSaved} onCancel={closeForm} />
          )}
        </div>
      )}
      {!redirect && onList && (
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
                onChange={(e) => setFilters(e.target.value, statusFilter)}
                aria-label="Search by learner ref or name"
              />
              <select
                value={statusFilter}
                onChange={(e) => setFilters(searchText, e.target.value)}
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
                    <a className="link-button" href={learnerPath(me, learner.LEARNREFNUMBER, listPath)}>
                      {learner.GIVENNAMES} {learner.FAMILYNAME}
                    </a>
                  </td>
                  <td>{standardLabel(learner, { withLevel: false })}</td>
                  <td>
                    <CompletionStatus compstatus={learner.COMPSTATUS} plannedEndDate={learner.LEARNPLANENDDATE} />
                  </td>
                  {isManager && (
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => navigate(learnerActionPath(learner.LEARNREFNUMBER, 'edit', listPath))}
                      >
                        Edit
                      </button>
                      {learner.COMPSTATUS === 1 && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => navigate(learnerActionPath(learner.LEARNREFNUMBER, 'complete', listPath))}
                        >
                          Mark completed
                        </button>
                      )}
                      {learner.COMPSTATUS === 1 && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => navigate(learnerActionPath(learner.LEARNREFNUMBER, 'withdraw', listPath))}
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

      {isManager && (
        <AddLearnerForm standards={standards} standardsStatus={standardsStatus} onLearnerAdded={loadLearners} />
      )}

      </>
      )}

      {!redirect && tab === 'dashboard' && (
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

      {!redirect && tab === 'officers' && isKnownView(view) && (
        <Officers
          learners={learners}
          learnersStatus={status}
          officerRef={view.rest[0] ?? null}
          onOpenLearner={openLearner}
        />
      )}

      {!redirect && tab === 'my-day' && <MyDay me={me} onOpenLearner={openLearner} />}
      {!redirect && tab === 'reports' && isKnownView(view) && (
        <Reports
          report={report}
          caseloadOfficer={caseloadOfficer ?? null}
          year={view.params.get('year')}
          onOpenLearner={openLearner}
          isManager={isManager}
        />
      )}
      {!redirect && tab === 'sign-offs' && <IqaSignOffs onOpenLearner={openLearner} />}

      </main>
    </div>
  )
}

export default App
