import { useState } from 'react'
import QarReport from './QarReport'
import CaseloadReport from './CaseloadReport'
import IlrReturn from './IlrReturn'

// The Reports tab. Each report fetches its own figures from
// /api/reports/..., where they're worked out in Snowflake SQL. The ILR
// return is for managers only.
function Reports({ onOpenLearner, isManager }) {
  const [report, setReport] = useState('qar') // 'qar' | 'caseload' | 'ilr'

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
        {isManager && (
          <button
            type="button"
            className={report === 'ilr' ? 'tab active' : 'tab'}
            onClick={() => setReport('ilr')}
          >
            ILR return
          </button>
        )}
      </nav>

      {report === 'qar' && <QarReport onOpenLearner={onOpenLearner} />}
      {report === 'caseload' && <CaseloadReport onOpenLearner={onOpenLearner} />}
      {report === 'ilr' && isManager && <IlrReturn onOpenLearner={onOpenLearner} />}
    </section>
  )
}

export default Reports
