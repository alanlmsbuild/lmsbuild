// origins.js - the places scripts/travel/compute.py routes between
// (decision 19, phase A): every 2021 LSOA in South Yorkshire's four
// authorities (SHARED_DB.SILVER.LSOA), at its ONS population-weighted
// centroid (SHARED_DB.RAW.ONS_LSOA_PWC, the latest file; British National
// Grid metres), and the SOURCE_FILE rows of the inputs the run uses, so each
// computed row can say what it came from. Reads Snowflake as TRANSFORM_USER;
// writes data/travel/origins/ (git-ignored).
//
//   node scripts/travel/origins.js

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'travel', 'origins')
// Barnsley and Sheffield took new codes in April 2023.
export const SOUTH_YORKSHIRE = { E08000038: 'Barnsley', E08000017: 'Doncaster', E08000018: 'Rotherham', E08000039: 'Sheffield' }
const latest = (source) => `(select SOURCEFILEID from SHARED_DB.RAW.SOURCE_FILE where SOURCE = '${source}' qualify row_number() over (order by LOADEDAT desc, SOURCEFILEID) = 1)`

const c = await connect({ as: 'transform', timeoutMs: 30000 })
try {
  const rows = await execute(c, `select l.lsoa21_code, l.local_authority_code, p."x" as x, p."y" as y
    from SHARED_DB.SILVER.LSOA l
    left join SHARED_DB.RAW.ONS_LSOA_PWC p on p."LSOA21CD" = l.lsoa21_code and p.SOURCEFILEID = ${latest('ons-lsoa-pwc')}
    where l.local_authority_code in (${Object.keys(SOUTH_YORKSHIRE).map((k) => `'${k}'`).join(', ')})
    order by 1`)
  const missing = rows.filter((r) => !r.X || !r.Y)
  if (missing.length) throw new Error(`${missing.length} LSOA(s) with no centroid, e.g. ${missing[0].LSOA21_CODE}`)
  // The GTFS zip has a SOURCE_FILE row per file loaded from it: its
  // feed_info.txt row stands for the feed.
  const feed = `(select SOURCEFILEID from SHARED_DB.RAW.SOURCE_FILE where SOURCE = 'bods-gtfs' and MEMBER = 'feed_info.txt'
    qualify row_number() over (order by LOADEDAT desc, SOURCEFILEID) = 1)`
  const [inputs] = await execute(c, `select ${feed} as gtfs, ${latest('geofabrik-osm')} as osm, ${latest('ons-lsoa-pwc')} as centroids,
    (select "feed_version" from SHARED_DB.RAW.BODS_GTFS_FEED_INFO where SOURCEFILEID = ${feed}) as feed_version`)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'south_yorkshire_lsoas.csv'), ['lsoa21_code,local_authority_code,x,y', ...rows.map((r) => `${r.LSOA21_CODE},${r.LOCAL_AUTHORITY_CODE},${r.X},${r.Y}`)].join('\n') + '\n')
  fs.writeFileSync(path.join(OUT, 'inputs.json'), JSON.stringify({ gtfs_source_file_id: inputs.GTFS, osm_source_file_id: inputs.OSM, centroid_source_file_id: inputs.CENTROIDS, gtfs_feed_version: inputs.FEED_VERSION }, null, 1) + '\n')
  const byLa = rows.reduce((m, r) => ({ ...m, [SOUTH_YORKSHIRE[r.LOCAL_AUTHORITY_CODE]]: (m[SOUTH_YORKSHIRE[r.LOCAL_AUTHORITY_CODE]] ?? 0) + 1 }), {})
  console.log(`${rows.length} South Yorkshire LSOAs with centroids (${Object.entries(byLa).map(([k, v]) => `${k} ${v}`).join(', ')}); inputs: ${JSON.stringify(inputs)}`)
} finally {
  await destroy(c)
}
