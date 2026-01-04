import { describe, expect, it } from "vitest"

import {
  CURRENT_CONFIG_VERSION,
  getConfigVersion,
  migrateAccountConfig,
  migrateAccountsConfig,
  needsConfigMigration,
} from "~/services/configMigration/account/accountDataMigration"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

describe("accountDataMigration", () => {
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

  describe("getConfigVersion", () => {
    it("returns 0 when configVersion is undefined", () => {
      const account = createSiteAccount({ configVersion: undefined })
      expect(getConfigVersion(account)).toBe(0)
    })

    it("returns the actual configVersion when defined", () => {
      const account = createSiteAccount({ configVersion: 1 })
      expect(getConfigVersion(account)).toBe(1)
    })

    it("returns 0 for accounts without configVersion property", () => {
      const account = createSiteAccount()
      // Remove configVersion to simulate old account
      delete (account as any).configVersion
      expect(getConfigVersion(account)).toBe(0)
    })
  })

  describe("needsConfigMigration", () => {
    it("returns true when account version is less than current version", () => {
      const account = createSiteAccount({ configVersion: 0 })
      expect(needsConfigMigration(account)).toBe(true)
    })

    it("returns false when account version equals current version", () => {
      const account = createSiteAccount({
        configVersion: CURRENT_CONFIG_VERSION,
      })
      expect(needsConfigMigration(account)).toBe(false)
    })

    it("returns false when account version is greater than current version", () => {
      const account = createSiteAccount({
        configVersion: CURRENT_CONFIG_VERSION + 1,
      })
      expect(needsConfigMigration(account)).toBe(false)
    })

    it("returns true when configVersion is undefined (version 0)", () => {
      const account = createSiteAccount({ configVersion: undefined })
      expect(needsConfigMigration(account)).toBe(true)
    })
  })

  describe("migrateAccountConfig", () => {
    it("migrates account from version 0 to current version", () => {
      const oldAccount = createSiteAccount({
        configVersion: 0,
        supports_check_in: true,
        can_check_in: false,
      })

      const migrated = migrateAccountConfig(oldAccount)

      expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migrated.checkIn).toBeDefined()
      expect(migrated.checkIn?.enableDetection).toBe(true)
      expect(migrated.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
      // Legacy fields should be removed
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })

    it("migrates version 1 custom check-in fields into checkIn.customCheckIn", () => {
      const legacyV1Account = createSiteAccount({
        configVersion: 1,
        checkIn: {
          enableDetection: true,
          isCheckedInToday: true,
          lastCheckInDate: "2000-01-01",
          customCheckInUrl: "https://custom.example.com/checkin",
          customRedeemUrl: "https://custom.example.com/redeem",
          openRedeemWithCheckIn: false,
        } as any,
      })

      const migrated = migrateAccountConfig(legacyV1Account)

      expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migrated.checkIn?.customCheckIn).toEqual({
        url: "https://custom.example.com/checkin",
        redeemUrl: "https://custom.example.com/redeem",
        openRedeemWithCheckIn: false,
        isCheckedInToday: true,
        lastCheckInDate: "2000-01-01",
      })

      // Legacy keys should not survive on the migrated shape.
      expect((migrated.checkIn as any).customCheckInUrl).toBeUndefined()
      expect((migrated.checkIn as any).customRedeemUrl).toBeUndefined()
      expect((migrated.checkIn as any).openRedeemWithCheckIn).toBeUndefined()
    })

    it("migrates version 1 site check-in status into checkIn.siteStatus", () => {
      const legacyV1Account = createSiteAccount({
        configVersion: 1,
        checkIn: {
          enableDetection: true,
          isCheckedInToday: false,
          lastCheckInDate: "2000-01-02",
        } as any,
      })

      const migrated = migrateAccountConfig(legacyV1Account)

      expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migrated.checkIn?.siteStatus).toEqual({
        isCheckedInToday: false,
        lastCheckInDate: "2000-01-02",
      })
      expect((migrated.checkIn as any).isCheckedInToday).toBeUndefined()
      expect((migrated.checkIn as any).lastCheckInDate).toBeUndefined()
    })

    it("leaves account unchanged when already at current version", () => {
      const currentAccount = createSiteAccount({
        configVersion: CURRENT_CONFIG_VERSION,
        checkIn: {
          enableDetection: false,
          siteStatus: { isCheckedInToday: true },
        },
      })

      const migrated = migrateAccountConfig(currentAccount)

      expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migrated.checkIn).toEqual(currentAccount.checkIn)
    })

    it("handles account with version higher than current version", () => {
      const futureAccount = createSiteAccount({
        configVersion: CURRENT_CONFIG_VERSION + 1,
        checkIn: {
          enableDetection: true,
          customCheckIn: { url: "https://custom.com" },
        },
      })

      const migrated = migrateAccountConfig(futureAccount)

      expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION + 1)
      expect(migrated.checkIn).toEqual(futureAccount.checkIn)
    })

    it("preserves all other account properties during migration", () => {
      const oldAccount = createSiteAccount({
        configVersion: 0,
        supports_check_in: true,
        can_check_in: true,
        notes: "Test notes",
        site_name: "Custom Site Name",
      })

      const migrated = migrateAccountConfig(oldAccount)

      // Check that non-migration properties are preserved
      expect(migrated.id).toBe(oldAccount.id)
      expect(migrated.site_name).toBe(oldAccount.site_name)
      expect(migrated.notes).toBe(oldAccount.notes)
      expect(migrated.account_info).toEqual(oldAccount.account_info)
    })

    it("creates a copy and does not mutate the original account", () => {
      const oldAccount = createSiteAccount({
        configVersion: 0,
        supports_check_in: true,
        can_check_in: false,
      })

      const migrated = migrateAccountConfig(oldAccount)

      // Original should be unchanged
      expect(oldAccount.configVersion).toBe(0)
      expect(oldAccount).toHaveProperty("supports_check_in")
      expect(oldAccount).toHaveProperty("can_check_in")

      // Migrated should have the changes
      expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migrated).not.toHaveProperty("supports_check_in")
      expect(migrated).not.toHaveProperty("can_check_in")
    })
  })

  describe("migrateAccountsConfig", () => {
    it("migrates all accounts that need migration", () => {
      const accounts = [
        createSiteAccount({
          id: "account-1",
          configVersion: 0,
          supports_check_in: true,
          can_check_in: true,
        }),
        createSiteAccount({
          id: "account-2",
          configVersion: 0,
          supports_check_in: false,
        }),
        createSiteAccount({
          id: "account-3",
          configVersion: CURRENT_CONFIG_VERSION,
          checkIn: { enableDetection: false },
        }),
      ]

      const result = migrateAccountsConfig(accounts)

      expect(result.migratedCount).toBe(2)
      expect(result.accounts).toHaveLength(3)

      // Check migrated accounts
      const migratedAccount1 = result.accounts.find((a) => a.id === "account-1")
      const migratedAccount2 = result.accounts.find((a) => a.id === "account-2")
      const unchangedAccount = result.accounts.find((a) => a.id === "account-3")

      expect(migratedAccount1?.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migratedAccount1).not.toHaveProperty("supports_check_in")
      expect(migratedAccount1).not.toHaveProperty("can_check_in")

      expect(migratedAccount2?.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(migratedAccount2).not.toHaveProperty("supports_check_in")
      expect(migratedAccount2).not.toHaveProperty("can_check_in")

      expect(unchangedAccount?.configVersion).toBe(CURRENT_CONFIG_VERSION)
    })

    it("returns migratedCount of 0 when no accounts need migration", () => {
      const accounts = [
        createSiteAccount({
          id: "account-1",
          configVersion: CURRENT_CONFIG_VERSION,
        }),
        createSiteAccount({
          id: "account-2",
          configVersion: CURRENT_CONFIG_VERSION + 1,
        }),
      ]

      const result = migrateAccountsConfig(accounts)

      expect(result.migratedCount).toBe(0)
      expect(result.accounts).toEqual(accounts)
    })

    it("handles empty array of accounts", () => {
      const result = migrateAccountsConfig([])

      expect(result.migratedCount).toBe(0)
      expect(result.accounts).toEqual([])
    })

    it("preserves order of accounts", () => {
      const accounts = [
        createSiteAccount({
          id: "first",
          configVersion: CURRENT_CONFIG_VERSION,
        }),
        createSiteAccount({
          id: "second",
          configVersion: 0,
          supports_check_in: true,
        }),
        createSiteAccount({
          id: "third",
          configVersion: CURRENT_CONFIG_VERSION,
        }),
      ]

      const result = migrateAccountsConfig(accounts)

      expect(result.accounts.map((a) => a.id)).toEqual([
        "first",
        "second",
        "third",
      ])
      expect(result.migratedCount).toBe(1)
    })

    it("handles mixed scenarios with complex account data", () => {
      const accounts = [
        createSiteAccount({
          id: "complex-1",
          configVersion: 0,
          supports_check_in: true,
          can_check_in: false,
          notes: "Already checked in",
          site_name: "Site A",
        }),
        createSiteAccount({
          id: "complex-2",
          configVersion: 0,
          supports_check_in: true,
          can_check_in: true,
          notes: "Can check in",
          site_name: "Site B",
        }),
        createSiteAccount({
          id: "complex-3",
          configVersion: 0,
          supports_check_in: false,
          notes: "No check-in support",
          site_name: "Site C",
        }),
        createSiteAccount({
          id: "already-migrated",
          configVersion: CURRENT_CONFIG_VERSION,
          checkIn: {
            enableDetection: true,
            siteStatus: { isCheckedInToday: false },
            customCheckIn: { url: "https://custom.com/checkin" },
          },
          notes: "Modern account",
          site_name: "Site D",
        }),
      ]

      const result = migrateAccountsConfig(accounts)

      expect(result.migratedCount).toBe(3)

      const migrated1 = result.accounts.find((a) => a.id === "complex-1")
      const migrated2 = result.accounts.find((a) => a.id === "complex-2")
      const migrated3 = result.accounts.find((a) => a.id === "complex-3")
      const unchanged = result.accounts.find((a) => a.id === "already-migrated")

      // Verify specific migration scenarios
      expect(migrated1?.checkIn?.enableDetection).toBe(true)
      expect(migrated1?.checkIn?.siteStatus?.isCheckedInToday).toBe(true) // was can_check_in: false

      expect(migrated2?.checkIn?.enableDetection).toBe(true)
      expect(migrated2?.checkIn?.siteStatus?.isCheckedInToday).toBe(false) // was can_check_in: true

      expect(migrated3?.checkIn).toBeUndefined() // supports_check_in was false, so no checkIn object created

      // Ensure all legacy fields are removed from migrated accounts
      expect(migrated1).not.toHaveProperty("supports_check_in")
      expect(migrated1).not.toHaveProperty("can_check_in")
      expect(migrated2).not.toHaveProperty("supports_check_in")
      expect(migrated2).not.toHaveProperty("can_check_in")
      expect(migrated3).not.toHaveProperty("supports_check_in")
      expect(migrated3).not.toHaveProperty("can_check_in")

      // Unchanged account should remain the same
      expect(unchanged?.checkIn).toEqual({
        enableDetection: true,
        siteStatus: { isCheckedInToday: false },
        customCheckIn: { url: "https://custom.com/checkin" },
      })
    })
  })
})
