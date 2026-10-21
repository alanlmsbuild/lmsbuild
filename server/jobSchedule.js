// The background jobs' schedule (scheduling, plan A): how often each runs,
// and when it counts as overdue. Data only, no job code, so the screens and
// the scheduler (scripts/jobs.js) share it. Every run is recorded in
// SHARED_DB.OPS.JOB_RUN (scripts/job-run.js).
//
//   label, short  its name, and a shorter one for the managers' tile
//   every         run when the last success started longer ago than this
//   overdueAfter  managers see it as overdue after this (every + slack)
//   lockGroup     jobs that must never overlap each other
//   lockHours     an open run older than this no longer blocks (it didn't
//                 finish: the laptop slept or was shut down)
//   timeoutMinutes  a scheduled run still going after this is stopped
//   coveredBy     a success of this job also counts for this one
//   followsRun    { after, then }: due only when `after` has succeeded since
//                 this job last did and `then` has started and succeeded after
//                 that run finished (reach-export: a new travel-monthly, then
//                 the silver build that puts its times in gold). `every` is
//                 then only the least gap between two runs.
const HOUR = 60 * 60 * 1000

export const JOB_SCHEDULE = {
  'vacancies-full': {
    label: 'Vacancies: every advert',
    short: 'Adverts, all',
    every: 24 * HOUR,
    overdueAfter: 26 * HOUR,
    lockGroup: 'vacancies',
    lockHours: 1,
    timeoutMinutes: 60,
  },
  'vacancies-new': {
    label: 'Vacancies: new adverts',
    short: 'Adverts, new',
    every: 2 * HOUR,
    overdueAfter: 3 * HOUR,
    lockGroup: 'vacancies',
    lockHours: 1,
    timeoutMinutes: 20,
    coveredBy: 'vacancies-full',
  },
  'companies-refresh': {
    label: 'Companies House refresh',
    short: 'Companies House',
    every: 24 * HOUR,
    overdueAfter: 26 * HOUR,
    lockGroup: 'companies-refresh',
    lockHours: 3,
    timeoutMinutes: 60,
  },
  skills: {
    label: 'Skills England standards and KSBs',
    short: 'Skills England',
    every: 7 * 24 * HOUR,
    overdueAfter: 8 * 24 * HOUR,
    lockGroup: 'skills',
    lockHours: 3,
    timeoutMinutes: 60,
  },
  // The official data sets with an API (scripts/fetch-official.js): fetch
  // what's new, then load it as DATA_LOAD_USER. Checked weekly; the claimant
  // count is published monthly, ASHE and the DfE sets yearly or so.
  'official-nomis': {
    label: 'Official data: claimant count and pay by area (Nomis)',
    short: 'Nomis',
    every: 7 * 24 * HOUR,
    overdueAfter: 8 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 3,
    timeoutMinutes: 90,
  },
  'official-api': {
    label: 'Official data: key stage 4, destinations, apprenticeships (DfE)',
    short: 'DfE statistics',
    every: 7 * 24 * HOUR,
    overdueAfter: 8 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 3,
    timeoutMinutes: 120,
  },
  'official-statxplore': {
    label: 'Official data: Universal Credit, Work and Health Programme (Stat-Xplore)',
    short: 'Stat-Xplore',
    every: 7 * 24 * HOUR,
    overdueAfter: 8 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 3,
    timeoutMinutes: 120,
  },
  'official-ons': {
    label: 'Official data: online job adverts, vacancies by industry (ONS)',
    short: 'ONS',
    every: 7 * 24 * HOUR,
    overdueAfter: 8 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 3,
    timeoutMinutes: 120,
  },
  'official-monthly': {
    label: 'Official data: police.uk, provider register, NaPTAN, listed buildings, Wikidata',
    short: 'Monthly data',
    every: 30 * 24 * HOUR,
    overdueAfter: 32 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 3,
    timeoutMinutes: 240,
  },
  // Travel times (decision 19, phase B): the next term-time Tuesday's bus,
  // tram and train journey times between South Yorkshire's LSOAs
  // (scripts/travel/job.js). Refuses to start without the memory the
  // compute needs (dev servers up), and is tried again an hour later.
  'travel-monthly': {
    label: 'Travel times: bus, tram and train (South Yorkshire)',
    short: 'Travel times',
    every: 30 * 24 * HOUR,
    overdueAfter: 32 * 24 * HOUR,
    lockGroup: 'travel',
    lockHours: 4,
    timeoutMinutes: 120,
  },
  'official-ofqual': {
    label: 'Official data: Ofqual register of qualifications',
    short: 'Ofqual',
    every: 7 * 24 * HOUR,
    overdueAfter: 8 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 3,
    timeoutMinutes: 60,
  },
  // The silver layer (scripts/transform-silver.js): last, after any load,
  // and in the official lock group so it never runs while one is loading.
  'transform-silver': {
    label: 'Silver layer: build, test and swap in (dbt)',
    short: 'Silver',
    every: 24 * HOUR,
    overdueAfter: 26 * HOUR,
    lockGroup: 'official',
    lockHours: 2,
    timeoutMinutes: 45,
  },
  // The reach map's static files (scripts/reach/job.js): exported from gold
  // after each travel-monthly run has been built into silver and gold, checked
  // against gold, and copied to the school leavers site if it is here. In the
  // official lock group, so it never reads gold while a silver swap is running.
  // Overdue after travel-monthly's 32 days and two more.
  'reach-export': {
    label: 'Reach map: export, check and copy to the site',
    short: 'Reach map',
    every: 24 * HOUR,
    overdueAfter: 34 * 24 * HOUR,
    lockGroup: 'official',
    lockHours: 2,
    timeoutMinutes: 20,
    followsRun: { after: 'travel-monthly', then: 'transform-silver' },
  },
  // Decision 26 (scripts/check-website-links.js): a seventh of the website
  // links in silver each day, so each is checked weekly. Its own lock group:
  // it only reads silver and writes its own tables.
  'website-links': {
    label: 'Website links: a seventh checked each day',
    short: 'Links',
    every: 24 * HOUR,
    overdueAfter: 26 * HOUR,
    lockGroup: 'links',
    lockHours: 2,
    timeoutMinutes: 120,
  },
}

// The order a tick runs due jobs in, one at a time.
export const JOB_ORDER = ['vacancies-full', 'vacancies-new', 'companies-refresh', 'skills', 'official-nomis', 'official-api', 'official-statxplore', 'official-ons', 'official-ofqual', 'official-monthly', 'travel-monthly', 'transform-silver', 'reach-export', 'website-links']

// A failed or refused job isn't tried again sooner than this.
export const RETRY_AFTER = HOUR
