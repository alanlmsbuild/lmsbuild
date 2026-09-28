// ILR return: GET /api/ilr/return runs the checks and says what the file
// would contain; GET /api/ilr/return/file makes the file, checks it against
// the official schema again, and only then sends it. Managers only.
//
// Warren never sends the file anywhere: it's a download for the manager to
// check in DfE's FIS tool and submit themselves.

import { allow, MANAGER } from '../access.js'
import { ILR_YEARS, loadIlrData } from './data.js'
import { buildIlrXml, ilrFileName, ukNow } from './xml.js'
import { checkIlrRules, NOT_CHECKED, RULES } from './rules.js'
import { schemaFileName, validateIlrXml } from './validate.js'

function parseRequest(req, res) {
  const year = req.query.year === undefined ? 2026 : Number(req.query.year)
  if (!ILR_YEARS[year]) {
    res.status(400).json({ error: `Warren can make ILR files for ${Object.values(ILR_YEARS).map((y) => y.label).join(', ')}.` })
    return null
  }
  const serial = req.query.serial === undefined ? 1 : Number(req.query.serial)
  if (!Number.isInteger(serial) || serial < 1 || serial > 99) {
    res.status(400).json({ error: 'The serial number must be a whole number from 1 to 99.' })
    return null
  }
  return { year, serial }
}

async function makeReturn(connection, year, serial) {
  const data = await loadIlrData(connection, year)
  if (data.problem) return { data }
  const now = ukNow()
  const xml = buildIlrXml(data, year, now, serial)
  const fileName = ilrFileName(data.organisation.UKPRN, year, now, serial)
  const schema = await validateIlrXml(xml, year)
  return { data, now, xml, fileName, schema }
}

export function registerIlrRoutes(app) {
  app.get('/api/ilr/return', allow(MANAGER), async (req, res) => {
    const params = parseRequest(req, res)
    if (!params) return
    try {
      const { data, now, xml, fileName, schema } = await makeReturn(req.db, params.year, params.serial)
      const organisation = data.organisation && {
        name: data.organisation.NAME, ukprn: data.organisation.UKPRN, isTest: data.organisation.ISTESTDATA,
      }
      if (data.problem) {
        res.json({ year: params.year, yearLabel: ILR_YEARS[params.year].label, organisation, problem: data.problem })
        return
      }
      res.json({
        year: params.year,
        yearLabel: ILR_YEARS[params.year].label,
        organisation,
        fileName,
        fileSize: Buffer.byteLength(xml, 'utf8'),
        learners: data.learners.length,
        aims: data.learners.reduce((n, l) => n + l.aims.length, 0),
        excluded: data.excluded,
        schema: { file: schemaFileName(params.year), valid: schema.valid, errors: schema.errors.slice(0, 50), errorCount: schema.errors.length },
        rules: checkIlrRules(data, params.year, now.date),
        rulesChecked: Object.keys(RULES).filter((rule) => !rule.startsWith('Warren')).length,
        notChecked: NOT_CHECKED,
      })
    } catch (err) {
      console.error('Failed to check the ILR return:', err.message)
      res.status(500).json({ error: 'Could not check the ILR return. Please try again.' })
    }
  })

  app.get('/api/ilr/return/file', allow(MANAGER), async (req, res) => {
    const params = parseRequest(req, res)
    if (!params) return
    try {
      const { data, xml, fileName, schema } = await makeReturn(req.db, params.year, params.serial)
      if (data.problem) {
        res.status(409).json({ error: data.problem })
        return
      }
      // The download is blocked unless the file passes the official schema.
      if (!schema.valid) {
        res.status(409).json({ error: 'This file doesn\'t pass the official ILR schema, so it can\'t be downloaded. Check the ILR return page for the errors.' })
        return
      }
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      res.send(xml)
    } catch (err) {
      console.error('Failed to make the ILR file:', err.message)
      res.status(500).json({ error: 'Could not make the ILR file. Please try again.' })
    }
  })
}
