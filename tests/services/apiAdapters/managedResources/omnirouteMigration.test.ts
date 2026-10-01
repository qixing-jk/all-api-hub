import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { omniRouteManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/omnirouteMigration"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationExecutionCommand,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
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

const BASE_URL = "https://omniroute.example.invalid"
const SCOPE_KEY = "https://omniroute.example.invalid"
const config = { baseUrl: BASE_URL, token: "oma_live_example" }

const ref = (resourceId: string) => ({
  siteType: SITE_TYPES.OMNIROUTE,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: SCOPE_KEY,
  resourceId,
})

const newApiSource = (
  overrides: Partial<ManagedSiteMigrationSource> = {},
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: 1,
  baseUrl: "https://relay.example.invalid/v1",
  models: ["gpt-example"],
  groups: ["default"],
  status: "enabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
  ...overrides,
})

const command = (
  source: ManagedSiteMigrationSource,
  type: string | number,
): ManagedSiteMigrationExecutionCommand => ({
  source,
  targetSiteType: SITE_TYPES.OMNIROUTE,
  projection: {
    name: "Migrated channel",
    type,
    baseUrl: source.baseUrl,
    models: [...source.models],
    groups: [],
    enabled: true,
  },
  credential: "sk-migrated",
})

describe("OmniRoute migration capability", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ omniroute: config })
  })

  it("is registered for the site type", () => {
    expect(resolveManagedSiteMigrationCapability(SITE_TYPES.OMNIROUTE)).toBe(
      omniRouteManagedSiteMigrationCapability,
    )
  })

  it("validates selection scope and blocks foreign selections without reading them", async () => {
    const selection = {
      selectionId: "conn-1",
      displayName: "Primary",
      ref: ref("conn-1"),
    }
    const foreign = {
      ...selection,
      ref: { ...selection.ref, scopeKey: "https://foreign.invalid" },
    }
    const context =
      await omniRouteManagedSiteMigrationCapability.source!
        .createSelectionValidationContext!()
    expect(context.isValid(selection)).toBe(true)
    expect(context.isValid(foreign)).toBe(false)
    await expect(
      omniRouteManagedSiteMigrationCapability.source!.prepare(foreign),
    ).resolves.toMatchObject({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    await expect(
      omniRouteManagedSiteMigrationCapability.source!.resolveCredential(
        foreign,
      ),
    ).resolves.toMatchObject({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("propagates cancellation rather than reporting a blocked credential", async () => {
    const selection = {
      selectionId: "conn-1",
      displayName: "Primary",
      ref: ref("conn-1"),
    }
    const options = { signal: AbortSignal.abort() }
    await expect(
      omniRouteManagedSiteMigrationCapability.source!.prepare(
        selection,
        options,
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      omniRouteManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
        options,
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      omniRouteManagedSiteMigrationCapability.target!.create(
        command(newApiSource(), "openai"),
        options,
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("normalizes a transport cancellation during the source read", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new DOMException("Aborted", "AbortError"))
    try {
      await expect(
        omniRouteManagedSiteMigrationCapability.source!.prepare({
          selectionId: "conn-1",
          displayName: "Primary",
          ref: ref("conn-1"),
        }),
      ).rejects.toMatchObject({ name: "AbortError" })
    } finally {
      fetch.mockRestore()
    }
  })

  it.each([
    undefined,
    { baseUrl: "ftp://gateway.invalid", token: config.token },
  ])(
    "reports an unavailable migration target for bad configuration %j",
    async (omniroute) => {
      mocks.getPreferences.mockResolvedValue({ omniroute })
      await expect(
        omniRouteManagedSiteMigrationCapability.target!.create(
          command(newApiSource(), "openai"),
        ),
      ).resolves.toEqual({
        status: "failed",
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
      })
    },
  )

  it("reports unexpected preference failures separately", async () => {
    mocks.getPreferences.mockRejectedValue(new Error("storage unavailable"))
    await expect(
      omniRouteManagedSiteMigrationCapability.target!.create(
        command(newApiSource(), "openai"),
      ),
    ).resolves.toEqual({
      status: "failed",
      failureCode: MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.Unexpected,
    })
  })

  it("rejects commands for another target before dispatch", async () => {
    await expect(
      omniRouteManagedSiteMigrationCapability.target!.create({
        ...command(newApiSource(), "openai"),
        targetSiteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({
      status: "failed",
      failureCode:
        MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
    })
  })

  it("prepares a built-in provider connection as a migration source", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({
          connection: {
            id: "conn-1",
            provider: "openai",
            name: "Primary",
            isActive: true,
            providerSpecificData: {
              baseUrl: "https://relay.example.invalid/v1",
            },
          },
        }),
      ),
    )

    const result =
      await omniRouteManagedSiteMigrationCapability.source!.prepare({
        selectionId: "conn-1",
        displayName: "Primary",
        ref: ref("conn-1"),
      })

    expect(result).toEqual({
      status: "ready",
      source: {
        sourceSiteType: SITE_TYPES.OMNIROUTE,
        resourceType: "openai",
        baseUrl: "https://relay.example.invalid/v1",
        models: [],
        groups: [],
        status: "enabled",
        lossSignals: {
          hasModelMapping: false,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: false,
          hasMultiKeyState: false,
        },
      },
    })
  })

  it("flags a node-backed connection's lost model prefix", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-2`, () =>
        HttpResponse.json({
          connection: {
            id: "conn-2",
            provider: "openai-compatible-chat-1",
            name: "Node backed",
            isActive: false,
            providerSpecificData: {
              prefix: "relay",
              baseUrl: "https://relay.example.invalid/v1",
            },
          },
        }),
      ),
    )

    const result =
      await omniRouteManagedSiteMigrationCapability.source!.prepare({
        selectionId: "conn-2",
        displayName: "Node backed",
        ref: ref("conn-2"),
      })

    // The generated provider id is not in the route table, so the type is
    // unsupported rather than guessed from its OpenAI-compatible shape.
    expect(result).toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
  })

  it("resolves a source credential only through the explicit client route", async () => {
    const readPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({
          connection: {
            id: "conn-1",
            provider: "openai",
            name: "Primary",
            isActive: true,
          },
        }),
      ),
      http.get(`${BASE_URL}/api/providers/client`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({
          connections: [
            { id: "conn-1", provider: "openai", apiKey: "sk-plaintext" },
          ],
        })
      }),
    )

    const result =
      await omniRouteManagedSiteMigrationCapability.source!.resolveCredential({
        selectionId: "conn-1",
        displayName: "Primary",
        ref: ref("conn-1"),
      })

    expect(result).toEqual({ status: "ready", credential: "sk-plaintext" })
    expect(readPaths).toEqual(["/api/providers/client"])
  })

  it("blocks when the deployment stops returning a readable credential", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({
          connection: {
            id: "conn-1",
            provider: "openai",
            name: "Primary",
            isActive: true,
          },
        }),
      ),
      http.get(`${BASE_URL}/api/providers/client`, () =>
        HttpResponse.json({
          connections: [
            { id: "conn-1", provider: "openai", apiKey: "sk-a****z" },
          ],
        }),
      ),
    )

    const result =
      await omniRouteManagedSiteMigrationCapability.source!.resolveCredential({
        selectionId: "conn-1",
        displayName: "Primary",
        ref: ref("conn-1"),
      })

    expect(result).toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("maps a New API OpenAI channel onto the built-in OpenAI provider", async () => {
    const result =
      await omniRouteManagedSiteMigrationCapability.target!.prepare(
        newApiSource(),
      )

    expect(result.projection).toEqual({
      name: "",
      type: "openai",
      baseUrl: "https://relay.example.invalid/v1",
      models: ["gpt-example"],
      groups: [],
      enabled: true,
    })
    expect(result.adjustments).toMatchObject({ remappedType: false })
  })

  it("refuses a source type with no explicit route", async () => {
    await expect(
      omniRouteManagedSiteMigrationCapability.target!.prepare(
        newApiSource({ resourceType: 999 }),
      ),
    ).rejects.toThrow(/does not support this migration channel type/)
  })

  it("creates a relay connection with the override and no default model", async () => {
    let created: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            connection: { id: "conn-9", provider: "openai", name: "Migrated" },
          },
          { status: 201 },
        )
      }),
    )

    const source = newApiSource()
    const result = await omniRouteManagedSiteMigrationCapability.target!.create(
      command(source, "openai"),
    )

    expect(result).toEqual({ status: "created" })
    expect(created).toEqual({
      provider: "openai",
      name: "Migrated channel",
      apiKey: "sk-migrated",
      providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
    })
    // A channel stores no model list, and guessing a default model would route
    // unspecified traffic.
    expect(created).not.toHaveProperty("defaultModel")
  })

  it("keeps a first-party endpoint on its provider's own configuration", async () => {
    let created: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            connection: {
              id: "conn-9",
              provider: "deepseek",
              name: "Migrated",
            },
          },
          { status: 201 },
        )
      }),
    )

    const source = newApiSource({
      resourceType: 1,
      baseUrl: "https://api.deepseek.com",
    })
    await omniRouteManagedSiteMigrationCapability.target!.create(
      command(source, "deepseek"),
    )

    expect(created).toEqual({
      provider: "deepseek",
      name: "Migrated channel",
      apiKey: "sk-migrated",
    })
  })

  it("reports a rejected create as a target rejection", async () => {
    server.use(
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          { error: "A connection with this name already exists" },
          { status: 409 },
        ),
      ),
    )

    const result = await omniRouteManagedSiteMigrationCapability.target!.create(
      command(newApiSource(), "openai"),
    )

    expect(result).toEqual({
      status: "failed",
      failureCode:
        MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
    })
  })

  it("reports an unconfirmed create as uncertain", async () => {
    server.use(
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          { error: "Failed to create provider" },
          { status: 500 },
        ),
      ),
    )

    const result = await omniRouteManagedSiteMigrationCapability.target!.create(
      command(newApiSource(), "openai"),
    )

    expect(result).toEqual({ status: "uncertain" })
  })
})
