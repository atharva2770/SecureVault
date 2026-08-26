import { describe, expect, it } from 'vitest'

import { ConfigError, loadApiConfig } from './config'

const VALID = {
  API_COOKIE_SECRET: 'unit-test-cookie-secret-ok',
  VAULT_KMS_WRAP_KEY: 'aa'.repeat(32),
  DATABASE_URL: 'sqlserver://localhost:1433;database=SecureVault;user=sa;password=unit-test;trustServerCertificate=true'
}

describe('loadApiConfig', () => {
  it('fails fast when API_COOKIE_SECRET is missing', () => {
    expect(() => loadApiConfig({ ...VALID, API_COOKIE_SECRET: '' })).toThrow(ConfigError)
    expect(() => loadApiConfig({ ...VALID, API_COOKIE_SECRET: '' })).toThrow(/API_COOKIE_SECRET/)
  })

  it('rejects placeholder cookie secrets', () => {
    expect(() =>
      loadApiConfig({ ...VALID, API_COOKIE_SECRET: 'change-me-to-a-long-random-string' })
    ).toThrow(/placeholder/)
  })

  it('rejects a placeholder database password', () => {
    expect(() =>
      loadApiConfig({
        ...VALID,
        DATABASE_URL:
          'sqlserver://localhost:1433;database=SecureVault;user=sa;password=YOUR_PASSWORD;trustServerCertificate=true'
      })
    ).toThrow(/placeholder password/)
  })

  it('rejects an invalid wrap key', () => {
    expect(() => loadApiConfig({ ...VALID, VAULT_KMS_WRAP_KEY: 'deadbeef' })).toThrow(
      /64 hex characters/
    )
  })

  it('requires cookie Secure in production', () => {
    expect(() =>
      loadApiConfig({
        ...VALID,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://vault.example',
        API_COOKIE_SECURE: 'false'
      })
    ).toThrow(/API_COOKIE_SECURE/)
  })

  it('accepts a complete development config', () => {
    const cfg = loadApiConfig(VALID)
    expect(cfg.cookieSecret).toBe(VALID.API_COOKIE_SECRET)
    expect(cfg.maxUploadBytes).toBe(100 * 1024 * 1024)
  })
})
