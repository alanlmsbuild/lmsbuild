// Meadow's drop-off report (GET /api/meadow/funnel), in the style of the
// approved mock-up (pipeline option C, "funnel with outcome"): the
// candidate stages in the board's three bands, for each stage how many
// reached it, how many left from it and why, and the % who carried on to
// the next; then the outcome box. Managers only, like the board; read on
// Meadow's sessions (crmSessions.js, as CRM_APP_USER), the organisation a
// bind in every query (check:scoping rule 21).
//
// Every candidate journey so far counts once, at its furthest stage: the
// highest stage it has ever been in (its stage moves in STAGE_CHANGE and
// the stage it's in now), so someone who skipped a stage still reached it.
// Reached a stage = furthest stage there or later. Left from a stage = not
// proceeding, with that as their furthest stage, so the "left from" counts
// add up to everyone not proceeding. The totals reconcile: everyone reached
// the first stage, and it equals enrolled + in progress + not proceeding;
// at each stage, reached = left from it + still there + reached the next.
//
// Choosing college or sixth form is a good outcome, not a failure: it's
// counted with those who left (it ends the journey) but shown as positive.
// The outcome box waits for Warren's outcomes to be linked: no figure.

import { allow, MANAGER } from './access.js'
import { execute } from './db.js'
import { sendError } from './burrow.js'
import { withCrmSession } from './crmSessions.js'
import { BANDS, STAGES_QUERY } from './meadow.js'

// Close reasons that are a good outcome, by the key at the end of their ID
// (CR-ORG-T003-CANDIDATE-COLLEGE is COLLEGE), so a provider can reword the
// label.
export const POSITIVE_REASONS = ['COLLEGE']

// Each candidate journey's outcome (its stage's category), close reason and
// furthest stage reached (SORTORDER), counted.
const JOURNEYS_QUERY = `
  with items as (
    select i.ITEMID, i.CLOSEREASONID, s.CATEGORY, s.SORTORDER
    from CRM_DB.CRM.PIPELINE_ITEM i
    join CRM_DB.CRM.PIPELINE p
      on p.PIPELINEID = i.PIPELINEID and p.ORGANISATIONID = i.ORGANISATIONID
    join CRM_DB.CRM.PIPELINE_STAGE s
      on s.STAGEID = i.STAGEID and s.ORGANISATIONID = i.ORGANISATIONID
    where i.ORGANISATIONID = ? and i.RECORDTYPE = 'lead' and p.KIND = 'candidate'
  ),
  visited as (
    select it.ITEMID, vs.SORTORDER
    from items it
    join CRM_DB.CRM.STAGE_CHANGE c on c.ITEMID = it.ITEMID and c.ORGANISATIONID = ?
    join CRM_DB.CRM.PIPELINE_STAGE vs
      on vs.STAGEID = c.TOSTAGEID and vs.ORGANISATIONID = c.ORGANISATIONID
    where vs.CATEGORY <> 'lost'
    union all
    select it.ITEMID, it.SORTORDER from items it where it.CATEGORY <> 'lost'
  ),
  furthest as (
    select ITEMID, max(SORTORDER) as FURTHEST from visited group by ITEMID
  )
  select it.CATEGORY, it.CLOSEREASONID, f.FURTHEST, count(*) as N
  from items it
  left join furthest f on f.ITEMID = it.ITEMID
  group by it.CATEGORY, it.CLOSEREASONID, f.FURTHEST
`

const REASONS_QUERY = `
  select r.REASONID, r.LABEL, r.SORTORDER
  from CRM_DB.CRM.CLOSE_REASON r
  join CRM_DB.CRM.PIPELINE p
    on p.PIPELINEID = r.PIPELINEID and p.ORGANISATIONID = r.ORGANISATIONID
  where r.ORGANISATIONID = ? and p.KIND = 'candidate'
  order by r.SORTORDER
`

const stageKey = (stageId) => stageId.split('-CANDIDATE-')[1] ?? stageId
const reasonKey = (reasonId) => (reasonId ? reasonId.split('-CANDIDATE-')[1] ?? reasonId : null)

// The report from the queries' rows (no database, so the test can check it).
export function buildFunnel({ stages, journeys, reasons }) {
  const open = stages.filter((s) => s.CATEGORY !== 'lost')
  const labels = new Map(reasons.map((r) => [r.REASONID, { label: r.LABEL, order: Number(r.SORTORDER) }]))
  // A journey's furthest stage: the last active stage at or before its
  // furthest SORTORDER (the first stage if it never had one, e.g. moved
  // straight to Not proceeding).
  const indexOf = (furthest) => {
    if (furthest == null) return 0
    let index = 0
    open.forEach((s, i) => { if (Number(s.SORTORDER) <= Number(furthest)) index = i })
    return index
  }
  const rows = open.map((s) => ({ stageId: s.STAGEID, key: stageKey(s.STAGEID), name: s.NAME, enrolled: s.SYSTEMKEY === 'ENROLLED', left: 0, stillHere: 0, endedHere: 0, reasons: new Map() }))
  const totals = { joined: 0, enrolled: 0, inProgress: 0, notProceeding: 0, positive: 0 }
  for (const j of journeys) {
    const n = Number(j.N)
    if (rows.length === 0) break
    const row = rows[indexOf(j.FURTHEST)]
    totals.joined += n
    if (j.CATEGORY === 'lost') {
      totals.notProceeding += n
      row.left += n
      const key = j.CLOSEREASONID ?? null
      row.reasons.set(key, (row.reasons.get(key) ?? 0) + n)
      if (POSITIVE_REASONS.includes(reasonKey(key))) totals.positive += n
    } else if (j.CATEGORY === 'won') {
      totals.enrolled += n
      row.endedHere += n
    } else {
      totals.inProgress += n
      row.stillHere += n
    }
  }
  // Reached a stage: furthest stage there or later.
  let later = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    rows[i].reached = later + rows[i].left + rows[i].stillHere + rows[i].endedHere
    later = rows[i].reached
  }
  const first = rows[0]?.reached ?? 0
  const out = rows.map((r, i) => {
    const next = rows[i + 1]
    return {
      stageId: r.stageId,
      key: r.key,
      name: r.name,
      reached: r.reached,
      share: first ? r.reached / first : 0,
      left: r.left,
      stillHere: r.stillHere,
      carriedOn: next && r.reached ? Math.round((next.reached / r.reached) * 100) : null,
      leftReasons: [...r.reasons]
        .map(([id, n]) => ({
          reasonId: id,
          label: id ? labels.get(id)?.label ?? 'Another reason' : 'No reason recorded',
          count: n,
          positive: POSITIVE_REASONS.includes(reasonKey(id)),
          order: id ? labels.get(id)?.order ?? 999 : 1000,
        }))
        .sort((a, b) => b.count - a.count || a.order - b.order)
        .map(({ order: _order, ...x }) => x),
    }
  })
  const bands = BANDS.map(({ key, name, note }) => ({ key, name, note, stages: [] }))
  let band = bands[0]
  for (const r of out) {
    band = bands[BANDS.findIndex((b) => b.stages.includes(r.key))] ?? band
    band.stages.push(r)
  }
  return {
    bands: bands.filter((b) => b.stages.length > 0),
    totals,
    reconciles: {
      everyoneReachedFirst: first === totals.joined,
      leftAddsUp: out.reduce((n, r) => n + r.left, 0) === totals.notProceeding,
      outcomesAddUp: totals.joined === totals.enrolled + totals.inProgress + totals.notProceeding,
    },
  }
}

// The report for one organisation, on a Meadow session.
export async function loadFunnel(crm, org) {
  const [stages, journeys, reasons] = await Promise.all([
    execute(crm, STAGES_QUERY, [org]),
    execute(crm, JOURNEYS_QUERY, [org, org]),
    execute(crm, REASONS_QUERY, [org]),
  ])
  return buildFunnel({ stages, journeys, reasons })
}

export function registerMeadowFunnelRoutes(app) {
  app.get('/api/meadow/funnel', allow(MANAGER), async (req, res) => {
    try {
      const funnel = await withCrmSession((crm) => loadFunnel(crm, req.user.ORGANISATIONID))
      res.json({ organisation: req.user.ORGANISATIONNAME, ...funnel })
    } catch (err) {
      sendError(res, err, 'Could not load the report')
    }
  })
}
