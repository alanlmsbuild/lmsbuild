// Test: UK time (src/ukTime.js and todayString) either side of the clocks
// changing, whatever zone this process is in. No database, no network.
//   node test/uk-time.mjs
process.env.TZ = 'America/Los_Angeles' // as Snowflake's default; Node applies it straight away

const { ukDate, ukIso, ukDateText, ukTimeText, ukDateTimeText, ukWhenText } = await import('../src/ukTime.js')
const { todayString } = await import('../src/validation.js')

let failures = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  [got ${got}, want ${want}]`}`)
}
const at = (s) => new Date(s)

check('this process is in Los Angeles time', new Date('2026-10-07T23:30:00Z').getHours(), 16)
check('00:30 UK time in summer is already the next day (UTC still says the 7th)', ukDate(at('2026-10-07T23:30:00Z')), '2026-10-08')
check('  todayString agrees', todayString(at('2026-10-07T23:30:00Z')), '2026-10-08')
check('  with its offset', ukIso(at('2026-10-07T23:30:00Z')), '2026-10-08T00:30:00+01:00')
check('25 October 2026, 01:30 BST (00:30 UTC)', ukIso(at('2026-10-25T00:30:00Z')), '2026-10-25T01:30:00+01:00')
check('  an hour later the clocks have gone back: 01:30 GMT', ukIso(at('2026-10-25T01:30:00Z')), '2026-10-25T01:30:00+00:00')
check('  shown as 01:30 both times', `${ukTimeText(at('2026-10-25T00:30:00Z'))} ${ukTimeText(at('2026-10-25T01:30:00Z'))}`, '01:30 01:30')
check('winter: UK time is UTC', ukIso(at('2026-12-01T09:00:00Z')), '2026-12-01T09:00:00+00:00')
check('29 March 2026, 00:59:59 GMT', ukIso(at('2026-03-29T00:59:59Z')), '2026-03-29T00:59:59+00:00')
check('  a second later the clocks have gone forward: 02:00 BST', ukIso(at('2026-03-29T01:00:00Z')), '2026-03-29T02:00:00+01:00')
check('a date-only value is shown as that day, whatever the zone', ukDateText('2026-10-08'), '08/10/2026')
check('an instant is shown as its UK day', ukDateText('2026-10-07T23:30:00Z'), '08/10/2026')
check('a Snowflake DATE (midnight UTC) stays its own day', ukDateText(at('2026-10-08T00:00:00Z')), '08/10/2026')
check('date and time for screens, in UK time', ukDateTimeText(at('2026-10-07T14:09:00Z')), '7 Oct 2026, 15:09')
const now = at('2026-10-08T00:20:00Z') // 01:20 UK time on the 8th
check('today, by the UK day', ukWhenText(at('2026-10-07T23:30:00Z'), now), 'today 00:30')
check('yesterday, by the UK day', ukWhenText(at('2026-10-07T14:09:00Z'), now), 'yesterday 15:09')
check('earlier this year', ukWhenText(at('2026-10-05T01:05:00Z'), now), '5 Oct, 02:05')
check('another year', ukWhenText(at('2025-12-31T10:00:00Z'), now), '31 Dec 2025, 10:00')
check('yesterday across the clocks going back', ukWhenText(at('2026-10-25T00:30:00Z'), at('2026-10-26T09:00:00Z')), 'yesterday 01:30')

console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
