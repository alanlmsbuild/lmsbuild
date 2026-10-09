# CLAUDE.md

## Standing rules

- All data Rarebit imports or works with is loaded into Snowflake (decision 15, 9 October 2026). New data sets get a RAW table and a SOURCE_FILE row via npm run load:data, run as DATA_LOAD_USER, logged in OPS.JOB_RUN. No personal data is loaded. Options site data goes in OPTIONS_DB, shared reference data in SHARED_DB, test files in CAPTURE_DB.TEST_BASELINE.
