/**
 * k6 load test for DOCMAN search (scoped + global).
 *
 * Reports p50 / p95 via summaryTrendStats. Sequential scenarios so each
 * endpoint gets a clean histogram.
 *
 *   k6 run scripts/search-load-test.k6.js
 *
 * Env (required): SEARCH_LOAD_USER, SEARCH_LOAD_PASSWORD, SEARCH_LOAD_FOLDER_ID
 * Env (optional): API_BASE, SEARCH_LOAD_Q, SEARCH_LOAD_DURATION, SEARCH_LOAD_VUS
 *
 * Raise the API default rate-limit bucket for the run (600/min will 429):
 *   API_RATE_LIMIT_DEFAULT=100000
 *
 * Prefer `npm run test:search-load` (Node runner) if k6 is not installed.
 */
import http from 'k6/http'
import { check } from 'k6'

const BASE = __ENV.API_BASE || 'http://127.0.0.1:4000'
const Q = encodeURIComponent(__ENV.SEARCH_LOAD_Q || 'in')
const LIMIT = __ENV.SEARCH_LOAD_LIMIT || '25'
const DURATION = __ENV.SEARCH_LOAD_DURATION || '20s'
const VUS = Number(__ENV.SEARCH_LOAD_VUS || '8')

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{endpoint:scoped}': ['p(95)<500'],
    'http_req_duration{endpoint:global}': ['p(95)<800']
  },
  scenarios: {
    scoped: {
      executor: 'constant-vus',
      exec: 'scopedSearch',
      vus: VUS,
      duration: DURATION
    },
    global: {
      executor: 'constant-vus',
      exec: 'globalSearch',
      vus: VUS,
      duration: DURATION,
      startTime: DURATION
    }
  }
}

function pickCookie(res, name) {
  const list = res.cookies[name]
  return list && list.length ? list[0].value : ''
}

export function setup() {
  const user = __ENV.SEARCH_LOAD_USER
  const password = __ENV.SEARCH_LOAD_PASSWORD
  const folderId = __ENV.SEARCH_LOAD_FOLDER_ID
  if (!user || !password || !folderId) {
    throw new Error('SEARCH_LOAD_USER, SEARCH_LOAD_PASSWORD, and SEARCH_LOAD_FOLDER_ID are required.')
  }

  const sessionRes = http.get(`${BASE}/api/auth/session`)
  const csrf = pickCookie(sessionRes, 'sv_csrf')
  const loginRes = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ username: user, password }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf,
        Cookie: `sv_csrf=${csrf}`
      }
    }
  )
  if (loginRes.status !== 200) {
    throw new Error(`login failed: ${loginRes.status} ${loginRes.body}`)
  }

  const session = pickCookie(loginRes, 'sv_session')
  const csrfKeep = pickCookie(loginRes, 'sv_csrf') || csrf
  if (!session) {
    throw new Error('login did not set sv_session')
  }

  return {
    cookie: `sv_session=${session}; sv_csrf=${csrfKeep}`,
    folderId
  }
}

export function scopedSearch(data) {
  const url = `${BASE}/api/search/folder?folderId=${data.folderId}&q=${Q}&limit=${LIMIT}`
  const res = http.get(url, {
    headers: { Cookie: data.cookie },
    tags: { endpoint: 'scoped' }
  })
  check(res, { 'scoped 200': (r) => r.status === 200 })
}

export function globalSearch(data) {
  const url = `${BASE}/api/search?q=${Q}&limit=${LIMIT}`
  const res = http.get(url, {
    headers: { Cookie: data.cookie },
    tags: { endpoint: 'global' }
  })
  check(res, { 'global 200': (r) => r.status === 200 })
}
