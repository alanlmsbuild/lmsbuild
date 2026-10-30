// transform-silver.js - the silver layer's daily build (decisions 16 and
// 21; the transform-silver job, server/jobSchedule.js). dbt replaces a table
// before it tests it, so nothing is built straight into SILVER:
//
//   1. check:dbt   every model tagged, described and typed (before dbt runs)
//   2. dbt build --target staging   every model into SILVER_STAGING and
//                  GOLD_STAGING (gold from the new silver), with
//                  its tests (dbt/target/run_results.json gives the counts)
//   3. check:tags --staging   the tags and comments, read back from Snowflake
//   4. swap        each table into SILVER or GOLD: ALTER TABLE ... SWAP WITH (its
//                  data, comments and tags move with it); a model new to
//                  SILVER is cloned in once (managed access refuses a rename
//                  across schemas)
//   5. check:tags  SILVER itself
//   6. data quality: Snowflake's data metric functions attached to the key
//                  SILVER and GOLD tables (scripts/data-quality.js; on gold,
//                  also the honesty rules' SHOWN_BASE_UNDER_10), measured
//                  weekly by Snowflake; the summary (dataQuality) says what
//                  was attached; npm run check:dmf reads the results
//
// If 1, 2 or 3 fails, SILVER is not touched: the job is recorded as failed
// with the counts, and SILVER_STAGING keeps the failed build to look at.
// After a swap, SILVER_STAGING holds the previous version until the next
// run. The swaps are one statement per table, run one after another.
//
//   npm run silver:build        the whole build, not recorded in OPS.JOB_RUN
//   npm run transform:silver    the same, recorded as a manual run of the job
//
// The scheduler (scripts/jobs.js) runs runJob, recorded by recordRun. The
// dbt venv must be in this checkout (dbt/requirements.txt).

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { JobTimeout, makeLog, recordRun } from './job-run.js'
import { runDbt } from './dbt.js'
import { measure } from './data-quality.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DBT_TARGET = path.join(ROOT, 'dbt', 'target')

function node(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}
// The last lines of a script's output, without dotenv's "injected env" notices.
const lastLines = (text, n = 6) => text.split('\n').filter((l) => l.trim() && !/^◇ injected env/.test(l.trim())).slice(-n).join('\n')

// Models built and tests passed or failed, from dbt's run_results.json.
export function countResults(runResults, manifest) {
  const counts = { models: { built: 0, error: 0, skipped: 0 }, tests: { passed: 0, failed: 0, warned: 0, error: 0, skipped: 0 }, failures: [] }
  for (const r of runResults.results ?? []) {
    const node = manifest.nodes?.[r.unique_id]
    const type = node?.resource_type ?? r.unique_id.split('.')[0]
    if (type === 'model') {
      if (r.status === 'success') counts.models.built++
      else if (r.status === 'skipped') counts.models.skipped++
      else { counts.models.error++; counts.failures.push(`model ${node?.name ?? r.unique_id}: ${r.status}`) }
    } else if (type === 'test') {
      const k = { pass: 'passed', fail: 'failed', warn: 'warned', error: 'error', skipped: 'skipped' }[r.status] ?? 'error'
      counts.tests[k]++
      if (k === 'failed' || k === 'error') counts.failures.push(`test ${node?.name ?? r.unique_id}: ${r.status}${r.failures ? ` (${r.failures})` : ''}`)
    }
  }
  return counts
}

// The models and seeds dbt built, as { database, name }: what to swap into SILVER.
function builtModels(runResults, manifest) {
  return (runResults.results ?? [])
    .filter((r) => r.status === 'success' && ['model', 'seed'].includes(manifest.nodes?.[r.unique_id]?.resource_type))
    .map((r) => manifest.nodes[r.unique_id])
    // Built in <schema>_STAGING; swapped into <schema> (SILVER or GOLD).
    .map((n) => ({ database: String(n.database).toUpperCase(), schema: String(n.schema).toUpperCase().replace(/_STAGING$/, ''), name: String(n.alias ?? n.name).toUpperCase() }))
}

export async function runJob({ log = console.log } = {}) {
  const failed = (error, summary) => ({ outcome: 'failed', error: `${error} SILVER not changed.`, summary })

  log('transform-silver: check:dbt')
  const governance = node('check-dbt-governance.js')
  if (!governance.ok) return failed(`check:dbt failed: ${lastLines(governance.out, 3)}`, { step: 'check:dbt' })

  log('transform-silver: dbt build into SILVER_STAGING')
  const build = runDbt(['build', '--target', 'staging'], { stdio: 'pipe' })
  const output = `${build.stdout ?? ''}${build.stderr ?? ''}`
  log(lastLines(output.replace(/\x1b\[[0-9;]*m/g, ''), 3))
  let runResults
  let manifest
  try {
    runResults = JSON.parse(fs.readFileSync(path.join(DBT_TARGET, 'run_results.json'), 'utf8'))
    manifest = JSON.parse(fs.readFileSync(path.join(DBT_TARGET, 'manifest.json'), 'utf8'))
  } catch {
    return failed(`dbt build failed before writing its results: ${lastLines(output, 3)}`, { step: 'dbt build' })
  }
  const counts = countResults(runResults, manifest)
  const summary = { models: counts.models, tests: counts.tests }
  if (build.status !== 0 || counts.models.error || counts.models.skipped || counts.tests.failed || counts.tests.error) {
    return failed(`dbt build: ${counts.failures.slice(0, 5).join('; ') || `exit ${build.status}`}.`, { ...summary, step: 'dbt build', failures: counts.failures.slice(0, 50) })
  }

  log('transform-silver: check:tags on SILVER_STAGING')
  const stagingTags = node('check-tags.js', ['--staging'])
  if (!stagingTags.ok) return failed(`check:tags on SILVER_STAGING failed: ${lastLines(stagingTags.out, 3)}`, { ...summary, step: 'check:tags staging' })

  const models = builtModels(runResults, manifest)
  const swapped = []
  const cloned = []
  const c = await connect({ as: 'transform', timeoutMs: 30000 })
  try {
    for (const m of models) {
      const live = `${m.database}.${m.schema}.${m.name}`
      const staged = `${m.database}.${m.schema}_STAGING.${m.name}`
      const [exists] = await execute(c, `select count(*) as N from ${m.database}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ? and TABLE_NAME = ?`, [m.schema, m.name])
      if (Number(exists.N) > 0) {
        await execute(c, `alter table ${live} swap with ${staged}`)
        swapped.push(live)
      } else {
        // A new model: cloned in, transient like every dbt table (silver and
        // gold are rebuilt daily, so no fail-safe). Gold keeps its readers' grants (COPY
        // GRANTS); SILVER is managed access, where only its owner may copy
        // grants, and has none to copy.
        await execute(c, `create transient table ${live} clone ${staged}${m.schema === 'GOLD' ? ' copy grants' : ''}`)
        cloned.push(live)
      }
    }
  } finally {
    await destroy(c)
  }
  log(`transform-silver: ${swapped.length} tables swapped into SILVER and GOLD${cloned.length ? `, ${cloned.length} cloned in (new)` : ''}`)

  const silverTags = node('check-tags.js')
  const done = { ...summary, swapped: swapped.length, cloned }
  if (!silverTags.ok) return { outcome: 'failed', error: `Swapped, but check:tags on SILVER failed: ${lastLines(silverTags.out, 3)}`, summary: { ...done, step: 'check:tags' } }
  log(`transform-silver: ${lastLines(silverTags.out, 1)}`)

  // 6. The data metric functions (scripts/data-quality.js): attached to the
  // new SILVER and GOLD tables on their weekly schedule. Snowflake measures
  // them later (check:dmf reads the results), so the run does not wait.
  // Failing to attach fails the run.
  const dq = await connect({ as: 'transform', timeoutMs: 30000 })
  try {
    done.dataQuality = await measure(dq, { log })
  } catch (err) {
    return { outcome: 'failed', error: `SILVER swapped and checked, but the data metric functions failed: ${err.message}`, summary: { ...done, step: 'data quality' } }
  } finally {
    await destroy(dq)
  }
  return { outcome: 'succeeded', summary: done }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = process.argv.includes('--record')
  const log = record ? makeLog('transform-silver') : console.log
  let result
  if (record) {
    const { JOB_SCHEDULE } = await import('../server/jobSchedule.js')
    const connection = await connect()
    try {
      result = await recordRun({ connection, job: 'transform-silver', triggeredBy: 'manual', log, timeoutMinutes: JOB_SCHEDULE['transform-silver'].timeoutMinutes, run: () => runJob({ log }) })
    } catch (err) {
      // A run stopped at its time limit is already recorded as failed.
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
