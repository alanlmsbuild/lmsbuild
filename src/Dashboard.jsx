import { STANDARD_OPTIONS } from './ilrCodes'
import { formatDate } from './lookups'

const STANDARD_LABELS = new Map(STANDARD_OPTIONS.map((o) => [o.code, o.label]))

const DAYS_AHEAD = 60

// Everything here is derived from the learner list already fetched for the
// table, so no separate dashboard endpoint is needed.
function Dashboard({ learners }) {
  const totalLearners = learners.length
  const continuing = learners.filter((l) => l.COMPSTATUS === 1).length
  const completed = learners.filter((l) => l.COMPSTATUS === 2).length
  const withdrawn = learners.filter((l) => l.COMPSTATUS === 3).length

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + DAYS_AHEAD)

  const upcomingEnds = learners
    .filter((l) => l.COMPSTATUS === 1 && l.LEARNPLANENDDATE)
    .filter((l) => {
      const end = new Date(l.LEARNPLANENDDATE)
      return end >= today && end <= cutoff
    })
    .sort((a, b) => new Date(a.LEARNPLANENDDATE) - new Date(b.LEARNPLANENDDATE))

  const standardCounts = new Map()
  for (const learner of learners) {
    const code = learner.STDCODE ?? null
    standardCounts.set(code, (standardCounts.get(code) ?? 0) + 1)
  }
  const standardRows = [...standardCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({
      code,
      count,
      label: code === null ? 'No standard code' : (STANDARD_LABELS.get(code) ?? `Code ${code}`),
    }))

  return (
    <section id="dashboard">
      <h2>Dashboard</h2>
      <p className="section-intro">A snapshot of the learners currently in the system.</p>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{totalLearners}</span>
          <span className="stat-label">Total learners</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{continuing}</span>
          <span className="stat-label">Continuing</span>
        </div>
        <div className="stat-card">
          <span className="stat-value status-completed">{completed}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat-card">
          <span className="stat-value status-withdrawn">{withdrawn}</span>
          <span className="stat-label">Withdrawn</span>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <h3>Planned end dates in the next {DAYS_AHEAD} days ({upcomingEnds.length})</h3>
          {upcomingEnds.length === 0 ? (
            <p className="empty-note">No continuing aims are due to end in this window.</p>
          ) : (
            <ul className="dashboard-list">
              {upcomingEnds.map((learner) => (
                <li key={`${learner.LEARNREFNUMBER}-${learner.LEARNAIMREF}`}>
                  <span>
                    {learner.GIVENNAMES} {learner.FAMILYNAME}
                  </span>
                  <span className="dashboard-list-meta">{formatDate(learner.LEARNPLANENDDATE)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dashboard-panel">
          <h3>Learners by standard</h3>
          {standardRows.length === 0 ? (
            <p className="empty-note">No learners yet.</p>
          ) : (
            <ul className="dashboard-list">
              {standardRows.map((row) => (
                <li key={row.code ?? 'none'}>
                  <span>{row.label}</span>
                  <span className="dashboard-list-meta">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export default Dashboard
