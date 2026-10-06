// Shared set-up for the browser tests in this folder (step4a.mjs onwards;
// step3.mjs does the same inline). They drive the real pages in headless
// Chromium against the TEST servers, never the dev ones:
//
//   test/start-test-servers.sh        API on 3002, website on 5199
//   node test/browser/step4a.mjs [folder for screenshots]
//   test/stop-test-servers.py         stops only those two
//
// or test/browser/run-all.sh for the lot. Settings, all optional:
//   BASE_URL        the test website (default http://localhost:5199)
//   PLAYWRIGHT_DIR  a node_modules folder with playwright-core in it
//   CHROMIUM_PATH   the headless Chromium to drive
//   CHROMIUM_LIBS   extra system libraries Chromium needs here (WSL without
//                   libnspr4, libnss3, libasound2: see test/README.md)
// Screenshots go to the folder given, or test/.output/screenshots in the
// repo (gitignored).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const BASE = process.env.BASE_URL ?? 'http://localhost:5199'
if (/:(3001|5173)\b/.test(BASE)) throw new Error('Ports 3001 and 5173 are the dev servers. Test on 3002 and 5199.')

export const OUT = process.argv[2] ?? path.join(REPO, 'test/.output/screenshots')
fs.mkdirSync(OUT, { recursive: true })

const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR ?? path.join(os.homedir(), '.npm/_npx/e058441c325e062a/node_modules')
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ??
  path.join(os.homedir(), '.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell')
const CHROMIUM_LIBS = process.env.CHROMIUM_LIBS ?? path.join(os.homedir(), '.cache/rarebit-test/chromium-libs/usr/lib/x86_64-linux-gnu')

const { chromium } = createRequire(PLAYWRIGHT_DIR + path.sep)('playwright-core')

export function launch() {
  const libs = fs.existsSync(CHROMIUM_LIBS) ? CHROMIUM_LIBS : null
  return chromium.launch({
    executablePath: CHROMIUM_PATH,
    env: { ...process.env, ...(libs ? { LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : {}) },
  })
}
