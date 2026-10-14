// Test: the link check's rules (scripts/check-website-links.js), no network
// and no database: what each answer means, the two-failures rule, the
// HEAD-then-GET and https-then-http steps, redirects, and the slices.
//   node test/links.mjs
import { checkLink, classify, nextState, sliceOf, todaysSlice, MAX_REDIRECTS } from '../scripts/check-website-links.js'

let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const res = (status, location) => ({ status, headers: new Map(location ? [['location', location]] : []), body: null })
const fake = (handler) => async (url, opts) => handler(url, opts.method)

check('200 ok, 404 and 410 broken, 500 unreachable, 403 and 429 blocked', classify(200) === 'ok' && classify(404) === 'broken' && classify(410) === 'broken' &&
  classify(503) === 'unreachable' && classify(403) === 'blocked' && classify(429) === 'blocked' && classify(401) === 'blocked' && classify(400) === 'broken')

const t1 = '2026-10-14T10:00:00.000Z', t2 = '2026-10-21T10:00:00.000Z', t3 = '2026-10-28T10:00:00.000Z'
const s1 = { ...nextState({ CONSECUTIVEFAILURES: 0 }, { url: 'u', result: 'broken', status: 404 }, t1), LASTCHECKEDAT: t1 }
check('one failure: not hidden yet, broken since then', s1.CONSECUTIVEFAILURES === 1 && !s1.ISHIDDEN && s1.BROKENSINCE === t1)
const s2 = { ...nextState(s1, { url: 'u', result: 'unreachable' }, t2), LASTCHECKEDAT: t2 }
check('two in a row: hidden, still broken since the first', s2.CONSECUTIVEFAILURES === 2 && s2.ISHIDDEN && s2.BROKENSINCE === t1)
const sb = nextState(s2, { url: 'u', result: 'blocked', status: 403 }, t3)
check('blocked changes nothing about the failures', sb.CONSECUTIVEFAILURES === 2 && sb.ISHIDDEN && sb.BROKENSINCE === t1)
const same = nextState(s1, { url: 'u', result: 'broken', status: 404 }, '2026-10-14T11:00:00.000Z')
check('a second failure the same day does not count: not hidden', same.CONSECUTIVEFAILURES === 1 && !same.ISHIDDEN)
const s3 = nextState(s2, { url: 'u', result: 'ok', status: 200 }, t3)
check('a good check shows it again and clears the run', s3.CONSECUTIVEFAILURES === 0 && !s3.ISHIDDEN && s3.BROKENSINCE === null && s3.LASTOKAT === t3)
const sh = nextState(s2, { url: 'u', result: 'http-only', status: 200 }, t3)
check('http-only counts as working', !sh.ISHIDDEN && sh.CONSECUTIVEFAILURES === 0)

const calls = []
let r = await checkLink('https://a.example/', { fetchImpl: fake((u, m) => { calls.push(m); return m === 'HEAD' ? res(405) : res(200) }) })
check('HEAD refused: GET, which works', r.result === 'ok' && r.method === 'GET' && calls.join() === 'HEAD,GET')
r = await checkLink('https://a.example/', { fetchImpl: fake(() => res(404)) })
check('404 on HEAD and GET: broken', r.result === 'broken' && r.status === 404)
r = await checkLink('https://a.example/', { fetchImpl: fake((u) => { if (u.startsWith('https:')) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }); return res(200) }) })
check('https fails to connect, http works: http-only', r.result === 'http-only' && /ERR_TLS/.test(r.error))
r = await checkLink('https://a.example/', { fetchImpl: fake(() => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }) }) })
check('no such host on https and http: unreachable', r.result === 'unreachable' && r.error === 'ENOTFOUND')
r = await checkLink('https://a.example/', { fetchImpl: fake((u) => (u === 'https://a.example/' ? res(301, '/home') : res(200))) })
check('a redirect is followed: ok, with where it ended', r.result === 'ok' && r.finalUrl === 'https://a.example/home')
r = await checkLink('https://a.example/', { fetchImpl: fake((u) => res(302, `${u}x`)) })
check(`more than ${MAX_REDIRECTS} redirects: broken`, r.result === 'broken' && /redirects/.test(r.error))
let waits = 0
await checkLink('https://a.example/', { wait: async () => { waits++ }, fetchImpl: fake((u, m) => (m === 'HEAD' ? res(405) : res(200))) })
check('the host\'s pace is kept before every request', waits === 2)

const slices = new Set(Array.from({ length: 200 }, (_, i) => sliceOf(`https://s${i}.example/`)))
check('slices are 0 to 6 and all used', [...slices].every((s) => s >= 0 && s <= 6) && slices.size === 7)
check('a URL keeps its slice', sliceOf('https://x.example/') === sliceOf('https://x.example/'))
check('the day\'s slice moves on each day', todaysSlice(Date.UTC(2026, 9, 14)) !== todaysSlice(Date.UTC(2026, 9, 15)))

console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
