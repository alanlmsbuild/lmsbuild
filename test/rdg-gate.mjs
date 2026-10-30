// Test: the two silver models that read the whole National Rail fares feed
// (8.5 million lines) are gated, so the daily build copies them instead of
// parsing the feed again. No Snowflake: reads the model files.
//   node test/rdg-gate.mjs
import fs from 'node:fs'

let failures = 0
const check = (label, ok) => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const models = fs.readdirSync(new URL('../dbt/models', import.meta.url), { recursive: true }).filter((f) => f.endsWith('.sql')).map((f) => [f, read(`dbt/models/${f}`)])
const heavy = models.filter(([, sql]) => /rdg_lines\('FFL'\)/.test(sql))

check('only rdg_flow and rdg_fare read the flow file', heavy.map(([f]) => f.split('/').pop()).sort().join() === 'rdg_fare.sql,rdg_flow.sql')
for (const [f, sql] of heavy) {
  check(`${f}: copies the live table when nothing has changed (rdg_reusable)`, /rdg_reusable\(\)/.test(sql) && /select \* from \{\{ reuse \}\}/.test(sql))
  check(`${f}: stamps what it was built from`, /rdg_stamp\(\) \}\}::varchar as built_from/.test(sql))
}
const yml = read('dbt/models/silver/areas/_areas.yml')
for (const name of ['rdg_flow', 'rdg_fare']) {
  const block = yml.slice(yml.indexOf(`  - name: ${name}\n`)).split('\n  - name:')[0]
  check(`${name}: built_from is described and typed`, /- name: built_from\n\s+data_type: varchar\n\s+description:/.test(block))
}
const macro = read('dbt/macros/rdg.sql')
check('the gate never applies to the slice or outside the staging build', /var\('rdg_slice', false\)/.test(macro) && /target\.name != 'staging'/.test(macro))
check('the stamp covers the feed, its load time, both seeds and a parsing version', /feed\.loaded_at/.test(macro) && /train_journey/.test(macro) && /train_ticket_kind/.test(macro) && /\|v\d+/.test(macro))
console.log(failures ? `\n${failures} failed` : '\nAll passed.')
process.exit(failures ? 1 : 0)
