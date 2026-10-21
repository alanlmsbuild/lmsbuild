// job.js - the reach map's data, refreshed (gap 3 of docs/data-journey.md),
// run by the scheduler as reach-export (server/jobSchedule.js) or by hand:
//
//   node scripts/reach/job.js [--record]
//
// Due after each travel-monthly run, once the silver build has put its times
// in gold. In order, stopping at the first failure:
//   1. export.js        gold and the boundaries, campuses and postcodes to
//                       data/reach/export/ (read only, as TRANSFORM_USER)
//   2. check-export.js  every file against gold; any problem fails the job
//   3. npm run reach:data in the school leavers site, if that folder is here
//                       (SCHOOL_LEAVERS_APP_DIR, else ../school-leavers-app),
//                       given this export's folder. If the site isn't here the
//                       copy is skipped, and the skip is logged and recorded in
//                       the run's summary in OPS.JOB_RUN: never silent.
// The copy happens only after the check has passed, so a failed run leaves
// the site's last good copy. (data/reach/export itself may be half written
// after a failed export: don't copy it by hand.)

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const EXPORT_DIR = path.join(REPO, 'data', 'reach', 'export')

// The school leavers site's folder, or null (with why) if it can't be copied to.
export function siteFolder(dir = process.env.SCHOOL_LEAVERS_APP_DIR || path.join(REPO, '..', 'school-leavers-app')) {
  if (!fs.existsSync(dir)) return { dir, why: `${dir} isn't here` }
  if (!fs.existsSync(path.join(dir, 'package.json')) || !fs.existsSync(path.join(dir, 'scripts', 'copy-reach-data.mjs'))) {
    return { dir, why: `${dir} has no scripts/copy-reach-data.mjs` }
  }
  return { dir, ok: true }
}

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    log(`  $ ${path.basename(cmd)} ${args.map((a) => a.replace(`${REPO}/`, '')).join(' ')}`)
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = []
    const keep = (chunk) => {
      for (const line of chunk.toString().split('\n').filter((l) => l.trim())) {
        tail.push(line)
        if (tail.length > 20) tail.shift()
        log(`    ${line}`)
      }
    }
    p.stdout.on('data', keep)
    p.stderr.on('data', keep)
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(tail) : reject(new Error(`${path.basename(args[0])} exited with ${code}: ${tail.slice(-3).join(' | ')}`))))
  })
}

export async function runJob({ log = console.log, site = siteFolder() } = {}) {
  await run(process.execPath, [path.join(REPO, 'scripts', 'reach', 'export.js')], REPO, log)
  const checked = await run(process.execPath, [path.join(REPO, 'scripts', 'reach', 'check-export.js')], REPO, log)
  const summary = { exported: true, checked: true, checkResult: checked.slice(-1)[0]?.slice(0, 200) ?? null }
  if (!site.ok) {
    log(`reach-export: not copied to the site: ${site.why}`)
    return { outcome: 'succeeded', summary: { ...summary, copied: false, skipped: site.why } }
  }
  const npm = fs.existsSync(path.join(path.dirname(process.execPath), 'npm')) ? path.join(path.dirname(process.execPath), 'npm') : 'npm'
  await run(npm, ['run', 'reach:data', '--', EXPORT_DIR], site.dir, log)
  log(`reach-export: copied to ${site.dir}/public/reach-data`)
  return { outcome: 'succeeded', summary: { ...summary, copied: true } }
}

// By hand, not recorded (the others' habit); --record records it as a manual run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = process.argv.includes('--record') ? (await import('../job-run.js')).makeLog('reach-export') : console.log
  let result
  if (process.argv.includes('--record')) {
    const { connect, destroy } = await import('../../server/db.js')
    const { JobTimeout, recordRun } = await import('../job-run.js')
    const { JOB_SCHEDULE } = await import('../../server/jobSchedule.js')
    const connection = await connect()
    try {
      result = await recordRun({ connection, job: 'reach-export', triggeredBy: 'manual', log, timeoutMinutes: JOB_SCHEDULE['reach-export'].timeoutMinutes, run: () => runJob({ log }) })
    } catch (err) {
      if (!(err instanceof JobTimeout)) throw err
      result = { outcome: 'failed', error: err.message }
    } finally {
      await destroy(connection)
    }
  } else {
    result = await runJob({ log })
  }
  console.log(JSON.stringify(result, null, 1))
  process.exit(result.outcome === 'succeeded' ? 0 : 1)
}
