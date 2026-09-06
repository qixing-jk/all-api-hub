import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { octopusManagedSiteMigrationCapability as capability } from "~/services/apiAdapters/managedResources/octopusMigration"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers } from "~/types/managedSiteMigration"
import type { ManagedSiteMigrationSource } from "~/types/managedSiteMigrationCapability"
import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
} from "~/types/octopus"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  loadSecret: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
  prepareMigrationBaseUrl: vi.fn(),
}))
vi.mock(
  "~/services/apiAdapters/managedResources/octopus",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiAdapters/managedResources/octopus")
    >()),
    openOctopusNativeResourceOperations: mocks.open,
  }),
)

const selection = {
  selectionId: "17",
  displayName: "Source channel",
  ref: {
    siteType: SITE_TYPES.OCTOPUS,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: "https://site.example.invalid",
    resourceId: "17",
  },
}
const channel: OctopusChannel = {
  id: 17,
  name: "Source channel",
  type: OctopusOutboundType.Anthropic,
  enabled: true,
  base_urls: [{ url: "https://upstream.example.invalid/v1" }],
  keys: [{ enabled: true, channel_key: "credential-placeholder" }],
  model: "model-a, model-b",
  proxy: false,
  auto_sync: false,
  auto_group: OctopusAutoGroupType.None,
}
const source: ManagedSiteMigrationSource = {
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: ChannelType.OpenAI,
  baseUrl: "http://upstream.example.invalid",
  models: ["model-a"],
  groups: ["vip"],
  priority: 4,
  weight: 5,
  status: "other",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
}

describe("Octopus native migration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.open.mockResolvedValue({
      scopeKey: selection.ref.scopeKey,
      get: mocks.get,
      loadSecret: mocks.loadSecret,
      create: mocks.create,
      prepareMigrationBaseUrl: mocks.prepareMigrationBaseUrl,
    })
    mocks.get.mockResolvedValue(channel)
    mocks.prepareMigrationBaseUrl.mockResolvedValue(
      "http://upstream.example.invalid/v1",
    )
  })

  it("registers Octopus canonical source and target migration", () => {
    expect(resolveManagedSiteMigrationCapability(SITE_TYPES.OCTOPUS)).toBe(
      capability,
    )
  })

  it("prepares native source facts without resolving a secret", async () => {
    const prepared = await capability.source!.prepare(selection)
    expect(prepared).toMatchObject({
      status: "ready",
      source: {
        resourceType: ChannelType.Anthropic,
        models: ["model-a", "model-b"],
        baseUrl: "https://upstream.example.invalid/v1",
      },
    })
    expect(JSON.stringify(prepared)).not.toContain("credential-placeholder")
    expect(mocks.loadSecret).not.toHaveBeenCalled()
  })

  it.each([
    { scopeKey: "https://other.example.invalid" },
    { resourceId: "0" },
    { resourceId: "1.2" },
    { resourceId: "invalid" },
    { siteType: SITE_TYPES.NEW_API },
  ])(
    "blocks an invalid source reference %j before accessing it",
    async (ref) => {
      const invalid = { ...selection, ref: { ...selection.ref, ...ref } }
      expect(
        (await capability.source!.createSelectionValidationContext!()).isValid(
          invalid,
        ),
      ).toBe(false)
      await expect(capability.source!.prepare(invalid)).resolves.toEqual({
        status: "blocked",
        reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
      })
      expect(mocks.get).not.toHaveBeenCalled()
    },
  )

  it("blocks unknown provider types", async () => {
    mocks.get.mockResolvedValue({ ...channel, type: 900 })
    await expect(capability.source!.prepare(selection)).resolves.toEqual({
      status: "blocked",
      reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
    })
  })

  it.each([
    {
      base_urls: [
        ...channel.base_urls,
        { url: "https://alternate.example.invalid" },
      ],
    },
    { custom_model: "custom-model" },
    { custom_header: [{ header_key: "example", header_value: "placeholder" }] },
    { param_override: "{}" },
    { channel_proxy: "http://proxy.example.invalid" },
    { match_regex: "model.*" },
    { proxy: true },
    { auto_sync: true },
    { auto_group: OctopusAutoGroupType.Exact },
    { type: OctopusOutboundType.OpenAIResponse },
    { type: OctopusOutboundType.OpenAIEmbedding },
    { hasUnrepresentedProtocolSettings: true },
  ])(
    "discloses native settings that the canonical draft cannot preserve %j",
    async (detail) => {
      mocks.get.mockResolvedValue({ ...channel, ...detail })
      await expect(
        capability.source!.prepare(selection),
      ).resolves.toMatchObject({
        source: { lossSignals: { hasAdvancedSettings: true } },
      })
    },
  )

  it("discloses multiple keys and resolves the execution secret independently", async () => {
    mocks.get.mockResolvedValue({
      ...channel,
      keys: [
        ...channel.keys,
        { enabled: false, channel_key: "other-placeholder" },
      ],
    })
    await expect(capability.source!.prepare(selection)).resolves.toMatchObject({
      source: { lossSignals: { hasMultiKeyState: true } },
    })
    mocks.loadSecret.mockResolvedValue(" resolved-placeholder ")
    await expect(
      capability.source!.resolveCredential(selection),
    ).resolves.toEqual({ status: "ready", credential: "resolved-placeholder" })
    mocks.loadSecret.mockResolvedValue("sk-********")
    await expect(
      capability.source!.resolveCredential(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode: blockers.SOURCE_KEY_MISSING,
    })
    mocks.loadSecret.mockRejectedValue(new Error("unavailable"))
    await expect(
      capability.source!.resolveCredential(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("propagates cancellation without converting it to a credential blocker", async () => {
    const controller = new AbortController()
    const reason = new Error("cancelled")
    controller.abort(reason)
    await expect(
      capability.source!.resolveCredential(selection, {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason)
    const abort = new DOMException("cancelled", "AbortError")
    mocks.loadSecret.mockRejectedValue(abort)
    await expect(capability.source!.resolveCredential(selection)).rejects.toBe(
      abort,
    )
    mocks.loadSecret.mockRejectedValue(
      new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.Aborted,
      }),
    )
    await expect(
      capability.source!.resolveCredential(selection),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("normalizes target defaults and retains HTTP upstream compatibility", async () => {
    await expect(capability.target!.prepare(source)).resolves.toMatchObject({
      projection: {
        type: String(OctopusOutboundType.OpenAIChat),
        baseUrl: "http://upstream.example.invalid/v1",
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 2,
      },
      adjustments: {
        normalizedBaseUrl: true,
        forcedDefaultGroup: true,
        ignoredPriority: true,
        ignoredWeight: true,
        simplifiedStatus: true,
      },
    })
    await expect(
      capability.target!.prepare({
        ...source,
        resourceType: ChannelType.Unknown,
      }),
    ).rejects.toThrow("does not support")
  })

  it("uses the target generation's URL preparation without appending another version path", async () => {
    mocks.prepareMigrationBaseUrl.mockResolvedValue(
      "http://upstream.example.invalid",
    )
    const controller = new AbortController()
    const options = { signal: controller.signal }
    await expect(
      capability.target!.prepare(
        { ...source, baseUrl: "http://upstream.example.invalid/v1" },
        options,
      ),
    ).resolves.toMatchObject({
      projection: { baseUrl: "http://upstream.example.invalid" },
      adjustments: { normalizedBaseUrl: true },
    })
    expect(mocks.prepareMigrationBaseUrl).toHaveBeenCalledWith(
      "http://upstream.example.invalid/v1",
      OctopusOutboundType.OpenAIChat,
      options,
    )
  })

  it.each(["/api/v3", "/v1"])(
    "passes the mapped protocol when preserving a versioned upstream root %s",
    async (path) => {
      const baseUrl = `https://upstream.example.invalid${path}`
      mocks.prepareMigrationBaseUrl.mockResolvedValue(baseUrl)
      await expect(
        capability.target!.prepare({
          ...source,
          resourceType: ChannelType.VolcEngine,
          baseUrl,
        }),
      ).resolves.toMatchObject({
        projection: { type: String(OctopusOutboundType.Volcengine), baseUrl },
        adjustments: { normalizedBaseUrl: false },
      })
      expect(mocks.prepareMigrationBaseUrl).toHaveBeenCalledWith(
        baseUrl,
        OctopusOutboundType.Volcengine,
        undefined,
      )
    },
  )

  it.each([
    [MANAGED_SITE_MUTATION_OUTCOMES.Succeeded, "created"],
    [MANAGED_SITE_MUTATION_OUTCOMES.Rejected, "failed"],
    [MANAGED_SITE_MUTATION_OUTCOMES.Partial, "uncertain"],
    [MANAGED_SITE_MUTATION_OUTCOMES.Uncertain, "uncertain"],
  ])(
    "maps native create outcome %s without replaying",
    async (outcome, status) => {
      mocks.create.mockResolvedValue({ outcome })
      const { projection } = await capability.target!.prepare(source)
      await expect(
        capability.target!.create({
          source,
          targetSiteType: SITE_TYPES.OCTOPUS,
          projection: { ...projection, name: "Migrated channel" },
          credential: "credential-placeholder",
        }),
      ).resolves.toMatchObject({ status })
      expect(mocks.create).toHaveBeenCalledTimes(1)
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Migrated channel",
          type: OctopusOutboundType.OpenAIChat,
          model: "model-a",
          enabled: false,
          key: "credential-placeholder",
        }),
        undefined,
      )
    },
  )

  it.each([
    { type: "999" },
    { name: " " },
    { baseUrl: "javascript:invalid" },
    { baseUrl: "https://user:password@example.invalid" },
    { models: [] },
  ])("rejects malformed target projections %j", async (overrides) => {
    const { projection } = await capability.target!.prepare(source)
    await expect(
      capability.target!.create({
        source,
        targetSiteType: SITE_TYPES.OCTOPUS,
        projection: { ...projection, name: "Migrated channel", ...overrides },
        credential: "credential-placeholder",
      }),
    ).resolves.toMatchObject({ status: "failed" })
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
