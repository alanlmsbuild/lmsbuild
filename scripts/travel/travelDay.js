// travelDay.js - the day each travel-times run is for (decision 19, phase B,
// agreed 20 October 2026): the next term-time Tuesday at least 14 days
// ahead, skipping school holidays and the weeks either side of a national
// rail timetable change. Bus and rail always use the same day.
//
// TERMS: South Yorkshire's school terms (half terms are the gaps between
// them). These are Rarebit's working list, to check against the four
// councils' published dates (Barnsley, Doncaster, Rotherham, Sheffield);
// past the last term listed, nextTravelDay refuses rather than guesses.
// TIMETABLE_CHANGES: the Sundays the national rail timetable changes; a
// Tuesday within 7 days of one is skipped (the week before and after).

export const TERMS = [
  ['2026-11-02', '2026-12-18'], // autumn, after half term
  ['2027-01-05', '2027-02-12'], // spring 1
  ['2027-02-22', '2027-03-26'], // spring 2
  ['2027-04-12', '2027-05-28'], // summer 1
  ['2027-06-07', '2027-07-21'], // summer 2
]
export const TIMETABLE_CHANGES = ['2026-12-13', '2027-05-16']
export const DAYS_AHEAD = 14

const DAY = 24 * 60 * 60 * 1000
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const at = (s) => Date.parse(`${s}T00:00:00Z`)

// The day (YYYY-MM-DD) for a run made on `today` (YYYY-MM-DD).
export function nextTravelDay(today) {
  const last = at(TERMS.at(-1)[1])
  for (let t = at(today) + DAYS_AHEAD * DAY; t <= last; t += DAY) {
    if (new Date(t).getUTCDay() !== 2) continue
    const day = iso(t)
    if (!TERMS.some(([a, b]) => a <= day && day <= b)) continue
    if (TIMETABLE_CHANGES.some((c) => Math.abs(at(c) - t) <= 7 * DAY)) continue
    return day
  }
  throw new Error(`No term-time Tuesday listed ${DAYS_AHEAD} or more days after ${today}: add the next terms to TERMS in scripts/travel/travelDay.js`)
}
