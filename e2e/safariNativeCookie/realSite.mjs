import assert from "node:assert/strict"
import { request } from "@playwright/test"
import * as OTPAuth from "otpauth"

import { loadLocalEnv } from "../../scripts/utils/local-env.mjs"

/**
 * HTTP-only credential bootstrap. Native proof is performed later in Safari.
 * Keep passwords, cookies, IDs and response bodies in memory, out of artifacts.
 */
export async function prepareRealSite() {
  loadLocalEnv({ envFile: process.env.AAH_SAFARI_REAL_ENV_FILE })
  const accounts = []
  for (const [kind, siteType] of [
    ["DONE_HUB", "done-hub"],
    ["VELOERA", "veloera"],
  ]) {
    const prefix = "AAH_E2E_" + kind
    const baseUrl = process.env[prefix + "_BASE_URL"]
    assert(
      baseUrl && new URL(baseUrl).protocol === "https:",
      "HTTPS fixture required",
    )
    const api = await request.newContext({
      baseURL: baseUrl,
      ignoreHTTPSErrors: false,
    })
    try {
      let response = await api.post("/api/user/login", {
        data: {
          username: process.env[prefix + "_USERNAME"],
          password: process.env[prefix + "_PASSWORD"],
        },
      })
      let payload = await response.json()
      if (payload.data?.require_2fa) {
        const secret = process.env[prefix + "_TOTP_SECRET"]
        assert(secret, "Fixture needs configured second factor")
        const totp = new OTPAuth.TOTP({
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(secret.trim().replace(/\s+/g, "")),
        })
        response = await api.post("/api/user/login/2fa", {
          data: { code: totp.generate() },
        })
        payload = await response.json()
      }
      assert(
        response.ok() && payload.success && payload.data?.id,
        "Fixture login failed",
      )
      const id = String(payload.data.id)
      const self = await api.get("/api/user/self", {
        headers: { "New-Api-User": id, "Veloera-User": id, "User-Id": id },
      })
      const selfData = await self.json()
      assert(
        self.ok() && selfData.success && String(selfData.data?.id) === id,
        "Fixture session verification failed",
      )
      const state = await api.storageState()
      const target = new URL("/api/user/self", baseUrl)
      const cookie = state.cookies
        .filter(
          (c) =>
            (target.hostname === c.domain.replace(/^\./, "") ||
              (c.domain.startsWith(".") &&
                target.hostname.endsWith(c.domain))) &&
            target.pathname.startsWith(c.path),
        )
        .map((c) => `${c.name}=${c.value}`)
        .join("; ")
      assert(cookie, "Fixture session cookie missing")
      accounts.push({ id, cookie, baseUrl, siteType })
    } finally {
      await api.dispose()
    }
  }
  assert(
    accounts[0].baseUrl !== accounts[1].baseUrl ||
      accounts[0].id !== accounts[1].id,
    "Two distinct fixture identities required",
  )
  assert(
    accounts[0].cookie !== accounts[1].cookie,
    "Two distinct sessions required",
  )
  return { accounts }
}
