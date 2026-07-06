import assert from "node:assert/strict"
import test from "node:test"

import {
  ConfigStore,
  findProfileForRecord,
  normalizeConfigState,
} from "../src/configStore.js"

test("keeps a direct-login session only in memory for the matching target", () => {
  const store = new ConfigStore()
  const session = {
    targetUrl: "https://new-api.example.com",
    userId: "8",
    username: "admin",
    sessionCookie: "session=opaque-value",
  }

  store.saveSession(session)

  assert.deepEqual(
    store.readSession(session.targetUrl, session.userId),
    session,
  )
  assert.equal(store.readSession("https://other.example.com", "8"), null)
  store.clearSession()
  assert.equal(store.readSession(session.targetUrl, session.userId), null)
})

test("uses a desktop token store for cross-platform encrypted persistence", async () => {
  const encryptedValues = new Map()
  const tokenStore = {
    async save(account, token) {
      encryptedValues.set(account, `encrypted:${token}`)
    },
    async read(account) {
      return encryptedValues.get(account)?.replace("encrypted:", "") || ""
    },
  }
  const writer = new ConfigStore()
  writer.setTokenStore(tokenStore)
  await writer.saveToken("site#1", "admin-token", true)

  const reader = new ConfigStore()
  reader.setTokenStore(tokenStore)
  assert.equal(await reader.readToken("site#1", true), "admin-token")
})

test("migrates the previous single New API configuration to a profile", () => {
  const state = normalizeConfigState({
    targetUrl: "https://new-api.example.com",
    userId: "8",
    rememberToken: true,
    allowInsecureHttp: false,
  })

  assert.equal(state.profiles.length, 1)
  assert.equal(state.activeProfileId, state.profiles[0].profileId)
  assert.equal(state.profiles[0].nameSource, "host")
  assert.deepEqual(
    {
      name: state.profiles[0].name,
      targetUrl: state.profiles[0].targetUrl,
      userId: state.profiles[0].userId,
    },
    {
      name: "new-api.example.com",
      targetUrl: "https://new-api.example.com",
      userId: "8",
    },
  )
})

test("rebinds a legacy import record by its New API target", () => {
  const profiles = [
    {
      profileId: "old-profile",
      targetUrl: "https://old.example.com",
    },
    {
      profileId: "current-profile",
      targetUrl: "http://47.77.237.243:3000",
    },
  ]

  assert.equal(
    findProfileForRecord(
      {
        profileId: "old-profile",
        targetUrl: "http://47.77.237.243:3000",
      },
      profiles,
    )?.profileId,
    "current-profile",
  )
})

test("keeps multiple New API profiles and repairs a missing active id", () => {
  const state = normalizeConfigState({
    activeProfileId: "missing",
    profiles: [
      {
        profileId: "primary",
        name: "主站",
        targetUrl: "https://primary.example.com",
        userId: "1",
      },
      {
        profileId: "backup",
        name: "备用站",
        targetUrl: "https://backup.example.com",
        userId: "2",
      },
    ],
  })

  assert.equal(state.activeProfileId, "primary")
  assert.equal(state.profiles[0].nameSource, "custom")
  assert.deepEqual(
    state.profiles.map(({ profileId, name }) => ({ profileId, name })),
    [
      { profileId: "primary", name: "主站" },
      { profileId: "backup", name: "备用站" },
    ],
  )
})
