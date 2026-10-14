import { beforeEach, describe, expect, it, vi } from "vitest"

import { gptLoadManagedSiteCapabilities as capabilities } from "~/services/apiAdapters/managedSites/gptLoad"
import { listAllGptLoadGroups } from "~/services/apiService/gptLoad"
import { toGptLoadSanitizedGroup } from "~/services/apiService/gptLoad/redaction"

vi.mock("~/services/apiService/gptLoad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/gptLoad")>()),
  listAllGptLoadGroups: vi.fn(),
}))
vi.mock("~/services/apiService/gptLoad/redaction", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiService/gptLoad/redaction")
    >()
  return {
    ...actual,
    toGptLoadSanitizedGroup: vi.fn(actual.toGptLoadSanitizedGroup),
  }
})
const config = { baseUrl: "https://target.invalid", managementKey: "key" }
const rows = [
  {
    id: 1,
    name: "relay",
    channel_id: "openai_compatible",
    params: { base_url: "https://relay.invalid/v1" },
    model_names: ["m"],
    credentials: { api_key: "hidden" },
  },
]
describe("gptLoad batch matching index", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAllGptLoadGroups).mockResolvedValue(rows)
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
    expect(listAllGptLoadGroups).toHaveBeenCalledTimes(1)
    expect(toGptLoadSanitizedGroup).toHaveBeenCalledTimes(1)
    await capabilities.matching.search(config, "https://relay.invalid/v1", {
      inventoryCache: new Map(),
    })
    expect(listAllGptLoadGroups).toHaveBeenCalledTimes(2)
    expect(toGptLoadSanitizedGroup).toHaveBeenCalledTimes(2)
  })
  it("preserves native default identities, exact overrides and inventory order", async () => {
    vi.mocked(listAllGptLoadGroups).mockResolvedValue([
      {
        id: 1,
        name: "override-first",
        channel_id: "openai",
        credentials: { api_key: "hidden" },
        params: { base_url: "https://api.openai.com/v1" },
      },
      {
        id: 2,
        name: "default",
        channel_id: "openai",
        credentials: { api_key: "hidden" },
      },
      {
        id: 3,
        name: "longer",
        channel_id: "openai",
        credentials: { api_key: "hidden" },
        params: { base_url: "https://api.openai.com/v1/extra" },
      },
      {
        id: 4,
        name: "relay",
        channel_id: "openai",
        credentials: { api_key: "hidden" },
        params: { base_url: "https://relay.invalid/v1" },
      },
      {
        id: 5,
        name: "raw-identity",
        credentials: { api_key: "hidden" },
        channel_id: " openai ",
      },
      {
        id: 6,
        name: "override-last",
        channel_id: "openai",
        credentials: { api_key: "hidden" },
        params: { base_url: "https://api.openai.com/v1" },
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
    expect(listAllGptLoadGroups).toHaveBeenCalledTimes(1)
  })

  it("evicts failed inventories and does not retain returned candidate mutations", async () => {
    vi.mocked(listAllGptLoadGroups).mockRejectedValueOnce(
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
    expect(listAllGptLoadGroups).toHaveBeenCalledTimes(2)
  })
})
