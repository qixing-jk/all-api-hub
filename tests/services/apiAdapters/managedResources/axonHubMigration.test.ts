import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import * as axonHubNativeResources from "~/services/apiAdapters/managedResources/axonHub"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHubMigration"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { AxonHubChannel } from "~/types/axonHub"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationExecutionCommand,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

const mocks = vi.hoisted(() => ({
  hasUsableApiTokenKey: vi.fn(),
}))

vi.mock("~/services/accountTokens/apiTokenKey", () => ({
  hasUsableApiTokenKey: mocks.hasUsableApiTokenKey,
}))

const selection: ManagedSiteMigrationSelection = {
  selectionId: "selection-safe-token",
  displayName: "Example channel",
  ref: {
    siteType: SITE_TYPES.AXON_HUB,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: "https://axon.example.invalid",
    resourceId: "resource-safe-token",
  },
}

const buildSource = (
  resourceType: ChannelType = ChannelType.OpenAI,
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType,
  baseUrl: "https://source.example.invalid",
  models: ["model-example"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: "enabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
})

const buildCommand = (
  projectionType: ChannelType | string,
  sourceType: ChannelType = ChannelType.OpenAI,
): ManagedSiteMigrationExecutionCommand => ({
  source: buildSource(sourceType),
  targetSiteType: SITE_TYPES.AXON_HUB,
  projection: {
    name: "Migration target",
    type: projectionType,
    baseUrl: "https://target.example.invalid",
    models: ["model-example"],
    groups: ["default"],
    priority: 0,
    weight: 0,
    status: 1,
  },
  credential: "credential-placeholder",
})

describe("AxonHub migration type boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasUsableApiTokenKey.mockReturnValue(true)
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      axonHub: {
        baseUrl: "https://axon.example.invalid",
        email: "admin@example.invalid",
        password: "password-placeholder",
      },
    } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("snapshots configured scope once for a validation context and honors AbortSignal", async () => {
    const getPreferences = vi.mocked(userPreferences.getPreferences)
    const createContext =
      axonHubManagedSiteMigrationCapability.source!
        .createSelectionValidationContext!
    const controller = new AbortController()

    const context = await createContext({ signal: controller.signal })

    expect(context.isValid(selection)).toBe(true)
    expect(
      context.isValid({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://other.example.invalid" },
      }),
    ).toBe(false)
    expect(getPreferences).toHaveBeenCalledOnce()

    controller.abort()
    await expect(
      createContext({ signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(getPreferences).toHaveBeenCalledOnce()
  })

  it("blocks an unknown native source type before credential resolution", async () => {
    const get = vi.fn(
      async () =>
        ({
          id: "resource-safe-token",
          name: "Example channel",
          type: "future-provider",
          status: AXON_HUB_CHANNEL_STATUS.ENABLED,
          baseURL: "https://source.example.invalid",
          supportedModels: ["model-example"],
          credentials: { apiKeys: ["credential-placeholder"] },
        }) as unknown as AxonHubChannel,
    )
    vi.spyOn(
      axonHubNativeResources,
      "openAxonHubNativeResourceOperations",
    ).mockResolvedValue({ get } as never)

    const preparation =
      await axonHubManagedSiteMigrationCapability.source!.prepare(selection)
    const credentialResolution =
      await axonHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      )

    expect(preparation).toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
    expect(credentialResolution).toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
    expect(mocks.hasUsableApiTokenKey).not.toHaveBeenCalled()
    expect(JSON.stringify([preparation, credentialResolution])).not.toContain(
      "future-provider",
    )
    expect(JSON.stringify([preparation, credentialResolution])).not.toContain(
      "credential-placeholder",
    )
  })

  it("rejects a valid-looking ref with the wrong configured scope before opening AxonHub", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      axonHub: {
        baseUrl: "https://axon.example.invalid/admin/",
        email: "admin@example.invalid",
        password: "password-placeholder",
      },
    } as never)
    const open = vi.spyOn(
      axonHubNativeResources,
      "openAxonHubNativeResourceOperations",
    )
    const mismatchedSelection = {
      ...selection,
      ref: {
        ...selection.ref,
        scopeKey: "https://other.example.invalid",
      },
    }

    await expect(
      axonHubManagedSiteMigrationCapability.source!.prepare(
        mismatchedSelection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    await expect(
      axonHubManagedSiteMigrationCapability.source!.resolveCredential(
        mismatchedSelection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    expect(open).not.toHaveBeenCalled()
  })

  it("rejects an unmapped canonical target before constructing a projection", async () => {
    await expect(
      axonHubManagedSiteMigrationCapability.target!.prepare(
        buildSource(ChannelType.Midjourney),
      ),
    ).rejects.toThrow("AxonHub migration does not support this channel type.")
  })

  it.each([
    ["future-provider", ChannelType.OpenAI],
    [ChannelType.Midjourney, ChannelType.Midjourney],
  ] as const)(
    "rejects unsupported target type %s before opening or creating",
    async (projectionType, sourceType) => {
      const create = vi.fn(async () => ({ certainty: "applied" as const }))
      const open = vi
        .spyOn(axonHubNativeResources, "openAxonHubNativeResourceOperations")
        .mockResolvedValue({ create } as never)

      await expect(
        axonHubManagedSiteMigrationCapability.target!.create(
          buildCommand(projectionType, sourceType),
        ),
      ).resolves.toEqual({
        status: "failed",
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
      })
      expect(open).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )

  it("continues to accept mapped native target types", async () => {
    await expect(
      axonHubManagedSiteMigrationCapability.target!.prepare(
        buildSource(ChannelType.Anthropic),
      ),
    ).resolves.toMatchObject({
      projection: { type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC },
    })
  })
})
