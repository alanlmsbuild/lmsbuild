// Burrow's learner endpoints: portfolio, evidence, and files.
//
// Everything is worked out in Snowflake SQL. KSBs come from CAPTURE_DB.SKILLS
// (loaded by scripts/import-ksbs.js); until that has data, every screen says
// the KSBs aren't loaded yet and nothing is made up. Evidence is never
// deleted: taking a file or a KSB off a draft marks the row instead.
//
// Every *_BY column the app writes (CREATED_BY, UPDATED_BY, CLAIMED_BY,
// UNCLAIMED_BY, UPLOADED_BY, REMOVED_BY) is the signed-in user's USERID.
// Rows saved before that hold the learner reference instead.
//
// Who can do what (see access.js for which learners each user can see):
//   the learner list   learners and staff, showing only the learners they can see
//   reading a portfolio, its evidence and files   the learner and staff
//   changing evidence  only the learner, on their own portfolio
// Employers never get the portfolio: employer.js gives them their
// apprentices' progress and the witness statements they're asked to confirm.

import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import busboy from 'busboy'
import { execute } from './db.js'
import { allow, IN_VISIBLE_LEARNERS, LEARNER, STAFF, VISIBLE_LEARNER } from './access.js'
import { validateEvidenceForm, validateEvidenceSubmission } from '../src/validation.js'
import {
  EDITABLE_STATUSES,
  MAX_FILES_PER_EVIDENCE,
  UPLOAD_RULES,
  checkUpload,
  fileExtension,
} from '../src/burrowCodes.js'

const STAGE = '@CAPTURE_DB.BURROW.EVIDENCE_FILES'
const LARGEST_UPLOAD = Math.max(...Object.values(UPLOAD_RULES).map((r) => r.maxBytes))

// A problem with the request itself, shown to the user as-is.
export class RequestError extends Error {
  constructor(message, status = 400, fields = undefined) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export function sendError(res, err, fallback) {
  if (err instanceof RequestError) {
    res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) })
    return
  }
  console.error(`${fallback}:`, err.message)
  res.status(500).json({ error: `${fallback}. Please try again.` })
}

// ---------------------------------------------------------------- the learner and their KSBs

// The learner, their programme aim's standard, and the KSBs for that
// standard's ST reference in SKILLS (none until the import has run).
const LEARNER_QUERY = `
  select
    l.LEARNREFNUMBER,
    l.GIVENNAMES,
    l.FAMILYNAME,
    ld.STDCODE,
    s.REFERENCE as STDREFERENCE,
    s.NAME as STDNAME,
    s.NOTIONAL_END_LEVEL as STDLEVEL,
    ld.COMPSTATUS
  from ${VISIBLE_LEARNER} l
  left join LEARNING_DELIVERY ld
    on ld.LEARNREFNUMBER = l.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  left join LARS.STANDARD s
    on s.STANDARD_CODE = ld.STDCODE
  where l.LEARNREFNUMBER = ?
`

const LEARNERS_QUERY = `
  select
    l.LEARNREFNUMBER,
    l.GIVENNAMES,
    l.FAMILYNAME,
    s.REFERENCE as STDREFERENCE,
    s.NAME as STDNAME
  from ${VISIBLE_LEARNER} l
  left join LEARNING_DELIVERY ld
    on ld.LEARNREFNUMBER = l.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  left join LARS.STANDARD s
    on s.STANDARD_CODE = ld.STDCODE
  order by l.LEARNREFNUMBER
`

// The occupation for an ST reference: normally one. If there were ever more
// than one, the most recently fetched wins. Bind: the ST reference.
const OCCUPATION_CTE = `
  occupation as (
    select OCCUPATION_CODE, VERSION
    from SKILLS.OCCUPATION
    where ST_REFERENCE = ?
    qualify row_number() over (order by FETCHED_AT desc) = 1
  )
`

// Every KSB on the learner's standard with its status, from the learner's
// claims on it (ignoring claims taken off, and withdrawn evidence):
//   signed off      - an assessor confirmed it on evidence that's signed off
//   awaiting review - claimed on evidence that has been submitted
//   needs changes   - claimed on evidence sent back with changes requested
//   not started     - anything else, including KSBs only on drafts
// Binds: the ST reference (occupation), the learner, the ST reference.
export const KSB_STATUS_QUERY = `
  with ${OCCUPATION_CTE},
  ksbs as (
    select k.KSB_TYPE, k.KSB_REFERENCE, k.DETAIL, k.SORT_ORDER
    from SKILLS.KSB k
    join occupation o
      on o.OCCUPATION_CODE = k.OCCUPATION_CODE
  ),
  claims as (
    select ek.KSB_TYPE, ek.KSB_REFERENCE, e.STATUS, ek.DECISION
    from BURROW.EVIDENCE e
    join BURROW.EVIDENCE_KSB ek
      on ek.EVIDENCE_ID = e.EVIDENCE_ID
    where e.LEARNREFNUMBER = ?
      and e.ST_REFERENCE = ?
      and e.STATUS <> 'withdrawn'
      and ek.UNCLAIMED_AT is null
  )
  select
    k.KSB_TYPE,
    k.KSB_REFERENCE,
    k.DETAIL,
    k.SORT_ORDER,
    case
      when count_if(c.STATUS = 'signed_off' and c.DECISION = 'confirmed') > 0 then 'signed_off'
      when count_if(c.STATUS = 'submitted') > 0 then 'awaiting_review'
      when count_if(c.STATUS = 'changes_requested') > 0 then 'needs_changes'
      else 'not_started'
    end as STATUS
  from ksbs k
  left join claims c
    on c.KSB_TYPE = k.KSB_TYPE
   and c.KSB_REFERENCE = k.KSB_REFERENCE
  group by k.KSB_TYPE, k.KSB_REFERENCE, k.DETAIL, k.SORT_ORDER
  order by decode(k.KSB_TYPE, 'K', 1, 'S', 2, 3), k.SORT_ORDER
`

// The learner's evidence, newest first, with its claimed KSB references,
// for evidence sent back the latest review's feedback, and for a witness
// statement the employer's answer on its latest submission.
// Binds: the learner, the ST reference.
export const EVIDENCE_LIST_QUERY = `
  with latest_review as (
    select EVIDENCE_ID, FEEDBACK, OFFICER_NAME, REVIEWED_AT
    from BURROW.EVIDENCE_REVIEW
    qualify row_number() over (partition by EVIDENCE_ID order by REVIEWED_AT desc) = 1
  ),
  latest_confirmation as (
    select EVIDENCE_ID, SUBMISSION_NUMBER, OUTCOME, CONFIRMER_NAME, COMMENT_TEXT
    from BURROW.WITNESS_CONFIRMATION
    qualify row_number() over (partition by EVIDENCE_ID order by CONFIRMED_AT desc) = 1
  ),
  claimed as (
    select
      EVIDENCE_ID,
      listagg(KSB_REFERENCE, ', ') within group (order by decode(KSB_TYPE, 'K', 1, 'S', 2, 3), KSB_REFERENCE) as KSB_REFS
    from BURROW.EVIDENCE_KSB
    where UNCLAIMED_AT is null
    group by EVIDENCE_ID
  )
  select
    e.EVIDENCE_ID,
    e.TITLE,
    e.EVIDENCE_TYPE,
    e.OCCURRED_ON,
    e.STATUS,
    e.UPDATED_AT,
    e.SUBMITTED_AT,
    c.KSB_REFS,
    r.FEEDBACK,
    r.OFFICER_NAME,
    r.REVIEWED_AT,
    wc.OUTCOME as EMPLOYER_OUTCOME,
    wc.CONFIRMER_NAME as EMPLOYER_CONFIRMER,
    wc.COMMENT_TEXT as EMPLOYER_COMMENT
  from BURROW.EVIDENCE e
  left join claimed c
    on c.EVIDENCE_ID = e.EVIDENCE_ID
  left join latest_review r
    on r.EVIDENCE_ID = e.EVIDENCE_ID
  left join latest_confirmation wc
    on wc.EVIDENCE_ID = e.EVIDENCE_ID
   and wc.SUBMISSION_NUMBER = e.SUBMISSION_COUNT
  where e.LEARNREFNUMBER = ?
    and e.ST_REFERENCE = ?
    and e.STATUS <> 'withdrawn'
  order by e.UPDATED_AT desc
`

async function findLearner(connection, learnRefNumber) {
  const [learner] = await execute(connection, LEARNER_QUERY, [learnRefNumber])
  if (!learner) throw new RequestError('Learner not found.', 404)
  if (!learner.STDREFERENCE) {
    throw new RequestError("This learner's standard isn't in LARS, so Burrow can't show their KSBs.", 409)
  }
  return learner
}

async function standardKsbs(connection, stReference) {
  const rows = await execute(
    connection,
    `with ${OCCUPATION_CTE}
     select k.KSB_TYPE, k.KSB_REFERENCE, k.DETAIL, o.VERSION
     from SKILLS.KSB k
     join occupation o on o.OCCUPATION_CODE = k.OCCUPATION_CODE`,
    [stReference],
  )
  return new Map(rows.map((r) => [r.KSB_REFERENCE, r]))
}

// ---------------------------------------------------------------- evidence

const EVIDENCE_QUERY = `
  select *
  from BURROW.EVIDENCE
  where EVIDENCE_ID = ?
    and LEARNREFNUMBER = ?
    and LEARNREFNUMBER in (select LEARNREFNUMBER from ${VISIBLE_LEARNER})
`

const ACTIVE_CLAIMS_QUERY = `
  select KSB_TYPE, KSB_REFERENCE
  from BURROW.EVIDENCE_KSB
  where EVIDENCE_ID = ?
    and UNCLAIMED_AT is null
  order by decode(KSB_TYPE, 'K', 1, 'S', 2, 3), KSB_REFERENCE
`

const ACTIVE_FILES_QUERY = `
  select FILE_ID, ORIGINAL_FILENAME, CONTENT_TYPE, SIZE_BYTES, UPLOADED_AT
  from BURROW.EVIDENCE_FILE
  where EVIDENCE_ID = ?
    and REMOVED_AT is null
  order by UPLOADED_AT
`

async function findEvidence(connection, evidenceId, learnRefNumber) {
  const [evidence] = await execute(connection, EVIDENCE_QUERY, [evidenceId, learnRefNumber])
  if (!evidence) throw new RequestError('Evidence not found.', 404)
  return evidence
}

// Evidence is changed only by the learner it belongs to. Anyone else who
// can see the portfolio (their tutor, say) is refused.
function requireOwnPortfolio(req) {
  if (!req.user.roles.includes(LEARNER) || req.user.LEARNREFNUMBER !== req.params.learnRefNumber) {
    throw new RequestError('Only the learner can change their own evidence.', 403)
  }
}

function requireEditable(evidence) {
  if (!EDITABLE_STATUSES.has(evidence.STATUS)) {
    throw new RequestError('This evidence has been sent for review, so it can’t be changed now.', 409)
  }
}

// KSB references a form may claim: only ones on the learner's standard.
function checkKsbs(ksbRefs, standard) {
  const unknown = ksbRefs.filter((ref) => !standard.has(ref))
  if (unknown.length > 0) {
    throw new RequestError('Please fix the highlighted fields.', 400, {
      ksbs: standard.size === 0
        ? "Your standard's KSBs aren't loaded yet, so none can be ticked."
        : `${unknown.join(', ')} ${unknown.length === 1 ? "isn't" : "aren't"} on your standard.`,
    })
  }
}

function normaliseKsbs(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((ref) => String(ref).trim().toUpperCase()))]
}

// Makes the evidence's active claims match `wanted`. Claims taken off are
// marked with UNCLAIMED_AT, never deleted; claims added back are reopened.
// The assessor's decision columns are left alone.
async function setClaims(connection, evidence, wanted, standard, by) {
  const rows = await execute(
    connection,
    'select KSB_REFERENCE, UNCLAIMED_AT from BURROW.EVIDENCE_KSB where EVIDENCE_ID = ?',
    [evidence.EVIDENCE_ID],
  )
  const existing = new Map(rows.map((r) => [r.KSB_REFERENCE, r]))
  const wantedSet = new Set(wanted)

  for (const ref of wanted) {
    const ksb = standard.get(ref)
    const row = existing.get(ref)
    if (!row) {
      await execute(
        connection,
        `insert into BURROW.EVIDENCE_KSB
           (EVIDENCE_ID, ST_REFERENCE, KSB_TYPE, KSB_REFERENCE, KSB_TEXT, STANDARD_VERSION, CLAIMED_BY)
         values (?, ?, ?, ?, ?, ?, ?)`,
        [evidence.EVIDENCE_ID, evidence.ST_REFERENCE, ksb.KSB_TYPE, ref, ksb.DETAIL, ksb.VERSION, by],
      )
    } else if (row.UNCLAIMED_AT) {
      await execute(
        connection,
        `update BURROW.EVIDENCE_KSB
         set UNCLAIMED_AT = null, UNCLAIMED_BY = null, CLAIMED_AT = current_timestamp(), CLAIMED_BY = ?,
             KSB_TEXT = ?, STANDARD_VERSION = ?
         where EVIDENCE_ID = ? and KSB_REFERENCE = ?`,
        [by, ksb.DETAIL, ksb.VERSION, evidence.EVIDENCE_ID, ref],
      )
    }
  }
  for (const [ref, row] of existing) {
    if (!wantedSet.has(ref) && !row.UNCLAIMED_AT) {
      await execute(
        connection,
        `update BURROW.EVIDENCE_KSB
         set UNCLAIMED_AT = current_timestamp(), UNCLAIMED_BY = ?
         where EVIDENCE_ID = ? and KSB_REFERENCE = ?`,
        [by, evidence.EVIDENCE_ID, ref],
      )
    }
  }
}

async function inTransaction(connection, work) {
  await execute(connection, 'begin')
  try {
    const result = await work()
    await execute(connection, 'commit')
    return result
  } catch (err) {
    try {
      await execute(connection, 'rollback')
    } catch (rollbackErr) {
      console.error('Failed to roll back transaction:', rollbackErr.message)
    }
    throw err
  }
}

function formFields(body) {
  const v = body ?? {}
  return {
    title: String(v.title ?? '').trim(),
    evidenceType: v.evidenceType,
    occurredOn: v.occurredOn,
    reflection: String(v.reflection ?? '').trim(),
    ksbs: normaliseKsbs(v.ksbs),
  }
}

// ---------------------------------------------------------------- uploads

// The file's real type, from its first bytes (its "signature"). `head` is
// up to the first 4 KB. Returns true when the bytes match the kind that
// the extension claims.
export function signatureMatches(kind, head) {
  const ascii = (start, end) => head.subarray(start, end).toString('latin1')
  const brand = head.length >= 12 && ascii(4, 8) === 'ftyp' ? ascii(8, 12) : null
  switch (kind) {
    case 'jpeg':
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    case 'png':
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    case 'heic':
      return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)
    case 'mp4':
      return ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', 'dash', 'mmp4'].includes(brand)
    case 'mov':
      return brand === 'qt  ' || ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(4, 8))
    case 'pdf':
      return ascii(0, 5) === '%PDF-'
    case 'office':
      // Word, Excel and PowerPoint files are ZIP archives underneath.
      return head.length >= 4 && ascii(0, 4) === 'PK\u0003\u0004'
    case 'text': {
      // Plain text has no signature: accept UTF-8 with no NUL bytes.
      if (head.includes(0)) return false
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(trimPartialUtf8(head))
        return true
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

// The 4 KB sample can end part way through a multi-byte character; drop
// the incomplete end so it isn't mistaken for invalid text.
function trimPartialUtf8(buf) {
  let end = buf.length
  let back = 0
  while (back < 3 && end - back - 1 >= 0 && (buf[end - back - 1] & 0xc0) === 0x80) back++
  const lead = buf[end - back - 1]
  if (lead !== undefined) {
    const needed = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1
    if (needed > back + 1) end = end - back - 1
  }
  return buf.subarray(0, end)
}

// Reads the one file in a multipart upload into `targetPath`, checking its
// size as it arrives and its signature once the first 4 KB are in, and
// working out its MD5. Rejects with a RequestError for anything refused.
// The caller deletes the temporary folder whether this succeeds or not.
export function receiveFile(req, targetPath) {
  return new Promise((resolve, reject) => {
    let bb
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fields: 0, fileSize: LARGEST_UPLOAD + 1 } })
    } catch {
      reject(new RequestError('Send the file as a form upload.'))
      return
    }

    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err)
    }
    let filePromise = null

    bb.on('file', (_field, stream, info) => {
      const filename = String(info.filename ?? '').trim()
      const problem = filename ? checkUpload(filename, info.mimeType) : 'The file has no name.'
      if (problem) {
        stream.resume()
        fail(new RequestError(problem, 415))
        return
      }
      const rule = UPLOAD_RULES[fileExtension(filename)]
      const hash = crypto.createHash('md5')
      let size = 0
      let head = Buffer.alloc(0)
      let checked = false

      const inspect = new Transform({
        transform(chunk, _enc, done) {
          size += chunk.length
          if (size > rule.maxBytes) {
            done(new RequestError(`${filename} is too big. The limit for this kind of file is ${rule.maxBytes / (1024 * 1024)} MB.`, 413))
            return
          }
          if (!checked) {
            head = Buffer.concat([head, chunk]).subarray(0, 4096)
            if (head.length >= 4096) {
              checked = true
              if (!signatureMatches(rule.kind, head)) {
                done(new RequestError(`${filename} isn't really a .${fileExtension(filename)} file, so it can't be uploaded.`, 415))
                return
              }
            }
          }
          hash.update(chunk)
          done(null, chunk)
        },
        flush(done) {
          if (size === 0) {
            done(new RequestError(`${filename} is empty.`))
            return
          }
          // Files smaller than 4 KB are checked here instead.
          if (!checked && !signatureMatches(rule.kind, head)) {
            done(new RequestError(`${filename} isn't really a .${fileExtension(filename)} file, so it can't be uploaded.`, 415))
            return
          }
          done()
        },
      })

      filePromise = pipeline(stream, inspect, fs.createWriteStream(targetPath))
        .then(() => ({ filename, rule, size, md5: hash.digest('hex') }))
        .catch((err) => {
          // Keep reading (and discarding) the rest so the request can finish.
          stream.resume()
          throw err
        })
      filePromise.catch(fail)
    })

    bb.on('error', (err) => fail(new RequestError(`The upload didn't arrive complete (${err.message}).`)))
    bb.on('close', async () => {
      if (!filePromise) {
        fail(new RequestError('No file was sent.'))
        return
      }
      try {
        const result = await filePromise
        if (!settled) {
          settled = true
          resolve(result)
        }
      } catch (err) {
        fail(err)
      }
    })
    // A connection dropped part way through: stop, and let the caller clean up.
    req.on('aborted', () => fail(new RequestError('The upload was interrupted.')))
    req.pipe(bb)
  })
}

// PUT the file into the evidence stage, uncompressed and never overwriting.
// PUT names the stage file after the local file, so the local file is
// already called <FILE_ID>.<ext>.
export async function putFile(connection, localPath, stageFolder, stage = STAGE) {
  const rows = await execute(
    connection,
    `put 'file://${localPath}' ${stage}/${stageFolder}/ auto_compress = false overwrite = false`,
  )
  const status = String(rows?.[0]?.status ?? rows?.[0]?.STATUS ?? '').toUpperCase()
  if (status !== 'UPLOADED') throw new Error(`upload to the stage reported "${status || 'nothing'}"`)
}

// GET one file from the stage into a local folder; returns its local path.
export async function getFile(connection, stagePath, localFolder, stage = STAGE) {
  await execute(connection, `get ${stage}/${stagePath} 'file://${localFolder}/'`)
  const local = path.join(localFolder, path.basename(stagePath))
  await fsp.access(local)
  return local
}

function contentDisposition(kind, filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

// Streams one file (a row with STAGE_PATH, ORIGINAL_FILENAME and
// CONTENT_TYPE, or undefined for "not found") from the stage through the
// server. ?download=1 saves it instead of showing it in the browser. The
// caller has already checked the user may see it.
export async function sendStageFile(req, res, file) {
  if (!file) throw new RequestError('File not found.', 404)
  let tmpDir
  try {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'burrow-download-'))
    const local = await getFile(req.db, file.STAGE_PATH, tmpDir)
    res.setHeader('Content-Type', file.CONTENT_TYPE)
    res.setHeader('Content-Disposition', contentDisposition(req.query.download ? 'attachment' : 'inline', file.ORIGINAL_FILENAME))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    await pipeline(fs.createReadStream(local), res)
  } catch (err) {
    // Part way through sending, the response can only be cut short.
    if (res.headersSent) console.error('Failed while sending a file:', err.message)
    else throw err
  } finally {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- routes

export function registerBurrowRoutes(app) {
  app.get('/api/burrow/learners', allow(LEARNER, STAFF), async (req, res) => {
    const connection = req.db
    try {
      res.json(await execute(connection, LEARNERS_QUERY))
    } catch (err) {
      sendError(res, err, 'Could not load learners')
    }
  })

  app.get('/api/burrow/learners/:learnRefNumber/portfolio', allow(LEARNER, STAFF), async (req, res) => {
    const connection = req.db
    try {
      const learner = await findLearner(connection, req.params.learnRefNumber)
      const st = learner.STDREFERENCE
      const [ksbs, evidence, [occupation]] = await Promise.all([
        execute(connection, KSB_STATUS_QUERY, [st, learner.LEARNREFNUMBER, st]),
        execute(connection, EVIDENCE_LIST_QUERY, [learner.LEARNREFNUMBER, st]),
        execute(connection, `with ${OCCUPATION_CTE} select * from occupation`, [st]),
      ])
      res.json({ learner, occupation: occupation ?? null, ksbsLoaded: ksbs.length > 0, ksbs, evidence })
    } catch (err) {
      sendError(res, err, 'Could not load the portfolio')
    }
  })

  app.get('/api/burrow/learners/:learnRefNumber/evidence/:evidenceId', allow(LEARNER, STAFF), async (req, res) => {
    const connection = req.db
    try {
      const evidence = await findEvidence(connection, req.params.evidenceId, req.params.learnRefNumber)
      const [claims, files] = await Promise.all([
        execute(connection, ACTIVE_CLAIMS_QUERY, [evidence.EVIDENCE_ID]),
        execute(connection, ACTIVE_FILES_QUERY, [evidence.EVIDENCE_ID]),
      ])
      res.json({ evidence, ksbs: claims.map((c) => c.KSB_REFERENCE), files })
    } catch (err) {
      sendError(res, err, 'Could not load this evidence')
    }
  })

  // Creates a draft. Sending for review is a separate step, after any files
  // have uploaded, so nothing half-finished is ever sent.
  app.post('/api/burrow/learners/:learnRefNumber/evidence', allow(LEARNER), async (req, res) => {
    const fields = formFields(req.body)
    const fieldErrors = validateEvidenceForm(fields)
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: 'Please fix the highlighted fields.', fields: fieldErrors })
      return
    }
    const connection = req.db
    try {
      requireOwnPortfolio(req)
      const learner = await findLearner(connection, req.params.learnRefNumber)
      const standard = await standardKsbs(connection, learner.STDREFERENCE)
      checkKsbs(fields.ksbs, standard)

      const evidenceId = crypto.randomUUID()
      const by = req.user.USERID
      await inTransaction(connection, async () => {
        await execute(
          connection,
          `insert into BURROW.EVIDENCE
             (EVIDENCE_ID, LEARNREFNUMBER, STDCODE, ST_REFERENCE, TITLE, EVIDENCE_TYPE, OCCURRED_ON, REFLECTION,
              STATUS, CREATED_BY, UPDATED_BY)
           values (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
          [evidenceId, learner.LEARNREFNUMBER, learner.STDCODE, learner.STDREFERENCE, fields.title, fields.evidenceType,
            fields.occurredOn, fields.reflection || null, by, by],
        )
        await setClaims(connection, { EVIDENCE_ID: evidenceId, ST_REFERENCE: learner.STDREFERENCE }, fields.ksbs, standard, by)
      })
      res.status(201).json({ evidenceId })
    } catch (err) {
      sendError(res, err, 'Could not save this evidence')
    }
  })

  app.put('/api/burrow/learners/:learnRefNumber/evidence/:evidenceId', allow(LEARNER), async (req, res) => {
    const fields = formFields(req.body)
    const fieldErrors = validateEvidenceForm(fields)
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: 'Please fix the highlighted fields.', fields: fieldErrors })
      return
    }
    const connection = req.db
    try {
      requireOwnPortfolio(req)
      const learner = await findLearner(connection, req.params.learnRefNumber)
      const evidence = await findEvidence(connection, req.params.evidenceId, learner.LEARNREFNUMBER)
      requireEditable(evidence)
      const standard = await standardKsbs(connection, evidence.ST_REFERENCE)
      checkKsbs(fields.ksbs, standard)

      const by = req.user.USERID
      await inTransaction(connection, async () => {
        await execute(
          connection,
          `update BURROW.EVIDENCE
           set TITLE = ?, EVIDENCE_TYPE = ?, OCCURRED_ON = ?, REFLECTION = ?,
               UPDATED_AT = current_timestamp(), UPDATED_BY = ?
           where EVIDENCE_ID = ? and ${IN_VISIBLE_LEARNERS}`,
          [fields.title, fields.evidenceType, fields.occurredOn, fields.reflection || null, by, evidence.EVIDENCE_ID],
        )
        await setClaims(connection, evidence, fields.ksbs, standard, by)
      })
      res.json({ evidenceId: evidence.EVIDENCE_ID })
    } catch (err) {
      sendError(res, err, 'Could not save this evidence')
    }
  })

  // Sends a draft (or evidence sent back for changes) for review, checking
  // what's actually saved rather than anything the browser says.
  app.post('/api/burrow/learners/:learnRefNumber/evidence/:evidenceId/submit', allow(LEARNER), async (req, res) => {
    const connection = req.db
    try {
      requireOwnPortfolio(req)
      const learner = await findLearner(connection, req.params.learnRefNumber)
      const evidence = await findEvidence(connection, req.params.evidenceId, learner.LEARNREFNUMBER)
      requireEditable(evidence)
      const [claims, files] = await Promise.all([
        execute(connection, ACTIVE_CLAIMS_QUERY, [evidence.EVIDENCE_ID]),
        execute(connection, ACTIVE_FILES_QUERY, [evidence.EVIDENCE_ID]),
      ])
      const saved = {
        title: evidence.TITLE,
        evidenceType: evidence.EVIDENCE_TYPE,
        occurredOn: evidence.OCCURRED_ON instanceof Date
          ? evidence.OCCURRED_ON.toISOString().slice(0, 10)
          : String(evidence.OCCURRED_ON).slice(0, 10),
        reflection: evidence.REFLECTION ?? '',
        ksbs: claims.map((c) => c.KSB_REFERENCE),
      }
      const fieldErrors = validateEvidenceSubmission(saved, files.length)
      if (Object.keys(fieldErrors).length > 0) {
        res.status(400).json({ error: 'This isn’t ready to send yet.', fields: fieldErrors })
        return
      }
      await execute(
        connection,
        `update BURROW.EVIDENCE
         set STATUS = 'submitted', SUBMISSION_COUNT = SUBMISSION_COUNT + 1,
             SUBMITTED_AT = current_timestamp(), UPDATED_AT = current_timestamp(), UPDATED_BY = ?
         where EVIDENCE_ID = ? and STATUS in ('draft', 'changes_requested') and ${IN_VISIBLE_LEARNERS}`,
        [req.user.USERID, evidence.EVIDENCE_ID],
      )
      res.json({ evidenceId: evidence.EVIDENCE_ID, status: 'submitted' })
    } catch (err) {
      sendError(res, err, 'Could not send this for review')
    }
  })

  // One file per request. The evidence is checked first, so nothing is read
  // for evidence that can't take it. The temporary folder is always removed.
  app.post('/api/burrow/learners/:learnRefNumber/evidence/:evidenceId/files', allow(LEARNER), async (req, res) => {
    const connection = req.db
    let tmpDir
    try {
      requireOwnPortfolio(req)
      const evidence = await findEvidence(connection, req.params.evidenceId, req.params.learnRefNumber)
      requireEditable(evidence)
      const files = await execute(connection, ACTIVE_FILES_QUERY, [evidence.EVIDENCE_ID])
      if (files.length >= MAX_FILES_PER_EVIDENCE) {
        throw new RequestError(`A piece of evidence can have up to ${MAX_FILES_PER_EVIDENCE} files.`, 409)
      }

      const fileId = crypto.randomUUID()
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'burrow-upload-'))
      // The extension is only known once the upload starts, so write to a
      // neutral name and rename before the PUT.
      const incoming = path.join(tmpDir, 'incoming')
      const upload = await receiveFile(req, incoming)
      const ext = fileExtension(upload.filename)
      const localPath = path.join(tmpDir, `${fileId}.${ext}`)
      await fsp.rename(incoming, localPath)

      const stageFolder = `${evidence.LEARNREFNUMBER}/${evidence.EVIDENCE_ID}`
      const stagePath = `${stageFolder}/${fileId}.${ext}`
      await putFile(connection, localPath, stageFolder)
      try {
        await execute(
          connection,
          `insert into BURROW.EVIDENCE_FILE
             (FILE_ID, EVIDENCE_ID, STAGE_PATH, ORIGINAL_FILENAME, CONTENT_TYPE, SIZE_BYTES, CHECKSUM_MD5, UPLOADED_BY)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          [fileId, evidence.EVIDENCE_ID, stagePath, upload.filename, upload.rule.mime, upload.size, upload.md5,
            req.user.USERID],
        )
      } catch (err) {
        console.error(`Stage file ${stagePath} was uploaded but its EVIDENCE_FILE row could not be saved.`)
        throw err
      }
      res.status(201).json({
        FILE_ID: fileId,
        ORIGINAL_FILENAME: upload.filename,
        CONTENT_TYPE: upload.rule.mime,
        SIZE_BYTES: upload.size,
      })
    } catch (err) {
      sendError(res, err, 'Could not upload this file')
    } finally {
      if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true })
    }
  })

  // Takes a file off a draft. The row and the stored file are both kept.
  app.post('/api/burrow/learners/:learnRefNumber/evidence/:evidenceId/files/:fileId/remove', allow(LEARNER), async (req, res) => {
    const connection = req.db
    try {
      requireOwnPortfolio(req)
      const evidence = await findEvidence(connection, req.params.evidenceId, req.params.learnRefNumber)
      requireEditable(evidence)
      await execute(
        connection,
        `update BURROW.EVIDENCE_FILE
         set REMOVED_AT = current_timestamp(), REMOVED_BY = ?
         where FILE_ID = ? and EVIDENCE_ID = ? and REMOVED_AT is null`,
        [req.user.USERID, req.params.fileId, evidence.EVIDENCE_ID],
      )
      res.json({ fileId: req.params.fileId })
    } catch (err) {
      sendError(res, err, 'Could not remove this file')
    }
  })

  // A file on any evidence of a learner the user can see.
  app.get('/api/burrow/learners/:learnRefNumber/files/:fileId', allow(LEARNER, STAFF), async (req, res) => {
    const connection = req.db
    try {
      const [file] = await execute(
        connection,
        `select f.STAGE_PATH, f.ORIGINAL_FILENAME, f.CONTENT_TYPE
         from BURROW.EVIDENCE_FILE f
         join BURROW.EVIDENCE e on e.EVIDENCE_ID = f.EVIDENCE_ID
         join ${VISIBLE_LEARNER} l on l.LEARNREFNUMBER = e.LEARNREFNUMBER
         where f.FILE_ID = ? and e.LEARNREFNUMBER = ?`,
        [req.params.fileId, req.params.learnRefNumber],
      )
      await sendStageFile(req, res, file)
    } catch (err) {
      sendError(res, err, 'Could not fetch this file')
    }
  })
}
