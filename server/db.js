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

// as: 'loader' opens the session as the data loaders' user instead of the app's.
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
