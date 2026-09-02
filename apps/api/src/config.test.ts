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

  it('parses API_TRUSTED_PROXIES into an array', () => {
    const config = loadApiConfig({
      ...VALID,
      API_TRUST_PROXY: 'true',
      API_TRUSTED_PROXIES: '10.0.0.1, 192.168.1.0/24 ,loopback'
    })
    expect(config.trustedProxies).toEqual(['10.0.0.1', '192.168.1.0/24', 'loopback'])
    expect(config.trustProxy).toEqual(['10.0.0.1', '192.168.1.0/24', 'loopback'])
  })

  it('defaults the trusted proxy list to loopback', () => {
    expect(loadApiConfig(VALID).trustedProxies).toEqual(['127.0.0.1', '::1'])
  })

  it('rejects a malformed trusted proxy entry', () => {
    expect(() => loadApiConfig({ ...VALID, API_TRUSTED_PROXIES: 'not-an-ip' })).toThrow(
      ConfigError
    )
    expect(() => loadApiConfig({ ...VALID, API_TRUSTED_PROXIES: '10.0.0.1/64' })).toThrow(
      /invalid CIDR prefix/
    )
    expect(() => loadApiConfig({ ...VALID, API_TRUSTED_PROXIES: '  ,  ' })).toThrow(
      /at least one address/
    )
  })

  it('validates the proxy list even when API_TRUST_PROXY is off', () => {
    // A bad value must fail at boot, not silently the day someone enables it.
    expect(() =>
      loadApiConfig({ ...VALID, API_TRUST_PROXY: 'false', API_TRUSTED_PROXIES: 'nope' })
    ).toThrow(ConfigError)
  })

  it('never resolves trustProxy to the boolean true', () => {
    const combinations = [
      {},
      { API_TRUST_PROXY: 'true' },
      { API_TRUST_PROXY: 'false' },
      { API_TRUST_PROXY: '1' },
      { API_TRUST_PROXY: 'TRUE' },
      { API_TRUST_PROXY: 'yes' },
      { API_TRUST_PROXY: 'true', API_TRUSTED_PROXIES: '10.1.2.3' },
      { API_TRUST_PROXY: 'true', API_TRUSTED_PROXIES: 'uniquelocal' }
    ]
    for (const extra of combinations) {
      const { trustProxy } = loadApiConfig({ ...VALID, ...extra })
      expect(trustProxy).not.toBe(true)
      expect(Array.isArray(trustProxy) || trustProxy === false).toBe(true)
    }
  })

  it('keeps public registration closed by default', () => {
    expect(loadApiConfig(VALID).allowPublicRegister).toBe(false)
  })

  it('allows public registration outside production when asked', () => {
    expect(
      loadApiConfig({ ...VALID, ALLOW_PUBLIC_REGISTER: 'true' }).allowPublicRegister
    ).toBe(true)
  })

  it('forces public registration off in production even when the env says true', () => {
    const prod = {
      ...VALID,
      NODE_ENV: 'production',
      API_COOKIE_SECURE: 'true',
      WEB_ORIGIN: 'https://vault.example',
      ALLOW_PUBLIC_REGISTER: 'true'
    }
    expect(loadApiConfig(prod).allowPublicRegister).toBe(false)
    // Only the second, deliberately awkward switch opens it.
    expect(
      loadApiConfig({ ...prod, ALLOW_PUBLIC_REGISTER_UNSAFE: 'true' }).allowPublicRegister
    ).toBe(true)
    // The unsafe flag alone is not enough either.
    expect(
      loadApiConfig({
        ...prod,
        ALLOW_PUBLIC_REGISTER: 'false',
        ALLOW_PUBLIC_REGISTER_UNSAFE: 'true'
      }).allowPublicRegister
    ).toBe(false)
  })

  it('accepts a complete development config', () => {
    const cfg = loadApiConfig(VALID)
    expect(cfg.cookieSecret).toBe(VALID.API_COOKIE_SECRET)
    expect(cfg.maxUploadBytes).toBe(100 * 1024 * 1024)
  })
})
