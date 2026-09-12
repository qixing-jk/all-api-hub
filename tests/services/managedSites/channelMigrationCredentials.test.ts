import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { executeManagedSiteMigrationCore } from "~/services/managedSites/channelMigrationCanonicalOrchestrator"
import { planMigrationCredentials } from "~/services/managedSites/channelMigrationCredentials"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers } from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationExecutionCommand,
} from "~/types/managedSiteMigrationCapability"

const source = {
  sourceSiteType: SITE_TYPES.OCTOPUS,
  resourceType: 0,
  baseUrl: "https://upstream.example.invalid",
  models: ["gpt-test"],
  groups: ["default"],
  priority: 0,
  weight: 1,
  status: "enabled" as const,
  credentialMetadata: [{ enabled: true }, { enabled: false }],
  lossSignals: {
    hasMultiKeyState: false,
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
  },
}
const preview = (): ManagedSiteMigrationCanonicalPreview => ({
  sourceSiteType: SITE_TYPES.OCTOPUS,
  targetSiteType: SITE_TYPES.NEW_API,
  generalWarningCodes: [],
  totalCount: 1,
  readyCount: 1,
  blockedCount: 0,
  items: [
    {
      selection: {
        selectionId: "one",
        displayName: "Source",
        ref: {
          siteType: SITE_TYPES.OCTOPUS,
          kind: "channel",
          scopeKey: "https://source.example.invalid",
          resourceId: "1",
        },
      },
      status: "ready",
      warningCodes: [],
      source: { ...source },
      target: {
        projection: {
          name: "Source",
          type: 1,
          baseUrl: source.baseUrl,
          models: source.models,
          groups: source.groups,
          priority: 0,
          weight: 1,
          enabled: true,
        },
        adjustments: {
          remappedType: false,
          normalizedBaseUrl: false,
          forcedDefaultGroup: false,
          ignoredPriority: false,
          ignoredWeight: false,
          simplifiedStatus: false,
        },
      },
    },
  ],
})
const credentials = [
  { value: "first-placeholder-key", enabled: true },
  { value: "second-placeholder-key", enabled: false },
]
const resolveCredential = async () => ({
  status: "ready" as const,
  credential: credentials[0].value,
  credentials,
})
const execute = (
  planned: ManagedSiteMigrationCanonicalPreview,
  overrides: Partial<
    Parameters<typeof executeManagedSiteMigrationCore>[0]
  > = {},
) =>
  executeManagedSiteMigrationCore({
    preview: planned,
    targetAvailable: true,
    sourceFailureReasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
    resolveCredential,
    create: async () => ({ status: "created" }),
    ...overrides,
  })

describe("multi-key migration planning and execution", () => {
  it("keeps all keys in one resource when the target supports their states", async () => {
    const planned = planMigrationCredentials(preview(), () => true)
    const create = vi.fn(
      async (_command: ManagedSiteMigrationExecutionCommand) => ({
        status: "created" as const,
      }),
    )
    expect(planned).toMatchObject({
      totalCount: 1,
      items: [{ target: { projection: { keyCount: 2 } } }],
    })
    const result = await execute(planned, { create })
    expect(create.mock.calls[0][0].credentials).toEqual(credentials)
    expect(result.createdCount).toBe(1)
    for (const key of credentials) {
      expect(JSON.stringify(planned)).not.toContain(key.value)
      expect(JSON.stringify(result)).not.toContain(key.value)
    }
  })

  it("previews separate names and disabled channels and records partial success per key", async () => {
    const planned = planMigrationCredentials(preview(), () => false)
    const create = vi
      .fn<
        (
          command: ManagedSiteMigrationExecutionCommand,
        ) => Promise<{ status: "created" } | { status: "uncertain" }>
      >()
      .mockResolvedValueOnce({ status: "created" })
      .mockResolvedValueOnce({ status: "uncertain" })
    expect(planned).toMatchObject({
      totalCount: 2,
      readyCount: 2,
      items: [
        {
          selection: { displayName: "Source [Key 1]" },
          target: { projection: { keyCount: 1, enabled: true } },
        },
        {
          selection: { displayName: "Source [Key 2]" },
          target: { projection: { keyCount: 1, enabled: false } },
        },
      ],
    })
    expect(await execute(planned, { create })).toMatchObject({
      createdCount: 1,
      uncertainCount: 1,
    })
    expect(create.mock.calls.map(([command]) => command.credential)).toEqual(
      credentials.map((key) => key.value),
    )
    expect(create.mock.calls.every(([command]) => !command.credentials)).toBe(
      true,
    )
  })

  it.each([
    [{ value: "first-placeholder-key", enabled: true }],
    credentials.map((key) => ({ ...key, enabled: true })),
  ])("blocks changed key counts or states before writing", async (...keys) => {
    const create = vi.fn()
    const result = await execute(
      planMigrationCredentials(preview(), () => true),
      {
        create,
        resolveCredential: async () => ({
          status: "ready",
          credential: "placeholder",
          credentials: keys,
        }),
      },
    )
    expect(result).toMatchObject({
      skippedCount: 1,
      items: [{ blockingReasonCode: blockers.SOURCE_KEYS_CHANGED }],
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("does not silently omit a masked key", async () => {
    const create = vi.fn()
    expect(
      await execute(
        planMigrationCredentials(preview(), () => true),
        {
          create,
          resolveCredential: async () => ({
            status: "ready",
            credential: credentials[0].value,
            credentials: [
              credentials[0],
              { value: "sk-********", enabled: false },
            ],
          }),
        },
      ),
    ).toMatchObject({
      skippedCount: 1,
      items: [{ blockingReasonCode: blockers.SOURCE_KEY_MISSING }],
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("stops later split keys when membership changes during execution", async () => {
    const create = vi.fn(async () => ({ status: "created" as const }))
    const resolve = vi
      .fn()
      .mockResolvedValueOnce(await resolveCredential())
      .mockResolvedValueOnce({
        status: "ready",
        credential: "new-key",
        credentials: [{ ...credentials[0], value: "new-key" }, credentials[1]],
      })
    expect(
      await execute(
        planMigrationCredentials(preview(), () => false),
        { create, resolveCredential: resolve },
      ),
    ).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
      items: [
        { status: "created" },
        { blockingReasonCode: blockers.SOURCE_KEYS_CHANGED },
      ],
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it("retains earlier success when a later write throws", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ status: "created" })
      .mockRejectedValueOnce(new Error("unknown write outcome"))
    expect(
      await execute(
        planMigrationCredentials(preview(), () => false),
        { create },
      ),
    ).toMatchObject({ createdCount: 1, uncertainCount: 1 })
  })

  it("blocks multi-key sources that cannot describe all their slots", () => {
    const input = preview()
    const item = input.items[0]
    if (item.status !== "ready") throw new Error("fixture")
    delete item.source.credentialMetadata
    item.source.lossSignals.hasMultiKeyState = true
    expect(planMigrationCredentials(input, () => true)).toMatchObject({
      readyCount: 0,
      blockedCount: 1,
      items: [{ blockingReasonCode: blockers.SOURCE_MULTI_KEY_UNSUPPORTED }],
    })
  })
})
