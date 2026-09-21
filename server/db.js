import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import snowflake from 'snowflake-sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

// Keep the SDK's own noisy internal logging out of our console.
snowflake.configure({ logLevel: 'ERROR' })

function createConnection() {
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

export function connect() {
  return new Promise((resolve, reject) => {
    const connection = createConnection()
    connection.connect((err, conn) => {
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
