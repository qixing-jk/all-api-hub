import { describe, expect, it } from "vitest"

import {
  applySiteAccountUpdates,
  normalizeAccountStorageConfigForRead,
  normalizeSiteAccount,
} from "~/services/accounts/accountDefaults"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

describe("accountDefaults", () => {
  const createSiteAccount = (
    overrides: Partial<SiteAccount> = {},
  ): SiteAccount =>
    ({
      id: "test-account-1",
      site_name: "Test Site",
      site_url: "https://test.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "test-site",
      exchange_rate: 7,
      account_info: {
        id: 1,
        access_token: "token",
        username: "user",
        quota: 1000,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      updated_at: 0,
      created_at: 0,
      notes: "",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      checkIn: { enableDetection: false },
      tagIds: [],
      ...overrides,
    }) as SiteAccount

  describe("normalizeAccountStorageConfigForRead", () => {
    it("defaults missing top-level collections and last_updated", () => {
      const normalized = normalizeAccountStorageConfigForRead(undefined, 123)
      expect(normalized).toEqual({
        accounts: [],
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        last_updated: 123,
      })
    })

    it("preserves provided top-level collections", () => {
      const raw: AccountStorageConfig = {
        accounts: [createSiteAccount()],
        bookmarks: [] as any,
        pinnedAccountIds: ["a"],
        orderedAccountIds: ["b"],
        last_updated: 42,
      }

      expect(normalizeAccountStorageConfigForRead(raw, 999)).toEqual(raw)
    })
  })

  describe("normalizeSiteAccount", () => {
    it("applies backward-compatible defaults for missing additive fields", () => {
      const legacy = createSiteAccount()
      delete (legacy as any).disabled
      delete (legacy as any).excludeFromTotalBalance
      delete (legacy as any).tagIds
      delete (legacy as any).tags
      delete (legacy as any).checkIn
      delete (legacy as any).notes

      const normalized = normalizeSiteAccount(legacy as any)

      expect(normalized.disabled).toBe(false)
      expect(normalized.excludeFromTotalBalance).toBe(false)
      expect(normalized.tagIds).toEqual([])
      expect(normalized.tags).toBeUndefined()
      expect(normalized.notes).toBe("")
      expect(normalized.checkIn.enableDetection).toBe(false)
    })

    it("preserves explicit values over defaults", () => {
      const account = createSiteAccount({
        disabled: true,
        excludeFromTotalBalance: true,
        tagIds: ["t1"],
        tags: ["Legacy"],
        checkIn: { enableDetection: true, autoCheckInEnabled: false },
        notes: "hello",
      })

      const normalized = normalizeSiteAccount(account)

      expect(normalized.disabled).toBe(true)
      expect(normalized.excludeFromTotalBalance).toBe(true)
      expect(normalized.tagIds).toEqual(["t1"])
      expect(normalized.tags).toEqual(["Legacy"])
      expect(normalized.checkIn.enableDetection).toBe(true)
      expect(normalized.checkIn.autoCheckInEnabled).toBe(false)
      expect(normalized.notes).toBe("hello")
    })
  })

  describe("applySiteAccountUpdates", () => {
    it("deep merges nested updates and preserves sibling fields", () => {
      const current = createSiteAccount({
        checkIn: {
          enableDetection: true,
          siteStatus: {
            isCheckedInToday: false,
            lastDetectedAt: 123,
          },
        } as any,
      })

      const updated = applySiteAccountUpdates({
        account: current as any,
        updates: {
          checkIn: {
            siteStatus: { isCheckedInToday: true },
          },
        } as any,
        now: 999,
      })

      expect(updated.checkIn.siteStatus?.isCheckedInToday).toBe(true)
      expect(updated.checkIn.siteStatus?.lastDetectedAt).toBe(123)
    })

    it("replaces arrays instead of concatenating", () => {
      const current = createSiteAccount({ tagIds: ["a"] })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { tagIds: ["b"] },
        now: 999,
      })

      expect(updated.tagIds).toEqual(["b"])
    })

    it("handles legacy stored accounts missing additive fields during partial update", () => {
      const legacy = createSiteAccount()
      delete (legacy as any).tagIds
      delete (legacy as any).checkIn

      const updated = applySiteAccountUpdates({
        account: legacy as any,
        updates: { notes: "updated" },
        now: 999,
      })

      expect(updated.notes).toBe("updated")
      expect(updated.tagIds).toEqual([])
      expect(updated.checkIn.enableDetection).toBe(false)
    })

    it("preserves explicit cleanup semantics for health.code when update sets it to undefined", () => {
      const current = createSiteAccount({
        health: {
          status: SiteHealthStatus.Warning,
          reason: "needs attention",
          code: "TEMP_WINDOW_DISABLED" as any,
        },
      })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { health: { code: undefined } } as any,
        now: 999,
      })

      expect(updated.health.code).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(updated.health, "code")).toBe(
        false,
      )
      expect(JSON.stringify(updated.health)).not.toContain("code")
    })
  })
})
