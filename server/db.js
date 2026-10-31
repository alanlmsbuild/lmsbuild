import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import snowflake from 'snowflake-sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

// Keep the SDK's own noisy internal logging out of our console.
snowflake.configure({ logLevel: 'ERROR' })

function createConnection(as) {
  if (as === 'loader') {
    // The data loaders' own user and key (sql/load_00_setup.sql), never the
    // app's: only DATA_LOAD_ROLE can write to OPTIONS_DB.
    if (!process.env.DATA_LOAD_PRIVATE_KEY_PATH) throw new Error('DATA_LOAD_PRIVATE_KEY_PATH is not set in server/.env.')
    return snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.DATA_LOAD_USERNAME || 'DATA_LOAD_USER',
      role: 'DATA_LOAD_ROLE',
      warehouse: 'LOAD_WH',
      authenticator: 'SNOWFLAKE_JWT',
      privateKeyPath: process.env.DATA_LOAD_PRIVATE_KEY_PATH,
    })
  }
  if (as === 'crm') {
    // The CRM's own user and key (sql/crm_01_database.sql): only CRM_DB and
    // shared data, never CAPTURE_DB.
    if (!process.env.CRM_PRIVATE_KEY_PATH) throw new Error('CRM_PRIVATE_KEY_PATH is not set in server/.env.')
    return snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.CRM_USERNAME || 'CRM_APP_USER',
      role: 'CRM_APP_ROLE',
      warehouse: 'CRM_WH',
      authenticator: 'SNOWFLAKE_JWT',
      privateKeyPath: process.env.CRM_PRIVATE_KEY_PATH,
    })
  }
  if (as === 'transform') {
    // dbt's own user and key (sql/silver_01_setup.sql): reads RAW, makes
    // SILVER, never CAPTURE_DB or CRM_DB.
    if (!process.env.TRANSFORM_PRIVATE_KEY_PATH) throw new Error('TRANSFORM_PRIVATE_KEY_PATH is not set in server/.env.')
    return snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.TRANSFORM_USERNAME || 'TRANSFORM_USER',
      role: 'TRANSFORM_ROLE',
      warehouse: 'TRANSFORM_WH',
      authenticator: 'SNOWFLAKE_JWT',
      privateKeyPath: process.env.TRANSFORM_PRIVATE_KEY_PATH,
    })
  }
  if (as === 'site-export') {
    // The school leavers site's build-time export (sql/site_export_01.sql):
    // reads GOLD through the two GOLD_SITE database roles and nothing else.
    if (!process.env.SITE_EXPORT_PRIVATE_KEY_PATH) throw new Error('SITE_EXPORT_PRIVATE_KEY_PATH is not set in server/.env.')
    return snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.SITE_EXPORT_USERNAME || 'SITE_EXPORT_USER',
      role: 'SITE_EXPORT_ROLE',
      warehouse: 'SITE_EXPORT_WH',
      authenticator: 'SNOWFLAKE_JWT',
      privateKeyPath: process.env.SITE_EXPORT_PRIVATE_KEY_PATH,
    })
  }
  if (as) throw new Error(`Unknown connection: ${as}`)
  return snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    authenticator: 'SNOWFLAKE_JWT',
    privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
    privateKeyPass: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || undefined,
  })
}

// Opening a session must finish within this time (DB_CONNECT_TIMEOUT_MS in
// server/.env, default 10 seconds). The driver itself keeps retrying a login
// for at least 5 minutes, so without a limit a stalled network leaves a
// request hanging with nothing on the page. A session that opens after the
// limit is closed straight away.
export const CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000

export class ConnectTimeoutError extends Error {}

// as: 'loader' opens the session as the data loaders' user, 'crm' as the
// CRM's, 'transform' as dbt's, 'site-export' as the site's build-time export, instead of Warren and Burrow's.
export function connect({ timeoutMs = CONNECT_TIMEOUT_MS, as } = {}) {
  return new Promise((resolve, reject) => {
    const connection = createConnection(as)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      reject(new ConnectTimeoutError(`Opening a Snowflake session took over ${timeoutMs} ms.`))
    }, timeoutMs)
    connection.connect((err, conn) => {
      clearTimeout(timer)
      if (timedOut) {
        if (!err) conn.destroy(() => {})
        return
      }
      if (err) reject(err)
      else resolve(conn)
    })
  })
}

export function execute(connection, sqlText, binds = []) {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) reject(err)
        else resolve(rows)
      },
    })
  })
}

export function destroy(connection) {
  return new Promise((resolve, reject) => {
    connection.destroy((err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}
