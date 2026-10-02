import { beforeEach, describe, expect, it, vi } from "vitest"

import { persistKimiOpenPlatformAuth } from "~/services/accounts/accountStorage/kimiAuthPersistence"
import type { SiteAccount } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock("~/services/accounts/accountStorage/accountConfigStore", () => ({
  accountConfigStore: { mutateAccount: mocks.mutate },
}))

describe("Kimi session persistence", () => {
  const original = () =>
    buildSiteAccount({
      site_type: "kimi-global",
      site_url: "https://platform.kimi.ai",
      kimiOpenPlatformAuth: {
        refreshToken: "old-refresh",
        organizationId: "org",
        tokenExpiresAt: 123,
      },
    })
  const next = { refreshToken: "new-refresh", organizationId: "org" }
  let saved: SiteAccount
  beforeEach(() => {
    saved = original()
    mocks.mutate.mockImplementation(async (_id, work) => {
      const result = work(saved)
      if (result.changed) saved = result.nextAccount
      return result.result
    })
  })
  it("persists the pair together, drops old expiry and preserves user edits", async () => {
    const snapshot = structuredClone(saved)
    saved.notes = "edited during request"
    await persistKimiOpenPlatformAuth(snapshot, "next-access", next)
    expect(saved.account_info.access_token).toBe("next-access")
    expect(saved.kimiOpenPlatformAuth).toEqual(next)
    expect(saved.notes).toBe("edited during request")
    expect(saved.user_updated_at).toBe(snapshot.user_updated_at)
  })
  it.each(["token", "refresh", "organization", "origin", "identity", "site"])(
    "rejects a stale rotation after a %s change",
    async (change) => {
      const snapshot = structuredClone(saved)
      if (change === "token") saved.account_info.access_token = "edited"
      if (change === "refresh")
        saved.kimiOpenPlatformAuth!.refreshToken = "edited"
      if (change === "organization")
        saved.kimiOpenPlatformAuth!.organizationId = "edited"
      if (change === "origin") saved.site_url = "https://unrelated.example"
      if (change === "identity") saved.account_info.id = "edited"
      if (change === "site") saved.site_type = "kimi"
      const before = structuredClone(saved)
      await expect(
        persistKimiOpenPlatformAuth(snapshot, "next-access", next),
      ).rejects.toThrow("kimi_auth_identity_mismatch")
      expect(saved).toEqual(before)
    },
  )
})
