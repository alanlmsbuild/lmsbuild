// Runs dbt (the silver layer, dbt/) from the repo's own Python venv, with
// server/.env loaded so dbt/profiles.yml finds TRANSFORM_USER's key.
//   npm run dbt -- debug | parse | build | test ...
// The venv: see dbt/requirements.txt.
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, 'server', '.env'), quiet: true })

export function runDbt(args, { stdio = 'inherit' } = {}) {
  const dbt = path.join(root, '.venv-dbt', 'bin', 'dbt')
  if (!fs.existsSync(dbt)) throw new Error(`No dbt at ${dbt}: make the venv first (dbt/requirements.txt).`)
  const dir = path.join(root, 'dbt')
  return spawnSync(dbt, args, {
    stdio,
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, DBT_PROJECT_DIR: dir, DBT_PROFILES_DIR: dir, DBT_SEND_ANONYMOUS_USAGE_STATS: 'false', DBT_VERSION_CHECK: 'false' },
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = runDbt(process.argv.slice(2))
  process.exit(r.status ?? 1)
}
