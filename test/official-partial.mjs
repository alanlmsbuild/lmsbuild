// Test: official-* jobs keep going when one fetch or load step fails
// (scripts/fetch-official.js runJob). No Snowflake, no network: fake fetches
// and load steps.
//   node test/official-partial.mjs
import { LOAD_STEPS, runJob } from '../scripts/fetch-official.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const quiet = () => {}
const loader = () => { const l = { closed: false, close: async () => { l.closed = true } }; return l }
// Steps 18 and 19 (the api job's steps; 17, Key stage 4, is paused) load one table each; `bad` lists the steps that throw.
const steps = (bad, ran = []) => async (_loader, n) => {
  ran.push(n)
  if (bad.includes(n)) throw new Error(`header doesn't match (step ${n})`)
  return { results: [{ table: `T${n}`, rowsLoaded: n * 10 }, { table: `T${n}b`, skipped: true }] }
}
const go = (bad, extra = {}) => {
  const ran = []
  const l = loader()
  return runJob({ kind: 'api', log: quiet, deps: { fetchOne: async () => null, runStep: steps(bad, ran), openLoader: async () => l, ...extra } }).then((r) => ({ r, ran, l }))
}

{
  const { r, ran, l } = await go([])
  check('all steps fine: succeeded, nothing failed', r.outcome === 'succeeded' && !r.summary.failed && r.error === undefined)
  check('  every step ran, in order, and loaded rows are listed', ran.join() === LOAD_STEPS.api.join() && r.summary.loaded.map((x) => x.table).join() === 'T18,T19', r.summary.loaded.map((x) => x.table).join())
  check('  the loader is closed', l.closed)
}
{
  const { r, ran } = await go([18])
  check('step 18 fails: 19 still runs', ran.join() === '18,19', ran.join())
  check('  partial, not failed', r.outcome === 'partial', r.outcome)
  check('  the summary says which step failed and why', r.summary.failed.length === 1 && r.summary.failed[0].step === 18 && r.summary.failed[0].name === 'load-destinations' && /header/.test(r.summary.failed[0].error), JSON.stringify(r.summary.failed))
  check('  what did load is still reported', r.summary.loaded.map((x) => x.table).join() === 'T19')
  check('  the error names the step and counts', /^1 of 6 failed: load-destinations: header/.test(r.error) && r.error.length <= 900, r.error)
}
{
  const { r, ran, l } = await go([18, 19])
  check('every step fails: failed, all attempted', r.outcome === 'failed' && ran.join() === '18,19' && r.summary.failed.length === 2 && l.closed, r.outcome)
}
{
  // A fetch that fails doesn't stop the other fetches or the loads.
  let calls = 0
  const { r, ran } = await go([], { fetchOne: async (set) => { calls++; if (set.id.startsWith('019d4f41')) throw new Error('API 503'); return null } })
  check('one fetch fails: the rest are fetched and every step loads', calls === 4 && ran.join() === '18,19', `${calls} fetches`)
  check('  partial, naming the data set', r.outcome === 'partial' && r.summary.failed[0].stage === 'fetch' && /019d4f41/.test(r.summary.failed[0].name) && /API 503/.test(r.error), r.error)
}
{
  const ran = []
  const { r } = await (async () => runJob({ kind: 'api', load: false, log: quiet, deps: { fetchOne: async () => '/data/x_v1.csv', runStep: steps([], ran), openLoader: async () => loader() } }).then((x) => ({ r: x })))()
  check('--no-load: nothing loaded, fetches reported', ran.length === 0 && r.outcome === 'succeeded' && r.summary.fetched.length === 4 && r.summary.loaded.length === 0)
}
{
  // Key stage 4 (step 17 and its two data sets) is paused until plan 3.
  const { EES_SETS, KS4_EES_SETS } = await import('../scripts/fetch-official.js')
  check('Key stage 4 is not in the api job: no step 17, no ks4 data set', !LOAD_STEPS.api.includes(17) && !EES_SETS.some((s) => s.dir === 'ks4-performance') && KS4_EES_SETS.length === 2)
}
{
  // fetch-official.js imports load-data.js (and so every load file) when it runs a load, so no load file may import it back:
  // run from the command line that waited on itself forever (30 October 2026).
  const { readdirSync, readFileSync } = await import('node:fs')
  const dir = new URL('../scripts/load/', import.meta.url)
  const back = readdirSync(dir).filter((f) => f.endsWith('.js') && /from '\.\.\/fetch-official\.js'/.test(readFileSync(new URL(f, dir), 'utf8')))
  check('no load file imports fetch-official.js back', back.length === 0, back.join())
  const { NOMIS_SETS, nomisFetched } = await import('../scripts/fetch-official.js')
  const again = await import('../scripts/load/nomis-sets.js')
  check('  the Nomis sets and nomisFetched are the same from either', again.NOMIS_SETS === NOMIS_SETS && again.nomisFetched === nomisFetched && NOMIS_SETS.length === 12)
}
console.log(failures ? `\n${failures} FAILED` : '\nAll passed')
process.exit(failures ? 1 : 0)
