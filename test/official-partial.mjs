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
// Steps 17, 18, 19 load one table each; `bad` lists the steps that throw.
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
  check('  every step ran, in order, and loaded rows are listed', ran.join() === LOAD_STEPS.api.join() && r.summary.loaded.map((x) => x.table).join() === 'T17,T18,T19', r.summary.loaded.map((x) => x.table).join())
  check('  the loader is closed', l.closed)
}
{
  const { r, ran } = await go([17])
  check('step 17 fails: 18 and 19 still run', ran.join() === '17,18,19', ran.join())
  check('  partial, not failed', r.outcome === 'partial', r.outcome)
  check('  the summary says which step failed and why', r.summary.failed.length === 1 && r.summary.failed[0].step === 17 && r.summary.failed[0].name === 'load-ks4-performance' && /header/.test(r.summary.failed[0].error), JSON.stringify(r.summary.failed))
  check('  what did load is still reported', r.summary.loaded.map((x) => x.table).join() === 'T18,T19')
  check('  the error names the step and counts', /^1 of 9 failed: load-ks4-performance: header/.test(r.error) && r.error.length <= 900, r.error)
}
{
  const { r, ran, l } = await go([17, 18, 19])
  check('every step fails: failed, all attempted', r.outcome === 'failed' && ran.join() === '17,18,19' && r.summary.failed.length === 3 && l.closed, r.outcome)
}
{
  // A fetch that fails doesn't stop the other fetches or the loads.
  let calls = 0
  const { r, ran } = await go([], { fetchOne: async (set) => { calls++; if (set.id.startsWith('19e39901')) throw new Error('API 503'); return null } })
  check('one fetch fails: the rest are fetched and every step loads', calls === 6 && ran.join() === '17,18,19', `${calls} fetches`)
  check('  partial, naming the data set', r.outcome === 'partial' && r.summary.failed[0].stage === 'fetch' && /19e39901/.test(r.summary.failed[0].name) && /API 503/.test(r.error), r.error)
}
{
  const ran = []
  const { r } = await (async () => runJob({ kind: 'api', load: false, log: quiet, deps: { fetchOne: async () => '/data/x_v1.csv', runStep: steps([], ran), openLoader: async () => loader() } }).then((x) => ({ r: x })))()
  check('--no-load: nothing loaded, fetches reported', ran.length === 0 && r.outcome === 'succeeded' && r.summary.fetched.length === 6 && r.summary.loaded.length === 0)
}
console.log(failures ? `\n${failures} FAILED` : '\nAll passed')
process.exit(failures ? 1 : 0)
