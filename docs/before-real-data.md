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

## ILR returns

- **Pre-break aims at the year-end rollover** (2026-10-05, Alan). When an
  apprentice returns from a break, Warren keeps returning the aims from
  before the break (and their prices) while the restart is open, as the
  provider support manual says ("Recording apprenticeship programmes":
  continue to return all aims and financial records, including those
  before the break, until the apprenticeship is completed or the apprentice
  withdraws). The migration specification for 2026 to 2027 (Appendix B)
  only mentions carrying break aims over while the apprentice "has not
  restarted". Check the first 2027 to 2028 return in FIS next summer for an
  apprentice who restarted in 2026 to 2027.
- **Aim sequence numbers between returns** (2026-10-06, Alan). The ILR file
  numbers each learner's aims 1, 2, 3... in the order Warren holds them
  (the specification says aims are "numbered consecutively from 1", and
  rule AimSeqNumber_02). If an aim is removed as entered in error after a
  return has been submitted, the aims after it get new numbers in the next
  file. Confirm with DfE's guidance whether an aim's AimSeqNumber may change
  between returns in the same year, or must stay the same once submitted.


## Employers and Companies House

- **The rate-limit counter is per server process** (2026-10-06, Alan).
  Companies House allows 600 requests in five minutes per application.
  Warren's own counter, capped below that, lives in one server process, so
  it won't hold if more than one server runs. Share it (for example in
  Snowflake) or keep to one process.
- **How long RAW history is kept** (2026-10-06, Alan). Every Companies House
  response is kept in RAW, add-only. Set a retention period (for example 2
  years) and a way to clear older rows.
- **Where scheduled jobs run** (2026-10-06, Claude). The nightly company
  refresh (`npm run refresh:companies`, scripts/refresh-companies.js) needs a
  scheduler: cron on the server, or inside Snowflake with external access.
  Nothing runs on a schedule yet. It works across every organisation with
  the app's role; give it its own role limited to ILR.EMPLOYER's company
  columns, RAW and EXT, and keep its logs (logs/refresh-companies/) as long
  as RAW.
- **Separate Companies House keys** (2026-10-06, Claude) for development,
  testing and real use: the limit is per application, so one shared key
  shares the 600 requests. Decide who owns the keys and how they're rotated.
- **Test employers linked to real companies** (2026-10-06, Claude). Testing
  the add-an-employer screen links test employers (ISTESTDATA) to real,
  public companies. Remove them before real use.
- **Registered office addresses** (2026-10-06, Alan). Small companies often
  use a home address. It's on the public register, but Warren shows it to
  managers only.
- **Who assigns employer site contacts** (2026-10-06, Alan). Which sites an
  employer contact covers in Burrow, and whether they're head office, is set
  by hand-run SQL for now. Decide whether managers do it in the app: that
  needs INSERT and UPDATE on ACCESS.APP_USER_SITE (and UPDATE on the
  head-office flag), the app role's first write access to ACCESS, and a
  change to `npm run check:grants`. Never DELETE: an assignment is ended.

## Employer contacts

- **Lawful basis for employer contact details** (2026-10-06, Alan). Warren
  will hold names, job titles, emails and phone numbers of people at
  employers (site contacts, line managers, Burrow users). Decide and record
  the lawful basis under UK GDPR (likely legitimate interests, or contract
  where the employer has signed an apprenticeship agreement), and say so in
  the privacy notice.
- **How long contact details are kept** (2026-10-06, Alan). Set a retention
  period for contacts who are no longer current (for example 6 years after
  the last apprentice they were linked to finished, in line with funding
  audit records) and a way to remove or anonymise them after that. Contacts
  are marked no longer current, not deleted, until then.
