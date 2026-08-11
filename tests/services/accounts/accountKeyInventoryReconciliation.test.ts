import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { reconcileAccountKeyInventory } from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyProvisioningSession,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
} from "~/services/apiAdapters/contracts/accountKeyResource"

const uncertainFailure = {
  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  message: "Request timed out",
} as const

const createRef = (resourceId: string): AccountKeyResourceRef => ({
  accountId: "account-example",
  siteType: SITE_TYPES.NEW_API,
  scopeKey: "account-keys",
  resourceId,
})

const createSession = (
  provisioning: AccountKeyProvisioningSession,
): AccountKeyResourceSession => ({
  resolveDefaultScope: vi.fn(),
  listScopes: vi.fn(),
  openCollection: vi.fn(),
  openCreateEditor: vi.fn(),
  provisioning,
})

const automaticRequirement = (requirementKey: string, displayName: string) => ({
  requirementKey,
  displayName,
  provisioning: {
    kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
  } as const,
})

describe("reconcileAccountKeyInventory", () => {
  it("lets one native resource cover multiple opaque requirements", async () => {
    const requirements = [
      {
        requirementKey: "opaque:group-a",
        displayName: "Alpha",
        provisioning: {
          kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
        },
      },
      {
        requirementKey: "opaque:group-b",
        displayName: "Beta",
        provisioning: {
          kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
        },
      },
    ]
    const provision = vi.fn()
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements,
        items: [
          {
            ref: createRef("multi-group-key"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: requirements.map(
                ({ requirementKey }) => requirementKey,
              ),
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: requirements.map((requirement) => ({
        requirement,
        outcome: "covered",
      })),
    })
    expect(provision).not.toHaveBeenCalled()
  })

  it("blocks input-required requirements without dispatching a mutation", async () => {
    const requirement = {
      requirementKey: "voapi-v2:group:7",
      displayName: "Example group",
      provisioning: {
        kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
        reasonCode: "finite-quota-required",
      },
    } as const
    const provision = vi.fn()

    await expect(
      reconcileAccountKeyInventory(
        createSession({
          inspect: vi.fn(async () => ({
            requirements: [requirement],
            items: [],
          })),
          provision,
        }),
      ),
    ).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: [{ requirement, outcome: "blocked-input-required" }],
    })
    expect(provision).not.toHaveBeenCalled()
  })

  it("keeps covered requirements and provisions only missing requirements", async () => {
    const coveredRef = createRef("covered-key")
    const createdRef = createRef("created-key")
    const requirements = [
      automaticRequirement("opaque:requirement-a", "Alpha"),
      automaticRequirement("opaque:requirement-b", "Beta"),
    ]
    const provision = vi.fn(async () => ({
      certainty: "applied" as const,
      value: { ref: createdRef },
    }))
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements,
        items: [
          {
            ref: coveredRef,
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirements[0]!.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        { requirement: requirements[0], outcome: "covered" },
        {
          requirement: requirements[1],
          outcome: "created",
          created: { ref: createdRef },
        },
      ],
    })
    expect(provision).toHaveBeenCalledOnce()
    expect(provision).toHaveBeenCalledWith("opaque:requirement-b", undefined)
  })

  it("does not provision missing requirements from a partial inventory", async () => {
    const requirements = [
      automaticRequirement("opaque:covered", "Covered"),
      automaticRequirement("opaque:missing", "Missing"),
    ]
    const partialFailure = { code: "unavailable" as const }
    const provision = vi.fn()
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements,
        items: [
          {
            ref: createRef("covered-key"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirements[0]!.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
        partialFailure,
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toEqual({
      inventoryStatus: "incomplete",
      inventoryIssues: [{ code: "partial-failure", count: 1 }],
      invalidResources: [],
      renameResults: [],
      partialFailure,
      requirementResults: [
        { requirement: requirements[0], outcome: "covered" },
        {
          requirement: requirements[1],
          outcome: "blocked-incomplete-inventory",
        },
      ],
    })
    expect(provision).not.toHaveBeenCalled()
  })

  it("fails closed for unknown coverage without mutating a sibling requirement", async () => {
    const requirements = [
      automaticRequirement("opaque:unknown", "Unknown"),
      automaticRequirement("opaque:missing", "Missing"),
    ]
    const provision = vi.fn()
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements,
        items: [
          {
            ref: createRef("unknown-key"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirements[0]!.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown,
          },
        ],
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toEqual({
      inventoryStatus: "incomplete",
      inventoryIssues: [{ code: "unknown-coverage", count: 1 }],
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        {
          requirement: requirements[0],
          outcome: "blocked-incomplete-inventory",
        },
        {
          requirement: requirements[1],
          outcome: "blocked-incomplete-inventory",
        },
      ],
    })
    expect(provision).not.toHaveBeenCalled()
  })

  it("does not trust malformed placement as requirement coverage", async () => {
    const requirement = automaticRequirement("opaque:duplicate", "Duplicate")
    const provision = vi.fn()
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements: [requirement],
        items: [
          {
            ref: createRef("malformed-placement"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [
                requirement.requirementKey,
                requirement.requirementKey,
              ],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toEqual({
      inventoryStatus: "incomplete",
      inventoryIssues: [{ code: "invalid-requirement-placement", count: 1 }],
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        {
          requirement,
          outcome: "blocked-incomplete-inventory",
        },
      ],
    })
    expect(provision).not.toHaveBeenCalled()
  })

  it("preserves a controlled reason for an unresolved inherited group", async () => {
    const requirement = automaticRequirement("opaque:default", "Default")
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements: [requirement],
        items: [
          {
            ref: createRef("inherited-group-key"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown,
              reasonCode:
                ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS.InheritedAccountGroupUnavailable,
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })),
      provision: vi.fn(),
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toMatchObject({
      inventoryStatus: "incomplete",
      inventoryIssues: [
        { code: "inherited-account-group-unavailable", count: 1 },
      ],
    })
  })

  it("does not treat an unusable resource as requirement coverage", async () => {
    const requirement = automaticRequirement("opaque:unusable", "Unusable")
    const createdRef = createRef("replacement-key")
    const provision = vi.fn(async () => ({
      certainty: "applied" as const,
      value: { ref: createdRef },
    }))
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements: [requirement],
        items: [
          {
            ref: createRef("disabled-key"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirement.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable,
          },
        ],
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        {
          requirement,
          outcome: "created",
          created: { ref: createdRef },
        },
      ],
    })
    expect(provision).toHaveBeenCalledOnce()
  })

  it("refreshes once after a possibly-applied mutation without reporting created provenance", async () => {
    const requirement = automaticRequirement("opaque:uncertain", "Uncertain")
    const ref = createRef("visible-after-uncertain")
    const inspect = vi
      .fn<AccountKeyProvisioningSession["inspect"]>()
      .mockResolvedValueOnce({ requirements: [requirement], items: [] })
      .mockResolvedValueOnce({
        requirements: [requirement],
        items: [
          {
            ref,
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirement.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })
    const provision = vi.fn(async () => ({
      certainty: "possibly-applied" as const,
      failure: uncertainFailure,
    }))

    await expect(
      reconcileAccountKeyInventory(createSession({ inspect, provision })),
    ).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        {
          requirement,
          outcome: "covered-after-uncertain",
          failure: uncertainFailure,
        },
      ],
    })
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(provision).toHaveBeenCalledOnce()
  })

  it("uses a complete uncertainty refresh for remaining requirements", async () => {
    const requirements = [
      automaticRequirement("opaque:first", "First"),
      automaticRequirement("opaque:second", "Second"),
    ]
    const ref = createRef("multi-requirement-key")
    const inspect = vi
      .fn<AccountKeyProvisioningSession["inspect"]>()
      .mockResolvedValueOnce({
        requirements,
        items: [
          {
            ref: createRef("orphaned-before-uncertain"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
              placementKey: "retired",
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })
      .mockResolvedValueOnce({
        requirements,
        items: [
          {
            ref,
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: requirements.map(
                ({ requirementKey }) => requirementKey,
              ),
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })
    const provision = vi.fn(async () => ({
      certainty: "possibly-applied" as const,
      failure: uncertainFailure,
    }))

    await expect(
      reconcileAccountKeyInventory(createSession({ inspect, provision })),
    ).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        {
          requirement: requirements[0],
          outcome: "covered-after-uncertain",
          failure: uncertainFailure,
        },
        { requirement: requirements[1], outcome: "covered" },
      ],
    })
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(provision).toHaveBeenCalledOnce()
  })

  it("stops later mutations when an uncertainty refresh is incomplete", async () => {
    const requirements = [
      automaticRequirement("opaque:first", "First"),
      automaticRequirement("opaque:second", "Second"),
    ]
    const partialFailure = { code: "unavailable" as const }
    const inspect = vi
      .fn<AccountKeyProvisioningSession["inspect"]>()
      .mockResolvedValueOnce({
        requirements,
        items: [
          {
            ref: createRef("orphaned-before-incomplete-refresh"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
              placementKey: "retired",
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })
      .mockResolvedValueOnce({
        requirements,
        items: [
          {
            ref: createRef("untrusted-after-uncertain"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirements[0]!.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
        partialFailure,
      })
    const provision = vi.fn(async () => ({
      certainty: "possibly-applied" as const,
      failure: uncertainFailure,
    }))

    await expect(
      reconcileAccountKeyInventory(createSession({ inspect, provision })),
    ).resolves.toEqual({
      inventoryStatus: "incomplete",
      inventoryIssues: [{ code: "partial-failure", count: 1 }],
      invalidResources: [],
      renameResults: [],
      partialFailure,
      requirementResults: [
        {
          requirement: requirements[0],
          outcome: "uncertain",
          failure: uncertainFailure,
        },
        {
          requirement: requirements[1],
          outcome: "blocked-incomplete-inventory",
        },
      ],
    })
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(provision).toHaveBeenCalledOnce()
  })

  it("continues serially after a definite rejection and reports every requirement", async () => {
    const requirements = [
      automaticRequirement("opaque:reject", "Rejected"),
      automaticRequirement("opaque:create-b", "Created B"),
      automaticRequirement("opaque:create-c", "Created C"),
    ]
    const failure = { code: "upstream_rejected" as const }
    let resolveFirst!: (value: {
      certainty: "not-applied"
      failure: typeof failure
    }) => void
    const firstResult = new Promise<{
      certainty: "not-applied"
      failure: typeof failure
    }>((resolve) => {
      resolveFirst = resolve
    })
    let active = 0
    let maximumActive = 0
    const callOrder: string[] = []
    const provision = vi.fn<AccountKeyProvisioningSession["provision"]>(
      async (requirementKey) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        callOrder.push(requirementKey)
        try {
          if (requirementKey === requirements[0]!.requirementKey) {
            return await firstResult
          }
          return {
            certainty: "applied",
            value: { ref: createRef(`created-${requirementKey}`) },
          }
        } finally {
          active -= 1
        }
      },
    )
    const run = reconcileAccountKeyInventory(
      createSession({
        inspect: vi.fn(async () => ({ requirements, items: [] })),
        provision,
      }),
    )

    await vi.waitFor(() => expect(provision).toHaveBeenCalledOnce())
    expect(callOrder).toEqual(["opaque:reject"])
    resolveFirst({ certainty: "not-applied", failure })

    await expect(run).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [],
      requirementResults: [
        { requirement: requirements[0], outcome: "rejected", failure },
        {
          requirement: requirements[1],
          outcome: "created",
          created: { ref: createRef("created-opaque:create-b") },
        },
        {
          requirement: requirements[2],
          outcome: "created",
          created: { ref: createRef("created-opaque:create-c") },
        },
      ],
    })
    expect(maximumActive).toBe(1)
    expect(callOrder).toEqual([
      "opaque:reject",
      "opaque:create-b",
      "opaque:create-c",
    ])
  })

  it("projects orphaned native resources without treating display data as identity", async () => {
    const requirement = automaticRequirement("opaque:active", "Active")
    const orphanedRef = createRef("orphaned-key")
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements: [requirement],
        items: [
          {
            ref: orphanedRef,
            displayName: "Retired key",
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
              placementKey: "provider-owned-retired-group",
              displayName: "Retired",
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })),
      provision: vi.fn(async () => ({
        certainty: "not-applied" as const,
        failure: { code: "upstream_rejected" as const },
      })),
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toMatchObject({
      inventoryStatus: "complete",
      invalidResources: [
        {
          ref: orphanedRef,
          displayLabel: "Retired key",
          groupLabel: "Retired",
          reasonCode: "orphaned-placement",
        },
      ],
    })
  })

  it("renames suggested covered resources serially and preserves coverage outcomes", async () => {
    const requirements = [
      automaticRequirement("opaque:a", "Alpha"),
      automaticRequirement("opaque:b", "Beta"),
    ]
    const refs = [createRef("rename-a"), createRef("rename-b")]
    let active = 0
    let maximumActive = 0
    const rename = vi.fn(async (ref: AccountKeyResourceRef) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      return ref.resourceId === "rename-a"
        ? ({ certainty: "applied", value: undefined } as const)
        : ({
            certainty: "possibly-applied",
            failure: uncertainFailure,
          } as const)
    })
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements,
        items: refs.map((ref, index) => ({
          ref,
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
            requirementKeys: [requirements[index]!.requirementKey],
          },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          renameSuggestion: {
            targetDisplayName: `${requirements[index]!.displayName} key`,
          },
        })),
      })),
      provision: vi.fn(),
      rename,
    })

    await expect(
      reconcileAccountKeyInventory(session, {
        renameSuggestedResources: true,
      }),
    ).resolves.toEqual({
      inventoryStatus: "complete",
      invalidResources: [],
      renameResults: [
        { ref: refs[0], outcome: "applied" },
        { ref: refs[1], outcome: "uncertain", failure: uncertainFailure },
      ],
      requirementResults: requirements.map((requirement) => ({
        requirement,
        outcome: "covered",
      })),
    })
    expect(rename).toHaveBeenCalledTimes(2)
    expect(maximumActive).toBe(1)
  })

  it("does not rename when inventory is incomplete", async () => {
    const requirement = automaticRequirement("opaque:a", "Alpha")
    const rename = vi.fn()
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements: [requirement],
        items: [
          {
            ref: createRef("rename-a"),
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
              requirementKeys: [requirement.requirementKey],
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
            renameSuggestion: { targetDisplayName: "Alpha key" },
          },
        ],
        partialFailure: { code: "unavailable" as const },
      })),
      provision: vi.fn(),
      rename,
    })

    await reconcileAccountKeyInventory(session, {
      renameSuggestedResources: true,
    })
    expect(rename).not.toHaveBeenCalled()
  })

  it("treats duplicate native refs as incomplete and performs no mutation", async () => {
    const requirement = automaticRequirement("opaque:a", "Alpha")
    const provision = vi.fn()
    const duplicateRef = createRef("duplicate")
    const session = createSession({
      inspect: vi.fn(async () => ({
        requirements: [requirement],
        items: [
          {
            ref: duplicateRef,
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unmanaged,
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
          {
            ref: duplicateRef,
            placement: {
              kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unmanaged,
            },
            coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
          },
        ],
      })),
      provision,
    })

    await expect(reconcileAccountKeyInventory(session)).resolves.toMatchObject({
      inventoryStatus: "incomplete",
      requirementResults: [
        { requirement, outcome: "blocked-incomplete-inventory" },
      ],
    })
    expect(provision).not.toHaveBeenCalled()
  })
})
