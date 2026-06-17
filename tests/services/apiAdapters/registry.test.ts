import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getSiteAdapter } from "~/services/apiAdapters/registry"

describe("apiAdapters registry", () => {
  it("returns a Sub2API Adapter with account-scoped siteAnnouncements", () => {
    const adapter = getSiteAdapter(SITE_TYPES.SUB2API)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.SUB2API,
      family: "sub2api",
    })
    expect(adapter.siteAnnouncements).toEqual({
      fetch: expect.any(Function),
      markRead: expect.any(Function),
    })
    expect(adapter.modelCatalog).toEqual({
      fetchModels: expect.any(Function),
    })
    expect(adapter.siteNotice).toBeUndefined()
  })

  it("returns New API family Adapters with siteNotice for compatible account sites", () => {
    for (const siteType of [
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
      SITE_TYPES.ANYROUTER,
      SITE_TYPES.VELOERA,
      SITE_TYPES.ONE_HUB,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.V_API,
      SITE_TYPES.VO_API,
      SITE_TYPES.SUPER_API,
      SITE_TYPES.RIX_API,
      SITE_TYPES.NEO_API,
      SITE_TYPES.WONG_GONGYI,
      SITE_TYPES.UNKNOWN,
    ]) {
      const adapter = getSiteAdapter(siteType)

      expect(adapter).toMatchObject({
        siteType,
        family: "newApiFamily",
      })
      expect(adapter.siteNotice).toEqual({
        fetch: expect.any(Function),
      })
      expect(adapter.siteAnnouncements).toBeUndefined()
      expect(adapter.modelCatalog).toBeUndefined()
    }
  })

  it("keeps AIHubMix unsupported for siteNotice in the first slice", () => {
    const adapter = getSiteAdapter(SITE_TYPES.AIHUBMIX)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
    })
    expect(adapter.siteNotice).toBeUndefined()
    expect(adapter.siteAnnouncements).toBeUndefined()
    expect(adapter.modelCatalog).toBeUndefined()
  })
})
