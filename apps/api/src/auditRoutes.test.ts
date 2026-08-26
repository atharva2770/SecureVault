import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('audit log HTTP surface', () => {
  const adminRoutes = readFileSync(join(import.meta.dirname, 'routes/admin.ts'), 'utf8')

  it('exposes a list endpoint and no update/delete of audit rows', () => {
    expect(adminRoutes).toMatch(/r\.get\(\s*'\/api\/admin\/audit-logs'/)
    expect(adminRoutes).not.toMatch(/r\.(patch|put|delete)\(\s*['`]\/api\/admin\/audit/)
    expect(adminRoutes).not.toContain('/api/admin/audit-logs/:')
  })
})
