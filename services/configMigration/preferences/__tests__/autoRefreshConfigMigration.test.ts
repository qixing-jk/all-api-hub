import { describe, expect, it } from "vitest"

import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh.ts"

import type { UserPreferences } from "../../../userPreferences"
import { migrateAutoRefreshConfig } from "../autoRefreshConfigMigration"

describe("autoRefreshConfigMigration", () => {
  it("migrates flat auto-refresh fields to nested structure", () => {
    const oldPrefs = {
      autoRefresh: true,
      refreshInterval: 300,
      minRefreshInterval: 45,
      refreshOnOpen: false,
      preferencesVersion: 3
    } as UserPreferences

    const migratedPrefs = migrateAutoRefreshConfig(oldPrefs)

    expect(migratedPrefs.accountAutoRefresh).toEqual({
      enabled: oldPrefs.autoRefresh,
      interval: oldPrefs.refreshInterval,
      minInterval: oldPrefs.minRefreshInterval,
      refreshOnOpen: oldPrefs.refreshOnOpen
    })

    // Old fields removed
    expect(migratedPrefs).not.toHaveProperty("autoRefresh")
    expect(migratedPrefs).not.toHaveProperty("refreshInterval")
    expect(migratedPrefs).not.toHaveProperty("minRefreshInterval")
    expect(migratedPrefs).not.toHaveProperty("refreshOnOpen")
  })

  it("prioritizes old fields over new ones", () => {
    const mixedPrefs = {
      autoRefresh: false,
      refreshInterval: 180,
      minRefreshInterval: 30,
      refreshOnOpen: true,
      accountAutoRefresh: {
        enabled: true,
        interval: 360,
        minInterval: 60,
        refreshOnOpen: false
      },
      preferencesVersion: 3
    } as UserPreferences

    const migratedPrefs = migrateAutoRefreshConfig(mixedPrefs)

    expect(migratedPrefs.accountAutoRefresh).toEqual({
      enabled: mixedPrefs.autoRefresh,
      interval: mixedPrefs.refreshInterval,
      minInterval: mixedPrefs.minRefreshInterval,
      refreshOnOpen: mixedPrefs.refreshOnOpen
    })
  })

  it("uses defaults when no old or new fields exist", () => {
    const emptyPrefs = { preferencesVersion: 3 } as UserPreferences
    const migratedPrefs = migrateAutoRefreshConfig(emptyPrefs)

    expect(migratedPrefs.accountAutoRefresh).toEqual(
      DEFAULT_ACCOUNT_AUTO_REFRESH
    )
  })

  it("does not migrate if already using new structure", () => {
    const newPrefs = {
      accountAutoRefresh: {
        enabled: false,
        interval: 361,
        minInterval: 61,
        refreshOnOpen: false
      },
      preferencesVersion: 3
    } as UserPreferences

    const migratedPrefs = migrateAutoRefreshConfig(newPrefs)

    expect(migratedPrefs.accountAutoRefresh).toEqual(
      newPrefs.accountAutoRefresh
    )
  })
})
