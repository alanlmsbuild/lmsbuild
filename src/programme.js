// A learner's current programme aim, from their aims: the latest programme
// aim (AIMTYPE 1) that hasn't been removed. A learner who returned from a
// break has more than one, and the aims before the break stay, but aren't
// current. The server's CURRENT_PROGRAMME (server/access.js) picks the same
// aim in SQL. Null if there's none.
export function currentProgramme(aims) {
  let current = null
  for (const a of aims ?? []) {
    if (a.AIMTYPE === 1 && !a.REMOVEDAT && (!current || a.AIMSEQNUMBER > current.AIMSEQNUMBER)) current = a
  }
  return current
}

// The current programme's component aims: the component aims (AIMTYPE 3)
// added after it, not removed. Components from before a break belong to the
// aims on the break.
export function currentComponents(aims) {
  const programme = currentProgramme(aims)
  if (!programme) return []
  return (aims ?? []).filter((a) => a.AIMTYPE === 3 && !a.REMOVEDAT && a.AIMSEQNUMBER > programme.AIMSEQNUMBER)
}
