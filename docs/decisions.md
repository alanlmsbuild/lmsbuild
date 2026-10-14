# Decisions

Decisions from the Rarebit plan, kept here so they're in the repo. Earlier
decisions are added as they come up.

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
