import { useEffect, useRef, useState } from 'react'
import {
  ACCEPT_ATTRIBUTE,
  ALLOWED_FILES_TEXT,
  EDITABLE_STATUSES,
  EVIDENCE_TYPE_OPTIONS,
  KSB_GROUPS,
  MAX_FILES_PER_EVIDENCE,
  UPLOAD_RULES,
  checkUpload,
  countStatuses,
  fileExtension,
} from '../burrowCodes'
import { validateEvidenceForm, validateEvidenceSubmission } from '../validation'
import FilePreview from './FilePreview'
import { KsbText, NotLoaded, StatusBar } from './KsbParts'

// Screens 2 and 3: adding evidence, on a computer and on a phone. On a
// phone (see burrow.css) the four capture tiles come first and the form
// only opens once something has been captured, so a photo can be saved as
// a draft straight away and finished later.
//
// Saving always goes: save the evidence as a draft, upload any new files
// one at a time, then (if sending) ask the server to send it for review.
// Nothing half-finished is ever sent, and a failed upload leaves a draft.

const PHONE_QUERY = '(max-width: 700px)'

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY)
    const onChange = () => setIsPhone(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return isPhone
}

// Today in the learner's own time zone, as YYYY-MM-DD.
function localToday() {
  return new Date().toLocaleDateString('en-CA')
}

function captureTitle(kind) {
  const when = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${kind}, ${when}`
}

function typeForFile(file) {
  const mime = UPLOAD_RULES[fileExtension(file.name)]?.mime ?? file.type
  if (mime.startsWith('image/')) return 'photo'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

let pendingCounter = 0

function AddEvidence({ portfolio, evidenceId: initialEvidenceId, navigate, onSaved }) {
  const { learner, ksbs, ksbsLoaded } = portfolio
  const learnerPath = `/api/burrow/learners/${encodeURIComponent(learner.LEARNREFNUMBER)}`
  const isPhone = useIsPhone()
  const reflectionRef = useRef(null)
  const fileInputRef = useRef(null)

  const [evidenceId, setEvidenceId] = useState(initialEvidenceId)
  const [loadStatus, setLoadStatus] = useState(initialEvidenceId ? 'loading' : 'ready')
  const [savedStatus, setSavedStatus] = useState(initialEvidenceId ? null : 'draft')
  const [form, setForm] = useState({
    title: '',
    evidenceType: 'document',
    occurredOn: localToday(),
    reflection: '',
    ksbs: [],
  })
  const [files, setFiles] = useState([]) // already uploaded
  const [pending, setPending] = useState([]) // chosen, not yet uploaded
  const [refused, setRefused] = useState([])
  const [removingId, setRemovingId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [captureStarted, setCaptureStarted] = useState(Boolean(initialEvidenceId))

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(null) // null | 'draft' | 'send'
  const [progress, setProgress] = useState(null)

  // Carrying on with a draft (or evidence sent back for changes).
  useEffect(() => {
    if (!initialEvidenceId) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${learnerPath}/evidence/${encodeURIComponent(initialEvidenceId)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        if (cancelled) return
        const e = data.evidence
        setForm({
          title: e.TITLE ?? '',
          evidenceType: e.EVIDENCE_TYPE,
          occurredOn: String(e.OCCURRED_ON).slice(0, 10),
          reflection: e.REFLECTION ?? '',
          ksbs: data.ksbs,
        })
        setFiles(data.files)
        setSavedStatus(e.STATUS)
        setLoadStatus('ready')
      } catch (err) {
        if (cancelled) return
        setServerError(err.message)
        setLoadStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [initialEvidenceId, learnerPath])

  // Local previews are freed as each file is removed or uploaded; any
  // still here when the page closes are freed then.
  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  useEffect(() => () => pendingRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl)), [])

  const editable = savedStatus === null || EDITABLE_STATUSES.has(savedStatus)
  const fileCount = files.length + pending.length
  const tickCount = form.ksbs.length

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function toggleKsb(ref) {
    setForm((f) => ({ ...f, ksbs: f.ksbs.includes(ref) ? f.ksbs.filter((r) => r !== ref) : [...f.ksbs, ref] }))
  }

  // Checks each chosen file in the browser first (the server checks again,
  // including the file's real type from its first bytes).
  function addFiles(list, { captureKind } = {}) {
    const chosen = [...list]
    const problems = []
    const accepted = []
    for (const file of chosen) {
      if (fileCount + accepted.length >= MAX_FILES_PER_EVIDENCE) {
        problems.push(`${file.name}: a piece of evidence can have up to ${MAX_FILES_PER_EVIDENCE} files.`)
        continue
      }
      const problem = checkUpload(file.name, file.type, file.size)
      if (problem) {
        problems.push(problem)
        continue
      }
      const rule = UPLOAD_RULES[fileExtension(file.name)]
      const previewable = rule.mime.startsWith('image/') || rule.mime.startsWith('video/')
      accepted.push({
        key: `pending-${++pendingCounter}`,
        file,
        contentType: rule.mime,
        previewUrl: previewable ? URL.createObjectURL(file) : null,
      })
    }
    setRefused(problems)
    if (accepted.length === 0) return
    setPending((p) => [...p, ...accepted])
    setCaptureStarted(true)
    setForm((f) => {
      const first = accepted[0].file
      const type = captureKind ?? typeForFile(first)
      const kindLabel = EVIDENCE_TYPE_OPTIONS.find((o) => o.code === type)?.label ?? 'Evidence'
      return {
        ...f,
        evidenceType: f.title ? f.evidenceType : type,
        title: f.title || (captureKind ? captureTitle(kindLabel) : first.name.replace(/\.[^.]+$/, '')),
      }
    })
  }

  function removePending(key) {
    const item = pending.find((x) => x.key === key)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setPending((p) => p.filter((x) => x.key !== key))
  }

  // Takes an uploaded file off this draft. The server keeps the file and
  // its record, and marks it as removed.
  async function removeUploaded(file) {
    setRemovingId(file.FILE_ID)
    setServerError(null)
    try {
      const res = await fetch(
        `${learnerPath}/evidence/${encodeURIComponent(evidenceId)}/files/${encodeURIComponent(file.FILE_ID)}/remove`,
        { method: 'POST' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not remove this file.')
      setFiles((f) => f.filter((x) => x.FILE_ID !== file.FILE_ID))
    } catch (err) {
      setServerError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  function startReflection() {
    setCaptureStarted(true)
    setForm((f) => ({
      ...f,
      evidenceType: 'reflection',
      title: f.title || captureTitle('Reflection'),
    }))
    setTimeout(() => reflectionRef.current?.focus(), 0)
  }

  async function uploadOne(id, item) {
    const body = new FormData()
    body.append('file', item.file, item.file.name)
    const res = await fetch(`${learnerPath}/evidence/${encodeURIComponent(id)}/files`, { method: 'POST', body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
    return data
  }

  async function save(send) {
    setServerError(null)
    const fieldErrors = send ? validateEvidenceSubmission(form, fileCount) : validateEvidenceForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(send ? 'send' : 'draft')
    let id = evidenceId
    try {
      // 1. Save the details (always as a draft first).
      setProgress('Saving…')
      const res = await fetch(id ? `${learnerPath}/evidence/${encodeURIComponent(id)}` : `${learnerPath}/evidence`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        throw new Error(data.error || 'Could not save this evidence.')
      }
      id = data.evidenceId
      setEvidenceId(id)
      setSavedStatus((s) => s ?? 'draft')

      // 2. Upload new files, one at a time.
      let left = [...pending]
      for (const [i, item] of pending.entries()) {
        setProgress(`Uploading ${item.file.name} (${i + 1} of ${pending.length})…`)
        try {
          const uploaded = await uploadOne(id, item)
          setFiles((f) => [...f, uploaded])
          left = left.filter((x) => x.key !== item.key)
          setPending(left)
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        } catch (err) {
          throw new Error(`Saved as a draft, but ${item.file.name} couldn't be uploaded: ${err.message}`)
        }
      }

      // 3. Send it for review.
      if (send) {
        setProgress('Sending for review…')
        const sent = await fetch(`${learnerPath}/evidence/${encodeURIComponent(id)}/submit`, { method: 'POST' })
        const sentData = await sent.json()
        if (!sent.ok) {
          setErrors(sentData.fields || {})
          throw new Error(`Saved as a draft, but not sent: ${sentData.error || 'please try again.'}`)
        }
      }

      if (send) onSaved(`Sent for review: ${form.title}`)
      else if (savedStatus === 'changes_requested') onSaved(`Saved your changes to ${form.title}. Send it when it's ready.`)
      else onSaved(`Saved as a draft: ${form.title}. You can finish it later.`)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSaving(null)
      setProgress(null)
    }
  }

  const sendLabel =
    tickCount === 0 ? 'Send for review' : `Send for review (${tickCount} ${tickCount === 1 ? 'KSB' : 'KSBs'})`
  const counts = countStatuses(ksbs)
  const stillToEvidence = ksbs.filter((k) => k.STATUS === 'not_started')
  const needsChanges = portfolio.evidence.filter((e) => e.STATUS === 'changes_requested')

  if (loadStatus === 'loading') return <p className="burrow-muted">Opening your evidence…</p>
  if (loadStatus === 'error') return <p role="alert">Couldn&apos;t open this evidence: {serverError}</p>

  if (!editable) {
    return (
      <div className="burrow-card burrow-locked">
        <h1>{form.title}</h1>
        <p>This has been sent for review, so it can&apos;t be changed now.</p>
        <button type="button" className="burrow-button-secondary" onClick={() => navigate('/burrow')}>
          Back to my portfolio
        </button>
      </div>
    )
  }

  // On a phone, the draft button is the main one: capture now, finish later.
  const draftButton = (
    <button
      type="button"
      className={isPhone ? 'burrow-button' : 'burrow-button-secondary'}
      disabled={saving !== null}
      onClick={() => save(false)}
    >
      {saving === 'draft' ? 'Saving…' : 'Save as draft'}
    </button>
  )
  const sendButton = (
    <button
      type="button"
      className={isPhone ? 'burrow-button-secondary' : 'burrow-button'}
      disabled={saving !== null || !ksbsLoaded}
      title={ksbsLoaded ? undefined : "Your standard's KSBs aren't loaded yet"}
      onClick={() => save(true)}
    >
      {saving === 'send' ? 'Sending…' : sendLabel}
    </button>
  )

  return (
    <div className={`burrow-layout burrow-add${captureStarted ? '' : ' is-capture-idle'}`}>
      <main className="burrow-main">
        <div className="burrow-add-head">
          <h1>{savedStatus === 'changes_requested' ? 'Update evidence' : evidenceId ? 'Finish your draft' : 'Add evidence'}</h1>
          <p className="burrow-phone-only">Capture it now, add the details later.</p>
        </div>

        {/* Phone only: quick capture tiles. Photo and video open the camera. */}
        <div className="burrow-capture-tiles burrow-phone-only">
          <label className="burrow-tile burrow-tile-clay">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                addFiles(e.target.files, { captureKind: 'photo' })
                e.target.value = ''
              }}
            />
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            Take a photo
          </label>
          <label className="burrow-tile burrow-tile-green">
            <input
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(e) => {
                addFiles(e.target.files, { captureKind: 'video' })
                e.target.value = ''
              }}
            />
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <rect x="3" y="6" width="13" height="12" rx="2" />
              <path d="M16 10l5-3v10l-5-3z" />
            </svg>
            Record a video
          </label>
          <label className="burrow-tile">
            <input
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            Upload a file
          </label>
          <button type="button" className="burrow-tile" onClick={startReflection}>
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4" />
            </svg>
            Write a reflection
          </button>
        </div>

        {refused.length > 0 && (
          <ul className="burrow-refused" role="alert">
            {refused.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        {/* Phone only, before anything is captured: progress and feedback. */}
        <div className="burrow-phone-cards burrow-phone-only">
          <section className="burrow-card">
            <div className="burrow-progress-head">
              <strong>Your progress</strong>
              <a
                href="/burrow"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/burrow')
                }}
              >
                See all
              </a>
            </div>
            {ksbsLoaded ? (
              <>
                <span>
                  {counts.signed_off} of {ksbs.length} KSBs signed off
                </span>
                <StatusBar counts={counts} total={ksbs.length} thin />
              </>
            ) : (
              <NotLoaded />
            )}
          </section>
          {needsChanges.length > 0 && (
            <section className="burrow-card burrow-card-clay">
              <strong>
                {needsChanges.length} {needsChanges.length === 1 ? 'piece needs' : 'pieces need'} changes
              </strong>
              <span>Your assessor has left feedback.</span>
              <a
                href="/burrow/feedback"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/burrow/feedback')
                }}
              >
                Read feedback
              </a>
            </section>
          )}
        </div>

        {serverError && (
          <p className="burrow-error" role="alert">
            {serverError}
          </p>
        )}

        <div className="burrow-form">
          <div className="burrow-form-grid">
            <div className="burrow-form-fields">
              <label className="burrow-field">
                <span>Give it a title</span>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="For example: Helping a customer choose the right plan"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                />
                {errors.title && <span className="burrow-field-error">{errors.title}</span>}
              </label>

              <div className="burrow-field-pair">
                <label className="burrow-field">
                  <span>What kind of evidence?</span>
                  <select value={form.evidenceType} onChange={(e) => updateField('evidenceType', e.target.value)}>
                    {EVIDENCE_TYPE_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {errors.evidenceType && <span className="burrow-field-error">{errors.evidenceType}</span>}
                </label>
                <label className="burrow-field">
                  <span>When did it happen?</span>
                  <input
                    type="date"
                    max={localToday()}
                    value={form.occurredOn}
                    onChange={(e) => updateField('occurredOn', e.target.value)}
                  />
                  {errors.occurredOn && <span className="burrow-field-error">{errors.occurredOn}</span>}
                </label>
              </div>

              <div
                className={dragging ? 'burrow-drop is-dragging' : 'burrow-drop'}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  addFiles(e.dataTransfer.files)
                }}
              >
                <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
                </svg>
                <span>Drag a file here, or</span>
                <button
                  type="button"
                  className="burrow-button-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={fileCount >= MAX_FILES_PER_EVIDENCE}
                >
                  Choose a file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <span className="burrow-muted burrow-drop-note">{ALLOWED_FILES_TEXT}</span>
              </div>
              {errors.files && <span className="burrow-field-error">{errors.files}</span>}

              {(files.length > 0 || pending.length > 0) && (
                <div className="burrow-files">
                  {files.map((f) => (
                    <FilePreview
                      key={f.FILE_ID}
                      name={f.ORIGINAL_FILENAME}
                      contentType={f.CONTENT_TYPE}
                      size={f.SIZE_BYTES}
                      src={`${learnerPath}/files/${encodeURIComponent(f.FILE_ID)}`}
                      downloadHref={`${learnerPath}/files/${encodeURIComponent(f.FILE_ID)}?download=1`}
                      onRemove={() => removeUploaded(f)}
                      removing={removingId === f.FILE_ID}
                    />
                  ))}
                  {pending.map((p) => (
                    <FilePreview
                      key={p.key}
                      name={p.file.name}
                      contentType={p.contentType}
                      size={p.file.size}
                      src={p.previewUrl}
                      onRemove={() => removePending(p.key)}
                    />
                  ))}
                </div>
              )}

              <label className="burrow-field">
                <span>What did you do, and what did you learn?</span>
                <textarea
                  ref={reflectionRef}
                  rows={8}
                  maxLength={5000}
                  placeholder="Describe what happened, what you did and why, and what you would do differently next time."
                  value={form.reflection}
                  onChange={(e) => updateField('reflection', e.target.value)}
                />
                {errors.reflection && <span className="burrow-field-error">{errors.reflection}</span>}
              </label>
            </div>

            <section className="burrow-card burrow-ksb-picker" aria-label="KSBs this shows">
              <h2>Which KSBs does this show?</h2>
              {ksbsLoaded ? (
                <>
                  <p className="burrow-muted">Tick every one it covers. Your assessor will confirm each.</p>
                  {KSB_GROUPS.map((group) => (
                    <fieldset key={group.type}>
                      <legend>{group.title}</legend>
                      {ksbs
                        .filter((k) => k.KSB_TYPE === group.type)
                        .map((k) => (
                          <div key={k.KSB_REFERENCE} className="burrow-ksb-option">
                            <input
                              id={`ksb-${k.KSB_REFERENCE}`}
                              type="checkbox"
                              checked={form.ksbs.includes(k.KSB_REFERENCE)}
                              onChange={() => toggleKsb(k.KSB_REFERENCE)}
                              aria-label={`${k.KSB_REFERENCE} ${k.DETAIL}`}
                            />
                            <label htmlFor={`ksb-${k.KSB_REFERENCE}`} className="burrow-ksb-ref">
                              {k.KSB_REFERENCE}
                            </label>
                            <KsbText text={k.DETAIL} />
                          </div>
                        ))}
                    </fieldset>
                  ))}
                </>
              ) : (
                <NotLoaded />
              )}
              {errors.ksbs && <span className="burrow-field-error">{errors.ksbs}</span>}
            </section>
          </div>

          <div className="burrow-actions">
            {isPhone ? (
              <>
                {draftButton}
                {sendButton}
              </>
            ) : (
              <>
                {sendButton}
                {draftButton}
              </>
            )}
            {progress && (
              <span className="burrow-muted" role="status">
                {progress}
              </span>
            )}
          </div>
        </div>
      </main>

      <aside className="burrow-aside burrow-desktop-only">
        <section className="burrow-card burrow-tips">
          <h2>What makes good evidence</h2>
          <p>Say what you did, not just what happened.</p>
          <p>Explain why you did it that way.</p>
          <p>Say what you learned, or would change next time.</p>
          <p>Leave out customers&apos; personal details.</p>
        </section>
        <section className="burrow-card">
          <h2 className="burrow-h2-small">Still to evidence</h2>
          {!ksbsLoaded ? (
            <NotLoaded />
          ) : stillToEvidence.length === 0 ? (
            <p className="burrow-muted">Every KSB has some evidence.</p>
          ) : (
            <ul className="burrow-still-list">
              {stillToEvidence.map((k) => (
                <li key={k.KSB_REFERENCE}>
                  <span className="burrow-ksb-ref">{k.KSB_REFERENCE}</span>
                  <KsbText text={k.DETAIL} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  )
}

export default AddEvidence
