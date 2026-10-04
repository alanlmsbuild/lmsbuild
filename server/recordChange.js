// ILR.RECORD_CHANGE: one row for every record the app adds, corrects or
// removes on a learner, with the values before and after. Add-only: the
// app's role can't change or delete it (sql/ilr_04_capture.sql).
//
// ISTESTDATA is the learner's, like every record keyed by learner, so the
// test reset (sql/test_reset_02_reset.sql) finds a test learner's history
// too. Nothing is logged for a learner this user can't reach.

import { execute } from './db.js'
import { VISIBLE_LEARNER } from './access.js'

const INSERT_CHANGE = `
  insert into ILR.RECORD_CHANGE
    (LEARNREFNUMBER, TABLENAME, RECORDKEY, CHANGETYPE, OLDVALUES, NEWVALUES, REASON, CHANGEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, parse_json(?), ?, parse_json(?), parse_json(?), ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`

const json = (value) => (value === null || value === undefined ? null : JSON.stringify(value))

// type: 'added' | 'corrected' | 'removed', or 'outcome' for a programme
// outcome recorded (server/outcomes.js). key: the record's key columns,
// e.g. { LLDDCAT: 12 }. oldValues / newValues: the columns before and after
// (null when there are none, e.g. no old values for an added record).
export async function logChange(connection, { learnRefNumber, table, key, type, oldValues = null, newValues = null, reason = null, by }) {
  const rows = await execute(connection, INSERT_CHANGE, [
    table,
    json(key),
    type,
    json(oldValues),
    json(newValues),
    reason,
    by,
    learnRefNumber,
  ])
  if (Number(rows?.[0]?.['number of rows inserted']) !== 1) {
    throw new Error(`The change to ${table} for ${learnRefNumber} could not be logged.`)
  }
}
