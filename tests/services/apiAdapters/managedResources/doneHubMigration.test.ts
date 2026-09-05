import { beforeEach, describe, expect, it, vi } from "vitest"

import { DoneHubChannelType } from "~/constants/doneHub"
import { ChannelType } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { doneHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/doneHubMigration"
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
  "~/services/apiAdapters/managedResources/doneHub",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiAdapters/managedResources/doneHub")
    >()),
    openDoneHubNativeResourceOperations: mocks.openOperations,
  }),
)

const selection = {
  selectionId: "17",
  displayName: "Source channel",
  ref: {
    siteType: SITE_TYPES.DONE_HUB,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: "https://done-hub.example.invalid",
    resourceId: "17",
  },
}

describe("DoneHub native channel migration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.openOperations.mockResolvedValue({
      scopeKey: selection.ref.scopeKey,
      get: mocks.get,
      loadSecret: mocks.loadSecret,
      create: mocks.create,
    })
  })

  it("blocks DoneHub-only types instead of reinterpreting colliding ids", async () => {
    mocks.get.mockResolvedValue(
      buildManagedSiteChannel({
        id: 17,
        type: DoneHubChannelType.GitHubModels,
      }),
    )

    await expect(
      doneHubManagedSiteMigrationCapability.source?.prepare(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
  })

  it("validates selections against the opened native scope", async () => {
    const context =
      await doneHubManagedSiteMigrationCapability.source!.createSelectionValidationContext?.()

    expect(context?.isValid(selection)).toBe(true)
    expect(
      context?.isValid({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://other.example.invalid" },
      }),
    ).toBe(false)
  })

  it("prepares, resolves, and creates through DoneHub native operations", async () => {
    mocks.get.mockResolvedValue({
      ...buildManagedSiteChannel({
        id: 17,
        type: DoneHubChannelType.OpenAI,
        base_url: " https://upstream.example.invalid ",
        models: "model-a, model-b",
        group: "default, vip",
        model_mapping: '{"model-a":"provider-model"}',
      }),
      proxy: "https://proxy.example.invalid",
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
      await doneHubManagedSiteMigrationCapability.source!.prepare(selection)
    expect(prepared).toMatchObject({
      status: "ready",
      source: {
        sourceSiteType: SITE_TYPES.DONE_HUB,
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
      doneHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "ready",
      credential: "credential-placeholder",
    })

    if (prepared.status !== "ready") throw new Error("expected ready source")
    const target = await doneHubManagedSiteMigrationCapability.target!.prepare(
      prepared.source,
    )
    await expect(
      doneHubManagedSiteMigrationCapability.target!.create({
        source: prepared.source,
        targetSiteType: SITE_TYPES.DONE_HUB,
        projection: { ...target.projection, name: "Migrated channel" },
        credential: "credential-placeholder",
      }),
    ).resolves.toEqual({ status: "created" })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Migrated channel",
        type: DoneHubChannelType.OpenAI,
        key: "credential-placeholder",
      }),
      undefined,
    )
  })

  it("rejects canonical target types DoneHub cannot represent", async () => {
    await expect(
      doneHubManagedSiteMigrationCapability.target?.prepare({
        sourceSiteType: SITE_TYPES.NEW_API,
        resourceType: ChannelType.NewAPI,
        baseUrl: "https://upstream.example.invalid",
        models: [],
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
    ).rejects.toThrow("DoneHub does not support this migration channel type")
  })

  it("does not migrate a masked detail credential as a real key", async () => {
    mocks.get.mockResolvedValue(
      buildManagedSiteChannel({ id: 17, type: DoneHubChannelType.OpenAI }),
    )
    mocks.loadSecret.mockResolvedValue("sk-********")

    await expect(
      doneHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })
})
