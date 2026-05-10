import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  applySiteAccountUpdates,
  createDefaultAccountStorageConfig,
  createPersistedSiteAccount,
  normalizeAccountStorageConfigForRead,
  normalizeAccountStorageConfigForWrite,
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
      site_type: SITE_TYPES.UNKNOWN,
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

  describe("storage helpers", () => {
    it("creates the canonical default storage shape", () => {
      expect(createDefaultAccountStorageConfig(321)).toEqual({
        accounts: [],
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        last_updated: 321,
      })
    })

    it("normalizes write payloads before persistence", () => {
      const normalized = normalizeAccountStorageConfigForWrite(
        {
          accounts: "bad" as any,
          bookmarks: [{ id: "bookmark-1" }] as any,
          pinnedAccountIds: "bad" as any,
          orderedAccountIds: ["ordered-1"],
          last_updated: 1,
        } as any,
        456,
      )

      expect(normalized).toEqual({
        accounts: [],
        bookmarks: [{ id: "bookmark-1" }],
        pinnedAccountIds: [],
        orderedAccountIds: ["ordered-1"],
        last_updated: 456,
      })
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

    it("canonicalizes AIHubMix accounts to the console web origin", () => {
      const normalized = normalizeSiteAccount(
        createSiteAccount({
          site_type: SITE_TYPES.AIHUBMIX,
          site_url: "https://aihubmix.com/statistics?tab=detail",
        }),
      )

      expect(normalized.site_url).toBe("https://console.aihubmix.com")
    })

    it("coerces invalid persisted values to stable defaults", () => {
      const normalized = normalizeSiteAccount({
        ...createSiteAccount(),
        site_type: "",
        exchange_rate: "bad" as any,
        authType: "invalid-auth" as any,
        account_info: {
          ...createSiteAccount().account_info,
          id: "12" as any,
          quota: "15" as any,
          today_income: "invalid" as any,
        },
        health: {
          status: "invalid-status" as any,
          reason: 123 as any,
          code: "UNHEALTHY" as any,
        },
        checkIn: {
          enableDetection: 1 as any,
          customCheckIn: {
            url: "https://checkin.example",
          },
        } as any,
        tagIds: [" first ", "", 2 as any, "second"],
        tags: "legacy" as any,
      } as any)

      expect(normalized.site_type).toBe(SITE_TYPES.UNKNOWN)
      expect(normalized.exchange_rate).toBe(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT)
      expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
      expect(normalized.account_info.id).toBe(12)
      expect(normalized.account_info.quota).toBe(15)
      expect(normalized.account_info.today_income).toBe(0)
      expect(normalized.health.status).toBe(SiteHealthStatus.Unknown)
      expect(normalized.health.reason).toBeUndefined()
      expect(normalized.health.code).toBe("UNHEALTHY")
      expect(normalized.checkIn.enableDetection).toBe(false)
      expect(normalized.checkIn.autoCheckInEnabled).toBe(true)
      expect(normalized.checkIn.customCheckIn?.openRedeemWithCheckIn).toBe(true)
      expect(normalized.tagIds).toEqual(["first", "second"])
      expect(normalized.tags).toBeUndefined()
    })
  })

  describe("createPersistedSiteAccount", () => {
    it("applies generated ids and timestamps while normalizing nested fields", () => {
      const {
        id: _legacyId,
        created_at: _legacyCreatedAt,
        updated_at: _legacyUpdatedAt,
        ...account
      } = createSiteAccount({
        id: "legacy-id" as any,
        created_at: 1 as any,
        updated_at: 2 as any,
        notes: undefined as any,
        checkIn: {
          enableDetection: true,
          customCheckIn: { url: "https://checkin.example" },
        } as any,
        tagIds: [" tag-a ", ""],
      })
      void _legacyId
      void _legacyCreatedAt
      void _legacyUpdatedAt

      const created = createPersistedSiteAccount({
        id: "persisted-id",
        now: 777,
        account,
      })

      expect(created.id).toBe("persisted-id")
      expect(created.created_at).toBe(777)
      expect(created.updated_at).toBe(777)
      expect(created.notes).toBe("")
      expect(created.tagIds).toEqual(["tag-a"])
      expect(created.checkIn.customCheckIn?.openRedeemWithCheckIn).toBe(true)
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
