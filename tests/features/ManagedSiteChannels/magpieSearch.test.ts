import { beforeEach, describe, expect, it, vi } from "vitest"

import { MAGPIE_DETAIL_FIELDS } from "~/constants/magpie"
import { createManagedResourceRowMapper } from "~/features/ManagedSiteChannels/table/managedResourceRowMapper"
import { magpieManagedResourceRegistration } from "~/services/apiAdapters/managedResources/magpie"
import {
  listMagpieProviders,
  type MagpieProvider,
} from "~/services/apiService/magpie/providers"

vi.mock("~/services/apiService/magpie/providers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listMagpieProviders: vi.fn(),
}))
vi.mock("~/services/managedSites/configuration/runtimeConfig", () => ({
  getManagedSiteRuntimeConfigForType: vi.fn(async () => ({
    siteType: "magpie",
    config: { baseUrl: "https://magpie.test", webKey: "test-web-key" },
  })),
}))

const provider: MagpieProvider = {
  id: "native/42+=",
  name: "Friendly provider",
  chat: "https://chat.test/v1",
  responses: "https://responses.test/v1",
  anthropic: "https://claude.test",
  gemini: "https://gemini.test/v1beta",
  key: { set: true, masked: "secret-mask", optional: false },
  chosen: ["selected-model"],
  models: [
    { id: "automatic-model", on: true },
    { id: "hidden-model", on: false },
  ],
  off: false,
  proxy: "http://proxy.test:7890",
  headers: { "X-Private": "private-header-value" },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listMagpieProviders).mockResolvedValue([provider])
})

describe("Magpie channel search", () => {
  it.each([
    " FRIENDLY ",
    "native/42+=",
    "chat.test",
    "responses.test",
    "claude.test",
    "gemini.test",
    "selected-model",
    "enabled",
    "proxy.test",
  ])("retains %s through inventory and table filtering", async (search) => {
    const session = await magpieManagedResourceRegistration.open()
    const page = await session.list({ search })
    expect(page.items.map((item) => item.ref.resourceId)).toEqual([provider.id])
    const mapper = createManagedResourceRowMapper({
      fieldIds: MAGPIE_DETAIL_FIELDS,
    })
    expect(mapper.map(page.items[0]!).searchText.toLowerCase()).toContain(
      search.trim().toLowerCase(),
    )
  })

  it.each([{ chosen: null }, { chosen: [] }])(
    "searches exposed automatic models with chosen=$chosen",
    async ({ chosen }) => {
      vi.mocked(listMagpieProviders).mockResolvedValue([
        { ...provider, chosen },
      ])
      const session = await magpieManagedResourceRegistration.open()
      const page = await session.list({ search: "automatic-model" })
      expect(page.items.map((item) => item.ref.resourceId)).toEqual([
        provider.id,
      ])
    },
  )

  it.each([
    "hidden-model",
    "automatic-model",
    "secret-mask",
    "private-header-value",
    "missing",
  ])("does not match undisplayed or private data: %s", async (search) => {
    const session = await magpieManagedResourceRegistration.open()
    expect((await session.list({ search })).items).toEqual([])
    const mapper = createManagedResourceRowMapper({
      fieldIds: MAGPIE_DETAIL_FIELDS,
    })
    const page = await session.list()
    expect(mapper.map(page.items[0]!).searchText).not.toContain(search)
  })
})
