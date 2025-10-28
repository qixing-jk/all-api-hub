import { describe, expect, it } from "vitest"

import { migrateCheckInConfig } from "~/services/configMigration/checkInMigration"
import {
  CURRENT_CONFIG_VERSION,
  migrateAccountConfig,
  migrateAccountsConfig,
  needsConfigMigration
} from "~/services/configMigration/configMigration"
import { createSiteAccount } from "~/tests/fixtures/accounts"
import type { SiteAccount } from "~/types"

describe("check-in migration", () => {
  it("creates checkIn object from legacy properties when can_check_in is true", () => {
    const legacy = {
      id: "1",
      supports_check_in: true,
      can_check_in: true
    } as Partial<SiteAccount>

    const migrated = migrateCheckInConfig(legacy)

    expect(migrated.checkIn).toEqual({
      enableDetection: true,
      isCheckedInToday: false
    })
    expect("supports_check_in" in migrated).toBe(false)
    expect("can_check_in" in migrated).toBe(false)
  })

  it("marks accounts as already checked in when can_check_in is false", () => {
    const legacy = {
      id: "1",
      supports_check_in: true,
      can_check_in: false
    } as Partial<SiteAccount>

    const migrated = migrateCheckInConfig(legacy)
    expect(migrated.checkIn).toEqual({
      enableDetection: true,
      isCheckedInToday: true
    })
  })

  it("defaults to not checked in when legacy flag is missing", () => {
    const legacy = {
      id: "1",
      supports_check_in: true
    } as Partial<SiteAccount>

    const migrated = migrateCheckInConfig(legacy)
    expect(migrated.checkIn).toEqual({
      enableDetection: true,
      isCheckedInToday: false
    })
  })

  it("removes legacy flags when feature is disabled", () => {
    const legacy = {
      id: "1",
      supports_check_in: false
    } as Partial<SiteAccount>

    const migrated = migrateCheckInConfig(legacy)
    expect(migrated.checkIn).toBeUndefined()
    expect("supports_check_in" in migrated).toBe(false)
  })

  it("returns original object when already migrated", () => {
    const account = createSiteAccount()
    const migrated = migrateCheckInConfig(account)
    expect(migrated).toBe(account)
  })
})

describe("configuration migration", () => {
  it("upgrades a single account and sets config version", () => {
    const legacy: SiteAccount = createSiteAccount({
      configVersion: undefined
    })

    ;(legacy as any).checkIn = undefined
    legacy.supports_check_in = true
    legacy.can_check_in = false

    const migrated = migrateAccountConfig(legacy)

    expect(migrated.configVersion).toBe(CURRENT_CONFIG_VERSION)
    expect(migrated.checkIn).toEqual({
      enableDetection: true,
      isCheckedInToday: true
    })
    expect(needsConfigMigration(migrated)).toBe(false)
  })

  it("counts only legacy accounts during bulk migration", () => {
    const legacy: SiteAccount = createSiteAccount({
      configVersion: undefined
    })
    ;(legacy as any).checkIn = undefined
    legacy.supports_check_in = true
    legacy.can_check_in = true

    const modern = createSiteAccount({ configVersion: CURRENT_CONFIG_VERSION })

    const { accounts, migratedCount } = migrateAccountsConfig([legacy, modern])

    expect(migratedCount).toBe(1)
    expect(accounts[0].configVersion).toBe(CURRENT_CONFIG_VERSION)
    expect(accounts[1].configVersion).toBe(CURRENT_CONFIG_VERSION)
  })
})
