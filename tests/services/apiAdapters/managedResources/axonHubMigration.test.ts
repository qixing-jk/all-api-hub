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
  openAxonHubNativeResourceOperations: vi.fn(),
}))

vi.mock(
  "~/services/apiAdapters/managedResources/axonHub",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiAdapters/managedResources/axonHub")
      >()
    return {
      ...actual,
      openAxonHubNativeResourceOperations:
        mocks.openAxonHubNativeResourceOperations,
    }
  },
)

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

  it("rejects OpenRouter native refs before they enter AxonHub migration", async () => {
    const open = vi.spyOn(
      axonHubNativeResources,
      "openAxonHubNativeResourceOperations",
    )
    const openRouterSelection = {
      ...selection,
      ref: {
        ...selection.ref,
        siteType: SITE_TYPES.OPENROUTER,
      },
    } as never
    const context =
      await axonHubManagedSiteMigrationCapability.source!
        .createSelectionValidationContext!()

    expect(context.isValid(openRouterSelection)).toBe(false)
    await expect(
      axonHubManagedSiteMigrationCapability.source!.prepare(
        openRouterSelection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    expect(open).not.toHaveBeenCalled()
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

  it.each([
    {
      label: "created",
      mutation: {
        outcome: "succeeded" as const,
        data: { id: "created-channel" },
        confirmedEffects: [
          {
            kind: "resource-created" as const,
            resourceKind: "channel" as const,
            resourceId: "created-channel",
          },
        ],
      },
      expected: { status: "created" as const },
    },
    {
      label: "rejected",
      mutation: {
        outcome: "rejected" as const,
        diagnostic: {
          message: "provider rejected",
          code: "upstream_rejected",
        },
      },
      expected: {
        status: "failed" as const,
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
      },
    },
    {
      label: "authentication rejected",
      mutation: {
        outcome: "rejected" as const,
        diagnostic: {
          message: "authentication failed",
          code: "authentication_failed",
        },
      },
      expected: {
        status: "failed" as const,
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
      },
    },
    {
      label: "availability rejected",
      mutation: {
        outcome: "rejected" as const,
        diagnostic: {
          message: "target unavailable",
          code: "unavailable",
        },
      },
      expected: {
        status: "failed" as const,
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
      },
    },
    {
      label: "partial",
      mutation: {
        outcome: "partial" as const,
        confirmedEffects: [
          {
            kind: "resource-created" as const,
            resourceKind: "channel" as const,
            resourceId: "partial-channel",
          },
        ] as const,
        completion: "uncertain" as const,
        diagnostic: { message: "status update uncertain" },
      },
      expected: { status: "uncertain" as const },
    },
    {
      label: "uncertain",
      mutation: {
        outcome: "uncertain" as const,
        diagnostic: { message: "create uncertain" },
      },
      expected: { status: "uncertain" as const },
    },
  ])(
    "maps an options-aware native common $label result without replay",
    async ({ mutation, expected }) => {
      const controller = new AbortController()
      const create = vi.fn().mockResolvedValue(mutation)
      const list = vi.fn().mockResolvedValue({ items: [] })
      const open = vi
        .spyOn(axonHubNativeResources, "openAxonHubNativeResourceOperations")
        .mockResolvedValue({ create, list } as never)
      const options = { signal: controller.signal }

      await expect(
        axonHubManagedSiteMigrationCapability.target!.create(
          buildCommand(ChannelType.OpenAI),
          options,
        ),
      ).resolves.toEqual(expected)

      expect(create).toHaveBeenCalledWith(
        {
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          name: "Migration target",
          baseURL: "https://target.example.invalid",
          credentials: { apiKeys: ["credential-placeholder"] },
          supportedModels: ["model-example"],
          manualModels: ["model-example"],
          defaultTestModel: "model-example",
          settings: {},
          orderingWeight: 0,
        },
        AXON_HUB_CHANNEL_STATUS.ENABLED,
        options,
      )
      expect(create).toHaveBeenCalledOnce()
      expect(open).toHaveBeenCalledWith(options)
      if (mutation.outcome === "partial" || mutation.outcome === "uncertain") {
        expect(list).toHaveBeenCalledOnce()
        expect(list).toHaveBeenCalledWith(undefined, options)
      } else {
        expect(list).not.toHaveBeenCalled()
      }
    },
  )

  it("rejects a succeeded migration result without a confirmed create effect", async () => {
    const create = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: { id: "created-without-effect" },
      confirmedEffects: [],
    })
    const list = vi.fn()
    vi.spyOn(
      axonHubNativeResources,
      "openAxonHubNativeResourceOperations",
    ).mockResolvedValue({ create, list } as never)

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(
        buildCommand(ChannelType.OpenAI),
      ),
    ).rejects.toThrow(
      "AxonHub migration succeeded without a confirmed create effect.",
    )
    expect(create).toHaveBeenCalledOnce()
    expect(list).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "explicit reason",
      reason: new DOMException("Cancelled migration", "AbortError"),
    },
    { label: "default reason", reason: undefined },
  ])(
    "throws the $label when the signal aborts before a rejected result is handled",
    async ({ reason }) => {
      const signal = { aborted: true, reason } as AbortSignal
      const create = vi.fn().mockResolvedValue({
        outcome: "rejected",
        diagnostic: {
          message: "provider rejected",
          code: "upstream_rejected",
        },
      })
      const list = vi.fn()
      vi.spyOn(
        axonHubNativeResources,
        "openAxonHubNativeResourceOperations",
      ).mockResolvedValue({ create, list } as never)

      const error = await axonHubManagedSiteMigrationCapability
        .target!.create(buildCommand(ChannelType.OpenAI), { signal })
        .catch((caught) => caught)

      if (reason) {
        expect(error).toBe(reason)
      } else {
        expect(error).toMatchObject({ name: "AbortError", message: "Aborted" })
      }
      expect(create).toHaveBeenCalledOnce()
      expect(list).not.toHaveBeenCalled()
    },
  )

  it("does not retain rejected abort raw diagnostics in the outward cause chain", async () => {
    const rawSecret = "raw-abort-secret-placeholder"
    const diagnosticRaw = {
      authorization: rawSecret,
      providerPayload: { apiKey: rawSecret },
    }
    const create = vi.fn().mockResolvedValue({
      outcome: "rejected",
      diagnostic: {
        message: "Provider request aborted",
        code: "aborted",
        raw: diagnosticRaw,
      },
    })
    const list = vi.fn()
    vi.spyOn(
      axonHubNativeResources,
      "openAxonHubNativeResourceOperations",
    ).mockResolvedValue({ create, list } as never)

    const error = await axonHubManagedSiteMigrationCapability
      .target!.create(buildCommand(ChannelType.OpenAI))
      .catch((failure) => failure)

    expect(error).toMatchObject({ name: "AbortError" })
    const causeChain: unknown[] = []
    let cause = error?.cause
    while (cause && typeof cause === "object" && !causeChain.includes(cause)) {
      causeChain.push(cause)
      cause = "cause" in cause ? cause.cause : undefined
    }
    expect(causeChain).not.toContain(diagnosticRaw)
    expect(causeChain).not.toContain(diagnosticRaw.providerPayload)
    for (const causeError of [error, ...causeChain]) {
      if (causeError instanceof Error) {
        expect(causeError.message).not.toContain(rawSecret)
      }
    }
    expect(create).toHaveBeenCalledOnce()
    expect(list).not.toHaveBeenCalled()
  })

  it("omits an empty optional baseURL from the native migration payload", async () => {
    const create = vi.fn().mockResolvedValue({
      outcome: "succeeded",
      data: { id: "created-channel" },
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
          resourceId: "created-channel",
        },
      ],
    })
    vi.spyOn(
      axonHubNativeResources,
      "openAxonHubNativeResourceOperations",
    ).mockResolvedValue({ create, list: vi.fn() } as never)
    const command = buildCommand(ChannelType.OpenAI)
    command.projection.baseUrl = "   "

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({ status: "created" })

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("baseURL")
  })
})
