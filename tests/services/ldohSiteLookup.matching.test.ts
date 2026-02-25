import { describe, expect, it } from "vitest"

import {
  buildLdohSiteLookupIndex,
  matchLdohSiteForAccount,
} from "~/services/ldohSiteLookup/matching"

describe("ldohSiteLookup matching", () => {
  it("prefers exact origin matches", () => {
    const index = buildLdohSiteLookupIndex([
      { id: "https", apiBaseUrl: "https://api.example.com/" },
      { id: "http", apiBaseUrl: "http://api.example.com/" },
    ])

    const match = matchLdohSiteForAccount(index, "https://api.example.com/v1")
    expect(match?.id).toBe("https")
  })

  it("falls back to hostname only when unique", () => {
    const index = buildLdohSiteLookupIndex([
      { id: "site-1", apiBaseUrl: "https://api.example.com/" },
    ])

    const match = matchLdohSiteForAccount(index, "http://api.example.com")
    expect(match?.id).toBe("site-1")
  })

  it("treats multiple hostname matches as no match", () => {
    const index = buildLdohSiteLookupIndex([
      { id: "a", apiBaseUrl: "https://api.example.com/" },
      { id: "b", apiBaseUrl: "http://api.example.com/" },
    ])

    const match = matchLdohSiteForAccount(
      index,
      "https://api.example.com:8443/v1",
    )
    expect(match).toBeNull()
  })

  it("matches by exact origin even when hostname is ambiguous", () => {
    const index = buildLdohSiteLookupIndex([
      { id: "a", apiBaseUrl: "https://api.example.com/" },
      { id: "b", apiBaseUrl: "http://api.example.com/" },
    ])

    const match = matchLdohSiteForAccount(index, "https://api.example.com/path")
    expect(match?.id).toBe("a")
  })
})
