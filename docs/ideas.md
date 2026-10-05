# Ideas

Things worth doing one day that aren't planned yet. One line each: the
date it was raised, who raised it, and the idea. When one is planned or
built, move it out (or strike it through with where it went).

- 2026-10-05, Alan: when an apprentice returns from a break on a
  different standard, record that properly (left out of 4g-2, which
  covers returning on the same standard).
- 2026-10-05, Claude: with session reuse, keep a session whose browser
  gave up when no query was still running on it, instead of always
  throwing it away (about 12% of requests in a test run).
- 2026-10-05, Claude: write each save's history rows (ILR.RECORD_CHANGE)
  in one insert instead of one per change, so saves make fewer trips to
  Snowflake.
- 2026-10-04, Claude: the employer on an apprentice's employment status
  record and the employer who sees them in Burrow (ILR.LEARNER_EMPLOYER)
  are kept separately; changing one doesn't change the other. Decide
  whether one should follow the other.
- 2026-09-28, Claude: other vacancy sources besides Find an apprenticeship
  (Adzuna, Reed). Their terms of use haven't been checked.
