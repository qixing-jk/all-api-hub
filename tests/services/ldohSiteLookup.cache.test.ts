import { beforeEach, describe, expect, it } from "vitest"

import {
  clearLdohSiteListCache,
  readFreshLdohSiteListCache,
  readLdohSiteListCache,
  writeLdohSiteListCache,
} from "~/services/integrations/ldohSiteLookup/cache"
import {
  buildLdohSiteSearchUrlFromUrl,
  normalizeUrlForLdohMatch,
} from "~/services/integrations/ldohSiteLookup/url"

describe("ldohSiteLookup cache + url helpers", () => {
  beforeEach(async () => {
    await clearLdohSiteListCache()
  })

  it("treats missing cache as a miss", async () => {
    expect(await readFreshLdohSiteListCache(1000)).toBeNull()
    expect(await readLdohSiteListCache()).toBeNull()
  })

  it("reads fresh cache and expires it at expiresAt", async () => {
    const now = 1700000000000
    const ttlMs = 10_000

    await writeLdohSiteListCache(
      [{ id: "site-1", apiBaseUrl: "https://api.example.com/" }],
      { now, ttlMs },
    )

    const hit = await readFreshLdohSiteListCache(now + 1)
    expect(hit).not.toBeNull()
    expect(hit?.items).toHaveLength(1)

    const miss = await readFreshLdohSiteListCache(now + ttlMs)
    expect(miss).toBeNull()

    const raw = await readLdohSiteListCache()
    expect(raw?.expiresAt).toBe(now + ttlMs)
  })

  it("normalizes to origin + hostname and never includes paths/secrets in deeplink", () => {
    expect(
      normalizeUrlForLdohMatch(
        "https://API.Example.com/v1?token=SHOULD_NOT_LEAK",
      ),
    ).toEqual({
      origin: "https://api.example.com",
      hostname: "api.example.com",
    })

    expect(
      buildLdohSiteSearchUrlFromUrl(
        "https://api.example.com/v1?token=SHOULD_NOT_LEAK",
      ),
    ).toBe("https://ldoh.105117.xyz/?q=api.example.com")
  })
})
