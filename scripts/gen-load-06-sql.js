// gen-load-06-sql.js - writes sql/load_06_official_tables.sql (batch 6) from the
// load:data steps 32 to 38 and the downloaded files' own headers, so the
// tables always match what the loader will check. Read-only apart from the
// SQL file.   node scripts/gen-load-06-sql.js
import fs from 'node:fs'
import path from 'node:path'
import { STEPS } from './load-data.js'
import { csvRecords, zipEntry, zipNames } from './load/files.js'
import { tableNames } from './load/loader.js'

const q = (n) => `"${n.replaceAll('"', '""')}"`
const lit = (s) => s.replaceAll("'", "''")
async function header(spec) {
  if (spec.table.endsWith('POLICE_STREET_CRIME') || spec.table.endsWith('POLICE_OUTCOME')) {
    const kind = spec.table.endsWith('POLICE_STREET_CRIME') ? 'street' : 'outcomes'
    const m = (await zipNames(spec.file)).find((n) => n.endsWith(`-${kind}.csv`))
    for await (const r of csvRecords(await zipEntry(spec.file, m))) return ['MEMBER', ...tableNames(r)]
  }
  const src = spec.member && spec.kind === 'extracted' ? await zipEntry(spec.file, spec.member) : fs.createReadStream(spec.file)
  for await (const r of csvRecords(src)) { src.destroy?.(); return tableNames(r) }
}
const typed = new Map()
for (let n = 32; n <= 38; n++) {
  for (const spec of await STEPS[n].files()) {
    if (spec.table.endsWith('PUBLISHED_CELL')) continue
    const cols = await header(spec)
    const prev = typed.get(spec.table)
    if (prev) { if (prev.cols.join('\u0001') !== cols.join('\u0001')) throw new Error(`${spec.table}: different headers`); prev.files.push(spec); continue }
    typed.set(spec.table, { cols, files: [spec], spec })
  }
}
const out = [`-- Loading everything, batch 6: the official data sets of the plan of 14
-- October 2026 (decision 15), their RAW tables and grants to DATA_LOAD_ROLE.
-- Loaded by npm run load:data steps 32 to 39 (scripts/load/official3.js).
--
--   SHARED_DB.RAW: the ONS Postcode Directory in full (all 55 columns:
--     ward, LSOA, MSOA, built-up area, deprivation rank and the rest; its
--     code-to-name lookups go to PUBLISHED_CELL); population by LSOA and by
--     local authority (Nomis, for rates per 1,000 people); the apprenticeship
--     provider and assessment register; police.uk street crimes and outcomes,
--     the latest 3 years (stop and search left out: individual stops with each
--     person's details); NaPTAN stops; Historic England's listed buildings;
--     Wikidata places with an English GSS code; the 14 electricity regions'
--     boundaries (NESO, one JSON feature per row). Ofgem's price cap
--     workbooks and DESNZ's sub-regional fuel poverty tables go to
--     PUBLISHED_CELL (made by sql/load_05_official_tables.sql).
--   OPTIONS_DB.RAW: HESA Graduate Outcomes (as republished by DfE).
--
-- Typed tables: columns named exactly as in each file's header, all text;
-- plus SOURCEFILEID and FILEROWNUMBER. Add-only.
--
-- DATA_LOAD_ROLE gets SELECT and INSERT on every new table: no UPDATE,
-- DELETE, TRUNCATE or CREATE. The app roles get nothing.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.NESO_DNO_AREA (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the GeoJSON file.',
  FEATURENUMBER NUMBER(38,0) NOT NULL COMMENT 'Its place among the file''s features, from 1.',
  PROPERTIES    VARIANT      COMMENT 'The region: ID, Name (the GSP group letter, e.g. _M), DNO, Area, DNO_Full.',
  GEOMETRY      VARIANT      COMMENT 'Its approximate boundary as GeoJSON, in British National Grid (EPSG:27700), as published.'
)
COMMENT = 'Batch 6. GB DNO licence areas: the 14 electricity regions, approximate boundaries (NESO, NESO Open Data Licence), one feature per row. Placing a postcode in its region: its ONSPD easting and northing inside the region''s boundary. Add-only.';
`]
for (const [table, t] of typed) {
  const s = t.spec
  const src = t.files.map((f) => (f.member ? `${f.member} in ${path.basename(f.file)}` : path.basename(f.file))).join('; ')
  out.push(`CREATE TABLE IF NOT EXISTS ${table} (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
${t.cols.map((c) => `  ${q(c)} VARCHAR`).join(',\n')}
)
COMMENT = '${lit(`Batch 6. ${s.title}. ${s.publisher}. ${s.licence}. Source: ${src.length > 300 ? `${src.slice(0, 300)}...` : src}. Columns named exactly as in the file${table.includes('POLICE_') ? ', after MEMBER (the monthly file each row came from)' : ''}, all text. Add-only: each load adds its rows under a new SOURCEFILEID.`)}';
`)
}
const all = ['SHARED_DB.RAW.NESO_DNO_AREA', ...typed.keys()]
out.push(`-- ---------------------------------------------------------------------------
-- Grants: the loaders add rows, nothing else
-- ---------------------------------------------------------------------------
${all.map((t) => `GRANT SELECT, INSERT ON TABLE ${t} TO ROLE DATA_LOAD_ROLE;`).join('\n')}

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: ${all.length} rows, ROW_COUNT 0, COLUMNS_ as listed:
${all.map((t) => `--      ${t} ${t.endsWith('NESO_DNO_AREA') ? 4 : typed.get(t).cols.length + 2}`).join('\n')}
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 6.%'
UNION ALL
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME, ROW_COUNT,
  (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME)
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 6.%'
ORDER BY 1;

-- 2. Who else has rights on them. Expected: 2 rows, DATA_LOAD_ROLE with
--    INSERT and with SELECT, each on ${all.length} tables; nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM (
  SELECT PRIVILEGE_TYPE, GRANTEE FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN (${all.filter((t) => t.startsWith('SHARED_DB')).map((t) => `'${t.split('.').at(-1)}'`).join(', ')})
  UNION ALL
  SELECT PRIVILEGE_TYPE, GRANTEE FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
  WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN (${all.filter((t) => t.startsWith('OPTIONS_DB')).map((t) => `'${t.split('.').at(-1)}'`).join(', ')})
) WHERE GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;
`)
fs.writeFileSync(new URL('../sql/load_06_official_tables.sql', import.meta.url), out.join('\n'))
for (const t of all) console.log(t, typed.get(t)?.cols.length ?? '(json)', typed.get(t)?.files.length ?? 1)
