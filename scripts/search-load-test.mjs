#!/usr/bin/env node
/**
 * Search load test — scoped (`GET /api/search/folder`) then global (`GET /api/search`).
 * Reports p50 / p95. Autocannon/k6 equivalent using Node 20 fetch (no extra binary).
 *
 *   npm run test:search-load
 *
 * Env:
 *   SEARCH_LOAD_USER          (required)
 *   SEARCH_LOAD_PASSWORD      (required)
 *   SEARCH_LOAD_FOLDER_ID     (required)  folder with a few hundred–thousand files
 *   API_BASE                  default http://127.0.0.1:4000
 *   SEARCH_LOAD_Q             default "in"
 *   SEARCH_LOAD_CONNECTIONS   default 8
 *   SEARCH_LOAD_DURATION_S    default 15
 *   SEARCH_LOAD_LIMIT         default 25
 *
 * Raise `API_RATE_LIMIT_DEFAULT` on the API process (default 600/min will 429).
 *
 * k6 alternative: k6 run scripts/search-load-test.k6.js
 */

const BASE = (process.env.API_BASE || 'http://127.0.0.1:4000').replace(/\/$/, '')
const USER = process.env.SEARCH_LOAD_USER
const PASSWORD = process.env.SEARCH_LOAD_PASSWORD
const FOLDER_ID = process.env.SEARCH_LOAD_FOLDER_ID
const Q = process.env.SEARCH_LOAD_Q || 'in'
const CONNECTIONS = Math.max(1, Number(process.env.SEARCH_LOAD_CONNECTIONS || 8))
const DURATION_S = Math.max(1, Number(process.env.SEARCH_LOAD_DURATION_S || 15))
const LIMIT = Math.min(100, Math.max(1, Number(process.env.SEARCH_LOAD_LIMIT || 25)))

function fail(message) {
  console.error(message)
  process.exit(1)
}

function cookiesFrom(res) {
  const lines = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  const map = new Map()
  for (const line of lines) {
    const pair = line.split(';')[0] ?? ''
    const eq = pair.indexOf('=')
    if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return map
}

function mergeCookies(into, from) {
  for (const [k, v] of from) into.set(k, v)
  return into
}

function cookieHeader(map) {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const i = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function fmt(ms) {
  if (ms == null || Number.isNaN(ms)) return 'n/a'
  return `${ms.toFixed(1)} ms`
}

async function login() {
  const cookies = new Map()
  const sessionRes = await fetch(`${BASE}/api/auth/session`)
  mergeCookies(cookies, cookiesFrom(sessionRes))
  const csrf = cookies.get('sv_csrf')
  if (!csrf) fail('No CSRF cookie from GET /api/auth/session')

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      cookie: cookieHeader(cookies)
    },
    body: JSON.stringify({ username: USER, password: PASSWORD })
  })
  mergeCookies(cookies, cookiesFrom(loginRes))
  if (!loginRes.ok) {
    const body = await loginRes.text()
    fail(`Login failed (${loginRes.status}): ${body}`)
  }
  if (!cookies.get('sv_session')) fail('Login did not set sv_session')
  return cookieHeader(cookies)
}

async function runEndpoint(name, url, cookie) {
  const samples = []
  const statuses = new Map()
  const stopAt = Date.now() + DURATION_S * 1000
  const headers = { cookie }

  const workers = Array.from({ length: CONNECTIONS }, async () => {
    while (Date.now() < stopAt) {
      const t0 = performance.now()
      try {
        const res = await fetch(url, { headers })
        const ms = performance.now() - t0
        await res.arrayBuffer()
        samples.push(ms)
        statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1)
      } catch {
        statuses.set(0, (statuses.get(0) ?? 0) + 1)
      }
    }
  })
  await Promise.all(workers)
  samples.sort((a, b) => a - b)

  const ok = statuses.get(200) ?? 0
  const errors = samples.length - ok
  const rate = samples.length / DURATION_S
  return { name, url, samples, statuses, ok, errors, rate }
}

function printReport(run) {
  const p50 = percentile(run.samples, 50)
  const p95 = percentile(run.samples, 95)
  const p99 = percentile(run.samples, 99)
  console.log(`\n${run.name}`)
  console.log(`  ${run.url}`)
  console.log(`  requests: ${run.samples.length}  (~${run.rate.toFixed(1)} req/s, ${CONNECTIONS} connections, ${DURATION_S}s)`)
  console.log(`  status:   ${[...run.statuses.entries()].map(([s, n]) => `${s}=${n}`).join(' ')}`)
  console.log(`  p50:      ${fmt(p50)}`)
  console.log(`  p95:      ${fmt(p95)}`)
  console.log(`  p99:      ${fmt(p99)}`)
  if ((run.statuses.get(429) ?? 0) > 0) {
    console.log('  note:     429s detected — raise API_RATE_LIMIT_DEFAULT on the API process')
  }
  return { name: run.name, p50, p95, requests: run.samples.length, errors: run.errors }
}

async function main() {
  if (!USER || !PASSWORD || !FOLDER_ID) {
    fail(
      'Set SEARCH_LOAD_USER, SEARCH_LOAD_PASSWORD, and SEARCH_LOAD_FOLDER_ID.\nSee SEARCH-PERFORMANCE.md.'
    )
  }

  console.log(`Search load test → ${BASE}`)
  console.log(`query=${JSON.stringify(Q)}  folder=${FOLDER_ID}  connections=${CONNECTIONS}  duration=${DURATION_S}s`)

  const cookie = await login()
  const q = encodeURIComponent(Q)
  const scopedUrl = `${BASE}/api/search/folder?folderId=${encodeURIComponent(FOLDER_ID)}&q=${q}&limit=${LIMIT}`
  const globalUrl = `${BASE}/api/search?q=${q}&limit=${LIMIT}`

  const scoped = await runEndpoint('scoped  GET /api/search/folder', scopedUrl, cookie)
  const global = await runEndpoint('global  GET /api/search', globalUrl, cookie)

  console.log('\n--- p50 / p95 ---')
  const rows = [printReport(scoped), printReport(global)]
  console.log('')
  for (const row of rows) {
    console.log(`${row.name}: p50=${fmt(row.p50)}  p95=${fmt(row.p95)}  n=${row.requests}  errors=${row.errors}`)
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
