import QarReport from './QarReport'
import CaseloadReport from './CaseloadReport'
import IlrReturn from './IlrReturn'

// The Reports tab. Each report has its own address (/app/reports/qar,
// /caseload, /ilr), and fetches its own figures from /api/reports/...,
// where they're worked out in Snowflake SQL. The ILR return is for
// managers only.
const REPORT_TABS = [
  { report: 'qar', label: 'QAR (indicative)' },
  { report: 'caseload', label: 'Caseload' },
  { report: 'ilr', label: 'ILR return', managersOnly: true },
]

function Reports({ report, caseloadOfficer, year, onOpenLearner, isManager }) {
  return (
    <section id="reports">
      <h2>Reports</h2>
      <nav className="report-tabs" aria-label="Reports">
        {REPORT_TABS.filter((t) => isManager || !t.managersOnly).map((t) => (
          <a
            key={t.report}
            href={`/app/reports/${t.report}`}
            className={report === t.report ? 'tab active' : 'tab'}
            aria-current={report === t.report ? 'page' : undefined}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {report === 'qar' && <QarReport year={year} onOpenLearner={onOpenLearner} />}
      {report === 'caseload' && <CaseloadReport officerRef={caseloadOfficer} onOpenLearner={onOpenLearner} />}
      {report === 'ilr' && isManager && <IlrReturn onOpenLearner={onOpenLearner} />}
    </section>
  )
}

export default Reports
