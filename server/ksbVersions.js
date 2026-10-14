// Which version of their standard an apprentice's KSBs come from
// (SHARED_DB.SKILLS.STANDARD_VERSION and STANDARD_KSB, loaded by npm run
// import:skills). The version whose start dates include the apprentice's
// start (their original start, after a break: the same rule as the
// off-the-job minimum in server/ilr/standards.js), if it publishes KSBs;
// otherwise the nearest later version that does (older versions of some
// standards, like ST0072 1.0, publish none), else the nearest earlier one.
// FROM_START says whether it's the start-date version itself.
//
// learnersSql: SQL giving LEARNREFNUMBER, ST_REFERENCE and START_DATE, already
// limited to learners this user can see.
export function ksbVersionsSql(learnersSql) {
  const inRange = 'v.EARLIEST_START_DATE <= a.START_DATE and (v.LATEST_START_DATE is null or v.LATEST_START_DATE >= a.START_DATE)'
  return `(
    select a.LEARNREFNUMBER, a.ST_REFERENCE, v.VERSION, (${inRange}) as FROM_START
    from (${learnersSql}) a
    join SHARED_DB.SKILLS.STANDARD_VERSION v
      on v.ST_REFERENCE = a.ST_REFERENCE and v.GONEAT is null
    join (select ST_REFERENCE, VERSION from SHARED_DB.SKILLS.STANDARD_KSB where GONEAT is null group by ST_REFERENCE, VERSION) k
      on k.ST_REFERENCE = v.ST_REFERENCE and k.VERSION = v.VERSION
    qualify row_number() over (
      partition by a.LEARNREFNUMBER, a.ST_REFERENCE
      order by iff(${inRange}, 0, 1), iff(v.EARLIEST_START_DATE > a.START_DATE, 0, 1),
        abs(datediff(day, v.EARLIEST_START_DATE, a.START_DATE)), v.EARLIEST_START_DATE desc
    ) = 1
  )`
}

// The same rule in JavaScript, for code that already has the versions (the
// test journeys generator, scripts/journeys/world.js). versions: one
// standard's versions, { VERSION, EARLIEST_START_DATE, LATEST_START_DATE }
// with ISO dates (server/ilr/standards.js loadStandardVersions); withKsbs:
// the set of its versions that publish KSBs; startDate: ISO. Returns the
// version, or null if none publishes KSBs.
export function ksbVersionFor(versions, withKsbs, startDate) {
  const inRange = (v) => v.EARLIEST_START_DATE <= startDate && (!v.LATEST_START_DATE || v.LATEST_START_DATE >= startDate)
  const later = (v) => v.EARLIEST_START_DATE > startDate
  const days = (v) => Math.abs(Date.parse(v.EARLIEST_START_DATE) - Date.parse(startDate))
  const ranked = versions.filter((v) => withKsbs.has(v.VERSION)).sort((a, b) =>
    (inRange(a) ? 0 : 1) - (inRange(b) ? 0 : 1)
    || (later(a) ? 0 : 1) - (later(b) ? 0 : 1)
    || days(a) - days(b)
    || (a.EARLIEST_START_DATE < b.EARLIEST_START_DATE ? 1 : a.EARLIEST_START_DATE > b.EARLIEST_START_DATE ? -1 : 0))
  return ranked[0]?.VERSION ?? null
}
