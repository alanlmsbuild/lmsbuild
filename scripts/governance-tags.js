// The governance tags (decision 21; sql/silver_01_setup.sql) and their
// allowed values. check:tags compares these with Snowflake's own.
export const TAG_SCHEMA = 'SHARED_DB.GOVERNANCE'
export const TAGS = ['LAYER', 'OWNER', 'SOURCE', 'LICENCE', 'ATTRIBUTION', 'REFRESH', 'SENSITIVITY']
export const ALLOWED = {
  layer: ['bronze', 'silver', 'gold'],
  owner: ['rarebit-data'],
  licence: ['ogl-3', 'cc-by-4', 'cc0', 'odbl', 'mit', 'neso-odl', 'test-data'],
  refresh: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'by-hand'],
  sensitivity: ['public', 'internal', 'personal', 'special-category', 'minor'],
}
// SOURCE: one or more SOURCE_FILE.SOURCE names, joined with commas.
export const SOURCE = /^[a-z0-9-]+(,[a-z0-9-]+)*$/
