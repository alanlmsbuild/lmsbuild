// strip-ofqual-contacts.js - takes the contact details out of the saved
// Ofqual organisation files (RAREBIT_DATA/ofqual/ofqual_organisations_*.jsonl),
// in place: the fields in scripts/load/ofqual.js. New fetches never write
// them (fetch-official.js); this is for files saved before that. A file's
// date on disk is kept (it is recorded as when it was downloaded). Safe to
// run again: a clean file is left as it is. No Snowflake.
//
//   node scripts/strip-ofqual-contacts.js [folder]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OFQUAL_PERSONAL_FIELDS, withoutPersonalFields } from './load/ofqual.js'

// Returns { file, records, stripped } for each organisation file in dir.
export function stripSavedOrganisations(dir) {
  if (!fs.existsSync(dir)) return []
  const done = []
  for (const name of fs.readdirSync(dir).filter((n) => /^ofqual_organisations_.*\.jsonl$/.test(n)).sort()) {
    const file = path.join(dir, name)
    const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const stripped = records.filter((r) => OFQUAL_PERSONAL_FIELDS.some((f) => f in r)).length
    if (stripped) {
      const { atime, mtime } = fs.statSync(file)
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, records.map((r) => JSON.stringify(withoutPersonalFields(r))).join('\n') + '\n')
      fs.renameSync(tmp, file)
      fs.utimesSync(file, atime, mtime)
    }
    done.push({ file: name, records: records.length, stripped })
  }
  return done
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? path.join(process.env.RAREBIT_DATA || '/mnt/c/Users/alanb/rarebit-data', 'ofqual')
  const done = stripSavedOrganisations(dir)
  if (!done.length) console.log(`No organisation files in ${dir}.`)
  for (const d of done) console.log(`${d.file}: ${d.records} records, ${d.stripped ? `${d.stripped} had contact details, now removed` : 'already clean'}`)
}
