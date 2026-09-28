# interest-words.csv

Our own everyday interest words for the learner diagnostic ("sports", "cars",
"helping people"), each linked to job titles in the ONS SOC 2020 coding index.
Loaded into `REF.INTEREST_WORD` by `npm run import:ref -- --only interests`.

Columns: `WORD` (lower case), `JOB_TITLE` (as written in the ONS index, natural
word order), `SOC2020` (the unit group that job title is coded to).

Many job titles appear in the index more than once with different qualifiers
and codes, so each row says which SOC 2020 unit group it means. The import
checks that every `JOB_TITLE` and `SOC2020` pair is a real entry in the index
(not a cross-reference) and loads nothing if one isn't.

To add a word: find suitable job titles in `REF.SOC2020_INDEX` (or the ONS
coding index), add a row per title, and run the import.
