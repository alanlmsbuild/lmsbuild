import { StatusBadge } from './ui/components'
import { COMPLETION_STATUS_LABELS, completionTone, describe } from './lookups'

// Whole months from a 'YYYY-MM-DD' date to today, or null if the date is
// today or later.
function monthsPast(date) {
  if (!date) return null
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)
  const today = new Date()
  const end = new Date(y, m - 1, d)
  if (!(end < new Date(today.getFullYear(), today.getMonth(), today.getDate()))) return null
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() - (m - 1))
  if (today.getDate() < d) months--
  return months
}

// "5 months past planned end", for an aim still continuing (or on a break)
// after its planned end date with no outcome. Null otherwise.
export function pastPlannedEndNote(compstatus, plannedEndDate) {
  if (compstatus !== 1 && compstatus !== 6) return null
  const months = monthsPast(plannedEndDate)
  if (months === null) return null
  if (months < 1) return 'Less than a month past planned end'
  return `${months} month${months === 1 ? '' : 's'} past planned end`
}

// A programme aim's completion status as a status chip: its word and its
// status colour. Given the planned end date, it also says when a
// continuing aim (or a break) is past it, as the QAR's data quality warning
// does.
function CompletionStatus({ compstatus, plannedEndDate }) {
  const note = pastPlannedEndNote(compstatus, plannedEndDate)
  const badge = <StatusBadge tone={completionTone(compstatus)}>{describe(COMPLETION_STATUS_LABELS, compstatus)}</StatusBadge>
  if (!note) return badge
  return (
    <span className="completion-status">
      {badge}
      <span className="completion-status-note">{note}</span>
    </span>
  )
}

export default CompletionStatus
