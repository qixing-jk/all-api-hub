import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { newApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/newApiMigration"
import {
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
import { CHANNEL_STATUS } from "~/types/newApi"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  openOperations: vi.fn(),
  get: vi.fn(),
  loadSecret: vi.fn(),
  create: vi.fn(),
}))

vi.mock("~/services/apiAdapters/managedResources/newApi", () => ({
  openNewApiNativeResourceOperations: mocks.openOperations,
}))

const scopeKey = "https://new-api.example.invalid"
const channel = buildManagedSiteChannel({
  id: 17,
  name: "Example channel",
  type: ChannelType.OpenAI,
  status: CHANNEL_STATUS.Enable,
  models: "model-a,model-b",
  group: "default,vip",
})
const selection: ManagedSiteMigrationSelection = {
  selectionId: "selection-17",
  displayName: channel.name,
  ref: {
    siteType: SITE_TYPES.NEW_API,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey,
    resourceId: String(channel.id),
  },
}
const source: ManagedSiteMigrationSource = {
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: ChannelType.OpenAI,
  baseUrl: "https://upstream.example.invalid",
  models: ["model-a"],
  groups: [],
  priority: 2,
  weight: 4,
  status: "other",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
}

describe("New API managed-site migration capability", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.openOperations.mockResolvedValue({
      scopeKey,
      get: mocks.get,
      loadSecret: mocks.loadSecret,
      create: mocks.create,
    })
    mocks.get.mockResolvedValue(channel)
    mocks.loadSecret.mockResolvedValue("credential-placeholder")
  })

  it("validates native selections against the current scope and numeric locator", async () => {
    const context =
      await newApiManagedSiteMigrationCapability.source!
        .createSelectionValidationContext!()

    expect(context.isValid(selection)).toBe(true)
    expect(
      context.isValid({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://stale.example.invalid" },
      }),
    ).toBe(false)
    expect(
      context.isValid({
        ...selection,
        ref: { ...selection.ref, resourceId: "not-a-channel-id" },
      }),
    ).toBe(false)
  })

  it("blocks stale refs before provider reads and unsupported native types after detail", async () => {
    await expect(
      newApiManagedSiteMigrationCapability.source!.prepare({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://stale.example.invalid" },
      }),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    expect(mocks.get).not.toHaveBeenCalled()

    mocks.get.mockResolvedValueOnce({ ...channel, type: 999 })
    await expect(
      newApiManagedSiteMigrationCapability.source!.prepare(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
  })

  it("prepares default groups and simplified disabled status without hiding adjustments", async () => {
    await expect(
      newApiManagedSiteMigrationCapability.target!.prepare(source),
    ).resolves.toEqual({
      projection: {
        name: "",
        type: ChannelType.OpenAI,
        baseUrl: source.baseUrl,
        models: ["model-a"],
        groups: [...DEFAULT_CHANNEL_FIELDS.groups],
        priority: 2,
        weight: 4,
        status: CHANNEL_STATUS.ManuallyDisabled,
      },
      adjustments: {
        remappedType: false,
        normalizedBaseUrl: false,
        forcedDefaultGroup: true,
        ignoredPriority: false,
        ignoredWeight: false,
        simplifiedStatus: true,
      },
    })
  })

  it.each([
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: channel,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          },
        ],
      },
      expected: { status: "created" },
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: { message: "provider rejected create" },
      },
      expected: {
        status: "failed",
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
      },
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          },
        ],
        completion: "uncertain",
        diagnostic: { message: "identity unresolved" },
      },
      expected: { status: "uncertain" },
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "response lost" },
      },
      expected: { status: "uncertain" },
    },
  ])(
    "maps $outcome without replaying the create",
    async ({ result, expected }) => {
      mocks.create.mockResolvedValueOnce(result)
      const prepared =
        await newApiManagedSiteMigrationCapability.target!.prepare(source)

      await expect(
        newApiManagedSiteMigrationCapability.target!.create({
          source,
          targetSiteType: SITE_TYPES.NEW_API,
          projection: prepared.projection,
          credential: "credential-placeholder",
        }),
      ).resolves.toEqual(expected)
      expect(mocks.create).toHaveBeenCalledOnce()
    },
  )
})
