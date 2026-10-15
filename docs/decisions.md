# Decisions

Decisions from the Rarebit plan, kept here so they're in the repo. Earlier
decisions are added as they come up.

## 19. Travel times

Journey times between LSOA population-weighted centroids, starting with South
Yorkshire (phase A: walk, bus and tram; rail in phase B after its licence is
reviewed). A typical term-time Tuesday, departures 07:30–08:30, stored as the
median with 25th and 75th percentiles, capped at 90 minutes, with walking-only
times alongside. Built from BODS timetables (OGL v3.0), OpenStreetMap (ODbL)
and ONS centroids (OGL v3.0; contains OS data © Crown copyright and database
right), computed with r5py and loaded through bronze, silver and gold like our
other data.

The travel-time tables are a database derived from OpenStreetMap, so they are
licensed under the ODbL (tagged `odbl`). Rarebit shows results from them as
Produced Works ("about 25 minutes by bus, weekday morning"), always with
"© OpenStreetMap contributors". We do not publish or hand over the tables
themselves. If we ever do, we will offer them under the ODbL with the method
that made them (`scripts/travel/`). Our other data joined to them for display
stays separate (a Collective Database) and is not affected.

Phase A settings (agreed 15 October 2026): Tuesday 10 November 2026; the
Yorkshire feed clipped to the trips that call in South Yorkshire and a 5 km
buffer; Java heap 4.5 GB; gold `travel_time` read by Warren, Meadow and the
school leavers site.

## 21. Governance built into Snowflake

Every object is described, tagged and controlled in Snowflake itself. Tags on
every database, schema, table and column: layer, source, licence and
attribution rule, owner, refresh schedule, sensitivity. Masking policies hang
on the sensitivity tags, so a column is masked the moment it's tagged
personal; Snowflake's data classification checks new tables for untagged
personal data. Row access policies keep each organisation's rows visible only
to it, backing up check:scoping. Least privilege as now. Every object has a
plain-English comment. Quality measured with dbt tests plus data metric
functions, results logged in OPS. Access history and lineage used for audit.
Retention set per layer. Resource monitors on each warehouse.

Added 14 October 2026:

- SENSITIVITY has a value for data about under-18s, `minor`, separate from
  `personal`.
- Masking and row access policies are planned but built when the first
  personal table arrives in silver (there is none yet).
- The tags are real Snowflake tags in SHARED_DB.GOVERNANCE (the account is
  Enterprise), made by `sql/silver_01_setup.sql`.

## Recorded 14 October 2026: SYSADMIN holds ILR_APP_ROLE

ILR_APP_ROLE (the app's role) is held by ILR_APP_USER and also by the role
SYSADMIN (granted by ACCOUNTADMIN on 27 September 2026, outside the repo's
SQL). This stays, as the one named exception to the rule that each service
role is held only by its own service user (`check:grants`, rule 12;
`ROLE_HOLDER_EXCEPTIONS` in `scripts/check-grants.js`).

Why: the app creates and owns the 18 `CAPTURE_DB.LARS` tables
(`scripts/import-lars.js`), and nothing else is granted on them. ACCOUNTADMIN
reaches them only through ACCOUNTADMIN → SYSADMIN → ILR_APP_ROLE. Without it,
the test-data scripts run as ACCOUNTADMIN that join `LARS.STANDARD`
(`witness_test_statements.sql`, `iqa_test_signoffs.sql`,
`test_learners_more.sql`) would fail, and ACCOUNTADMIN couldn't manage the
LARS tables.

What it means: SYSADMIN, and so ACCOUNTADMIN, has everything ILR_APP_ROLE
has. Both are admin roles held only by Alan's own user.

To remove it later: make ACCOUNTADMIN the owner of the LARS tables, grant
ILR_APP_ROLE what the app and the LARS import need, then revoke the role
from SYSADMIN and take the exception out.

