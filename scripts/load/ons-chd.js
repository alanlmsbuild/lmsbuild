// The ONS Code History Database (Office for National Statistics, Register of
// Geographic Codes), Changes table: every change of a statistical geography's
// code, with the order (statutory instrument) and date that made it. Open
// Government Licence v3.0 (docs/licences/ons-code-history-2026-06/). Load
// step 55 puts it into SHARED_DB.RAW.ONS_CODE_CHANGE (sql/ons_chd_01_tables.sql).
// Silver reads only the local authority rows (local_authority_code_change).
//
// The download (Code_History_Database_(June_2026).zip from the Open Geography
// portal, saved as RAREBIT_DATA/ons-chd/chd-<year>-<month>.zip) is kept as it
// is. The loaded copy is Changes.csv converted to UTF-8: the file is UTF-8 with
// a few stray bytes of another encoding in non-authority rows, which become
// the replacement character. Nothing else is changed. No personal data: the
// names and codes of areas.
import fs from 'node:fs'
import path from 'node:path'
import { csvLine, csvRecords, writeLines, zipEntry } from './files.js'

export const CHD_DIR = 'ons-chd'
export const CHD_PAGE = 'https://geoportal.statistics.gov.uk/search?q=Code%20History%20Database'
export const CHD_MEMBER = 'Changes.csv'
export const CHD_COLUMNS = ['GEOGCD', 'GEOGNM', 'GEOGNMW', 'GEOGCD_P', 'GEOGNM_P', 'GEOGNMW_P', 'SI_ID', 'SI_TITLE', 'OPER_DATE', 'ENTITYCD', 'YEAR']

// Changes.csv as UTF-8, stopping if its columns are not the ones the table has.
export const changesAsUtf8 = (zip) => async (out) => {
  let rows = 0
  async function* lines() {
    let header = null
    for await (const record of csvRecords(await zipEntry(zip, CHD_MEMBER), 'utf8')) {
      if (!header) {
        header = record
        if (header.join() !== CHD_COLUMNS.join()) throw new Error(`${CHD_MEMBER}: the columns are ${header.join(', ')}, not ${CHD_COLUMNS.join(', ')}: stopped, nothing loaded.`)
        yield csvLine(header)
        continue
      }
      if (record.length === 1 && record[0] === '') continue
      if (record.length !== CHD_COLUMNS.length) throw new Error(`${CHD_MEMBER}: a row of ${record.length} fields`)
      rows++
      yield csvLine(record)
    }
  }
  await writeLines(out, lines())
  return { removed: null, rows }
}

// The newest download: chd-<year>-<month>.zip.
export function latestChd(dir) {
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^chd-\d{4}-\d{2}\.zip$/.test(n)).sort() : []
  if (!found.length) throw new Error(`No chd-<year>-<month>.zip in ${dir}: download the Code History Database (CSV zip) from the Open Geography portal.`)
  return path.join(dir, found.at(-1))
}

export function chdSteps(R) {
  const dir = path.join(R, CHD_DIR)
  return {
    55: { job: 'load-ons-code-history', runLabel: 'ONS Code History Database: changes of area codes', files: () => {
      const zip = latestChd(dir)
      return [{ home: 'SHARED_DB', source: 'ons-code-history', publisher: 'Office for National Statistics (Register of Geographic Codes)',
        licence: 'Open Government Licence v3.0 (credit the Office for National Statistics)', format: 'SHARED_DB.RAW.CSV_UTF8',
        title: 'Code History Database for the UK: changes of codes (Changes.csv, converted to UTF-8)', page: CHD_PAGE,
        file: zip, member: CHD_MEMBER, kind: 'converted', table: 'SHARED_DB.RAW.ONS_CODE_CHANGE', make: changesAsUtf8(zip) }]
    } },
  }
}
