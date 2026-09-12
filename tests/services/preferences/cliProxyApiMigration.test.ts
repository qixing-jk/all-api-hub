import { describe, expect, it } from "vitest"

import { migratePreferences } from "~/services/preferences/migrations/preferencesMigration"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

describe("CLIProxyAPI preferences migration", () => {
  it("keeps a configured user's URL and key usable without re-entry", () => {
    const result = migratePreferences({
      ...DEFAULT_PREFERENCES,
      preferencesVersion: 27,
      cliProxy: {
        baseUrl: "http://localhost:8317/v0/management",
        managementKey: "saved-secret",
      },
    })
    expect(result.cliProxyApi).toEqual({
      baseUrl: "http://localhost:8317/v0/management",
      adminToken: "saved-secret",
    })
    expect(result.cliProxy).toBeUndefined()
    expect(migratePreferences(result)).toEqual(result)
  })

  it("does not mix old credentials into a new or partially configured deployment", () => {
    const result = migratePreferences({
      ...DEFAULT_PREFERENCES,
      preferencesVersion: 27,
      cliProxy: { baseUrl: "http://old.example", managementKey: "old-secret" },
      cliProxyApi: { baseUrl: "http://new.example", adminToken: "" },
    })
    expect(result.cliProxyApi).toEqual({
      baseUrl: "http://new.example",
      adminToken: "",
    })
  })

  it.each([
    { baseUrl: "http://new.example", adminToken: "" },
    { baseUrl: "", adminToken: "new-key" },
  ])("keeps a partially configured destination: %j", (config) => {
    const result = migratePreferences({
      ...DEFAULT_PREFERENCES,
      preferencesVersion: 27,
      cliProxy: {
        baseUrl: "http://old.example",
        managementKey: "old-key",
      },
      cliProxyApi: config,
    })

    expect(result.cliProxyApi).toEqual(config)
    expect(result.cliProxy).toBeUndefined()
  })
})
