// Puts the 4g-1 test learners back to continuing between test runs (test
// learners only). The full reset (sql/test_reset_02_reset.sql) does the rest.
import { connect, execute, destroy } from '../../server/db.js'
const REFS = ['TESTL0085', 'TESTL0032', 'TESTL0020', 'TESTL0010', 'TESTL0057', 'TESTL0075']
const IN = `LEARNREFNUMBER in (${REFS.map(() => '?').join(',')}) and LEARNREFNUMBER in (select LEARNREFNUMBER from ILR.LEARNER where ISTESTDATA)`
const c = await connect()
try {
  const a = await execute(c, `update ILR.LEARNING_DELIVERY set COMPSTATUS = 1, LEARNACTENDDATE = null, OUTCOME = null, ACHDATE = null, OUTGRADE = null, WITHDRAWREASON = null where ${IN}`, REFS)
  const h = await execute(c, `update ILR.HOURS_RECORD set REMOVEDAT = current_timestamp(), REMOVEDBY = 'USR-T0008', REMOVEDREASON = 'TEST: 4g-1 test rerun'
    where HRSTYPE = 'HRS' and HRSCODE = 3 and REMOVEDAT is null and ${IN}`, REFS)
  // Robin's learning support ran to his planned end date.
  await execute(c, `update ILR.LEARNING_DELIVERY_FAM set DATETO = '2026-12-18'
    where LEARNREFNUMBER = 'TESTL0010' and LEARNDELFAMTYPE = 'LSF' and REMOVEDAT is null
      and LEARNREFNUMBER in (select LEARNREFNUMBER from ILR.LEARNER where ISTESTDATA)`)
  console.log('aims', a[0]['number of rows updated'], 'HRS 3 removed', h[0]['number of rows updated'])
} finally { await destroy(c) }
