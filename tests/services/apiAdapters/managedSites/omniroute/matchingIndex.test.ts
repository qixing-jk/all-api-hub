import { beforeEach, describe, expect, it, vi } from "vitest"

import { omniRouteManagedSiteCapabilities as capabilities } from "~/services/apiAdapters/managedSites/omniroute"
import { listAllOmniRouteConnections } from "~/services/apiService/omniroute"
import { toOmniRouteSanitizedConnection } from "~/services/apiService/omniroute/redaction"

vi.mock("~/services/apiService/omniroute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/omniroute")>()),
  listAllOmniRouteConnections: vi.fn(),
}))
vi.mock("~/services/apiService/omniroute/redaction", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiService/omniroute/redaction")
    >()
  return {
    ...actual,
    toOmniRouteSanitizedConnection: vi.fn(
      actual.toOmniRouteSanitizedConnection,
    ),
  }
})
const config = { baseUrl: "https://target.invalid", token: "key" }
const rows = [
  {
    id: "1",
    name: "relay",
    provider: "openai",
    providerSpecificData: { baseUrl: "https://relay.invalid/v1" },
    apiKey: "hidden",
  },
]
describe("omniroute batch matching index", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAllOmniRouteConnections).mockResolvedValue(rows)
  })
  it("projects a retained batch inventory once and refreshes the next operation", async () => {
    const options = { inventoryCache: new Map() }
    const first = await capabilities.matching.search(
      config,
      "https://relay.invalid/v1",
      options,
    )
    const second = await capabilities.matching.search(
      config,
      "https://relay.invalid/v1",
      options,
    )
    expect(first).toEqual(second)
    expect(first?.items).toMatchObject([{ name: "relay", key: "" }])
    expect(JSON.stringify(first)).not.toContain("hidden")
    expect(listAllOmniRouteConnections).toHaveBeenCalledTimes(1)
    expect(toOmniRouteSanitizedConnection).toHaveBeenCalledTimes(1)
    await capabilities.matching.search(config, "https://relay.invalid/v1", {
      inventoryCache: new Map(),
    })
    expect(listAllOmniRouteConnections).toHaveBeenCalledTimes(2)
    expect(toOmniRouteSanitizedConnection).toHaveBeenCalledTimes(2)
  })
  it("preserves native default identities, exact overrides and inventory order", async () => {
    vi.mocked(listAllOmniRouteConnections).mockResolvedValue([
      {
        id: "1",
        name: "override-first",
        provider: "openai",
        apiKey: "hidden",
        providerSpecificData: { baseUrl: "https://api.openai.com/v1" },
      },
      { id: "2", name: "default", provider: "openai", apiKey: "hidden" },
      {
        id: "3",
        name: "longer",
        provider: "openai",
        apiKey: "hidden",
        providerSpecificData: { baseUrl: "https://api.openai.com/v1/extra" },
      },
      {
        id: "4",
        name: "relay",
        provider: "openai",
        apiKey: "hidden",
        providerSpecificData: { baseUrl: "https://relay.invalid/v1" },
      },
      {
        id: "5",
        name: "raw-identity",
        apiKey: "hidden",
        provider: " openai ",
      },
      {
        id: "6",
        name: "override-last",
        provider: "openai",
        apiKey: "hidden",
        providerSpecificData: { baseUrl: "https://api.openai.com/v1" },
      },
    ])
    const options = { inventoryCache: new Map() }
    const search = async (url: string) =>
      (await capabilities.matching.search(config, url, options))?.items.map(
        (row) => row.name,
      )
    expect(await search(" HTTPS://API.OPENAI.COM/v1/ ")).toEqual([
      "override-first",
      "default",
      "override-last",
    ])
    expect(await search("https://api.openai.com/v1/extra")).toEqual([
      "default",
      "longer",
    ])
    expect(await search("https://relay.invalid/v1")).toEqual(["relay"])
    expect(await search("https://unrelated.invalid/v1")).toEqual([])
    expect(listAllOmniRouteConnections).toHaveBeenCalledTimes(1)
  })

  it("evicts failed inventories and does not retain returned candidate mutations", async () => {
    vi.mocked(listAllOmniRouteConnections).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    const options = { inventoryCache: new Map() }
    await expect(
      capabilities.matching.search(config, "https://relay.invalid/v1", options),
    ).rejects.toThrow("unavailable")
    const first = await capabilities.matching.search(
      config,
      "https://relay.invalid/v1",
      options,
    )
    first!.items[0]!.name = "changed"
    first!.items[0]!.ref.resourceId = "changed"
    const second = await capabilities.matching.search(
      config,
      "https://relay.invalid/v1",
      options,
    )
    expect(second?.items).toMatchObject([
      { name: "relay", ref: { resourceId: "1" } },
    ])
    expect(listAllOmniRouteConnections).toHaveBeenCalledTimes(2)
  })
})
