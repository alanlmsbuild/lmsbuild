import { connect, execute, destroy } from './db.js'

async function main() {
  const connection = await connect()
  try {
    const rows = await execute(
      connection,
      'select current_user() as "user", current_role() as "role", current_warehouse() as "warehouse"',
    )
    console.log('Connected successfully:', rows[0])
  } finally {
    await destroy(connection)
  }
}

main().catch((err) => {
  console.error('Connection failed:', err.message)
  process.exit(1)
})
