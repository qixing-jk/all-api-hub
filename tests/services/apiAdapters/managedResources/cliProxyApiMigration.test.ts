import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { cliProxyApiManagedSiteMigrationCapability as capability } from "~/services/apiAdapters/managedResources/cliProxyApiMigration"
import type { CliProxyApiResource } from "~/services/apiService/cliProxyApi"
import {
  planMigrationCredentials,
  resolveMigrationCredentials,
} from "~/services/managedSites/channelMigrationCredentials"
import type {
  ManagedSiteMigrationSelection,
  ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  config: vi.fn(),
}))
vi.mock(
  "~/services/apiAdapters/managedResources/cliProxyApi",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiAdapters/managedResources/cliProxyApi")
    >()),
    getCliProxyApiResource: mocks.get,
    createCliProxyApiResource: mocks.create,
  }),
)
vi.mock("~/services/managedSites/runtimeConfig", async (original) => ({
  ...(await original<typeof import("~/services/managedSites/runtimeConfig")>()),
  getManagedSiteRuntimeConfigForType: mocks.config,
}))
const selection: ManagedSiteMigrationSelection = {
  selectionId: "provider",
  displayName: "Example",
  ref: {
    siteType: SITE_TYPES.CLI_PROXY_API,
    kind: "channel",
    scopeKey: "https://cli.example.invalid/v0/management",
    resourceId: "opaque",
  },
}
const resource: CliProxyApiResource = {
  id: "opaque",
  kind: "openai-compatibility",
  value: {
    name: "Example",
    "base-url": "https://upstream.example.invalid/v1",
    "api-key-entries": [
      { "api-key": "first-placeholder" },
      {
        "api-key": "second-placeholder",
        "proxy-url": "http://proxy.example.invalid",
      },
    ],
    models: [{ name: "upstream-model", alias: "local-model" }],
    disabled: true,
  },
}
const source: ManagedSiteMigrationSource = {
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: 1,
  baseUrl: "https://upstream.example.invalid/v1",
  models: ["upstream-model"],
  groups: ["default"],
  priority: 2,
  weight: 3,
  status: "disabled",
  credentialMetadata: [{ enabled: true }, { enabled: true }],
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.config.mockResolvedValue({
    config: {
      baseUrl: "https://cli.example.invalid",
      adminToken: "placeholder-admin",
    },
  })
  mocks.get.mockResolvedValue(resource)
  mocks.create.mockResolvedValue({ outcome: "succeeded" })
})
describe("CLIProxyAPI native migration", () => {
  it("requires a configured management endpoint before accessing credentials", async () => {
    mocks.config.mockResolvedValue(null)
    await expect(
      capability.source!.resolveCredential(selection),
    ).rejects.toThrow("configuration required")
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it("validates a selection context and rejects stale credential reads", async () => {
    const context = await capability.source!.createSelectionValidationContext!()
    expect(context.isValid(selection)).toBe(true)
    const stale = {
      ...selection,
      ref: { ...selection.ref, scopeKey: "https://stale.invalid" },
    }
    expect(context.isValid(stale)).toBe(false)
    expect(await capability.source!.resolveCredential(stale)).toMatchObject({
      status: "blocked",
    })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    "preserves a single provider's priority and excluded status: %s",
    async (excluded) => {
      mocks.get.mockResolvedValue({
        ...resource,
        kind: "claude-api-key",
        value: {
          "api-key": "placeholder",
          priority: 7,
          "excluded-models": excluded ? ["*"] : [],
        },
      })
      const prepared = await capability.source!.prepare(selection)
      expect(prepared).toMatchObject({
        source: { priority: 7, status: excluded ? "disabled" : "enabled" },
      })
      if (prepared.status !== "ready") throw new Error("Expected source")
      expect(prepared.source.credentialMetadata).toBeUndefined()
      expect(await capability.source!.resolveCredential(selection)).toEqual({
        status: "ready",
        credential: "placeholder",
      })
    },
  )

  it("blocks missing credentials at execution", async () => {
    mocks.get.mockResolvedValue({
      ...resource,
      value: { "api-key-entries": [] },
    })
    expect(await capability.source!.resolveCredential(selection)).toMatchObject(
      { status: "blocked", reasonCode: "source-key-missing" },
    )
  })

  it.each([
    { resourceType: 9999 },
    { baseUrl: "ftp://example.invalid" },
    { models: [] },
  ])("rejects unsupported target drafts: %j", async (override) => {
    await expect(
      capability.target!.prepare({ ...source, ...override }),
    ).rejects.toThrow()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it.each(["route", "masked", "disabled"])(
    "rejects invalid commands before mutation: %s",
    async (mode) => {
      const prepared = await capability.target!.prepare(source)
      expect(
        await capability.target!.create({
          source,
          targetSiteType: SITE_TYPES.CLI_PROXY_API,
          projection: {
            ...prepared.projection,
            ...(mode === "route" ? { type: "wrong" } : {}),
          },
          credential: "placeholder",
          credentials: [
            {
              value: mode === "masked" ? "sk-********" : "placeholder",
              enabled: mode !== "disabled",
            },
          ],
        }),
      ).toMatchObject({ status: "failed" })
      expect(mocks.create).not.toHaveBeenCalled()
    },
  )

  it("keeps an enabled standalone provider enabled and surfaces target rejection", async () => {
    const input = { ...source, resourceType: 14, status: "enabled" as const }
    const prepared = await capability.target!.prepare(input)
    mocks.create.mockResolvedValue({ outcome: "rejected" })
    expect(
      await capability.target!.create({
        source: input,
        targetSiteType: SITE_TYPES.CLI_PROXY_API,
        projection: prepared.projection,
        credential: "placeholder",
      }),
    ).toMatchObject({ status: "failed" })
    expect(mocks.create.mock.calls[0][1].value).not.toHaveProperty(
      "excluded-models",
    )
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it.each([{ weights: [undefined, 0, -1, 2] }, { weights: [0] }])(
    "preserves excluded key weights through split target creation: $weights",
    async ({ weights }) => {
      const entries = weights.map((weight, index) => ({
        "api-key": `placeholder-${index}`,
        ...(weight === undefined ? {} : { weight }),
      }))
      mocks.get.mockResolvedValue({
        ...resource,
        value: {
          ...resource.value,
          disabled: false,
          "api-key-entries": entries,
        },
      })
      const preparedSource = await capability.source!.prepare(selection)
      const resolved = await capability.source!.resolveCredential(selection)
      if (preparedSource.status !== "ready" || resolved.status !== "ready")
        throw new Error("Expected ready source")
      const enabled = weights.map(
        (weight) => weight === undefined || weight > 0,
      )
      expect(preparedSource.source.credentialMetadata).toEqual(
        enabled.map((enabled) => ({ enabled })),
      )
      expect(resolved.credentials?.map((key) => key.enabled)).toEqual(enabled)
      const target = await capability.target!.prepare(preparedSource.source)
      const preview = planMigrationCredentials(
        {
          sourceSiteType: SITE_TYPES.CLI_PROXY_API,
          targetSiteType: SITE_TYPES.CLI_PROXY_API,
          generalWarningCodes: [],
          totalCount: 1,
          readyCount: 1,
          blockedCount: 0,
          items: [
            {
              status: "ready",
              selection,
              source: preparedSource.source,
              target,
              warningCodes: [],
            },
          ],
        },
        capability.target!.supportsMultipleCredentials!,
      )
      expect(preview.items).toHaveLength(weights.length)
      for (const item of preview.items) {
        if (item.status !== "ready") throw new Error("Expected ready item")
        const credential = resolveMigrationCredentials(item, resolved)
        if (credential.status !== "ready")
          throw new Error("Expected ready credential")
        await capability.target!.create({
          source: item.source,
          targetSiteType: SITE_TYPES.CLI_PROXY_API,
          projection: item.target.projection,
          credential: credential.credential,
        })
      }
      expect(
        mocks.create.mock.calls.map(([, command]) => command.value.disabled),
      ).toEqual(enabled.map((value) => !value))
    },
  )

  it("previews all key slots without secrets and discloses per-key options and aliases", async () => {
    const result = await capability.source!.prepare(selection)
    expect(result).toMatchObject({
      status: "ready",
      source: {
        models: ["upstream-model"],
        status: "disabled",
        credentialMetadata: [{ enabled: true }, { enabled: true }],
        lossSignals: { hasModelMapping: true, hasAdvancedSettings: true },
      },
    })
    expect(JSON.stringify(result)).not.toContain("placeholder")
    expect(await capability.source!.resolveCredential(selection)).toMatchObject(
      {
        status: "ready",
        credentials: [
          { value: "first-placeholder", enabled: true },
          { value: "second-placeholder", enabled: true },
        ],
      },
    )
  })
  it("preserves a standalone provider key excluded by its weight", async () => {
    mocks.get.mockResolvedValue({
      ...resource,
      kind: "claude-api-key",
      value: { "api-key": "placeholder", weight: 0 },
    })
    expect(await capability.source!.prepare(selection)).toMatchObject({
      status: "ready",
      source: { credentialMetadata: [{ enabled: false }] },
    })
    expect(await capability.source!.resolveCredential(selection)).toMatchObject(
      {
        status: "ready",
        credentials: [{ value: "placeholder", enabled: false }],
      },
    )
  })

  it("validates the configured source scope before reading", async () => {
    expect(
      await capability.source!.prepare({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://stale.example.invalid" },
      }),
    ).toMatchObject({ status: "blocked" })
    expect(mocks.get).not.toHaveBeenCalled()
  })
  it("blocks structured provider credentials and masked key lists", async () => {
    mocks.get.mockResolvedValue({ ...resource, kind: "vertex-api-key" })
    expect(await capability.source!.prepare(selection)).toMatchObject({
      status: "blocked",
      reasonCode: "source-type-unsupported",
    })
    mocks.get.mockResolvedValue({
      ...resource,
      value: {
        ...resource.value,
        "api-key-entries": [
          { "api-key": "first-placeholder" },
          { "api-key": "sk-********" },
        ],
      },
    })
    expect(await capability.source!.prepare(selection)).toMatchObject({
      status: "blocked",
      reasonCode: "source-key-missing",
    })
  })
  it("uses native grouped keys and disabled state for OpenAI-compatible targets", async () => {
    expect(capability.target!.supportsMultipleCredentials!(source)).toBe(true)
    const prepared = await capability.target!.prepare(source)
    expect(
      await capability.target!.create({
        source,
        targetSiteType: SITE_TYPES.CLI_PROXY_API,
        projection: { ...prepared.projection, name: "Migrated" },
        credential: "first-placeholder",
        credentials: [
          { value: "first-placeholder", enabled: true },
          { value: "second-placeholder", enabled: true },
        ],
      }),
    ).toEqual({ status: "created" })
    expect(mocks.create.mock.calls[0][1]).toMatchObject({
      kind: "openai-compatibility",
      value: {
        disabled: true,
        "api-key-entries": [
          { "api-key": "first-placeholder" },
          { "api-key": "second-placeholder" },
        ],
      },
    })
    expect(mocks.create.mock.calls[0][1].value).not.toHaveProperty(
      "excluded-models",
    )
  })
  it.each([
    [14, "claude-api-key"],
    [24, "gemini-api-key"],
    [48, "xai-api-key"],
    [57, "codex-api-key"],
  ] as const)(
    "uses one native provider per key for type %s",
    async (resourceType, expected) => {
      const input = { ...source, resourceType }
      expect(capability.target!.supportsMultipleCredentials!(input)).toBe(false)
      const prepared = await capability.target!.prepare(input)
      await capability.target!.create({
        source: input,
        targetSiteType: SITE_TYPES.CLI_PROXY_API,
        projection: prepared.projection,
        credential: "placeholder",
      })
      expect(mocks.create.mock.calls[0][1]).toMatchObject({
        kind: expected,
        value: { "api-key": "placeholder", "excluded-models": ["*"] },
      })
    },
  )
  it("splits mixed enabled states and never replays an uncertain create", async () => {
    expect(
      capability.target!.supportsMultipleCredentials!({
        ...source,
        credentialMetadata: [{ enabled: true }, { enabled: false }],
      }),
    ).toBe(false)
    mocks.create.mockResolvedValue({ outcome: "partial" })
    const prepared = await capability.target!.prepare(source)
    expect(
      await capability.target!.create({
        source,
        targetSiteType: SITE_TYPES.CLI_PROXY_API,
        projection: prepared.projection,
        credential: "placeholder",
      }),
    ).toEqual({ status: "uncertain" })
    expect(mocks.create).toHaveBeenCalledOnce()
  })
})
