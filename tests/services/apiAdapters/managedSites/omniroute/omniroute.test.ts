import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveOmniRouteBuiltinProvider } from "~/constants/omniroute"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { omniRouteManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/omniroute"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
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
const config = { baseUrl: BASE_URL, token: "oma_live_example" }

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "conn-1",
  provider: "openai",
  name: "Primary",
  apiKey: "sk-aaaaaaa****bbbb",
  providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
  defaultModel: "gpt-example",
  isActive: true,
  ...overrides,
})

describe("OmniRoute managed-site capabilities", () => {
  it.each([
    ["sk-abcde****1234", [{ prefix: "sk-abcde", suffix: "1234" }]],
    ["********", undefined],
    ["sk-abcde…1234", [{ prefix: "sk-abcde", suffix: "1234" }]],
    ["sk-ab**12", [{ prefix: "sk-ab", suffix: "12" }]],
    ["sk-abcde**ab**1234", undefined],
    ["sk-plaintext-secret", undefined],
  ])(
    "preserves only anchored evidence from masked inventory: %s",
    async (apiKey, expected) => {
      server.use(
        http.get(`${BASE_URL}/api/providers`, () =>
          HttpResponse.json({ connections: [connection({ apiKey })] }),
        ),
      )
      const result = await omniRouteManagedSiteCapabilities.matching.search(
        config,
        "https://relay.example.invalid/v1",
      )
      expect(result?.items[0]?.keyMasks).toEqual(expected)
      expect(result?.items[0]?.key).toBe("")
      expect(JSON.stringify(result)).not.toContain("sk-plaintext-secret")
    },
  )

  beforeEach(() => {
    vi.resetAllMocks()
    server.resetHandlers()
    mocks.getPreferences.mockResolvedValue({ omniroute: config })
  })

  it("is the registered capability set for the site type", () => {
    expect(getManagedSiteCapabilities(SITE_TYPES.OMNIROUTE)).toBe(
      omniRouteManagedSiteCapabilities,
    )
    expect(omniRouteManagedSiteCapabilities.siteType).toBe(SITE_TYPES.OMNIROUTE)
    expect("models" in omniRouteManagedSiteCapabilities).toBe(false)
    expect(omniRouteManagedSiteCapabilities.matching.exactMatchBasis).toBe(
      "url-key",
    )
  })

  it("checks scope before reading an opaque channel credential", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/client`, () =>
        HttpResponse.json({
          connections: [connection({ apiKey: "sk-readable" })],
        }),
      ),
    )
    const ref = {
      siteType: SITE_TYPES.OMNIROUTE,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "conn-1",
    }
    await expect(
      omniRouteManagedSiteCapabilities.matching.fetchSecretKey!(config, ref),
    ).resolves.toBe("sk-readable")
    await expect(
      omniRouteManagedSiteCapabilities.matching.fetchSecretKey!(config, {
        ...ref,
        scopeKey: "https://foreign.invalid",
      }),
    ).rejects.toThrow()
  })

  it("shares one plaintext inventory between different refs in a batch and refreshes the next batch", async () => {
    let reads = 0
    server.use(
      http.get(`${BASE_URL}/api/providers/client`, () => {
        reads += 1
        return HttpResponse.json({
          connections: [
            connection({ apiKey: "secret-one" }),
            connection({ id: "conn-2", apiKey: "secret-two" }),
          ],
        })
      }),
    )
    const ref = {
      siteType: SITE_TYPES.OMNIROUTE,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: BASE_URL,
      resourceId: "conn-1",
    }
    const options = {
      inventoryCache: new Map(),
      protectionBypassExecution: {
        version: 2 as const,
        kind: "automatic" as const,
        feature: "managed_site_channels" as const,
        trigger: "background_recovery" as const,
        surface: "background" as const,
      },
    }
    const read = omniRouteManagedSiteCapabilities.matching.fetchSecretKey!
    await expect(read(config, ref, options)).resolves.toBe("secret-one")
    await expect(
      read(config, { ...ref, resourceId: "conn-2" }, options),
    ).resolves.toBe("secret-two")
    expect(reads).toBe(1)
    await read(config, ref, { ...options, inventoryCache: new Map() })
    expect(reads).toBe(2)
  })

  it("matches channels by their connection-level address without a credential", async () => {
    const readPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({
          connections: [
            connection(),
            connection({
              id: "conn-2",
              name: "Other",
              providerSpecificData: {
                baseUrl: "https://elsewhere.example.invalid/v1",
              },
            }),
          ],
        })
      }),
    )

    const result = await omniRouteManagedSiteCapabilities.matching.search(
      config,
      "https://relay.example.invalid/v1",
    )

    expect(result?.items).toEqual([
      {
        ref: {
          siteType: SITE_TYPES.OMNIROUTE,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: BASE_URL,
          resourceId: "conn-1",
        },
        name: "Primary",
        type: "openai",
        base_url: "https://relay.example.invalid/v1",
        models: "",
        key: "",
        keyMasks: [{ prefix: "sk-aaaaaaa", suffix: "bbbb" }],
      },
    ])
    // Matching reads the masked list route only.
    expect(readPaths).toEqual(["/api/providers"])
  })

  it("targets a known first-party endpoint's provider for import drafts", async () => {
    const draft =
      await omniRouteManagedSiteCapabilities.channelDrafts.prepareFormData({
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "sk-source",
        modelHints: [],
      })

    expect(draft).toMatchObject({ type: "deepseek", base_url: "" })
    expect(resolveOmniRouteBuiltinProvider("https://api.deepseek.com")).toBe(
      "deepseek",
    )
  })

  it("matches a first-party channel whose connection stores no override", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({
          connections: [
            connection({
              id: "conn-1",
              name: "OpenAI",
              provider: "openai",
              // Imported from a known first-party endpoint, so the gateway
              // serves the provider's own URL and no override is stored.
              providerSpecificData: {},
            }),
          ],
        }),
      ),
    )

    const result = await omniRouteManagedSiteCapabilities.matching.search(
      config,
      "https://api.openai.com/v1",
    )

    expect(result?.items).toHaveLength(1)
    expect(result?.items[0]).toMatchObject({
      ref: {
        siteType: SITE_TYPES.OMNIROUTE,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: BASE_URL,
        resourceId: "conn-1",
      },
      name: "OpenAI",
      type: "openai",
    })
  })

  it("does not match a channel whose address merely starts with the search target", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({
          connections: [
            connection({
              id: "conn-1",
              name: "Relay",
              // The searched baseUrl is a URL prefix, not the stored address.
              providerSpecificData: {
                baseUrl: "https://relay.example.invalid/v1-proxy",
              },
            }),
          ],
        }),
      ),
    )

    const result = await omniRouteManagedSiteCapabilities.matching.search(
      config,
      "https://relay.example.invalid/v1",
    )

    expect(result?.items).toEqual([])
  })

  it("offers the deployment's model catalogue without a group concept", async () => {
    server.use(
      http.get(`${BASE_URL}/api/models`, () =>
        HttpResponse.json({
          models: [
            { provider: "openai", model: "gpt-example" },
            { provider: "openai", model: "gpt-other" },
          ],
        }),
      ),
    )

    await expect(
      omniRouteManagedSiteCapabilities.queries?.accountAvailableModels?.fetch(
        config,
      ),
    ).resolves.toEqual(["gpt-example", "gpt-other"])
    expect(
      omniRouteManagedSiteCapabilities.queries?.siteUserGroups,
    ).toBeUndefined()
  })
})
