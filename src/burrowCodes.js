// Burrow's shared lists and rules. No browser or Node dependencies, so the
// screens and the server use exactly the same values.

// Evidence types offered on the add evidence screen, stored in
// BURROW.EVIDENCE.EVIDENCE_TYPE.
export const EVIDENCE_TYPE_OPTIONS = [
  { code: 'photo', label: 'Photo' },
  { code: 'video', label: 'Video' },
  { code: 'document', label: 'Document' },
  { code: 'witness_statement', label: 'Witness statement' },
  { code: 'reflection', label: 'Reflection only' },
]

// These types are about a file, so they need one before they can be sent.
export const TYPES_NEEDING_A_FILE = new Set(['photo', 'video', 'document'])

// BURROW.EVIDENCE.STATUS values, as the learner sees them.
export const EVIDENCE_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  changes_requested: 'Needs changes',
  signed_off: 'Signed off',
  withdrawn: 'Withdrawn',
}

// An employer's answer on a witness statement, stored in
// BURROW.WITNESS_CONFIRMATION.OUTCOME.
export const WITNESS_OUTCOME_OPTIONS = [
  { code: 'confirmed', label: 'Confirmed' },
  { code: 'declined', label: 'Declined' },
]

// An IQA's finding on an assessor's sign-off, stored in
// BURROW.IQA_CHECK.OUTCOME.
export const IQA_OUTCOME_OPTIONS = [
  { code: 'agreed', label: 'Agreed' },
  { code: 'action_required', label: 'Action required' },
]

// Evidence can only be edited, and files added or removed, in these states.
export const EDITABLE_STATUSES = new Set(['draft', 'changes_requested'])

// A KSB's status, worked out on the server from its evidence and reviews.
export const KSB_STATUS_ORDER = ['signed_off', 'awaiting_review', 'needs_changes', 'not_started']
export const KSB_STATUS_LABELS = {
  signed_off: 'Signed off',
  awaiting_review: 'Awaiting review',
  needs_changes: 'Needs changes',
  not_started: 'Not started',
}

// How many KSBs have each status, for the progress bar and counts.
export function countStatuses(ksbs) {
  const counts = { signed_off: 0, awaiting_review: 0, needs_changes: 0, not_started: 0 }
  for (const k of ksbs) counts[k.STATUS] = (counts[k.STATUS] ?? 0) + 1
  return counts
}

export const KSB_GROUPS = [
  { type: 'K', title: 'Knowledge' },
  { type: 'S', title: 'Skills' },
  { type: 'B', title: 'Behaviours' },
]

// ---------------------------------------------------------------- uploads

const MB = 1024 * 1024
export const MAX_FILES_PER_EVIDENCE = 5

// Allowed uploads by extension. `mime` is what's stored and served;
// `browserTypes` are the types browsers report for it (an empty or generic
// type is also accepted, since the server checks the file's first bytes
// anyway). `kind` picks the signature check on the server.
export const UPLOAD_RULES = {
  jpg: { kind: 'jpeg', mime: 'image/jpeg', maxBytes: 20 * MB, browserTypes: ['image/jpeg', 'image/pjpeg'] },
  jpeg: { kind: 'jpeg', mime: 'image/jpeg', maxBytes: 20 * MB, browserTypes: ['image/jpeg', 'image/pjpeg'] },
  png: { kind: 'png', mime: 'image/png', maxBytes: 20 * MB, browserTypes: ['image/png'] },
  webp: { kind: 'webp', mime: 'image/webp', maxBytes: 20 * MB, browserTypes: ['image/webp'] },
  heic: { kind: 'heic', mime: 'image/heic', maxBytes: 20 * MB, browserTypes: ['image/heic', 'image/heif'] },
  heif: { kind: 'heic', mime: 'image/heif', maxBytes: 20 * MB, browserTypes: ['image/heic', 'image/heif'] },
  pdf: { kind: 'pdf', mime: 'application/pdf', maxBytes: 20 * MB, browserTypes: ['application/pdf'] },
  docx: {
    kind: 'office',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    maxBytes: 20 * MB,
    browserTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  xlsx: {
    kind: 'office',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    maxBytes: 20 * MB,
    browserTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  pptx: {
    kind: 'office',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    maxBytes: 20 * MB,
    browserTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
  txt: { kind: 'text', mime: 'text/plain', maxBytes: 20 * MB, browserTypes: ['text/plain'] },
  mp4: { kind: 'mp4', mime: 'video/mp4', maxBytes: 100 * MB, browserTypes: ['video/mp4'] },
  mov: { kind: 'mov', mime: 'video/quicktime', maxBytes: 100 * MB, browserTypes: ['video/quicktime'] },
}

export const GENERIC_BROWSER_TYPES = new Set(['', 'application/octet-stream'])

export const ACCEPT_ATTRIBUTE = Object.keys(UPLOAD_RULES)
  .map((ext) => `.${ext}`)
  .join(',')

export const ALLOWED_FILES_TEXT =
  'Photos (JPEG, PNG, HEIC, WebP) and documents (PDF, Word, Excel, PowerPoint, text) up to 20 MB; videos (MP4, MOV) up to 100 MB. Up to 5 files.'

export function fileExtension(filename) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(filename ?? ''))
  return match ? match[1].toLowerCase() : ''
}

// A first check in the browser, and again on the server before anything is
// read. Returns an error message, or null if the file looks allowed. The
// server then checks the file's real type from its first bytes.
export function checkUpload(filename, browserType, size) {
  const rule = UPLOAD_RULES[fileExtension(filename)]
  if (!rule) return `${filename} isn't a type Burrow accepts. ${ALLOWED_FILES_TEXT}`
  const type = String(browserType ?? '').toLowerCase()
  if (!GENERIC_BROWSER_TYPES.has(type) && !rule.browserTypes.includes(type)) {
    return `${filename} doesn't look like the kind of file its name says it is.`
  }
  if (size !== undefined && size > rule.maxBytes) {
    return `${filename} is too big. The limit for this kind of file is ${rule.maxBytes / MB} MB.`
  }
  return null
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}
