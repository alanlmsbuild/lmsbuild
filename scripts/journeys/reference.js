// The reference data the test journeys are built from, read (never written)
// as the app's own role (and, for funding bands, the loaders' role: only the
// full LARS download in SHARED_DB.RAW has them for every standard): real postcode districts in England, the
// apprenticeship standards used with their LARS funding caps and KSBs, the
// SOC 2020 unit groups for interests, and current adverts to match leads to.

import { execute } from '../../server/db.js'
import { loadStandardVersions } from '../../server/ilr/standards.js'
import { STANDARDS_QUERY, clean } from '../../server/ilr/data.js'

// The interests leads type, the SOC 2020 unit group each is coded to, and
// the standard it leads to. minAge: offered only to people this old at
// enquiry (team leading and managing).
export const SECTORS = [
  { key: 'care', words: ['care', 'caring', 'looking after people'], soc: '6135', std: 119, minAge: 16, component: 'Health and Social Care' },
  { key: 'retail', words: ['shop work', 'retail', 'customer service'], soc: '7111', std: 122, minAge: 16, component: 'Retail' },
  { key: 'office', words: ['office', 'admin', 'business'], soc: '4159', std: 196, minAge: 16, component: 'Administration' },
  { key: 'childcare', words: ['childcare', 'nursery', 'working with kids'], soc: '6111', std: 430, minAge: 16, component: 'Child' },
  { key: 'hair', words: ['hairdressing', 'hair', 'barber'], soc: '6221', std: 157, minAge: 16, component: 'Service Enterprises' },
  { key: 'cooking', words: ['cooking', 'chef', 'kitchen'], soc: '5434', std: 93, minAge: 16, component: 'Hospitality and Catering' },
  { key: 'hospitality', words: ['hotel', 'hospitality', 'restaurant manager'], soc: '1222', std: 223, minAge: 20, component: 'Hospitality and Catering' },
  { key: 'warehouse', words: ['warehouse', 'logistics', 'forklift'], soc: '9252', std: 111, minAge: 16, component: 'Warehousing' },
  { key: 'leading', words: ['team leader', 'supervisor', 'managing people'], soc: '7220', std: 105, minAge: 20, component: 'Management' },
  { key: 'animals', words: ['animals', 'dogs', 'animal care'], soc: '6129', std: 332, minAge: 16, component: 'Animal' },
  { key: 'teaching', words: ['teaching', 'schools', 'teaching assistant'], soc: '6112', std: 297, minAge: 18, component: 'Teaching' },
  { key: 'it', words: ['IT', 'computers', 'tech support'], soc: '3132', std: 413, minAge: 16, component: 'ICT' },
]

export async function loadReference(connection, loader) {
  const q = async (sql, binds) => execute(connection, sql, binds)
  const stdCodes = SECTORS.map((s) => s.std)
  const standards = await q(`
    select s.STANDARD_CODE, s.REFERENCE, s.NAME, s.NOTIONAL_END_LEVEL as LEVEL
    from LARS.STANDARD s where s.STANDARD_CODE in (${stdCodes.join(', ')})`)
  // Each standard's funding band today: its maximum and minimum duration.
  const bands = await execute(loader, `
    select "ApprenticeshipCode" as CODE, try_to_decimal("MaxEmployerLevyCap", 12, 2) as CAP, try_to_decimal("Duration", 6, 2) as MONTHS
    from SHARED_DB.RAW.LARS_APPRENTICESHIPFUNDING
    where "ApprenticeshipType" = 'STD' and "ApprenticeshipCode" in (${stdCodes.map((c) => `'${c}'`).join(', ')})
      and "EffectiveFrom" <= to_varchar(current_date()) and ("EffectiveTo" = '' or "EffectiveTo" >= to_varchar(current_date()))`)
  const band = new Map(bands.map((b) => [Number(b.CODE), { CAP: Number(b.CAP), MONTHS: Number(b.MONTHS) }]))
  const ksbs = await q(`
    select k.ST_REFERENCE, k.VERSION, k.KSB_TYPE, k.KSB_REFERENCE, k.DETAIL, k.SORT_ORDER
    from SHARED_DB.SKILLS.STANDARD_KSB k
    where k.GONEAT is null and k.ST_REFERENCE in (select REFERENCE from LARS.STANDARD where STANDARD_CODE in (${stdCodes.join(', ')}))
    order by k.ST_REFERENCE, k.SORT_ORDER`)
  const socs = await q(`select SOC2020, TITLE from SHARED_DB.REF.SOC2020_UNIT_GROUP where SOC2020 in (${SECTORS.map((s) => `'${s.soc}'`).join(', ')})`)
  // Districts: the outward code, its region and centre, from live English
  // postcodes. A district needs 50 or more live postcodes to be used.
  const districts = await q(`
    select split_part(POSTCODE, ' ', 1) as DISTRICT, any_value(REGION) as REGION, avg(LATITUDE) as LAT, avg(LONGITUDE) as LON, count(*) as N
    from SHARED_DB.REF.POSTCODE
    where COUNTRY = 'E92000001' and TERMINATED is null and GONEAT is null and LATITUDE is not null
    group by 1 having count(*) >= 50`)
  const adverts = await q(`
    select VACANCYREFERENCE, LARSCODE, POSTCODE, TITLE from SHARED_DB.EXT.VACANCY
    where GONEAT is null and CLOSINGDATE >= current_date() and LARSCODE in (${stdCodes.join(', ')})`)
  // Component aims: LARS's non-regulated aims by level and sector, and
  // Functional Skills English and maths.
  const nonRegulated = await q(`
    select LEARN_AIM_REF, TITLE from LARS.LEARNING_AIM
    where TITLE like 'Non regulated provision, Level _, %' and LEARN_AIM_REF like 'Z%'`)
  const aimTitles = await q(`select LEARN_AIM_REF, TITLE from LARS.LEARNING_AIM where LEARN_AIM_REF in ('ZPROG001', '60350544', '6035060X')`)
  const components = new Map()
  for (const sector of SECTORS) {
    const level = Number((standards.find((x) => Number(x.STANDARD_CODE) === sector.std) ?? {}).LEVEL)
    const fit = (lv) => nonRegulated.filter((a) => a.TITLE.startsWith(`Non regulated provision, Level ${lv}, `) && a.TITLE.includes(sector.component))
      .sort((x, y) => (x.LEARN_AIM_REF < y.LEARN_AIM_REF ? -1 : 1))[0]
    const aim = fit(level) ?? fit(2)
    if (aim) components.set(sector.std, aim)
  }
  const standardVersions = await loadStandardVersions(connection)
  const larsStandards = clean(await q(STANDARDS_QUERY))
  return {
    standards: new Map(standards.map((s) => [Number(s.STANDARD_CODE), { ...s, ...band.get(Number(s.STANDARD_CODE)) }])),
    ksbs,
    socs: new Map(socs.map((s) => [s.SOC2020, s.TITLE])),
    districts: districts.map((d) => ({ district: d.DISTRICT, region: d.REGION, lat: Number(d.LAT), lon: Number(d.LON) })),
    adverts,
    components,
    aimTitles: new Map(aimTitles.map((a) => [a.LEARN_AIM_REF, a.TITLE])),
    standardVersions,
    larsStandards: new Map(larsStandards.map((s) => [s.STANDARD_CODE, s])),
    // Postcodes that exist, for the districts chosen (filled by existingPostcodes).
    existing: new Set(),
  }
}

// The live and terminated postcodes in some districts, so made-up inward
// codes can be checked not to be real ones.
export async function existingPostcodes(connection, districts) {
  const set = new Set()
  for (let i = 0; i < districts.length; i += 200) {
    const part = districts.slice(i, i + 200)
    const rows = await execute(connection,
      `select POSTCODE from SHARED_DB.REF.POSTCODE where split_part(POSTCODE, ' ', 1) in (${part.map(() => '?').join(', ')})`, part)
    for (const r of rows) set.add(r.POSTCODE)
  }
  return set
}
