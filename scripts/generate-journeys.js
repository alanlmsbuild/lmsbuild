// generate-journeys.js - the test journeys (day 2 of the trial plan): about
// 500 fictional people through the CRM, hand-over and Warren, in ORG-T003.
// All test data. See scripts/journeys/world.js for who they are.
//
//   npm run generate:journeys -- --dry-run     build and check, write nothing
//   npm run generate:journeys -- --slice       10 people end to end, Warren and
//                                              Burrow through the HTTP routes (3002)
//   npm run generate:journeys -- --run         everyone else
//
// The dry run reads reference data only, builds the whole world in memory,
// checks every learner's ILR records with Warren's own code (the official
// rules in server/ilr/rules.js, the XML builder and the official schema),
// and prints the funnel and how many rows each table would get. The real
// run (writing as the app's roles and calling flows F6, F7 and F8) comes
// after the dry run is agreed.
//
// Options: --seed N (default 20261011), --as-of YYYY-MM-DD (default
// 2026-10-13), --people N (500), --back-cohort N (80).

import { connect, destroy } from '../server/db.js'
import { assembleLearner } from '../server/ilr/data.js'
import { checkIlrRules } from '../server/ilr/rules.js'
import { buildIlrXml, ukNow } from '../server/ilr/xml.js'
import { validateIlrXml } from '../server/ilr/validate.js'
import { loadReference, existingPostcodes, SECTORS } from './journeys/reference.js'
import { buildWorld, chooseDistricts } from './journeys/world.js'
import { ilrRows } from './journeys/ilr.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const settings = { seed: Number(opt('seed', 20261011)), asOf: opt('as-of', '2026-10-13'), people: Number(opt('people', 500)), backCohort: Number(opt('back-cohort', 80)) }
const mode = ['--dry-run', '--slice', '--run'].find((m) => args.includes(m))
if (!mode) {
  console.error('Say --dry-run, --slice or --run. Nothing was done.')
  process.exit(1)
}

const app = await connect({ timeoutMs: 30000 })
const loader = await connect({ as: 'loader', timeoutMs: 30000 })
let ref
try {
  ref = await loadReference(app, loader)
  const districts = chooseDistricts(ref, settings.seed)
  ref.existing = await existingPostcodes(app, districts.map((d) => d.district))
  var world = buildWorld(ref, districts, settings) // eslint-disable-line no-var
} finally {
  await destroy(app)
  await destroy(loader)
}

// ---------------------------------------------------------------- the funnel
const STAGES = ['NEW', 'CONFIRMED', 'CONTACTED', 'MATCHED', 'INTERVIEWING', 'OFFERED', 'ASSESSMENT', 'ENROLLED']
console.log(`Test journeys, ${mode === '--dry-run' ? 'dry run' : mode.slice(2)}: seed ${settings.seed}, as of ${settings.asOf}.${mode === '--dry-run' ? ' Nothing written.' : ''}\n`)
console.log('Stage          reached   lost here   still open here')
for (const s of STAGES) console.log(`${s.padEnd(14)} ${String(world.stageReached[s] ?? 0).padStart(7)} ${String(world.lostAt[s] ?? 0).padStart(11)} ${String(world.openAt[s] ?? 0).padStart(17)}`)

// ---------------------------------------------------------------- rows per table
const P = world.people
const leadsReaching = (k) => P.filter((p) => p.path.some(([s]) => s === k)).length
const learners = world.learners
const handedOver = P.filter((p) => p.handoverAt)
const isOpen = (path) => !['ENROLLED', 'LOST', 'PLACED'].includes(path.at(-1)[0])
const recent = P.filter((p) => p.enquiry >= '2026-06-01' && p.confirmedAt)
const matches = recent.reduce((n, p) => n + Math.min(3, ref.adverts.filter((a) => Number(a.LARSCODE) === SECTORS.find((s) => s.key === p.sector).std).length), 0)
const clients = world.employers.filter((e) => e.wonAt)
const reviewsOf = (l) => l.evidence.filter((e) => ['signed_off', 'changes_requested'].includes(e.status)).length + l.evidence.filter((e) => e.resubmitted).length
const counts = {
  'CRM BRONZE.FORM_SUBMISSION': world.counts.submissions,
  'CRM LEAD': P.length,
  'CRM LEAD_INTEREST': P.reduce((n, p) => n + p.interests.length, 0),
  'CRM LEAD_CONSENT': P.length * 2 + P.filter((p) => p.marketing).length,
  'CRM CONFIRM_TOKEN': P.length,
  'CRM LEAD_MATCH': matches,
  'CRM EMAIL_MESSAGE (outbox only)': world.counts.submissions + leadsReaching('CONTACTED'),
  'CRM EMPLOYER / SITE / CONTACT': `${world.employers.length} / ${world.employers.reduce((n, e) => n + e.sites.length, 0)} / ${world.employers.reduce((n, e) => n + e.contacts.length, 0)}`,
  'CRM PIPELINE_ITEM': P.length + world.employers.length,
  'CRM STAGE_CHANGE': P.reduce((n, p) => n + p.path.length, 0) + world.employers.reduce((n, e) => n + e.path.length, 0),
  'CRM PLACEMENT': P.reduce((n, p) => n + (p.placements?.length ?? 0), 0),
  'CRM ACTIVITY (one per lead contacted, per employer meeting)': leadsReaching('CONTACTED') + world.employers.filter((e) => e.path.some(([k]) => k === 'MEETING')).length,
  'CRM TASK (one per open journey)': P.filter((p) => isOpen(p.path)).length + world.employers.filter((e) => isOpen(e.path)).length,
  'Flow calls F8 / F6 / F7': `${clients.length} / ${handedOver.length} / ${handedOver.length + learners.filter((l) => !l.person.backCohort).length + P.filter((p) => p.onboardingStatus === 'not_proceeding').length}`,
  'ILR.ONBOARDING (by F6)': handedOver.length,
  'ACCESS sign-ins / roles (by F6, F7)': `${handedOver.length} / ${handedOver.length + learners.filter((l) => !l.person.backCohort).length}`,
  'ILR.EMPLOYER (F8 + Warren-only)': clients.length + world.warrenOnlyEmployers.length,
  'ILR.LEARNER (CRM + back cohort)': `${learners.length} (${world.counts.crmLearners} + ${world.counts.backCohort})`,
}
const ilr = learners.map((l) => ilrRows(l, ref, settings.asOf))
const sum = (f) => ilr.reduce((n, x) => n + f(x), 0)
Object.assign(counts, {
  'ILR.LEARNING_DELIVERY': sum((x) => x.rows.aims.length), 'ILR.APP_FIN_RECORD': sum((x) => x.rows.fin.length),
  'ILR.HOURS_RECORD': sum((x) => x.rows.hours.length), 'ILR.EMPLOYMENT_STATUS (+ monitoring)': `${sum((x) => x.rows.employment.length)} (+${sum((x) => x.rows.esm.length)})`,
  'ILR.PRIOR_ATTAINMENT / LLDD': `${sum((x) => x.rows.prior.length)} / ${sum((x) => x.rows.lldd.length)}`,
  'ILR.OFFICER_ASSIGNMENT / LEARNER_EMPLOYER': `${learners.length * 2} / ${learners.length}`,
  'ILR.PROGRESS_REVIEW': learners.reduce((n, l) => n + l.reviews.length, 0),
  'BURROW.EVIDENCE / EVIDENCE_KSB': `${learners.reduce((n, l) => n + l.evidence.length, 0)} / ${learners.reduce((n, l) => n + l.evidence.reduce((m, e) => m + e.claims.length, 0), 0)}`,
  'BURROW.EVIDENCE_REVIEW / IQA_CHECK': `${learners.reduce((n, l) => n + reviewsOf(l), 0)} / ${learners.reduce((n, l) => n + l.evidence.filter((e) => e.iqa).length, 0)}`,
})
console.log('\nRows each table would get')
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
const outcomes = {}
for (const l of learners) outcomes[l.status] = (outcomes[l.status] ?? 0) + 1
console.log(`\nApprentices by outcome as of ${settings.asOf}: ${Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(', ')}`)
const byYear = {}
for (const l of learners) { const y = l.start >= '2026-08-01' ? '2026-27' : l.start >= '2025-08-01' ? '2025-26' : '2024-25'; byYear[y] = (byYear[y] ?? 0) + 1 }
console.log(`Starts by academic year: ${Object.entries(byYear).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`)

// ---------------------------------------------------------------- ILR checks (2026 to 2027)
const assembled = ilr.map((x) => assembleLearner(x.learner, x.rows, 2026)).filter(Boolean)
const found = checkIlrRules({ learners: assembled, standards: ref.larsStandards, standardVersions: ref.standardVersions }, 2026, settings.asOf)
const errors = found.filter((f) => f.severity === 'Error')
const warnings = found.filter((f) => f.severity !== 'Error')
const xml = buildIlrXml({ organisation: { UKPRN: 99999997, ISTESTDATA: true }, learners: assembled }, 2026, ukNow(), 1)
const schema = await validateIlrXml(xml, 2026)
console.log(`\nILR 2026 to 2027: ${assembled.length} learners in the return, ${assembled.reduce((n, l) => n + l.aims.length, 0)} aims.`)
console.log(`  Rules (84 official, Warren's checks): ${errors.length} error rule(s), ${warnings.length} warning rule(s).`)
for (const f of found.slice(0, 12)) console.log(`    ${f.severity} ${f.rule}: ${f.learners.length} learner(s), e.g. ${f.learners.slice(0, 3).join(', ')}`)
console.log(`  Official schema: ${schema.valid ? 'valid' : `${schema.errors.length} error(s), e.g. ${schema.errors.slice(0, 2).map((e) => JSON.stringify(e)).join('; ')}`}`)

if (mode !== '--dry-run') {
  const { run } = await import('./journeys/run.js')
  if (errors.length || !schema.valid) {
    console.error('\nThe ILR checks failed: nothing written.')
    process.exit(1)
  }
  const result = await run(world, ref, { slice: mode === '--slice' })
  console.log(`\nDone: JOB_RUN ${result.jobRunId}`)
}
