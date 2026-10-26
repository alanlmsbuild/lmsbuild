# CLAUDE.md

## Standing rules

- All data Rarebit imports or works with is loaded into Snowflake (decision 15, 9 October 2026). New data sets get a RAW table and a SOURCE_FILE row via npm run load:data, run as DATA_LOAD_USER, logged in OPS.JOB_RUN. No personal data is loaded. Options site data goes in OPTIONS_DB, shared reference data in SHARED_DB, test files in CAPTURE_DB.TEST_BASELINE.
- Clearing data out of Snowflake: follow the rule under decision 21 in docs/decisions.md (make the change, leave retention as it is, old versions stay reachable until the retention period ends, then 7 days Fail-safe; confirm with an AT(TIMESTAMP => before the change) read that errors; stage files and SOURCE_FILE kept true).
