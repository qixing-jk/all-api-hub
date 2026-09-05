import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import { VeloeraChannelType } from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { veloeraManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/veloeraMigration"
import {
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  loadSecret: vi.fn(),
  create: vi.fn(),
  openOperations: vi.fn(),
}))

vi.mock(
  "~/services/apiAdapters/managedResources/veloera",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiAdapters/managedResources/veloera")
    >()),
    openVeloeraNativeResourceOperations: mocks.openOperations,
  }),
)

const selection = {
  selectionId: "17",
  displayName: "Source channel",
  ref: {
    siteType: SITE_TYPES.VELOERA,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: "https://veloera.example.invalid",
    resourceId: "17",
  },
}

describe("Veloera native channel migration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.openOperations.mockResolvedValue({
      scopeKey: selection.ref.scopeKey,
      get: mocks.get,
      loadSecret: mocks.loadSecret,
      create: mocks.create,
    })
  })

  it("blocks Veloera-only channel types instead of reinterpreting their ids", async () => {
    mocks.get.mockResolvedValue(
      buildManagedSiteChannel({
        id: 17,
        type: VeloeraChannelType.GitHubModels,
      }),
    )

    await expect(
      veloeraManagedSiteMigrationCapability.source?.prepare(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
  })

  it("validates migration selections against the native Veloera scope", async () => {
    const controller = new AbortController()
    const context =
      await veloeraManagedSiteMigrationCapability.source!.createSelectionValidationContext?.(
        {
          signal: controller.signal,
        },
      )

    expect(context?.isValid(selection)).toBe(true)
    expect(
      context?.isValid({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://other.example.invalid" },
      }),
    ).toBe(false)
    expect(
      context?.isValid({
        ...selection,
        ref: { ...selection.ref, resourceId: "invalid" },
      }),
    ).toBe(false)
  })

  it("blocks selections that do not belong to the opened Veloera resource scope", async () => {
    const invalidSelection = {
      ...selection,
      ref: { ...selection.ref, scopeKey: "https://other.example.invalid" },
    }

    await expect(
      veloeraManagedSiteMigrationCapability.source!.prepare(invalidSelection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it("rejects canonical target types that Veloera cannot represent", async () => {
    await expect(
      veloeraManagedSiteMigrationCapability.target?.prepare({
        sourceSiteType: SITE_TYPES.NEW_API,
        resourceType: ChannelType.Coze,
        baseUrl: "https://upstream.example.invalid",
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
      }),
    ).rejects.toThrow("Veloera does not support this migration channel type")
  })

  it("prepares, resolves, and creates through the Veloera native operations", async () => {
    mocks.get.mockResolvedValue({
      ...buildManagedSiteChannel({
        id: 17,
        type: VeloeraChannelType.OpenAI,
        base_url: " https://upstream.example.invalid ",
        models: "model-a, model-b",
        group: "default, vip",
        model_mapping: '{"model-a":"provider-model"}',
      }),
      model_prefix: "tenant-",
      system_prompt: null,
    })
    mocks.loadSecret.mockResolvedValue(" credential-placeholder ")
    mocks.create.mockResolvedValue({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: buildManagedSiteChannel({ id: 23 }),
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
          resourceKind: "channel",
          resourceId: 23,
        },
      ],
    })

    const prepared =
      await veloeraManagedSiteMigrationCapability.source!.prepare(selection)
    expect(prepared).toMatchObject({
      status: "ready",
      source: {
        sourceSiteType: SITE_TYPES.VELOERA,
        resourceType: ChannelType.OpenAI,
        baseUrl: "https://upstream.example.invalid",
        models: ["model-a", "model-b"],
        groups: ["default", "vip"],
        lossSignals: {
          hasModelMapping: true,
          hasAdvancedSettings: true,
        },
      },
    })
    await expect(
      veloeraManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "ready",
      credential: "credential-placeholder",
    })

    if (prepared.status !== "ready") throw new Error("expected ready source")
    const target = await veloeraManagedSiteMigrationCapability.target!.prepare(
      prepared.source,
    )
    await expect(
      veloeraManagedSiteMigrationCapability.target!.create({
        source: prepared.source,
        targetSiteType: SITE_TYPES.VELOERA,
        projection: { ...target.projection, name: "Migrated channel" },
        credential: "credential-placeholder",
      }),
    ).resolves.toEqual({ status: "created" })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Migrated channel",
        type: VeloeraChannelType.OpenAI,
        key: "credential-placeholder",
      }),
      undefined,
    )
  })

  it.each([
    {
      status: 2,
      expectedStatus: "disabled",
      expectedLoss: false,
    },
    {
      status: 3,
      expectedStatus: "other",
      expectedLoss: true,
    },
  ])(
    "normalizes source status $status and provider-owned loss signals",
    async ({ status, expectedStatus, expectedLoss }) => {
      mocks.get.mockResolvedValue({
        ...buildManagedSiteChannel({
          id: 17,
          type: VeloeraChannelType.OpenAI,
          status,
          model_mapping: expectedLoss ? "true" : "{}",
          status_code_mapping: expectedLoss ? ["mapping"] : [],
          group: "",
        }),
        setting: expectedLoss ? { retry: 1 } : "",
        channel_info: { is_multi_key: expectedLoss },
      })

      const result =
        await veloeraManagedSiteMigrationCapability.source!.prepare(selection)

      expect(result).toMatchObject({
        status: "ready",
        source: {
          status: expectedStatus,
          groups: [],
          lossSignals: {
            hasModelMapping: expectedLoss,
            hasStatusCodeMapping: expectedLoss,
            hasAdvancedSettings: expectedLoss,
            hasMultiKeyState: expectedLoss,
          },
        },
      })
    },
  )

  it("blocks missing credentials and provider lookup failures", async () => {
    mocks.get.mockResolvedValue(buildManagedSiteChannel({ id: 17 }))
    mocks.loadSecret.mockResolvedValueOnce("   ")

    await expect(
      veloeraManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })

    mocks.loadSecret.mockRejectedValueOnce(new Error("lookup failed"))
    await expect(
      veloeraManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })

    await expect(
      veloeraManagedSiteMigrationCapability.source!.resolveCredential({
        ...selection,
        ref: { ...selection.ref, resourceId: "invalid" },
      }),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("preserves abort semantics while resolving source credentials", async () => {
    const abortError = new DOMException("cancelled", "AbortError")
    mocks.get.mockResolvedValue(buildManagedSiteChannel({ id: 17 }))
    mocks.loadSecret.mockRejectedValueOnce(abortError)

    await expect(
      veloeraManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).rejects.toBe(abortError)

    const controller = new AbortController()
    const signalReason = new Error("signal cancelled")
    controller.abort(signalReason)
    mocks.get.mockRejectedValueOnce(new Error("provider cancelled"))
    await expect(
      veloeraManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
        {
          signal: controller.signal,
        },
      ),
    ).rejects.toBe(signalReason)
  })

  it("defaults empty target groups and simplifies non-canonical status", async () => {
    const result = await veloeraManagedSiteMigrationCapability.target!.prepare({
      sourceSiteType: SITE_TYPES.NEW_API,
      resourceType: ChannelType.OpenAI,
      baseUrl: "https://upstream.example.invalid",
      models: ["model-example"],
      groups: [],
      priority: 3,
      weight: 4,
      status: "other",
      lossSignals: {
        hasModelMapping: false,
        hasStatusCodeMapping: false,
        hasAdvancedSettings: false,
        hasMultiKeyState: false,
      },
    })

    expect(result).toMatchObject({
      projection: { groups: ["default"], status: 2 },
      adjustments: { forcedDefaultGroup: true, simplifiedStatus: true },
    })
  })

  it.each([
    [MANAGED_SITE_MUTATION_OUTCOMES.Rejected, "failed"],
    [MANAGED_SITE_MUTATION_OUTCOMES.Partial, "uncertain"],
    [MANAGED_SITE_MUTATION_OUTCOMES.Uncertain, "uncertain"],
  ] as const)(
    "maps target create outcome %s to %s",
    async (outcome, status) => {
      mocks.create.mockResolvedValueOnce({
        outcome,
        confirmedEffects: [],
        ...(outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial
          ? { completion: "uncertain" }
          : {}),
      })
      const source = {
        sourceSiteType: SITE_TYPES.NEW_API,
        resourceType: ChannelType.OpenAI,
        baseUrl: "https://upstream.example.invalid",
        models: ["model-example"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: "enabled" as const,
        lossSignals: {
          hasModelMapping: false,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: false,
          hasMultiKeyState: false,
        },
      }

      await expect(
        veloeraManagedSiteMigrationCapability.target!.create({
          source,
          targetSiteType: SITE_TYPES.VELOERA,
          projection: {
            name: "Migrated channel",
            type: VeloeraChannelType.OpenAI,
            baseUrl: source.baseUrl,
            models: source.models,
            groups: source.groups,
            priority: 0,
            weight: 0,
            status: 1,
          },
          credential: "credential-placeholder",
        }),
      ).resolves.toMatchObject({ status })
    },
  )
})
