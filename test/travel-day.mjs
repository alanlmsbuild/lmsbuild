// Test: the travel-times run's day (scripts/travel/travelDay.js): the next
// term-time Tuesday at least 14 days ahead, skipping holidays and the weeks
// either side of a rail timetable change. No database, no network.
//   node test/travel-day.mjs
import { nextTravelDay } from '../scripts/travel/travelDay.js'

let failures = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  [got ${got}, want ${want}]`}`)
}

check('a run on 27 October takes 10 November', nextTravelDay('2026-10-27'), '2026-11-10')
check('a run on 20 October takes 3 November (14 days ahead, after half term)', nextTravelDay('2026-10-20'), '2026-11-03')
check('exactly 14 days ahead counts', nextTravelDay('2026-11-03'), '2026-11-17')
check('the week before the 13 December timetable change is skipped (8 December), and the week after (15 December), then the holidays', nextTravelDay('2026-11-20'), '2027-01-05')
check('a Tuesday in February half term (16 February) is skipped', nextTravelDay('2027-01-30'), '2027-02-23')
check('Easter holidays are skipped', nextTravelDay('2027-03-20'), '2027-04-13')
check('the May timetable change (16 May): 11 and 18 May skipped', nextTravelDay('2027-04-24'), '2027-05-25')
let threw = false
try { nextTravelDay('2027-07-10') } catch { threw = true }
check('past the last listed term it refuses rather than guesses', threw, true)

if (failures) { console.log(`${failures} failed`); process.exit(1) }
console.log('all passed')
