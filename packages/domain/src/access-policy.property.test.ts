/**
 * Property-based tests for `resolveFolderRightsPure` — the single source of truth
 * for effective folder rights.
 *
 * Pure: no database, no network, no filesystem. Every property runs 200 cases.
 *
 * These tests document the CURRENT contract of the resolver. Where the observed
 * behaviour is surprising it is pinned by a passing test and flagged with an
 * adjacent `it.todo`; the implementation is deliberately left untouched.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { resolveFolderRightsPure } from './access-policy'
import type { AccessGrant } from './access-policy'
import { EMPTY_RIGHTS, FULL_RIGHTS, intersectRights, unionRights } from './rbac'
import type { FolderRight, FolderRights } from './rbac'

const RIGHT_KEYS: readonly FolderRight[] = ['view', 'edit', 'copy', 'delete']

const USER_ID = 'user-under-test'
const OTHER_USER_ID = 'user-someone-else'
const ROLE_POOL = ['role-alpha', 'role-beta', 'role-gamma', 'role-delta'] as const
const UNHELD_ROLE = 'role-not-held'

const VIEWER_CAP: FolderRights = { view: true, edit: false, copy: false, delete: false }

interface Tree {
  /** Ordered root → leaf; the last id is the target folder. */
  chain: string[]
  /** Every folder in the generated tree, including off-chain siblings. */
  allFolderIds: string[]
}

interface Scenario {
  tree: Tree
  roleIds: string[]
  grants: AccessGrant[]
  roleCapability: FolderRights
}

type ResolverInput = Parameters<typeof resolveFolderRightsPure>[0]

const rightsArb = fc.record<FolderRights>({
  view: fc.boolean(),
  edit: fc.boolean(),
  copy: fc.boolean(),
  delete: fc.boolean()
})

/** Rights that always include `view`, so the resolver view gate never masks them. */
const viewableRightsArb = fc.record<FolderRights>({
  view: fc.constant(true),
  edit: fc.boolean(),
  copy: fc.boolean(),
  delete: fc.boolean()
})

/**
 * Random folder tree: depth 1-6, branching 1-4. Only the node on the chain is
 * expanded at each level, so its siblings become off-chain noise that grants may
 * target (and that the resolver must ignore).
 */
function treeArb(minDepth = 1) {
  return fc
    .record({
      depth: fc.integer({ min: minDepth, max: 6 }),
      branching: fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 6, maxLength: 6 }),
      picks: fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 6, maxLength: 6 })
    })
    .map(({ depth, branching, picks }): Tree => {
      const root = 'folder-L0'
      const chain = [root]
      const allFolderIds = [root]

      for (let level = 1; level < depth; level += 1) {
        const width = branching[level - 1] ?? 1
        const siblings: string[] = []
        for (let i = 0; i < width; i += 1) {
          siblings.push(`folder-L${level}-${i}`)
        }
        allFolderIds.push(...siblings)
        chain.push(siblings[(picks[level - 1] ?? 0) % width])
      }

      return { chain, allFolderIds }
    })
}

function grantArb(folderIds: string[]) {
  const folderArb = fc.constantFrom(...folderIds)
  return fc.oneof(
    fc.record<AccessGrant>({
      principalType: fc.constant('USER' as const),
      principalId: fc.constantFrom(USER_ID, OTHER_USER_ID),
      rights: rightsArb,
      inherit: fc.boolean(),
      folderId: folderArb
    }),
    fc.record<AccessGrant>({
      principalType: fc.constant('ROLE' as const),
      principalId: fc.constantFrom<string>(...ROLE_POOL, UNHELD_ROLE),
      rights: rightsArb,
      inherit: fc.boolean(),
      folderId: folderArb
    })
  )
}

function scenarioArb(minDepth = 1) {
  return treeArb(minDepth).chain((tree) =>
    fc.record<Scenario>({
      tree: fc.constant(tree),
      roleIds: fc.uniqueArray(fc.constantFrom<string>(...ROLE_POOL), { maxLength: 3 }),
      grants: fc.array(grantArb(tree.allFolderIds), { maxLength: 12 }),
      roleCapability: rightsArb
    })
  )
}

function resolve(scenario: Scenario, overrides: Partial<ResolverInput> = {}): FolderRights {
  return resolveFolderRightsPure({
    isAdmin: false,
    roleCapability: scenario.roleCapability,
    userId: USER_ID,
    roleIds: scenario.roleIds,
    chainFolderIds: scenario.tree.chain,
    grants: scenario.grants,
    ...overrides
  })
}

/** Deterministic Fisher-Yates so a shuffle is reproducible from a generated seed. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let state = seed >>> 0 || 1
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const j = state % (i + 1)
    const swap = out[i]
    out[i] = out[j]
    out[j] = swap
  }
  return out
}

const RUNS = { numRuns: 200 } as const

describe('resolveFolderRightsPure', () => {
  it('1. DENY BY DEFAULT — no grants and no admin means no rights at all', () => {
    fc.assert(
      fc.property(scenarioArb(), (scenario) => {
        const rights = resolve(scenario, { grants: [] })
        for (const key of RIGHT_KEYS) {
          expect(rights[key]).toBe(false)
        }
      }),
      RUNS
    )
  })

  it('2. ADMIN BYPASS — an admin gets full rights for any tree, grants or cap', () => {
    fc.assert(
      fc.property(scenarioArb(), fc.boolean(), (scenario, emptyGrants) => {
        const rights = resolve(scenario, {
          isAdmin: true,
          grants: emptyGrants ? [] : scenario.grants
        })
        expect(rights).toEqual(FULL_RIGHTS)
      }),
      RUNS
    )
  })

  it('3. VIEWER CAP — a view-only role can never gain edit, copy or delete', () => {
    fc.assert(
      fc.property(scenarioArb(), (scenario) => {
        const rights = resolve(scenario, { roleCapability: VIEWER_CAP })
        expect(rights.edit).toBe(false)
        expect(rights.copy).toBe(false)
        expect(rights.delete).toBe(false)
      }),
      RUNS
    )
  })

  it('4. CAPABILITY IS A CEILING — a folder ACL can never exceed the role cap', () => {
    fc.assert(
      fc.property(scenarioArb(), (scenario) => {
        const rights = resolve(scenario)
        for (const key of RIGHT_KEYS) {
          if (rights[key]) {
            expect(scenario.roleCapability[key]).toBe(true)
          }
        }
      }),
      RUNS
    )
  })

  it('5. MONOTONICITY — adding a ROLE grant never removes a right', () => {
    fc.assert(
      fc.property(scenarioArb(), rightsArb, fc.boolean(), (scenario, extraRights, inherit) => {
        const before = resolve(scenario)
        const added: AccessGrant = {
          principalType: 'ROLE',
          principalId: scenario.roleIds[0] ?? UNHELD_ROLE,
          rights: extraRights,
          inherit,
          folderId: scenario.tree.chain[0]
        }
        const after = resolve(scenario, { grants: [...scenario.grants, added] })
        for (const key of RIGHT_KEYS) {
          if (before[key]) expect(after[key]).toBe(true)
        }
      }),
      RUNS
    )
  })

  it('5b. MONOTONICITY — adding a USER grant on an ancestor never removes a right', () => {
    fc.assert(
      fc.property(
        scenarioArb(2),
        rightsArb,
        fc.boolean(),
        fc.nat(),
        (scenario, extraRights, inherit, pick) => {
          const ancestors = scenario.tree.chain.slice(0, -1)
          const before = resolve(scenario)
          const added: AccessGrant = {
            principalType: 'USER',
            principalId: USER_ID,
            rights: extraRights,
            inherit,
            folderId: ancestors[pick % ancestors.length]
          }
          const after = resolve(scenario, { grants: [...scenario.grants, added] })
          for (const key of RIGHT_KEYS) {
            if (before[key]) expect(after[key]).toBe(true)
          }
        }
      ),
      RUNS
    )
  })

  it('5c. documents the ONE non-monotonic case: an exact USER grant drops inherited USER rights', () => {
    // Adding a USER ACL on the target folder REPLACES (does not union with) the USER
    // rights inherited from an ancestor — access-policy.ts:80-82. Narrowing an
    // inherited grant is the documented intent, but it means "add a grant" is not a
    // rights-preserving operation for the USER principal.
    const chain = ['root', 'leaf']
    const ancestorGrant: AccessGrant = {
      principalType: 'USER',
      principalId: USER_ID,
      rights: FULL_RIGHTS,
      inherit: true,
      folderId: 'root'
    }
    const before = resolveFolderRightsPure({
      isAdmin: false,
      roleCapability: FULL_RIGHTS,
      userId: USER_ID,
      roleIds: [],
      chainFolderIds: chain,
      grants: [ancestorGrant]
    })
    expect(before).toEqual(FULL_RIGHTS)

    const after = resolveFolderRightsPure({
      isAdmin: false,
      roleCapability: FULL_RIGHTS,
      userId: USER_ID,
      roleIds: [],
      chainFolderIds: chain,
      grants: [
        ancestorGrant,
        {
          principalType: 'USER',
          principalId: USER_ID,
          rights: { view: true, edit: false, copy: false, delete: false },
          inherit: true,
          folderId: 'leaf'
        }
      ]
    })
    expect(after).toEqual({ view: true, edit: false, copy: false, delete: false })
  })

  // CONCERN: unrestricted monotonicity ("adding any grant never removes a right")
  // does NOT hold — see 5c above and access-policy.ts:80-82. Left as a todo rather
  // than a failing test because the override is the documented policy, not a bug.
  // Revisit if the ACL admin UI ever implies that grants only ever add access.
  it.todo('5d. MONOTONICITY holds for every grant, including exact USER grants')

  it('6. INHERIT BOUNDARY — inherit:false on an ancestor does not reach a descendant', () => {
    fc.assert(
      fc.property(treeArb(2), viewableRightsArb, fc.nat(), (tree, rights, pick) => {
        const ancestors = tree.chain.slice(0, -1)
        const folderId = ancestors[pick % ancestors.length]
        const base = {
          isAdmin: false,
          roleCapability: FULL_RIGHTS,
          userId: USER_ID,
          roleIds: [] as string[],
          chainFolderIds: tree.chain
        }
        const grant = { principalType: 'USER' as const, principalId: USER_ID, rights, folderId }

        const blocked = resolveFolderRightsPure({
          ...base,
          grants: [{ ...grant, inherit: false }]
        })
        expect(blocked).toEqual(EMPTY_RIGHTS)

        const inherited = resolveFolderRightsPure({
          ...base,
          grants: [{ ...grant, inherit: true }]
        })
        expect(inherited).toEqual(rights)
      }),
      RUNS
    )
  })

  it('6b. INHERIT BOUNDARY — inherit is ignored for a grant on the target folder itself', () => {
    fc.assert(
      fc.property(treeArb(), viewableRightsArb, (tree, rights) => {
        const target = tree.chain[tree.chain.length - 1]
        const resolved = resolveFolderRightsPure({
          isAdmin: false,
          roleCapability: FULL_RIGHTS,
          userId: USER_ID,
          roleIds: [],
          chainFolderIds: tree.chain,
          grants: [
            {
              principalType: 'USER',
              principalId: USER_ID,
              rights,
              inherit: false,
              folderId: target
            }
          ]
        })
        expect(resolved).toEqual(rights)
      }),
      RUNS
    )
  })

  describe('7. NEAREST-WINS / UNION (the contract as implemented)', () => {
    const deepTree = treeArb(2)

    it('an exact USER grant on the target REPLACES inherited USER rights', () => {
      fc.assert(
        fc.property(
          deepTree,
          viewableRightsArb,
          viewableRightsArb,
          (tree, ancestorRights, targetRights) => {
            const target = tree.chain[tree.chain.length - 1]
            const resolved = resolveFolderRightsPure({
              isAdmin: false,
              roleCapability: FULL_RIGHTS,
              userId: USER_ID,
              roleIds: [],
              chainFolderIds: tree.chain,
              grants: [
                {
                  principalType: 'USER',
                  principalId: USER_ID,
                  rights: ancestorRights,
                  inherit: true,
                  folderId: tree.chain[0]
                },
                {
                  principalType: 'USER',
                  principalId: USER_ID,
                  rights: targetRights,
                  inherit: true,
                  folderId: target
                }
              ]
            })
            expect(resolved).toEqual(targetRights)
          }
        ),
        RUNS
      )
    })

    it('inherited ROLE rights UNION with an exact USER grant (they are not replaced)', () => {
      fc.assert(
        fc.property(
          deepTree,
          viewableRightsArb,
          viewableRightsArb,
          (tree, roleRights, targetRights) => {
            const target = tree.chain[tree.chain.length - 1]
            const resolved = resolveFolderRightsPure({
              isAdmin: false,
              roleCapability: FULL_RIGHTS,
              userId: USER_ID,
              roleIds: [ROLE_POOL[0]],
              chainFolderIds: tree.chain,
              grants: [
                {
                  principalType: 'ROLE',
                  principalId: ROLE_POOL[0],
                  rights: roleRights,
                  inherit: true,
                  folderId: tree.chain[0]
                },
                {
                  principalType: 'USER',
                  principalId: USER_ID,
                  rights: targetRights,
                  inherit: true,
                  folderId: target
                }
              ]
            })
            expect(resolved).toEqual(unionRights(roleRights, targetRights))
          }
        ),
        RUNS
      )
    })

    it('without an exact USER grant, every inherited grant UNIONS', () => {
      fc.assert(
        fc.property(deepTree, viewableRightsArb, viewableRightsArb, (tree, a, b) => {
          const resolved = resolveFolderRightsPure({
            isAdmin: false,
            roleCapability: FULL_RIGHTS,
            userId: USER_ID,
            roleIds: [ROLE_POOL[0]],
            chainFolderIds: tree.chain,
            grants: [
              {
                principalType: 'USER',
                principalId: USER_ID,
                rights: a,
                inherit: true,
                folderId: tree.chain[0]
              },
              {
                principalType: 'ROLE',
                principalId: ROLE_POOL[0],
                rights: b,
                inherit: true,
                folderId: tree.chain[0]
              }
            ]
          })
          expect(resolved).toEqual(unionRights(a, b))
        }),
        RUNS
      )
    })

    it('grants for other principals and off-chain folders are ignored', () => {
      fc.assert(
        fc.property(scenarioArb(), (scenario) => {
          const onChainForMe = scenario.grants.filter(
            (g) =>
              scenario.tree.chain.includes(g.folderId) &&
              ((g.principalType === 'USER' && g.principalId === USER_ID) ||
                (g.principalType === 'ROLE' && scenario.roleIds.includes(g.principalId)))
          )
          expect(resolve(scenario)).toEqual(resolve(scenario, { grants: onChainForMe }))
        }),
        RUNS
      )
    })

    it('VIEW GATES EVERYTHING — without view, no other right survives', () => {
      fc.assert(
        fc.property(scenarioArb(), (scenario) => {
          const rights = resolve(scenario)
          if (!rights.view) {
            expect(rights).toEqual(EMPTY_RIGHTS)
          }
        }),
        RUNS
      )
    })

    it('resolved rights never exceed the union of the grants that name the caller', () => {
      fc.assert(
        fc.property(scenarioArb(), (scenario) => {
          const mine = scenario.grants
            .filter(
              (g) =>
                (g.principalType === 'USER' && g.principalId === USER_ID) ||
                (g.principalType === 'ROLE' && scenario.roleIds.includes(g.principalId))
            )
            .reduce((acc, g) => unionRights(acc, g.rights), EMPTY_RIGHTS)
          const ceiling = intersectRights(mine, scenario.roleCapability)
          const rights = resolve(scenario)
          for (const key of RIGHT_KEYS) {
            if (rights[key]) expect(ceiling[key]).toBe(true)
          }
        }),
        RUNS
      )
    })
  })

  it('8. DETERMINISM — the same input always resolves to the same rights', () => {
    fc.assert(
      fc.property(scenarioArb(), (scenario) => {
        expect(resolve(scenario)).toEqual(resolve(scenario))
      }),
      RUNS
    )
  })

  it('8b. DETERMINISM — grant order does not change the result', () => {
    fc.assert(
      fc.property(scenarioArb(), fc.integer({ min: 1, max: 2147483647 }), (scenario, seed) => {
        const shuffled = shuffle(scenario.grants, seed)
        expect(resolve(scenario, { grants: shuffled })).toEqual(resolve(scenario))
      }),
      RUNS
    )
  })

  it('documents that deny paths return the shared EMPTY_RIGHTS object by reference', () => {
    // access-policy.ts:47 and :85 return the exported EMPTY_RIGHTS singleton rather
    // than a copy. Any caller that mutated a "denied" result would corrupt the
    // deny-by-default constant process-wide. Pinned here so the aliasing cannot
    // change silently.
    const denied = resolveFolderRightsPure({
      isAdmin: false,
      roleCapability: FULL_RIGHTS,
      userId: USER_ID,
      roleIds: [],
      chainFolderIds: ['only-folder'],
      grants: []
    })
    expect(denied).toBe(EMPTY_RIGHTS)
  })

  // CONCERN: the resolver hands out the shared EMPTY_RIGHTS singleton (see the test
  // above). A defensive copy, or Object.freeze on EMPTY_RIGHTS / FULL_RIGHTS in
  // rbac.ts:39-52, would remove a whole class of accidental-privilege bugs.
  it.todo('deny paths return a fresh rights object that callers cannot alias')
})
