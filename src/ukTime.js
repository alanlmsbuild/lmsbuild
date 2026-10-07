// UK time for everything people see: dates and times in Europe/London,
// whichever zone the browser, server or Snowflake session is in, and right
// either side of the clocks changing (never a fixed offset).
//
// Date-only values (YYYY-MM-DD, or a Snowflake DATE, which arrives as
// midnight UTC) are calendar days with no zone: they're shown as they are.

export const UK_ZONE = 'Europe/London'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parts(date, options) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: UK_ZONE, ...options }).formatToParts(date).map((p) => [p.type, p.value]))
}

// The UK calendar day of an instant, as YYYY-MM-DD.
export function ukDate(date = new Date()) {
  const p = parts(new Date(date), { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

// An instant as ISO 8601 in UK time with its offset, e.g.
// 2026-10-07T13:35:10+01:00 (summer) or 2026-11-02T09:00:00+00:00.
export function ukIso(date = new Date()) {
  const d = new Date(date)
  const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' })
  const offset = p.timeZoneName === 'GMT' ? '+00:00' : p.timeZoneName.replace('GMT', '')
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`
}

// For screens: 07/10/2026. A date-only value is shown as that day; an
// instant as its UK day.
export function ukDateText(value) {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' })
  return new Date(value).toLocaleDateString('en-GB', { timeZone: UK_ZONE })
}

// For screens: 13:35, the UK time of an instant.
export function ukTimeText(value) {
  return new Date(value).toLocaleTimeString('en-GB', { timeZone: UK_ZONE, hour: '2-digit', minute: '2-digit' })
}

// For screens: 7 Oct 2026, 15:09.
export function ukDateTimeText(value) {
  const d = new Date(value)
  return `${d.toLocaleDateString('en-GB', { timeZone: UK_ZONE, day: 'numeric', month: 'short', year: 'numeric' })}, ${ukTimeText(d)}`
}

// For screens, short: "today 15:09", "yesterday 02:05", or "5 Oct, 02:05"
// (with the year if it isn't this year), by UK days.
export function ukWhenText(value, now = new Date()) {
  const d = new Date(value)
  const day = ukDate(d)
  if (day === ukDate(now)) return `today ${ukTimeText(d)}`
  if (day === ukDate(new Date(Date.parse(`${ukDate(now)}T12:00:00Z`) - 86400000))) return `yesterday ${ukTimeText(d)}`
  const sameYear = day.slice(0, 4) === ukDate(now).slice(0, 4)
  return `${d.toLocaleDateString('en-GB', { timeZone: UK_ZONE, day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}, ${ukTimeText(d)}`
}
