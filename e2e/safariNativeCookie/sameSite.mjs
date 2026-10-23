import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import { request } from "@playwright/test"

import { loadLocalEnv } from "../../scripts/utils/local-env.mjs"

/** Create only run-owned, ordinary users; never delete an existing account. */
export async function prepareSameSite() {
  loadLocalEnv({ envFile: process.env.AAH_SAFARI_REAL_ENV_FILE })
  const baseUrl = process.env.AAH_E2E_DONE_HUB_BASE_URL
  assert(baseUrl && new URL(baseUrl).protocol === "https:")
  const admin = await request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: {
      Authorization: "Bearer " + process.env.AAH_E2E_DONE_HUB_ADMIN_TOKEN,
      "User-Id": process.env.AAH_E2E_DONE_HUB_ADMIN_USER_ID,
    },
  })
  const owned = []
  const accounts = []
  const journal = ".scratch/safari-native-cookie/owned-real-users.json"
  assert(
    !fs.existsSync(journal),
    "Resolve previous owned fixture cleanup first",
  )
  const save = () =>
    fs.writeFileSync(journal, JSON.stringify(owned), { mode: 0o600 })
  const cleanup = async () => {
    for (const user of owned) {
      if (!user.id) {
        const result = await (
          await admin.get("/api/user/", {
            params: { keyword: user.username, page: 1, size: 1000 },
          })
        ).json()
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
      const before = await admin.get(`/api/user/${user.id}`)
      const body = await before.json()
      if (!body.success) continue
      assert(
        body.data?.username === user.username && body.data.role < 10,
        "Owned fixture deletion scope mismatch",
      )
      await admin.delete(`/api/user/${user.id}`)
      const after = await admin.get(`/api/user/${user.id}`)
      assert(
        after.status() === 404 || !(await after.json()).success,
        "Owned fixture deletion not confirmed",
      )
    }
    fs.unlinkSync(journal)
    await admin.dispose()
  }
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
    if (owned.length) await cleanup()
    else await admin.dispose()
    throw error
  }
}
