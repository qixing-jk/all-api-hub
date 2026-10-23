import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import { request } from "@playwright/test"

import { loadLocalEnv } from "../../scripts/utils/local-env.mjs"

/** Done Hub exposes GORM's exact not-found error as an HTTP 200 API failure. */
async function lookupOwnedFixture(admin, id) {
  const response = await admin.get(`/api/user/${id}`)
  if (response.status() === 404) return null
  assert(response.ok(), "Owned fixture lookup not confirmed")
  const body = await response.json()
  // GetUser: https://github.com/deanxv/done-hub/blob/cf6805e94582f40fc1f7e4e1413cb403385b65b6/controller/user.go#L358-L387
  if (body.success === false && body.message === "record not found") return null
  assert(body.success === true, "Owned fixture lookup not confirmed")
  assert(body.data?.id === id, "Owned fixture lookup not confirmed")
  return body.data
}

/** Delete only owned fixture users and retain recovery data until confirmed. */
export async function cleanupOwnedFixtureUsers({
  admin,
  owned,
  journal,
  save,
}) {
  try {
    for (const user of owned) {
      if (!user.id) {
        const response = await admin.get("/api/user/", {
          params: { keyword: user.username, page: 1, size: 1000 },
        })
        assert(response.ok(), "Owned fixture lookup not confirmed")
        const result = await response.json()
        assert(result.success === true, "Owned fixture lookup not confirmed")
        const rows = Array.isArray(result.data)
          ? result.data
          : result.data?.items ?? result.data?.data
        const matches = Array.isArray(rows)
          ? rows.filter((r) => r.username === user.username && r.role < 10)
          : []
        assert(matches.length === 1, "Owned fixture identity needs recovery")
        user.id = matches[0].id
        save()
      }
      const userRecord = await lookupOwnedFixture(admin, user.id)
      if (userRecord === null) continue
      assert(
        userRecord.username === user.username && userRecord.role < 10,
        "Owned fixture deletion scope mismatch",
      )
      await admin.delete(`/api/user/${user.id}`)
      assert(
        (await lookupOwnedFixture(admin, user.id)) === null,
        "Owned fixture deletion not confirmed",
      )
    }
    fs.unlinkSync(journal)
  } finally {
    await admin.dispose()
  }
}

/** Create only run-owned, ordinary users; never delete an existing account. */
export async function prepareSameSite({
  journal = ".scratch/safari-native-cookie/owned-real-users.json",
} = {}) {
  loadLocalEnv({ envFile: process.env.AAH_SAFARI_REAL_ENV_FILE })
  const baseUrl = process.env.AAH_E2E_DONE_HUB_BASE_URL
  assert(baseUrl && new URL(baseUrl).protocol === "https:")
  assert(
    !fs.existsSync(journal),
    "Resolve previous owned fixture cleanup first",
  )
  const admin = await request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: {
      Authorization: "Bearer " + process.env.AAH_E2E_DONE_HUB_ADMIN_TOKEN,
      "User-Id": process.env.AAH_E2E_DONE_HUB_ADMIN_USER_ID,
    },
  })
  const owned = []
  const accounts = []
  const save = () =>
    fs.writeFileSync(journal, JSON.stringify(owned), { mode: 0o600 })
  const cleanup = () =>
    cleanupOwnedFixtureUsers({ admin, owned, journal, save })
  try {
    const self = await (await admin.get("/api/user/self")).json()
    assert(self.success && self.data?.role >= 10, "Fixture admin unavailable")
    const nonce = randomBytes(3).toString("hex")
    for (const label of ["a", "b", "c"]) {
      const username = "sf" + nonce + label
      const password = randomBytes(15).toString("base64url")
      const result = await admin.post("/api/user/", {
        data: {
          username,
          password,
          display_name: username,
          role: 1,
        },
      })
      assert(
        result.ok() && (await result.json()).success,
        "Fixture creation failed",
      )
      const user = { username, id: null }
      owned.push(user)
      save()
      const api = await request.newContext({ baseURL: baseUrl })
      try {
        const login = await (
          await api.post("/api/user/login", { data: { username, password } })
        ).json()
        assert(login.success && login.data?.id, "Owned fixture login failed")
        user.id = login.data.id
        save()
        const state = await api.storageState()
        const cookie = state.cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ")
        assert(cookie, "Owned fixture cookie missing")
        const check = await (await api.get("/api/user/self")).json()
        assert(
          check.success && check.data?.id === user.id,
          "Owned fixture verification failed",
        )
        accounts.push({
          baseUrl,
          siteType: "done-hub",
          id: String(user.id),
          cookie,
        })
        if (label === "c") accounts[2].browserLogin = { username, password }
      } finally {
        await api.dispose()
      }
    }
    return { accounts, cleanup }
  } catch (error) {
    try {
      if (owned.length) await cleanup()
      else await admin.dispose()
    } catch (cleanupError) {
      // Retain diagnostics in memory; the CLI reports only a classified error.
      throw new AggregateError(
        [error, cleanupError],
        "Fixture preparation and cleanup failed",
        { cause: error },
      )
    }
    throw error
  }
}
