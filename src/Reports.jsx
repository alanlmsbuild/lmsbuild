import { useState } from 'react'
import QarReport from './QarReport'
import CaseloadReport from './CaseloadReport'

// The Reports tab. Each report fetches its own figures from
// /api/reports/..., where they're worked out in Snowflake SQL.
function Reports({ onOpenLearner }) {
  const [report, setReport] = useState('qar') // 'qar' | 'caseload'

  return (
    <section id="reports">
      <h2>Reports</h2>
      <nav className="report-tabs" aria-label="Reports">
        <button
          type="button"
          className={report === 'qar' ? 'tab active' : 'tab'}
          onClick={() => setReport('qar')}
        >
          QAR (indicative)
        </button>
        <button
          type="button"
          className={report === 'caseload' ? 'tab active' : 'tab'}
          onClick={() => setReport('caseload')}
        >
          Caseload
        </button>
      </nav>

      {report === 'qar' && <QarReport onOpenLearner={onOpenLearner} />}
      {report === 'caseload' && <CaseloadReport onOpenLearner={onOpenLearner} />}
    </section>
  )
}

export default Reports
