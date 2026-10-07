// The background jobs' schedule (scheduling, plan A): how often each runs,
// and when it counts as overdue. Data only, no job code, so the screens and
// the scheduler (scripts/jobs.js) share it. Every run is recorded in
// OPS.JOB_RUN (scripts/job-run.js).
//
//   label, short  its name, and a shorter one for the managers' tile
//   every         run when the last success started longer ago than this
//   overdueAfter  managers see it as overdue after this (every + slack)
//   lockGroup     jobs that must never overlap each other
//   lockHours     an open run older than this no longer blocks (it didn't
//                 finish: the laptop slept or was shut down)
//   timeoutMinutes  a scheduled run still going after this is stopped
//   coveredBy     a success of this job also counts for this one
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
}

// The order a tick runs due jobs in, one at a time.
export const JOB_ORDER = ['vacancies-full', 'vacancies-new', 'companies-refresh', 'skills']

// A failed or refused job isn't tried again sooner than this.
export const RETRY_AFTER = HOUR
