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
