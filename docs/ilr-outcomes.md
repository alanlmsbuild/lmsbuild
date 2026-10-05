# Recording an apprenticeship standard's outcome in the ILR (2026 to 2027)

What Warren records on the programme aim (and its component aims) for each
outcome, for apprenticeship standards on funding model 36 (FundModel 36,
ProgType 25). Checked 4 October 2026 against:

- **Spec**: ILR Specification 2026 to 2027, Version 1 (30 January 2026), the
  LearningDelivery field pages for CompStatus, LearnActEndDate, Outcome,
  AchDate, WithdrawReason and OutGrade
  (guidance.submit-learner-data.service.gov.uk/26-27/ilr/entity/LearningDelivery).
- **PSM**: Provider support manual, "Recording apprenticeship programmes"
  (sections "Withdrawal from the apprenticeship programme", "Apprentice takes
  an agreed break in learning", "Funding model 36: recording learning
  outcomes", "Recording apprenticeship standard completions") and "Recording
  learner changes in ILR" ("Recording learner absence or withdrawal",
  "Recording restarts").
- **Rules**: Validation rules 2026 to 2027, Version 4 (9 September 2026). All
  the rules named here run in FIS.
- **Migration**: Migration specification (Appendix B), January 2026,
  Version 1 (guidance.submit-learner-data.service.gov.uk/26-27/ilr/appendixbmigrationspec).

"—" means the field is not returned. ACT is the apprenticeship contract type
record Warren adds itself (SOF 105 and ACT 1 aren't stored).

## Programme aim

| Outcome | CompStatus | LearnActEndDate | Outcome | AchDate | WithdrawReason | OutGrade | ACT date to | Actual OTJ hours (HRS 3) |
|---|---|---|---|---|---|---|---|---|
| 1. Continuing | 1 | — | — | — | — | — | — (R_123) | — |
| 2. Learning finished, waiting for the EPA | 1 | last day of training, **not** the EPA period | 8 | — | — | — (OutGrade_04) | — (R_123: still CompStatus 1) | recorded now (funding rules 90) |
| 3. EPA passed | 2 | unchanged (end of training) | 1 | end of the EPA period | — | PA, ME or DS | = AchDate (R_121) | required (HRSType_08) |
| 4. EPA failed (reached the end of the EPA period) | 2 | unchanged (end of training) | 3 | end of the EPA period | — | FL, or not returned (OutGrade_06) | = AchDate (R_121) | required (HRSType_08) |
| 5. Withdrawn | 3 | last learning activity | 3 | — | the reason (WithdrawReason_03) | — (PSM) | = LearnActEndDate (R_122) | required for starts from 1 Aug 2022 (HRSType_09) |
| 6. Break in learning | 6 | last learning activity before the break (the day after, if it falls on the day aims complete) | 3 | — | — (WithdrawReason_04) | — | = LearnActEndDate (R_122) | not required |
| 7. Doesn't return from a break | 3 | unchanged (the break's date) | 3 | — | the reason | — | = LearnActEndDate (R_122) | required for starts from 1 Aug 2022 |
| 8. Returns from a break | new programme aim from the restart date: CompStatus 1, OrigLearnStartDate = the original start, new planned end, RES 1, prices TNP 1 and 2 (the same unless renegotiated), or residual TNP 3 and 4 with a new employer; planned hours (HRS 1, HRS 4) and any price reduction (RIP 1) copied. The aim on the break stays as it was and is still returned while the restart is open. | | | | | | ACT from the new start (R_102) | copied from the start (whole programme) |

Notes, with sources:

- CompStatus 2 only once **both** the training and the EPA are done (Spec,
  CompStatus notes; PSM, "Recording apprenticeship standard completions").
  A failed EPA counts as complete if the apprentice reached the end of the
  EPA period rather than withdrawing (PSM).
- Outcome 8 at the end of learning and before the EPA, for learning ending
  from 1 August 2019, then updated after the EPA (Spec, Outcome notes).
  LearnActEndDate is recorded with it (PSM).
- LearnActEndDate on the programme aim excludes the EPA period (Spec,
  LearnActEndDate notes). AchDate records the end of the EPA period, pass or
  fail (Spec, AchDate notes; PSM).
- A standard's AchDate with Outcome 3 is allowed: Outcome_04 isn't triggered
  for standards. CompStatus_02 and CompStatus_05 (an end date or outcome with
  CompStatus 1) aren't triggered for standards' programme aims either, which
  is what allows outcome 2 (CompStatus 1 with an end date and Outcome 8).
- AchDate only on the programme aim (AchDate_14), on or after LearnActEndDate
  (AchDate_05), not after the file preparation date (AchDate_07), and only
  with CompStatus 2 (CompStatus_07). CompStatus 2 must have one (AchDate_12).
- Withdrawn or on a break: Outcome must not be 1 or 8 (CompStatus_06); an
  end date needs an outcome (Outcome_12).
- Employer payments for training or assessment not delivered are repaid and
  recorded as PMR 3 (PSM, withdrawal and break sections).
- Which year's return an aim is in: the year it ends or is achieved in, or
  later. Carried over from earlier years (Migration): continuing aims, aims
  on a break (CompStatus 6) and aims waiting for their outcome (Outcome 8),
  if the planned end date is on or after 1 August 2024. So outcome 2 and
  outcome 6 stay in the 2026 to 2027 return even when they started before
  it; outcomes 3, 4, 5 and 7 drop out once their dates are all before
  1 August 2026.
- An aim's dated funding and monitoring records (learning support, LSF, for
  example) must not run past its actual end date (LearnDelFAMDateTo_03), so
  Warren ends them on it when the outcome is recorded. A component's ACT
  running past its planned end date is a warning only
  (LearnDelFAMDateTo_02): English and maths often do.
- A failed EPA that needs more learning is a new aim recorded as a restart;
  a resit with no more learning isn't a new aim (PSM, "Funding model 36:
  recording learning outcomes").

## Component aims (the standard's own aim, English and maths)

| Programme outcome | Component aims |
|---|---|
| 2. Learning finished | every open component closed: CompStatus 2, LearnActEndDate = its last learning activity (not after the programme's: R_89), Outcome 1 (achieved) or 3 (not) |
| 3 and 4. EPA result | already closed at 2 |
| 5. Withdrawn | every open component: CompStatus 3, the same date and reason, Outcome 3 |
| 6. Break in learning | every open component: CompStatus 6, LearnActEndDate, Outcome 3 |
| 8. Returns from a break | new component aims with RES 1 and their original start dates (4g-2) |

Returning from a break (sources: provider support manual, "Recording
apprenticeship programmes"; technical funding guide from August 2026,
scenario F and "Changes in price"; funding rules 2026 to 2027, version 3,
paragraphs 78.4, 79, 310 and 333; off-the-job guidance version 6,
paragraphs 63, 75 and 82):

- Each component on the break gets a new aim too, from the restart date,
  with RES 1 and its own original start. English and maths record the
  proportion still to be delivered (funding adjustment for prior learning).
- EEF is copied; dated records such as learning support (LSF) are entered
  again if they still apply.
- A new employer gets an employment status from the restart date.
- The off-the-job policy and the standard's version go by the original start
  date; the minimum duration counts the spells before and after the break.
- Rules for restarts: R_124 (no overlapping programme aims), R_142 (no price
  on the aim on the break dated on or after the restart), AFinDate_05 and 06,
  OrigLearnStartDate_01, 02, 04, 07 and 09; restarts are excluded from
  LearnStartDate_13, 17 and 18, the minimum-duration rules, HRSAmount_02 and
  03 and HRSType_08.
- In the ILR file the aims are numbered consecutively from 1 (AimSeqNumber
  notes; rule AimSeqNumber_02). Warren's own aim numbers can have gaps,
  because an aim removed as entered in error keeps its number.

A closed programme aim can't have open component aims (R_90), and no
component can end after the programme (R_89). AchDate is never on a
component (AchDate_14). ACT on English and maths components follows the
same rules as the programme's (R_121 to R_123 apply to the programme aim;
Warren gives components the same date to as their own end date).
