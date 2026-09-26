// Human-readable labels for a few common ILR reference codes, so the table
// isn't just raw numbers. Falls back to showing the code itself if unknown.

export const AIM_TYPE_LABELS = {
  1: 'Programme aim',
  3: 'Component (funded)',
  4: 'Core aim',
  5: 'Additional learning aim',
}

export const COMPLETION_STATUS_LABELS = {
  1: 'Continuing',
  2: 'Completed',
  3: 'Withdrawn',
  6: 'Temporarily withdrawn',
}

export const OUTCOME_LABELS = {
  1: 'Achieved',
  2: 'Partially achieved',
  3: 'No achievement',
  8: 'Achieved, not certificated',
}

export function describe(map, code) {
  if (code === null || code === undefined) return '—'
  return map[code] ?? `Code ${code}`
}

// The colour used to mark a completion status, shared by the learner table
// and the dashboard so the same status always reads the same way. Continuing
// deliberately gets no colour, since it's the ordinary, unremarkable state.
export function statusClassName(compstatus) {
  if (compstatus === 2) return 'status-completed'
  if (compstatus === 3) return 'status-withdrawn'
  return ''
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB')
}

// Formats a LARS standard, e.g. "ST0072 Customer Service Practitioner
// (Level 2)". Works on a row from GET /api/standards or a learner row from
// GET /api/learners, since both carry STDCODE, STDREFERENCE, STDNAME and
// STDLEVEL. Pass { withLevel: false } for the shorter "ST0072 Customer
// Service Practitioner" used in lists and panels.
export function standardLabel(row, { withLevel = true } = {}) {
  if (row?.STDCODE === null || row?.STDCODE === undefined) return '—'
  if (!row.STDNAME) return `Code ${row.STDCODE} (not in LARS)`
  const level = withLevel && row.STDLEVEL != null ? ` (Level ${row.STDLEVEL})` : ''
  return `${row.STDREFERENCE ?? ''} ${row.STDNAME}${level}`.trim()
}

// Looks up a label from one of the {code, label} option lists in
// ilrCodes.js (e.g. SEX_OPTIONS, ETHNICITY_OPTIONS) by code. Codes are
// compared as strings so this works whether the value passed in is a
// number (as stored in the database) or a string (as held in form state).
export function labelFromOptions(options, code) {
  if (code === null || code === undefined || code === '') return '—'
  const match = options.find((o) => String(o.code) === String(code))
  return match ? match.label : `Code ${code}`
}

// Looks up labels for a comma-separated list of codes (e.g. a learner's
// CONTACTMETHODSALLOWED column) and joins them back together for display.
export function labelsFromCommaList(options, commaSeparated) {
  if (!commaSeparated) return '—'
  return commaSeparated
    .split(',')
    .map((code) => labelFromOptions(options, code))
    .join(', ')
}
