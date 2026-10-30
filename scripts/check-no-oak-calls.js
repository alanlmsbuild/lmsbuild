// check:oak - the options app (and every Rarebit app) must never call Oak
// National Academy: Oak's terms, and decision 56. They read Rarebit's own gold
// tables; only the fetch on the laptop (scripts/load/oak*.js) talks to Oak, with
// the key from server/.env. This fails if the code or the built site of the apps
// mentions Oak's API address, its key or its image server:
//
//   open-api.thenational.academy   the API
//   OAK_API_KEY                    the key
//   cloudinary-res.thenational.academy   where Oak's quiz and lesson images are
//
// An ordinary link to a lesson (https://www.thenational.academy/teachers/lessons/...)
// is a link the student follows, not a call, and is allowed.
//
//   npm run check:oak
//
// Looks in: this repo's src/ and server/ (the apps), and the school leavers app's
// src/, public/ (not its reach-data), dist/ and scripts/ (SCHOOL_LEAVERS_REPO,
// default ~/school-leavers-app). Not server/.env (the key lives there).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const FORBIDDEN = [/open-api\.thenational\.academy/i, /OAK_API_KEY/, /cloudinary-res\.thenational\.academy/i]
const TEXT = /\.(js|mjs|cjs|jsx|ts|tsx|astro|html|css|json|md|svelte|vue|txt|map)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'reach-data', '.astro', '.output'])

// The files under `root` (a file or folder) that match, as [{ file, pattern }].
export function findOakCalls(root, { forbidden = FORBIDDEN } = {}) {
  const found = []
  const walk = (p) => {
    if (!fs.existsSync(p)) return
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(path.basename(p))) return
      for (const n of fs.readdirSync(p)) walk(path.join(p, n))
    } else if (TEXT.test(p) && !path.basename(p).startsWith('.env') && stat.size < 20_000_000) {
      const text = fs.readFileSync(p, 'utf8')
      for (const re of forbidden) if (re.test(text)) found.push({ file: p, pattern: String(re) })
    }
  }
  walk(root)
  return found
}

export function appRoots(repo, site) {
  return [path.join(repo, 'src'), path.join(repo, 'server'), ...['src', 'public', 'dist', 'scripts'].map((d) => path.join(site, d))]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const site = process.env.SCHOOL_LEAVERS_REPO || path.join(process.env.HOME, 'school-leavers-app')
  const roots = appRoots(repo, site)
  const missing = roots.filter((r) => !fs.existsSync(r))
  const found = roots.flatMap((r) => findOakCalls(r))
  for (const f of found) console.log(`FAIL ${f.file} mentions ${f.pattern}`)
  console.log(found.length
    ? `\n${found.length} mention(s) of Oak's API, key or image server in the apps.`
    : `No mention of Oak's API, key or image server in the apps (${roots.length - missing.length} folders looked at${missing.length ? `; not there: ${missing.map((m) => path.basename(path.dirname(m)) + '/' + path.basename(m)).join(', ')}` : ''}).`)
  process.exit(found.length ? 1 : 0)
}
