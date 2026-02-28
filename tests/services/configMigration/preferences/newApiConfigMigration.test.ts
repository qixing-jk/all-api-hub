import { describe, expect, it } from "vitest"

import { migrateNewApiConfig } from "~/services/preferences/migrations/newApiConfigMigration"
import type { UserPreferences } from "~/services/preferences/userPreferences"

describe("newApiConfigMigration", () => {
  it("migrates flat new-api fields to nested structure", () => {
    const oldPrefs = {
      newApiBaseUrl: "https://api.example.com",
      newApiAdminToken: "admin-token-123",
      newApiUserId: "user-456",
      preferencesVersion: 4,
    } as UserPreferences

    const migratedPrefs = migrateNewApiConfig(oldPrefs)

    expect(migratedPrefs.newApi).toEqual({
      baseUrl: oldPrefs.newApiBaseUrl,
      adminToken: oldPrefs.newApiAdminToken,
      userId: oldPrefs.newApiUserId,
    })

    // Old fields removed
    expect(migratedPrefs).not.toHaveProperty("newApiBaseUrl")
    expect(migratedPrefs).not.toHaveProperty("newApiAdminToken")
    expect(migratedPrefs).not.toHaveProperty("newApiUserId")
  })

  it("uses empty strings when flat fields are missing", () => {
    const emptyPrefs = { preferencesVersion: 4 } as UserPreferences
    const migratedPrefs = migrateNewApiConfig(emptyPrefs)

    expect(migratedPrefs.newApi).toEqual({
      baseUrl: "",
      adminToken: "",
      userId: "",
    })
  })

  it("does not migrate if already using new structure", () => {
    const newPrefs = {
      newApi: {
        baseUrl: "https://api.example.com",
        adminToken: "admin-token-123",
        userId: "user-456",
      },
      preferencesVersion: 4,
    } as UserPreferences

    const migratedPrefs = migrateNewApiConfig(newPrefs)

    expect(migratedPrefs.newApi).toEqual(newPrefs.newApi)
    expect(migratedPrefs).not.toHaveProperty("newApiBaseUrl")
  })

  it("handles partial old fields", () => {
    const partialPrefs = {
      newApiBaseUrl: "https://api.example.com",
      newApiAdminToken: "admin-token-123",
      preferencesVersion: 4,
    } as UserPreferences

    const migratedPrefs = migrateNewApiConfig(partialPrefs)

    expect(migratedPrefs.newApi).toEqual({
      baseUrl: "https://api.example.com",
      adminToken: "admin-token-123",
      userId: "",
    })
  })
})
