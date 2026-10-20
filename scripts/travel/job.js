// job.js - the monthly travel-times refresh (decision 19, phase B), run by
// the scheduler as travel-monthly (server/jobSchedule.js) or by hand:
//
//   node scripts/travel/job.js [--day YYYY-MM-DD]
//
// The day: the next term-time Tuesday at least 14 days ahead
// (travelDay.js), the same for bus and rail. In order, stopping at the
// first failure:
//   1. fetch.py         newest inputs: Network Rail's newest weekly full
//                       SCHEDULE extract and CORPUS, the OpenStreetMap
//                       extract, the BODS feed (copied from RAREBIT_DATA,
//                       downloaded by hand)
//   2. clip_gtfs.py     the BODS feed clipped to South Yorkshire + 5 km
//   3. cif_to_gtfs.py   the rail GTFS for the day, with its checks (stops if
//                       a station is unmatched, either feed doesn't cover the
//                       day, or the day has too few trains)
//   4. load:data 41, 44 the sources into SHARED_DB.RAW (skips what's loaded)
//   5. origins.js       the places and the inputs' SOURCE_FILE rows
//   6. compute.py       the four runs (needs about 4.5 GB: the job refuses
//                       to start with less than MIN_FREE_MB available, e.g.
//                       while the dev servers are up, and is tried again
//                       an hour later)
//   7. load:data 42     the times into SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN
// The next transform-silver run builds silver and gold from them. Each load
// step logs its own load-* row in OPS.JOB_RUN; the scheduler logs this job's.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nextTravelDay } from './travelDay.js'
import { ukDate } from '../../src/ukTime.js'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PYTHON = path.join(REPO, '.venv-travel', 'bin', 'python')
export const MIN_FREE_MB = 5500

export function freeMb(meminfo = fs.readFileSync('/proc/meminfo', 'utf8')) {
  return Math.floor(Number(meminfo.match(/^MemAvailable:\s+(\d+) kB/m)[1]) / 1024)
}

function run(cmd, args, log) {
  return new Promise((resolve, reject) => {
    log(`  $ ${path.basename(cmd)} ${args.map((a) => path.relative(REPO, a) || a).join(' ')}`)
    const p = spawn(cmd, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = []
    const keep = (chunk) => {
      for (const line of chunk.toString().split('\n').filter((l) => l.trim() && !/warn/i.test(l))) {
        tail.push(line)
        if (tail.length > 20) tail.shift()
        log(`    ${line}`)
      }
    }
    p.stdout.on('data', keep)
    p.stderr.on('data', keep)
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(tail) : reject(new Error(`${path.basename(args[1] ?? cmd)} exited with ${code}: ${tail.slice(-3).join(' | ')}`))))
  })
}

const py = (script, args, log) => run(PYTHON, ['-I', path.join(REPO, 'scripts', 'travel', script), ...args], log)

async function loadSteps(steps, log) {
  const { runStep } = await import('../load-data.js')
  const { Loader } = await import('../load/loader.js')
  const loader = await Loader.open(log)
  const loaded = []
  try {
    for (const n of steps) {
      const r = await runStep(loader, n)
      loaded.push(...r.results.filter((x) => !x.skipped).map((x) => ({ table: x.table, rows: x.rowsLoaded })))
    }
  } finally {
    await loader.close()
  }
  return loaded
}

export async function runJob({ day = nextTravelDay(ukDate(new Date())), log = console.log } = {}) {
  const free = freeMb()
  if (free < MIN_FREE_MB) {
    throw new Error(`Only ${free} MB of memory available; the compute needs ${MIN_FREE_MB} MB (stop the dev servers). Tried again in an hour.`)
  }
  log(`travel-monthly: the day is ${day}`)
  await py('fetch.py', [], log)
  await py('clip_gtfs.py', [], log)
  await py('cif_to_gtfs.py', [day], log)
  const loaded = await loadSteps([41, 44], log)
  await run(process.execPath, [path.join(REPO, 'scripts', 'travel', 'origins.js')], log)
  const computed = await py('compute.py', [], log)
  loaded.push(...await loadSteps([42], log))
  const pairs = computed.map((l) => l.match(/^([\d,]+) pairs written/)).find(Boolean)?.[1]
  return { outcome: 'succeeded', summary: { day, pairs, loaded } }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--day')
  const result = await runJob(i > 0 ? { day: process.argv[i + 1] } : {})
  console.log(JSON.stringify(result))
}
