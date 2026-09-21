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

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB')
}
