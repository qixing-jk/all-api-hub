import { describe, expect, it } from "vitest"

import { migrateCheckInConfig } from "~/services/accounts/migrations/checkInMigration"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

describe("checkInMigration", () => {
  // Helper to create a minimal SiteAccount fixture
  const createSiteAccount = (
    overrides: Partial<SiteAccount> = {},
  ): SiteAccount =>
    ({
      id: "test-account-1",
      site_name: "Test Site",
      site_url: "https://test.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "test-site",
      exchange_rate: 7.0,
      account_info: {
        id: 1,
        access_token: "test-token",
        username: "test-user",
        quota: 1000,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: Date.now(),
      updated_at: Date.now(),
      created_at: Date.now(),
      authType: AuthTypeEnum.AccessToken,
      // Note: checkIn is intentionally omitted to simulate old accounts
      // It can be provided in overrides when needed
      ...overrides,
    }) as SiteAccount

  describe("Scenario 1: Can check in (supports_check_in: true, can_check_in: true)", () => {
    it("creates checkIn object with siteStatus.isCheckedInToday: false", () => {
      const account = createSiteAccount({
        supports_check_in: true,
        can_check_in: true,
      })

      const migrated = migrateCheckInConfig(account)

      expect(migrated.checkIn).toEqual({
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: false, // Inverted from can_check_in: true
        },
      })

      // Legacy fields should be removed
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })
  })

  describe("Scenario 2: Already checked in (supports_check_in: true, can_check_in: false)", () => {
    it("creates checkIn object with siteStatus.isCheckedInToday: true", () => {
      const account = createSiteAccount({
        supports_check_in: true,
        can_check_in: false,
      })

      const migrated = migrateCheckInConfig(account)

      expect(migrated.checkIn).toEqual({
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: true, // Inverted from can_check_in: false
        },
      })

      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })
  })

  describe("Scenario 3: can_check_in is undefined", () => {
    it("defaults to siteStatus.isCheckedInToday: false when can_check_in is undefined", () => {
      const account = createSiteAccount({
        supports_check_in: true,
        // can_check_in is undefined
      })

      const migrated = migrateCheckInConfig(account)

      expect(migrated.checkIn).toEqual({
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: false, // Defaults to false when can_check_in is undefined
        },
      })
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })
  })

  describe("Scenario 4: Feature not supported (supports_check_in: false)", () => {
    it("does not create checkIn object and cleans up legacy fields", () => {
      const account = createSiteAccount({
        supports_check_in: false,
        can_check_in: true, // This should be ignored
      })

      const migrated = migrateCheckInConfig(account)

      expect(migrated.checkIn).toBeUndefined()
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })

    it("cleans up legacy fields when supports_check_in is false and no checkIn exists", () => {
      const account = createSiteAccount({
        supports_check_in: false,
        can_check_in: false,
      })

      const migrated = migrateCheckInConfig(account)

      // Should not have checkIn since supports_check_in is false
      expect(migrated.checkIn).toBeUndefined()
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })
  })

  describe("Scenario 5: Already migrated", () => {
    it("returns account unchanged when checkIn already exists and no legacy fields", () => {
      const existingCheckIn = {
        enableDetection: true,
        siteStatus: { isCheckedInToday: false },
        customCheckIn: { url: "https://custom.com" },
      }

      const account = createSiteAccount({
        checkIn: existingCheckIn,
      })

      const migrated = migrateCheckInConfig(account)

      expect(migrated.checkIn).toEqual(existingCheckIn)
      expect(migrated).toEqual(account) // Should be exactly the same object
    })

    it("preserves existing checkIn and does not clean up legacy fields when checkIn exists", () => {
      const existingCheckIn = {
        enableDetection: false,
        siteStatus: { isCheckedInToday: true },
      }

      const account = createSiteAccount({
        checkIn: existingCheckIn,
        supports_check_in: false,
        can_check_in: true,
      })

      const migrated = migrateCheckInConfig(account)

      // Should keep existing checkIn but does NOT clean up legacy fields when checkIn exists
      expect(migrated.checkIn).toEqual(existingCheckIn)
      expect(migrated).toHaveProperty("supports_check_in", false)
      expect(migrated).toHaveProperty("can_check_in", true)
    })
  })

  describe("Edge cases and cleanup scenarios", () => {
    it("handles account with supports_check_in: true but no can_check_in", () => {
      const account = createSiteAccount({
        supports_check_in: true,
      })
      delete (account as any).checkIn
      delete (account as any).can_check_in

      const migrated = migrateCheckInConfig(account)

      expect(migrated.checkIn).toEqual({
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: false, // Defaults to false when can_check_in is undefined
        },
      })
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })

    it("handles account with only can_check_in but no supports_check_in", () => {
      const account = createSiteAccount({
        can_check_in: true,
      })
      delete (account as any).supports_check_in

      const migrated = migrateCheckInConfig(account)

      // Should not migrate since supports_check_in is not true
      expect(migrated.checkIn).toBeUndefined()
      expect(migrated).not.toHaveProperty("can_check_in")
    })

    it("handles account with both legacy fields but supports_check_in is null", () => {
      const account = createSiteAccount({
        supports_check_in: undefined,
        can_check_in: true,
      })

      const migrated = migrateCheckInConfig(account)

      // Should not migrate since supports_check_in is not true
      expect(migrated.checkIn).toBeUndefined()
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })

    it("preserves all other account properties during migration", () => {
      const account = createSiteAccount({
        supports_check_in: true,
        can_check_in: false,
        notes: "Test notes",
        site_name: "Custom Site",
      })

      const migrated = migrateCheckInConfig(account)

      // Check that non-migration properties are preserved
      expect(migrated.id).toBe(account.id)
      expect(migrated.site_name).toBe(account.site_name)
      expect(migrated.notes).toBe(account.notes)
      expect(migrated.account_info).toEqual(account.account_info)
      expect(migrated.health).toEqual(account.health)
    })

    it("creates a copy and does not mutate the original account", () => {
      const account = createSiteAccount({
        supports_check_in: true,
        can_check_in: true,
      })

      const migrated = migrateCheckInConfig(account)

      // Original should be unchanged (except for potential deletion of legacy fields in copy)
      expect(account).toHaveProperty("supports_check_in")
      expect(account).toHaveProperty("can_check_in")

      // Migrated should have the changes
      expect(migrated.checkIn).toBeDefined()
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })
  })

  describe("Complex real-world scenarios", () => {
    it("preserves existing checkIn and does not clean up legacy fields when checkIn exists", () => {
      const account = createSiteAccount({
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
          customCheckIn: { url: "https://example.com/checkin" },
        },
        supports_check_in: false, // This should NOT trigger cleanup when checkIn exists
        can_check_in: true,
      })

      const migrated = migrateCheckInConfig(account)

      // Should preserve existing checkIn but does NOT clean up legacy fields when checkIn exists
      expect(migrated.checkIn).toEqual({
        enableDetection: true,
        siteStatus: { isCheckedInToday: false },
        customCheckIn: { url: "https://example.com/checkin" },
      })
      expect(migrated).toHaveProperty("supports_check_in", false)
      expect(migrated).toHaveProperty("can_check_in", true)
    })

    it("preserves complex checkIn configuration and does not clean up legacy fields when checkIn exists", () => {
      const complexCheckIn = {
        enableDetection: true,
        siteStatus: { isCheckedInToday: false },
        customCheckIn: {
          url: "https://custom.com/checkin",
          redeemUrl: "https://custom.com/redeem",
          lastCheckInDate: "2024-01-15",
          openRedeemWithCheckIn: false,
          isCheckedInToday: true,
        },
      }

      const account = createSiteAccount({
        checkIn: complexCheckIn,
        supports_check_in: false,
        can_check_in: false,
      })

      const migrated = migrateCheckInConfig(account)

      // Should preserve all existing checkIn configuration but does NOT clean up legacy fields when checkIn exists
      expect(migrated.checkIn).toEqual(complexCheckIn)
      expect(migrated).toHaveProperty("supports_check_in", false)
      expect(migrated).toHaveProperty("can_check_in", false)
    })
  })
})
