// remap-standards.js - one-off: move the dummy learners off the made-up
// standard codes 9901-9903 and onto real LARS standards.
//
// Usage:
//   npm run remap:standards              preview only, changes nothing
//   npm run remap:standards -- --apply   preview, then ask before changing
//
// Safe to re-run: only rows still on an old code are touched, so once
// they've been moved there is nothing left to change.

import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { connect, execute, destroy } from '../server/db.js'

// Old dummy code -> real LARS standard code.
const REMAP = new Map([
  [9901, 122], // ST0072 Customer Service Practitioner, Level 2
  [9902, 119], // ST0005 Adult Care Worker, Level 2
  [9903, 111], // ST0259 Supply Chain Warehouse Operative, Level 2
])

const OLD_CODES = [...REMAP.keys()]
const NEW_CODES = [...REMAP.values()]
const placeholders = (list) => list.map(() => '?').join(', ')

const ROWS_TO_CHANGE_QUERY = `
  select
    ld.LEARNREFNUMBER,
    l.GIVENNAMES,
    l.FAMILYNAME,
    ld.LEARNAIMREF,
    ld.AIMSEQNUMBER,
    ld.COMPSTATUS,
    ld.STDCODE
  from LEARNING_DELIVERY ld
  join LEARNER l
    on l.LEARNREFNUMBER = ld.LEARNREFNUMBER
  where ld.STDCODE in (${placeholders(OLD_CODES)})
  order by ld.LEARNREFNUMBER, ld.LEARNAIMREF, ld.AIMSEQNUMBER
`

const TARGET_STANDARDS_QUERY = `
  select STANDARD_CODE, REFERENCE, NAME, NOTIONAL_END_LEVEL
  from LARS.STANDARD
  where STANDARD_CODE in (${placeholders(NEW_CODES)})
`

// The same where clause as the preview, so only rows still on an old code
// can ever change.
const REMAP_UPDATE = `
  update LEARNING_DELIVERY set
    STDCODE = case STDCODE ${OLD_CODES.map(() => 'when ? then ?').join(' ')} end
  where STDCODE in (${placeholders(OLD_CODES)})
`

const COMPLETION_STATUS = { 1: 'Continuing', 2: 'Completed', 3: 'Withdrawn' }

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

async function main() {
  const { values: args } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })

  const connection = await connect()
  try {
    // Every target must be a real LARS standard before anything moves onto it.
    const targets = new Map(
      (await execute(connection, TARGET_STANDARDS_QUERY, NEW_CODES)).map((s) => [s.STANDARD_CODE, s]),
    )
    const missing = NEW_CODES.filter((code) => !targets.has(code))
    if (missing.length > 0) {
      console.error(`Stopped: standard code(s) ${missing.join(', ')} not found in LARS.STANDARD.`)
      process.exitCode = 1
      return
    }
    const describeTarget = (code) => {
      const s = targets.get(code)
      return `${code} ${s.REFERENCE} ${s.NAME} (Level ${s.NOTIONAL_END_LEVEL})`
    }

    const rows = await execute(connection, ROWS_TO_CHANGE_QUERY, OLD_CODES)
    if (rows.length === 0) {
      console.log('Nothing to change: no learning delivery rows are on 9901, 9902 or 9903.')
      return
    }

    console.log(`${rows.length} learning delivery row(s) will change:\n`)
    console.log(
      `  ${'Learner ref'.padEnd(12)} ${'Name'.padEnd(24)} ${'Aim'.padEnd(11)} ${'Status'.padEnd(11)} Standard`,
    )
    for (const r of rows) {
      const name = `${r.GIVENNAMES ?? ''} ${r.FAMILYNAME ?? ''}`.trim()
      const aim = `${r.LEARNAIMREF}/${r.AIMSEQNUMBER}`
      const status = COMPLETION_STATUS[r.COMPSTATUS] ?? `Code ${r.COMPSTATUS}`
      console.log(
        `  ${r.LEARNREFNUMBER.padEnd(12)} ${name.padEnd(24)} ${aim.padEnd(11)} ${status.padEnd(11)} ` +
          `${r.STDCODE} -> ${describeTarget(REMAP.get(r.STDCODE))}`,
      )
    }

    console.log('\nSummary:')
    for (const [oldCode, newCode] of REMAP) {
      const count = rows.filter((r) => r.STDCODE === oldCode).length
      console.log(`  ${oldCode} -> ${describeTarget(newCode)}: ${count} row(s)`)
    }

    if (!args.apply) {
      console.log('\nPreview only. Nothing was changed. Run with --apply to make these changes.')
      return
    }

    if (!(await confirm(`\nType "yes" to change these ${rows.length} row(s): `))) {
      console.log('Cancelled. Nothing was changed.')
      return
    }

    await execute(connection, 'begin')
    try {
      const binds = [...[...REMAP].flat(), ...OLD_CODES]
      const [result] = await execute(connection, REMAP_UPDATE, binds)
      const updated = Number(result?.['number of rows updated'] ?? 0)
      // Something else changed these rows between the preview and now, so
      // back out rather than change rows that weren't shown.
      if (updated !== rows.length) {
        throw new Error(`expected to change ${rows.length} row(s) but ${updated} matched`)
      }
      await execute(connection, 'commit')
      console.log(`Done. ${updated} row(s) changed.`)
    } catch (err) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
      throw err
    }
  } finally {
    await destroy(connection)
  }
}

main().catch((err) => {
  console.error('Remap failed, nothing was changed:', err.message)
  process.exit(1)
})
