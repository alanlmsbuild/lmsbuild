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

// English and maths component aims carry the contract type (ACT) like the
// programme aim (rule LearnDelFAMType_64), and on a restart record the
// proportion still to be delivered. Recognised by their LARS title.
const ENGLISH_OR_MATHS = /^(Functional Skills Qualification in (English|Mathematics)|GCSE .*(English|Mathematics))/i
export const isEnglishOrMaths = (title) => ENGLISH_OR_MATHS.test(title ?? '')

// The aim that restarted this one after a break: a later aim (not removed)
// for the same learning aim, with this aim's start as its original start.
// Null if it hasn't been restarted.
export function restartOf(aim, aims) {
  if (aim.COMPSTATUS !== 6) return null
  const original = String(aim.ORIGLEARNSTARTDATE ?? aim.LEARNSTARTDATE).slice(0, 10)
  return (aims ?? []).find((r) => !r.REMOVEDAT && r.AIMSEQNUMBER > aim.AIMSEQNUMBER && r.LEARNAIMREF === aim.LEARNAIMREF &&
    r.ORIGLEARNSTARTDATE && String(r.ORIGLEARNSTARTDATE).slice(0, 10) === original) ?? null
}

// Why an aim on a break that has been restarted can't be removed (the server
// refuses it; the page says the same).
export const RESTARTED_AIM = "This aim was restarted when the apprentice returned from their break, so it can't be removed. If the return was entered in error, undo the return instead."
