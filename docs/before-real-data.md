# Before real data

Everything that must be done, or decided, before Warren and Burrow hold
real learners' data. Each item has the date it was raised and who raised
it. Add to this list rather than keeping these elsewhere.

## Database roles and grants

- **Explicit grants per table** (2026-10-04, Alan). The ILR and BURROW
  schemas have FUTURE grants that give the app's role (ILR_APP_ROLE)
  SELECT, INSERT and UPDATE on every new table. Replace them with
  explicit grants on each table the app needs, when tidying up roles.
- **ACCESS stays read-only for the app** (2026-10-04, Alan). Since
  sql/access_03_app_read_only.sql the app can only read the ACCESS tables
  (users, roles, organisations); `npm run check:grants` fails if that
  changes. Part 8 will grant specific tables only.
- **An owner role for imports** (2026-10-05, Alan). The import scripts
  (`npm run import:lars`, `import:standards`, `import:ref`, `import:ksbs`)
  run as ILR_APP_ROLE, the same role as the website, and create or replace
  tables. A separate role should own the reference tables and run the
  imports, so the website's role can't create, replace or drop anything.

## Snowflake connection

- **Lost replies under WSL2** (2026-10-05, Claude). Now and then Snowflake
  answers a query in milliseconds but the reply never reaches the app,
  which waits until the driver's 90-second timeout makes it ask again.
  It happens both when opening a session and on sessions already open.
  Seen in Snowflake's query history (for example: answered in 19 ms, the
  next query 92.5 seconds later). Figures from 5 October 2026:
  - NAT networking: 3 stalls in the morning tests (11:13, 11:23, 12:04);
    2 of 93 seconds in a short isolation run (about 130 requests, around
    14:02); none in 1,746 requests (browser suite, session reuse on);
    2 of 28 seconds in 1,631 requests (session reuse off).
  - Mirrored networking (from 15:38, now kept on): 1 in about 3,400
    requests (16:31:29, an EEF save; Snowflake ran its last query in
    220 ms, and nothing more arrived until the test gave up 30 seconds
    later).

  Mirrored mode didn't stop them, and it's too early to say whether it
  made them rarer. Find the cause, or make sure the real server doesn't
  have it, before real use.
- **The driver's 90-second retry** (2026-10-05, Claude). If a reply is
  lost, nothing happens for 90 seconds. Find out whether that timeout can
  be shortened without risking a save being written twice (check how the
  Snowflake driver retries a query and whether Snowflake recognises the
  repeat by its request id).

## Signing in

- **Real sign-in** (2026-09-27, Alan). Today only test sign-in exists:
  picking a test user, with TEST_SIGN_IN=true in server/.env. The server
  refuses to start with it set when NODE_ENV is production. Real users
  need real sign-in (APP_USER.SSOSUBJECT is ready for single sign-on), and
  TEST_SIGN_IN must be off.

## Test data

- **Test data never goes anywhere** (2026-09-28, Alan). Every test row has
  ISTESTDATA = TRUE, names are obviously fake and every email ends
  @example.com, so all of it can be found and removed. The test
  organisations' UKPRNs (99999999 and 99999998) aren't real providers. The
  ILR return already refuses test learners in a real organisation and real
  learners in a test one. Before real use, decide whether the test
  organisations and their data are removed or kept apart.
