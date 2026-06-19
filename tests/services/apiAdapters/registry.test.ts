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
    expect(adapter.accountCompletion).toEqual({
      complete: expect.any(Function),
    })
    expect(adapter.keyManagement).toEqual({
      fetchTokens: expect.any(Function),
      createToken: expect.any(Function),
      resolveTokenKey: expect.any(Function),
      deleteToken: expect.any(Function),
      fetchUserGroups: expect.any(Function),
      fetchAvailableModels: expect.any(Function),
    })
    expect(adapter.accountRefresh).toEqual({
      fetchCheckInSupport: expect.any(Function),
      refreshAccount: expect.any(Function),
    })
    expect(adapter.accountData).toEqual({
      fetchData: expect.any(Function),
    })
    expect(adapter.modelPricing).toBeUndefined()
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
      expect(adapter.accountCompletion).toEqual({
        complete: expect.any(Function),
      })
      expect(adapter.keyManagement).toEqual({
        fetchTokens: expect.any(Function),
        createToken: expect.any(Function),
        resolveTokenKey: expect.any(Function),
        deleteToken: expect.any(Function),
        fetchUserGroups: expect.any(Function),
        fetchAvailableModels: expect.any(Function),
      })
      expect(adapter.accountRefresh).toEqual({
        fetchCheckInSupport: expect.any(Function),
        refreshAccount: expect.any(Function),
      })
      expect(adapter.accountData).toEqual({
        fetchData: expect.any(Function),
      })
      expect(adapter.modelPricing).toEqual({
        fetchPricing: expect.any(Function),
      })
      expect(adapter.siteAnnouncements).toBeUndefined()
      expect(adapter.modelCatalog).toBeUndefined()
    }
  })

  it("returns an AIHubMix Adapter with account completion and key management", () => {
    const adapter = getSiteAdapter(SITE_TYPES.AIHUBMIX)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
    })
    expect(adapter.accountCompletion).toEqual({
      complete: expect.any(Function),
    })
    expect(adapter.keyManagement).toEqual({
      fetchTokens: expect.any(Function),
      createToken: expect.any(Function),
      resolveTokenKey: expect.any(Function),
      deleteToken: expect.any(Function),
      fetchUserGroups: expect.any(Function),
      fetchAvailableModels: expect.any(Function),
    })
    expect(adapter.accountRefresh).toEqual({
      fetchCheckInSupport: expect.any(Function),
      refreshAccount: expect.any(Function),
    })
    expect(adapter.accountData).toEqual({
      fetchData: expect.any(Function),
    })
    expect(adapter.modelPricing).toEqual({
      fetchPricing: expect.any(Function),
    })
    expect(adapter.siteNotice).toBeUndefined()
    expect(adapter.siteAnnouncements).toBeUndefined()
    expect(adapter.modelCatalog).toBeUndefined()
  })
})
