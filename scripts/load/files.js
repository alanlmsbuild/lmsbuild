// Reading the downloads for the data loaders (scripts/load-data.js):
// checksums, CSV records, a file inside a zip, .ods sheets, and writing the
// CSV and JSON-lines copies COPY reads. Read-only towards the downloads:
// nothing here writes to a file it reads.

import fs from 'node:fs'
import crypto from 'node:crypto'
import { once } from 'node:events'
import { Transform } from 'node:stream'
import yauzl from 'yauzl'
import { SaxesParser } from 'saxes'

// sha256 and size of a file, streamed (some downloads are hundreds of MB).
export async function sha256File(file) {
  const hash = crypto.createHash('sha256')
  let bytes = 0
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk)
    bytes += chunk.length
  }
  return { sha256: hash.digest('hex'), bytes }
}

export const sha256Text = (text) => crypto.createHash('sha256').update(text).digest('hex')

// yauzl's own size check rejects a whole zip over one odd entry (the LARS
// zip's CSV/ folder entry is stored with sizes 0 and 20480), so it's off;
// zipEntry checks the size of the file it reads instead.
const ZIP_OPTIONS = { lazyEntries: true, validateEntrySizes: false }

// A readable stream of one file inside a zip. The stream fails if the file
// comes out a different size from the one the zip records.
export function zipEntry(zipPath, entryName) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { ...ZIP_OPTIONS, autoClose: false }, (err, zip) => {
      if (err) return reject(err)
      zip.on('entry', (entry) => {
        if (entry.fileName !== entryName) return zip.readEntry()
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e)
          let bytes = 0
          const counted = new Transform({
            transform(chunk, _encoding, done) { bytes += chunk.length; done(null, chunk) },
            flush(done) {
              zip.close()
              done(bytes === entry.uncompressedSize ? null : new Error(`${entryName} in ${zipPath}: read ${bytes} bytes, the zip says ${entry.uncompressedSize}.`))
            },
          })
          stream.on('error', (e2) => counted.destroy(e2))
          resolve(stream.pipe(counted))
        })
      })
      zip.on('end', () => reject(new Error(`${entryName} isn't in ${zipPath}`)))
      zip.readEntry()
    })
  })
}

// The names of the files in a zip.
export function zipNames(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, ZIP_OPTIONS, (err, zip) => {
      if (err) return reject(err)
      const names = []
      zip.on('entry', (entry) => { names.push(entry.fileName); zip.readEntry() })
      zip.on('end', () => resolve(names))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

// CSV records as arrays of fields, header row included, streamed. Handles
// quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF
// and a BOM. encoding 'latin1' maps each byte to one character and back,
// so a Windows-1252 file can be copied byte for byte.
export async function* csvRecords(source, encoding = 'utf8') {
  const stream = typeof source === 'string' ? fs.createReadStream(source) : source
  stream.setEncoding(encoding)
  let field = ''
  let row = []
  let quoted = false
  let afterQuote = false
  let first = true
  for await (const chunk of stream) {
    let text = String(chunk)
    if (first) { text = text.replace(/^﻿/, ''); first = false }
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (quoted) {
        if (c === '"') { quoted = false; afterQuote = true } else field += c
        continue
      }
      if (c === '"') { if (afterQuote) field += '"'; quoted = true; afterQuote = false; continue }
      afterQuote = false
      if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); field = ''; yield row; row = [] }
      else if (c !== '\r') field += c
    }
  }
  if (field || row.length) { row.push(field); yield row }
}

// One CSV line, every field quoted.
export const csvLine = (fields) => fields.map((f) => `"${String(f ?? '').replaceAll('"', '""')}"`).join(',') + '\n'

// Writes lines to a file, waiting when the stream is full. encoding as for
// csvRecords.
export async function writeLines(file, lines, encoding = 'utf8') {
  const out = fs.createWriteStream(file, { encoding })
  for await (const line of lines) {
    if (!out.write(line, encoding)) await once(out, 'drain')
  }
  out.end()
  await once(out, 'finish')
}

// Rows of one sheet in an .ods file: arrays of { text, href } cells, empty
// rows left out, trailing empty cells dropped. (After the school leavers
// app's scripts/lib/readers.mjs, which reads the same files.)
export async function* odsRows(odsPath, sheetName) {
  const stream = await zipEntry(odsPath, 'content.xml')
  stream.setEncoding('utf8')
  const parser = new SaxesParser()
  const queue = []
  let inSheet = false
  let row = null
  let cell = null
  let repeat = 1
  let paragraphs = 0
  parser.on('opentag', (tag) => {
    if (tag.name === 'table:table') inSheet = tag.attributes['table:name'] === sheetName
    if (!inSheet) return
    if (tag.name === 'table:table-row') row = []
    else if ((tag.name === 'table:table-cell' || tag.name === 'table:covered-table-cell') && row) {
      // A link is either <text:a xlink:href> or a HYPERLINK("…") formula.
      const formula = tag.attributes['table:formula']?.match(/HYPERLINK\("([^"]+)"/i)?.[1]
      cell = { text: '', href: formula ?? null }
      repeat = Math.min(Number(tag.attributes['table:number-columns-repeated'] ?? 1), 300)
      paragraphs = 0
    } else if (tag.name === 'text:p' && cell) { if (paragraphs++) cell.text += ' ' }
    else if (tag.name === 'text:a' && cell) cell.href = tag.attributes['xlink:href'] ?? null
    else if (tag.name === 'text:s' && cell) cell.text += ' '.repeat(Number(tag.attributes['text:c'] ?? 1))
  })
  parser.on('text', (t) => { if (cell) cell.text += t })
  parser.on('closetag', (tag) => {
    if (!inSheet) return
    if ((tag.name === 'table:table-cell' || tag.name === 'table:covered-table-cell') && row && cell) {
      for (let i = 0; i < repeat; i++) row.push(cell)
      cell = null
    } else if (tag.name === 'table:table-row' && row) {
      while (row.length && !row.at(-1).text && !row.at(-1).href) row.pop()
      if (row.length) queue.push(row)
      row = null
    } else if (tag.name === 'table:table') inSheet = false
  })
  for await (const chunk of stream) {
    parser.write(chunk)
    while (queue.length) yield queue.shift()
  }
  parser.close()
  while (queue.length) yield queue.shift()
}
