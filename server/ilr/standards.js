// Which version of their standard a learner is on, and the minimum
// off-the-job training hours that applies to them.
//
// The rule (Apprenticeship funding rules 2026 to 2027, version 3,
// paragraphs 85 to 89, and the off-the-job training guidance version 6,
// paragraph 63):
//   Starts from 1 August 2025: at least the minimum published on the
//   standard (SKILLS.STANDARD_VERSION, loaded by npm run import:skills),
//   less any hours removed for evidenced prior learning (HRS 4). However
//   much prior learning there is, a programme can't fall below 187 hours
//   (paragraph 86.2).
//   Starts up to 31 July 2025 (including carry-ins and returns from a
//   break): the old rule, 20% of normal working hours (capped at 30 a week)
//   over the planned duration. The ILR checks those against 278 hours
//   (HRSAmount_02), and Warren doesn't work them out itself.
// The version is the one whose start dates include the learner's start date.

import { execute } from '../db.js'

export const OTJ_FLOOR = 187
export const PUBLISHED_MINIMUM_FROM = '2025-08-01'

const VERSIONS_QUERY = `
  select ST_REFERENCE, VERSION, LARS_CODE, EARLIEST_START_DATE, LATEST_START_DATE, MIN_OTJ_HOURS
  from SKILLS.STANDARD_VERSION
  where LARS_CODE is not null
`

const iso = (value) => {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

// Every version, grouped by LARS code, or null when npm run import:skills
// hasn't been run yet (the table doesn't exist).
export async function loadStandardVersions(connection) {
  try {
    const rows = await execute(connection, VERSIONS_QUERY)
    const byCode = new Map()
    for (const r of rows) {
      const v = {
        ST_REFERENCE: r.ST_REFERENCE,
        VERSION: r.VERSION,
        EARLIEST_START_DATE: iso(r.EARLIEST_START_DATE),
        LATEST_START_DATE: iso(r.LATEST_START_DATE),
        MIN_OTJ_HOURS: r.MIN_OTJ_HOURS === null ? null : Number(r.MIN_OTJ_HOURS),
      }
      const code = Number(r.LARS_CODE)
      if (!byCode.has(code)) byCode.set(code, [])
      byCode.get(code).push(v)
    }
    return byCode
  } catch (err) {
    if (/does not exist or not authorized/i.test(err.message)) return null
    throw err
  }
}

// What applies to a programme aim: { policy, stReference, version, published,
// priorLearning, minimum }. policy is 'published' (starts from 1 August 2025
// with a published figure), 'floor' (from 1 August 2025 but the version has
// no published figure: only the 187-hour floor), 'old' (started before
// 1 August 2025), or 'not loaded' (the import hasn't been run).
//
// An apprentice returning from a break goes by their original start date:
// the policy they started under (off-the-job guidance version 6, paragraph
// 63) and the version of the standard they were on (funding rules 2026 to
// 2027, paragraph 333). originalStart says which date was used.
export function otjMinimum(standardVersions, aim) {
  if (!aim?.LEARNSTARTDATE) return null
  const start = aim.ORIGLEARNSTARTDATE ?? aim.LEARNSTARTDATE
  const originalStart = aim.ORIGLEARNSTARTDATE ? start : undefined
  const priorLearning = Number(aim.hours?.find((h) => Number(h.HRSCODE) === 4)?.HRSAMOUNT ?? 0)
  if (start < PUBLISHED_MINIMUM_FROM) return { policy: 'old', priorLearning, originalStart }
  if (!standardVersions) return { policy: 'not loaded', priorLearning, minimum: OTJ_FLOOR, originalStart }
  const version = (standardVersions.get(Number(aim.STDCODE)) ?? [])
    .filter((v) => v.EARLIEST_START_DATE && v.EARLIEST_START_DATE <= start
      && (!v.LATEST_START_DATE || v.LATEST_START_DATE >= start))
    .sort((a, b) => (a.EARLIEST_START_DATE < b.EARLIEST_START_DATE ? 1 : -1))[0]
  const found = version ? { stReference: version.ST_REFERENCE, version: version.VERSION } : {}
  if (!version || version.MIN_OTJ_HOURS === null) {
    return { policy: 'floor', ...found, priorLearning, minimum: OTJ_FLOOR, originalStart }
  }
  return {
    policy: 'published',
    ...found,
    published: version.MIN_OTJ_HOURS,
    priorLearning,
    minimum: Math.max(version.MIN_OTJ_HOURS - priorLearning, OTJ_FLOOR),
    originalStart,
  }
}
