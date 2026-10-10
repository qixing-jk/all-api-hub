import { afterEach, expect, it, vi } from "vitest"

import {
  patchMagpieBrowserState,
  restoreMagpieBrowserState,
} from "~~/scripts/suites/magpie/state.mjs"

afterEach(() => vi.unstubAllGlobals())

it("restores only test-owned preference fields and credentials, preserving concurrent edits", async () => {
  const values: Record<string, string> = {
    user_preferences: JSON.stringify({
      managedSiteType: "new-api",
      magpie: { baseUrl: "old", webKey: "old-key" },
      openChangelogOnUpdate: true,
      managedSiteModelSync: { enabled: true, interval: 123 },
      autoCheckin: { globalEnabled: true },
    }),
    api_credential_profiles: JSON.stringify({
      profiles: [{ id: "original", name: "Original" }],
      links: [],
    }),
  }
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [
              key,
              values[key],
            ]),
          ),
        set: async (next: Record<string, unknown>) =>
          Object.assign(values, next),
        remove: async (key: string) => {
          delete values[key]
        },
      },
    },
  })
  vi.stubGlobal("navigator", {
    locks: { request: async (_name: string, run: () => unknown) => run() },
  })
  const config = { baseUrl: "http://localhost:1234", webKey: "test-key" }
  const snapshot = await patchMagpieBrowserState(config)
  const prefs = JSON.parse(values.user_preferences!)
  prefs.magpie.baseUrl = "concurrent-url"
  prefs.managedSiteModelSync.interval = 456
  prefs.unrelated = "retained"
  values.user_preferences = JSON.stringify(prefs)
  values.api_credential_profiles = JSON.stringify({
    profiles: [
      { id: "original", name: "Original" },
      { id: "run", name: "Exact run name" },
      { id: "concurrent", name: "Other run" },
    ],
    links: [],
  })
  await restoreMagpieBrowserState({
    snapshot,
    config,
    invalidKey: "bad",
    credentialNames: ["Exact run name"],
    credentialIds: [],
    resourceIds: [],
  })
  expect(JSON.parse(values.user_preferences!)).toMatchObject({
    managedSiteType: "new-api",
    magpie: { baseUrl: "concurrent-url", webKey: "old-key" },
    managedSiteModelSync: { enabled: true, interval: 456 },
    unrelated: "retained",
  })
  expect(
    JSON.parse(values.api_credential_profiles!).profiles.map(
      (p: { id: string }) => p.id,
    ),
  ).toEqual(["original", "concurrent"])
})
