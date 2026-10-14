import { beforeEach, describe, expect, it, vi } from "vitest"

import { magpieManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/magpie"
import { listMagpieProviders } from "~/services/apiService/magpie/providers"

vi.mock("~/services/apiService/magpie/providers", async (original) => ({
  ...(await original<object>()),
  listMagpieProviders: vi.fn(),
}))

const config = { baseUrl: "https://magpie.invalid", webKey: "key" }
const provider = (id: string) => ({
  id,
  name: id,
  chat: `https://${id}.invalid/v1`,
  responses: "",
  anthropic: "",
  key: { set: true, masked: "***", optional: false },
  chosen: [],
  models: [],
  off: false,
})

describe("Magpie matching inventory index", () => {
  beforeEach(() => vi.mocked(listMagpieProviders).mockReset())

  it("reads and normalizes each provider endpoint once across distinct searches in a batch", async () => {
    let endpointReads = 0
    const providers = Array.from({ length: 12 }, (_, index) => {
      const record = provider(`source-${index}`)
      const chat = record.chat
      Object.defineProperty(record, "chat", {
        get: () => {
          endpointReads += 1
          return chat
        },
      })
      return record
    })
    vi.mocked(listMagpieProviders).mockResolvedValue(providers)
    const options = { inventoryCache: new Map() }
    for (let index = 0; index < 6; index += 1) {
      const result = await magpieManagedSiteCapabilities.matching.search(
        config,
        `https://source-${index}.invalid`,
        options,
      )
      expect(result.items.map((item) => item.ref.resourceId)).toEqual([
        `source-${index}`,
      ])
    }
    expect(endpointReads).toBe(12)
    expect(listMagpieProviders).toHaveBeenCalledOnce()
  })

  it("preserves protocol aliases, provider order, first matching field and account exclusions", async () => {
    vi.mocked(listMagpieProviders).mockResolvedValue([
      {
        ...provider("responses"),
        chat: "",
        responses: "https://relay.invalid/v1",
      },
      {
        ...provider("both"),
        chat: "https://relay.invalid/v1",
        responses: "https://relay.invalid/v1",
      },
      { ...provider("account"), chat: "https://relay.invalid/v1", account: {} },
      {
        ...provider("anthropic"),
        chat: "",
        anthropic: "https://claude.invalid/v1",
      },
      {
        ...provider("gemini"),
        chat: "",
        gemini: "https://gemini.invalid/v1beta",
      },
    ])
    const options = { inventoryCache: new Map() }
    const search = magpieManagedSiteCapabilities.matching.search
    const result = await search(config, "https://relay.invalid", options)
    expect(
      result.items.map((item) => [item.ref.resourceId, item.type]),
    ).toEqual([
      ["responses", "responses"],
      ["both", "chat"],
    ])
    expect(
      (await search(config, "https://claude.invalid", options)).items.map(
        (item) => item.type,
      ),
    ).toEqual(["anthropic"])
    expect(
      (await search(config, "https://gemini.invalid", options)).items,
    ).toMatchObject([{ type: "gemini", base_url: "https://gemini.invalid" }])
  })

  it("isolates config credentials, retries failed inventories and refreshes a new batch", async () => {
    vi.mocked(listMagpieProviders)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([provider("source")])
    const options = { inventoryCache: new Map() }
    const search = magpieManagedSiteCapabilities.matching.search
    await expect(
      search(config, "https://source.invalid", options),
    ).rejects.toThrow("offline")
    await search(config, "https://source.invalid", options)
    await search(
      { ...config, webKey: "other-key" },
      "https://source.invalid",
      options,
    )
    await search(config, "https://source.invalid", {
      inventoryCache: new Map(),
    })
    expect(listMagpieProviders).toHaveBeenCalledTimes(4)
  })
})
