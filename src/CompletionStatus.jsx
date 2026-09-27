import { StatusBadge } from './ui/components'
import { COMPLETION_STATUS_LABELS, completionTone, describe } from './lookups'

// A programme aim's completion status as a status chip: its word and its
// status colour.
function CompletionStatus({ compstatus }) {
  return <StatusBadge tone={completionTone(compstatus)}>{describe(COMPLETION_STATUS_LABELS, compstatus)}</StatusBadge>
}

export default CompletionStatus
