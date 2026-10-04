import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { gptLoadManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/gptLoadMigration"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migrationTypeRoutes"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import type { ManagedSiteMigrationSelection } from "~/types/managedSiteMigrationCapability"
import { server } from "~~/tests/msw/server"

const mocks = vi.hoisted(() => ({ getPreferences: vi.fn() }))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mocks.getPreferences,
    },
  }
})

const BASE_URL = "https://gpt-load.example.invalid"
const config = { baseUrl: BASE_URL, managementKey: "auth-key-example" }

const envelope = (data: unknown) =>
  HttpResponse.json({ code: 0, message: "ok", data })

const selection = (resourceId: string): ManagedSiteMigrationSelection => ({
  selectionId: `sel-${resourceId}`,
  displayName: `group-${resourceId}`,
  ref: {
    siteType: SITE_TYPES.GPT_LOAD,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: BASE_URL,
    resourceId,
  },
})

/** Detail view for group 1, plus a reveal handler for each credential row. */
const useGroupDetailHandlers = (overrides?: {
  channelId?: string
  credentialIds?: number[]
}) => {
  const channelId = overrides?.channelId ?? "openai_compatible"
  const credentialIds = overrides?.credentialIds ?? [11, 12]
  server.use(
    http.get(`${BASE_URL}/api/groups/1/settings`, () =>
      envelope({
        name: "Primary",
        channel_id: channelId,
        params: { base_url: "https://relay.example.invalid/v1" },
        enabled: true,
        price_multiplier: "1",
      }),
    ),
    http.get(`${BASE_URL}/api/groups/1/models`, () =>
      envelope({ items: [{ id: "gpt-example" }] }),
    ),
    http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
      envelope({
        items: credentialIds.map((id) => ({
          credential_id: id,
          mask: `sk-****${id}`,
          effective_status: "available",
        })),
      }),
    ),
    ...credentialIds.map((id) =>
      http.post(`${BASE_URL}/api/groups/1/credentials/${id}/reveal`, () =>
        envelope({
          credential_id: id,
          credential: { api_key: `sk-real-${id}` },
        }),
      ),
    ),
  )
}

describe("gpt-load migration routing", () => {
  it("blocks the entire source credential pool when a later reveal fails", async () => {
    mocks.getPreferences.mockResolvedValue({ gptLoad: config })
    useGroupDetailHandlers()
    server.use(
      http.post(`${BASE_URL}/api/groups/1/credentials/12/reveal`, () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "expired" },
          { status: 401 },
        ),
      ),
    )
    await expect(
      gptLoadManagedSiteMigrationCapability.source!.resolveCredential(
        selection("1"),
      ),
    ).resolves.toMatchObject({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("admits the drivers it has a route for and rejects the rest", () => {
    expect(
      isManagedSiteMigrationSourceType(SITE_TYPES.GPT_LOAD, "openai"),
    ).toBe(true)
    expect(
      isManagedSiteMigrationSourceType(
        SITE_TYPES.GPT_LOAD,
        "openai_compatible",
      ),
    ).toBe(true)
    expect(
      isManagedSiteMigrationSourceType(SITE_TYPES.GPT_LOAD, "google_vertex"),
    ).toBe(true)
    // No route table row exists for these drivers, so they must not guess one.
    expect(isManagedSiteMigrationSourceType(SITE_TYPES.GPT_LOAD, "grok")).toBe(
      false,
    )
    expect(
      isManagedSiteMigrationSourceType(SITE_TYPES.GPT_LOAD, "cerebras"),
    ).toBe(false)
  })

  it("maps a New API OpenAI channel into the gpt-load openai driver", () => {
    const result = resolveManagedSiteMigrationType(
      { sourceSiteType: SITE_TYPES.NEW_API, resourceType: 1 },
      SITE_TYPES.GPT_LOAD,
    )
    expect(result).toEqual({
      status: "mapped",
      value: "openai",
      remappedType: false,
    })
  })

  it("is registered as a migration capability", () => {
    expect(resolveManagedSiteMigrationCapability(SITE_TYPES.GPT_LOAD)).toBe(
      gptLoadManagedSiteMigrationCapability,
    )
  })
})

describe("gpt-load migration source", () => {
  it("normalizes mid-reveal cancellation and prevents a partial migration", async () => {
    useGroupDetailHandlers()
    const controller = new AbortController()
    server.use(
      http.post(`${BASE_URL}/api/groups/1/credentials/11/reveal`, () => {
        controller.abort()
        return envelope({ credential: { api_key: "sk-first" } })
      }),
    )
    await expect(
      gptLoadManagedSiteMigrationCapability.source!.resolveCredential(
        selection("1"),
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
  it("validates source scope and blocks invalid identities", async () => {
    const context =
      await gptLoadManagedSiteMigrationCapability.source!
        .createSelectionValidationContext!()
    expect(context.isValid(selection("1"))).toBe(true)
    const wrongScope = {
      ...selection("1"),
      ref: { ...selection("1").ref, scopeKey: "https://other.invalid" },
    }
    expect(context.isValid(wrongScope)).toBe(false)
    for (const invalid of [wrongScope, selection("0"), selection("NaN")]) {
      expect(
        await gptLoadManagedSiteMigrationCapability.source!.prepare(invalid),
      ).toMatchObject({ status: "blocked" })
      expect(
        await gptLoadManagedSiteMigrationCapability.source!.resolveCredential(
          invalid,
        ),
      ).toMatchObject({ status: "blocked" })
    }
  })

  it("reports missing plaintext and propagates cancellation", async () => {
    useGroupDetailHandlers({ credentialIds: [] })
    expect(
      await gptLoadManagedSiteMigrationCapability.source!.resolveCredential(
        selection("1"),
      ),
    ).toMatchObject({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
    const controller = new AbortController()
    controller.abort()
    await expect(
      gptLoadManagedSiteMigrationCapability.source!.prepare(selection("1"), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      gptLoadManagedSiteMigrationCapability.source!.resolveCredential(
        selection("1"),
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ gptLoad: config })
  })

  it("prepares a multi-key group as a ready source", async () => {
    useGroupDetailHandlers()

    const prepared =
      await gptLoadManagedSiteMigrationCapability.source!.prepare(
        selection("1"),
      )
    expect(prepared.status).toBe("ready")
    if (prepared.status !== "ready") throw prepared
    expect(prepared.source).toMatchObject({
      sourceSiteType: SITE_TYPES.GPT_LOAD,
      resourceType: "openai_compatible",
      baseUrl: "https://relay.example.invalid/v1",
      models: ["gpt-example"],
      status: "enabled",
    })
    expect(prepared.source.lossSignals.hasMultiKeyState).toBe(true)
    expect(prepared.source.credentialMetadata).toHaveLength(2)
  })

  it("blocks a driver with no migration route", async () => {
    useGroupDetailHandlers({ channelId: "grok" })

    await expect(
      gptLoadManagedSiteMigrationCapability.source!.prepare(selection("1")),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
  })

  it("blocks a group with no credentials", async () => {
    useGroupDetailHandlers({ credentialIds: [] })

    await expect(
      gptLoadManagedSiteMigrationCapability.source!.prepare(selection("1")),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("reveals the whole pool for a multi-key migration", async () => {
    useGroupDetailHandlers()

    const resolved =
      await gptLoadManagedSiteMigrationCapability.source!.resolveCredential(
        selection("1"),
      )
    expect(resolved.status).toBe("ready")
    if (resolved.status !== "ready") throw resolved
    expect(resolved.credential).toBe("sk-real-11")
    expect(resolved.credentials).toEqual([
      { value: "sk-real-11", enabled: true },
      { value: "sk-real-12", enabled: true },
    ])
  })
})

describe("gpt-load migration target", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ gptLoad: config })
  })

  const newApiOpenAiSource = {
    sourceSiteType: SITE_TYPES.NEW_API,
    resourceType: 1,
    baseUrl: "https://relay.example.invalid/v1",
    models: ["gpt-example"],
    groups: [],
    status: "enabled" as const,
    lossSignals: {
      hasModelMapping: false,
      hasStatusCodeMapping: false,
      hasAdvancedSettings: false,
      hasMultiKeyState: false,
    },
  }

  const targetCommand = () => ({
    source: newApiOpenAiSource,
    targetSiteType: SITE_TYPES.GPT_LOAD,
    projection: {
      name: "Test",
      type: "openai",
      baseUrl: "",
      models: [],
      groups: [],
      enabled: true,
    },
    credential: "sk-fake",
  })

  it.each([
    [400, "failed"],
    [500, "uncertain"],
  ])("preserves target mutation certainty (%s)", async (status, outcome) => {
    server.use(
      http.post(`${BASE_URL}/api/groups`, () =>
        HttpResponse.json({ code: "FAILED", message: "failed" }, { status }),
      ),
    )
    expect(
      await gptLoadManagedSiteMigrationCapability.target!.create(
        targetCommand(),
      ),
    ).toMatchObject({ status: outcome })
  })

  it("rejects invalid target input without writing and reports unavailable config", async () => {
    const target = gptLoadManagedSiteMigrationCapability.target!
    expect(
      await target.create({
        ...targetCommand(),
        targetSiteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({ status: "failed" })
    expect(
      await target.create({ ...targetCommand(), credential: " " }),
    ).toMatchObject({ status: "failed" })
    mocks.getPreferences.mockResolvedValue({})
    expect(await target.create(targetCommand())).toMatchObject({
      status: "failed",
      failureCode: "target_unavailable",
    })
    mocks.getPreferences.mockRejectedValue(new Error("storage failed"))
    expect(await target.create(targetCommand())).toMatchObject({
      status: "failed",
      failureCode: "unexpected",
    })
  })

  it("propagates cancellation before target dispatch", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      gptLoadManagedSiteMigrationCapability.target!.create(targetCommand(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("prepares a target projection with the mapped driver", async () => {
    const prepared =
      await gptLoadManagedSiteMigrationCapability.target!.prepare(
        newApiOpenAiSource,
      )
    expect(prepared.projection).toMatchObject({
      type: "openai",
      baseUrl: "https://relay.example.invalid/v1",
      models: ["gpt-example"],
      enabled: true,
    })
    expect(prepared.adjustments.remappedType).toBe(false)
  })

  it("throws for a source type gpt-load cannot express", async () => {
    await expect(
      gptLoadManagedSiteMigrationCapability.target!.prepare({
        ...newApiOpenAiSource,
        resourceType: 999,
      }),
    ).rejects.toThrow(/does not support this migration channel type/)
  })

  it("supports multiple credentials", () => {
    expect(
      gptLoadManagedSiteMigrationCapability.target!
        .supportsMultipleCredentials!(newApiOpenAiSource),
    ).toBe(true)
  })

  it("creates a group with the base-url override and every key", async () => {
    let seenBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/groups`, async ({ request }) => {
        seenBody = await request.json()
        return envelope({
          group_id: 42,
          group_name: "Migrated",
          credentials_added: 2,
          credentials_duplicated: 0,
        })
      }),
    )

    const result = await gptLoadManagedSiteMigrationCapability.target!.create({
      source: newApiOpenAiSource,
      targetSiteType: SITE_TYPES.GPT_LOAD,
      projection: {
        name: "Migrated",
        type: "openai_compatible",
        baseUrl: "https://relay.example.invalid/v1",
        models: ["gpt-example"],
        groups: [],
        enabled: true,
      },
      credential: "sk-first",
      credentials: [
        { value: "sk-first", enabled: true },
        { value: "sk-second", enabled: true },
      ],
    })

    expect(result).toEqual({ status: "created" })
    expect(seenBody).toMatchObject({
      name: "Migrated",
      channel_id: "openai_compatible",
      params: { base_url: "https://relay.example.invalid/v1" },
      credentials: "sk-first\nsk-second",
    })
  })

  it("keeps the driver default when the source address is that driver's own", async () => {
    let seenBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/groups`, async ({ request }) => {
        seenBody = await request.json()
        return envelope({ group_id: 43, group_name: "DeepSeek" })
      }),
    )

    await gptLoadManagedSiteMigrationCapability.target!.create({
      source: newApiOpenAiSource,
      targetSiteType: SITE_TYPES.GPT_LOAD,
      projection: {
        name: "DeepSeek",
        type: "deepseek",
        baseUrl: "https://api.deepseek.com",
        models: [],
        groups: [],
        enabled: true,
      },
      credential: "sk-deepseek",
    })

    expect(seenBody).toMatchObject({ channel_id: "deepseek", params: {} })
  })
})
