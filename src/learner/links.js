// Addresses for the learner page, which has two tabs:
//   Record     /app/learners/<ref>     (Warren, staff)
//   Portfolio  /burrow/learners/<ref>  (Burrow)
// ?back=<address> is where "Back" goes: the list, My day, a report... It
// travels with both tabs, so Back works from either.
//
// Opening a learner goes to the tab the person used last, remembered in
// this browser (per user). It's only a convenience: without it, Record.

const TAB_KEY = (userId) => `rarebit.learnerTab.${userId ?? 'anyone'}`

export function lastLearnerTab(userId) {
  try {
    return window.localStorage.getItem(TAB_KEY(userId)) === 'portfolio' ? 'portfolio' : 'record'
  } catch {
    return 'record'
  }
}

export function rememberLearnerTab(userId, tab) {
  try {
    window.localStorage.setItem(TAB_KEY(userId), tab)
  } catch {
    // Storage blocked: every learner opens on Record.
  }
}

export function learnerTabPath(learnRefNumber, tab, back) {
  const base = `${tab === 'portfolio' ? '/burrow' : '/app'}/learners/${encodeURIComponent(learnRefNumber)}`
  return back ? `${base}?back=${encodeURIComponent(back)}` : base
}

// A manager's form on the Record tab: edit, complete or withdraw.
export function learnerActionPath(learnRefNumber, action, back) {
  const base = `/app/learners/${encodeURIComponent(learnRefNumber)}/${action}`
  return back ? `${base}?back=${encodeURIComponent(back)}` : base
}

// Staff's read-only view of one piece of evidence, on the Portfolio tab.
export function evidencePath(learnRefNumber, evidenceId, back) {
  const base = `/burrow/learners/${encodeURIComponent(learnRefNumber)}/evidence/${encodeURIComponent(evidenceId)}`
  return back ? `${base}?back=${encodeURIComponent(back)}` : base
}

// Where a link to a learner goes: their page on the last-used tab.
export function learnerPath(me, learnRefNumber, back) {
  return learnerTabPath(learnRefNumber, lastLearnerTab(me?.USERID), back)
}

// A ?back= address, if it's a page in Warren or Burrow other than a
// learner page (so Back can't loop or leave Rarebit). Otherwise null.
export function safeBack(back) {
  if (typeof back !== 'string' || !/^\/(app|burrow)(\/|$|\?)/.test(back)) return null
  if (/^\/(app|burrow)\/learners\/[^/?]+/.test(back)) return null
  return back
}

const BACK_LABELS = [
  [/^\/app\/my-day/, 'My day'],
  [/^\/app\/learners/, 'Learners'],
  [/^\/app\/dashboard/, 'Dashboard'],
  [/^\/app\/officers\/[^/?]+/, 'Officer'],
  [/^\/app\/officers/, 'Officers'],
  [/^\/app\/reports\/qar/, 'QAR'],
  [/^\/app\/reports\/caseload\/[^/?]+/, 'Caseload'],
  [/^\/app\/reports\/caseload/, 'Caseload report'],
  [/^\/app\/reports\/ilr/, 'ILR return'],
  [/^\/app\/sign-offs/, 'Sign-offs to check'],
  [/^\/burrow\/learners/, 'Learners'],
]

// "← My day", "← Learners"...
export function backLabel(back) {
  return BACK_LABELS.find(([pattern]) => pattern.test(back))?.[1] ?? 'Back'
}
