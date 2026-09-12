import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { DoneHubChannelType } from "~/constants/doneHub"
import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import { ChannelType } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import { VeloeraChannelType } from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { newApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/newApiMigration"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
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
import { OctopusOutboundType } from "~/types/octopus"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  openOperations: vi.fn(),
  get: vi.fn(),
  loadSecret: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
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
  it.each([
    [SITE_TYPES.DONE_HUB, DoneHubChannelType.DeepSeek, 43],
    [SITE_TYPES.DONE_HUB, DoneHubChannelType.Gemini, 24],
    [SITE_TYPES.VELOERA, VeloeraChannelType.Anthropic, 14],
    [SITE_TYPES.OCTOPUS, OctopusOutboundType.Anthropic, 14],
    [SITE_TYPES.AXON_HUB, AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES, 1],
    [SITE_TYPES.CLAUDE_CODE_HUB, CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX, 57],
  ] as const)(
    "prepares the New API target from native %s type %s",
    async (sourceSiteType, resourceType, expectedType) => {
      const prepared =
        await newApiManagedSiteMigrationCapability.target!.prepare({
          ...source,
          sourceSiteType,
          resourceType,
        })

      expect(prepared.projection.type).toBe(expectedType)
    },
  )

  it.each([
    [SITE_TYPES.NEW_API, ChannelType.Unknown],
    [SITE_TYPES.VELOERA, VeloeraChannelType.GitHubModels],
    [SITE_TYPES.DONE_HUB, DoneHubChannelType.GitHubModels],
    [SITE_TYPES.CLAUDE_CODE_HUB, 14],
  ] as const)(
    "rejects native %s type %s without reinterpreting its numeric identity",
    async (sourceSiteType, resourceType) => {
      await expect(
        newApiManagedSiteMigrationCapability.target!.prepare({
          ...source,
          sourceSiteType,
          resourceType,
        }),
      ).rejects.toThrow()
    },
  )

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.openOperations.mockResolvedValue({
      scopeKey,
      get: mocks.get,
      loadSecret: mocks.loadSecret,
      create: mocks.create,
      update: mocks.update,
    })
    mocks.get.mockResolvedValue(channel)
    mocks.loadSecret.mockResolvedValue("credential-placeholder")
  })

  it("exports every native key with its current enabled state", async () => {
    mocks.get.mockResolvedValue({
      ...channel,
      channel_info: {
        is_multi_key: true,
        multi_key_size: 2,
        multi_key_status_list: { 1: 2 },
      },
    })
    mocks.loadSecret.mockResolvedValue("first-placeholder\nsecond-placeholder")
    expect(
      await newApiManagedSiteMigrationCapability.source!.prepare(selection),
    ).toMatchObject({
      source: { credentialMetadata: [{ enabled: true }, { enabled: false }] },
    })
    expect(
      await newApiManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).toMatchObject({
      credentials: [
        { value: "first-placeholder", enabled: true },
        { value: "second-placeholder", enabled: false },
      ],
    })
  })

  it("rereads key metadata after interactive secret verification", async () => {
    mocks.get.mockResolvedValueOnce(channel).mockResolvedValueOnce({
      ...channel,
      channel_info: {
        is_multi_key: true,
        multi_key_size: 2,
        multi_key_status_list: { 0: 2 },
      },
    })
    mocks.loadSecret.mockResolvedValue("first-placeholder\nsecond-placeholder")
    expect(
      await newApiManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).toMatchObject({
      credentials: [
        { value: "first-placeholder", enabled: false },
        { value: "second-placeholder", enabled: true },
      ],
    })
  })

  it.each(["succeeded", "partial", "throw"])(
    "pauses creation until disabled key states are confirmed: %s",
    async (outcome) => {
      const saved = {
        ...channel,
        status: 2,
        channel_info: {
          is_multi_key: true,
          multi_key_size: 2,
          multi_key_status_list: {},
        },
      }
      mocks.create.mockResolvedValue({ outcome: "succeeded", data: saved })
      if (outcome === "throw")
        mocks.update.mockRejectedValue(new Error("readback unavailable"))
      else mocks.update.mockResolvedValue({ outcome })
      const prepared =
        await newApiManagedSiteMigrationCapability.target!.prepare({
          ...source,
          status: "enabled",
        })
      const result = await newApiManagedSiteMigrationCapability.target!.create({
        source,
        targetSiteType: SITE_TYPES.NEW_API,
        projection: prepared.projection,
        credential: "first-placeholder",
        credentials: [
          { value: "first-placeholder", enabled: true },
          { value: "second-placeholder", enabled: false },
        ],
      })
      expect(mocks.create.mock.calls[0][0]).toMatchObject({
        status: 2,
        credentialPatch: {
          entries: [
            { secret: { kind: "replace", value: "first-placeholder" } },
            { secret: { kind: "replace", value: "second-placeholder" } },
          ],
        },
      })
      expect(mocks.update.mock.calls[0][1]).toMatchObject({
        status: 1,
        key: "",
        credentialPatch: {
          entries: [
            {
              id: "0",
              secret: { kind: "unchanged" },
              fields: { enabled: "true" },
            },
            {
              id: "1",
              secret: { kind: "unchanged" },
              fields: { enabled: "false" },
            },
          ],
        },
      })
      expect(result.status).toBe(
        outcome === "succeeded" ? "created" : "uncertain",
      )
      expect(mocks.create).toHaveBeenCalledOnce()
    },
  )

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
        enabled: false,
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
    { status: "enabled", nativeStatus: CHANNEL_STATUS.Enable },
    { status: "disabled", nativeStatus: CHANNEL_STATUS.ManuallyDisabled },
  ] as const)(
    "preserves an $status source when creating a New API channel",
    async ({ status, nativeStatus }) => {
      const currentSource = { ...source, status }
      const prepared =
        await newApiManagedSiteMigrationCapability.target!.prepare(
          currentSource,
        )
      mocks.create.mockResolvedValueOnce({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: channel,
        confirmedEffects: [],
      })

      await expect(
        newApiManagedSiteMigrationCapability.target!.create({
          source: currentSource,
          targetSiteType: SITE_TYPES.NEW_API,
          projection: prepared.projection,
          credential: "credential-placeholder",
        }),
      ).resolves.toEqual({ status: "created" })
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: nativeStatus }),
        undefined,
      )
    },
  )

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
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
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
