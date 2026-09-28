// Checks an ILR file against the official schema with xmllint (libxml2,
// compiled to WebAssembly). The schema is DfE's own file, kept unchanged in
// server/ilr/schema/ (see the README there for where it came from).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateXML } from 'xmllint-wasm'

const here = path.dirname(fileURLToPath(import.meta.url))
const SCHEMAS = { 2026: 'ILR-2026-27-schemafile-January.xsd' }
const cache = new Map()

function schemaFor(year) {
  if (!cache.has(year)) {
    cache.set(year, { fileName: SCHEMAS[year], contents: fs.readFileSync(path.join(here, 'schema', SCHEMAS[year]), 'utf8') })
  }
  return cache.get(year)
}

export function schemaFileName(year) {
  return SCHEMAS[year]
}

// Returns { valid, errors: [{ line, message }] }. The verdict is xmllint's
// own last line ("<file> validates" or "<file> fails to validate").
// xmllint also warns that DfE's namespace, ILR/2026-27, isn't an absolute
// URI; that warning is about the namespace name itself, not the file, so
// it's left out of the errors.
export async function validateIlrXml(xml, year) {
  const fileName = 'ilr.xml'
  const result = await validateXML({ xml: { fileName, contents: xml }, schema: schemaFor(year), maxMemoryPages: 4096 })
  const lines = result.rawOutput.split('\n')
  const valid = lines.some((l) => l.trim() === `${fileName} validates`)
  const errors = lines
    .filter((l) => l.startsWith(`${fileName}:`) && !l.includes('namespace warning'))
    .map((l) => {
      const m = /^ilr\.xml:(\d+): (.*)$/.exec(l)
      return m ? { line: Number(m[1]), message: m[2].replace(/^(Schemas validity error|parser error) : /, '') } : { line: null, message: l }
    })
  if (!valid && errors.length === 0) errors.push({ line: null, message: 'The schema check did not pass, but xmllint gave no reason.' })
  return { valid, errors }
}
