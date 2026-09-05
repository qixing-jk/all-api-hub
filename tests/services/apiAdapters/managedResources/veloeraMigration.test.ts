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
})
