// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://gateway.example/login"}
import {
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  webcrypto,
} from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  handleClearNewApiPasswordLogin,
  handleNewApiPasswordLogin,
} from "~/services/apiService/newApiFamily/passwordLogin"
import { SUB2API_AUTH_STORAGE_KEYS } from "~/services/apiService/sub2api/auth/browserSession"
import {
  handleClearSub2ApiPasswordLogin,
  handleSub2ApiPasswordLogin,
} from "~/services/apiService/sub2api/auth/passwordLogin"

const fetchMock = vi.fn<typeof fetch>()
const request = {
  origin: "https://gateway.example",
  requestId: "password-1",
  expectedIdentity: "17",
  credentials: { username: "alice", password: " secret " },
}

function invoke(details = {}) {
  return new Promise((resolve) => {
    handleNewApiPasswordLogin({ ...request, ...details }, resolve)
  })
}

describe("password login content protocol", () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("logs in to legacy New API and verifies the server identity before publishing a browser session", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: {} }))
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: { id: 17, username: "alice", checked_in: true },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: { id: 17 } }),
    )

    await expect(invoke()).resolves.toEqual({
      status: "authenticated",
      identity: "17",
      evidence: { checkedIn: true },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/user/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "alice", password: " secret " }),
        credentials: "include",
        redirect: "error",
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/user/self",
      expect.objectContaining({
        headers: expect.objectContaining({ "New-Api-User": "17" }),
      }),
    )
    expect(JSON.parse(localStorage.getItem("user")!)).toMatchObject({ id: 17 })
  })

  it.each([
    [{ password_login_enabled: false }, "unsupported"],
    [{ turnstile_check: true }, "interaction_required"],
  ])(
    "does not submit credentials when public settings require %s",
    async (settings, outcome) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ success: true, data: settings }),
      )
      await expect(invoke()).resolves.toEqual({ status: outcome })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it("reports 2FA as interaction required without accepting the partial login", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: {} }))
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: { require_2fa: true, flow_token: "secret-flow" },
      }),
    )
    await expect(invoke()).resolves.toEqual({ status: "interaction_required" })
    expect(localStorage.getItem("user")).toBeNull()
  })

  it("verifies a modern New API AuthBundle using its bearer without persisting or returning it", async () => {
    const bundle = {
      access_token: "session-secret",
      token_type: "Bearer",
      access_expires_at: Date.now() / 1000 + 600,
      session: { sid: "sid-1", current: true },
      user: { id: 17 },
    }
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: {} }))
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: bundle }),
    )
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, data: { id: 17 } }),
    )
    await expect(invoke()).resolves.toEqual({
      status: "authenticated",
      identity: "17",
    })
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/user/self",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-secret",
        }),
      }),
    )
    expect(localStorage.length).toBe(0)
  })

  it("logs in to Sub2API using email and commits a verified website token pair without exporting it", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 0, data: {} }))
    fetchMock.mockResolvedValueOnce(
      Response.json({
        code: 0,
        data: {
          access_token: "access-secret",
          refresh_token: "refresh-secret",
          expires_in: 600,
          token_type: "Bearer",
          user: { id: 17 },
        },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 0, data: { id: 17 } }),
    )
    const result = await new Promise((resolve) =>
      handleSub2ApiPasswordLogin(request, resolve),
    )
    expect(result).toEqual({ status: "authenticated", identity: "17" })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/login",
      expect.objectContaining({
        body: JSON.stringify({ email: "alice", password: " secret " }),
      }),
    )
    expect(localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)).toBe(
      "access-secret",
    )
    expect(localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken)).toBe(
      "refresh-secret",
    )
    expect(
      Number(localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt)),
    ).toBeGreaterThan(Date.now())
  })

  it.each([
    "turnstile_enabled",
    "tencent_captcha_enabled",
    "aliyun_captcha_enabled",
  ])(
    "requires interaction for Sub2API %s without submitting a password",
    async (flag) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({ code: 0, data: { [flag]: true } }),
      )
      await expect(
        new Promise((resolve) => handleSub2ApiPasswordLogin(request, resolve)),
      ).resolves.toEqual({ status: "interaction_required" })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it("does not fall back to plaintext when New API requires password encryption", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: { password_login_encryption_enabled: true },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: { kid: "broken", public_key: "invalid" },
      }),
    )
    await expect(invoke()).resolves.toEqual({ status: "failed" })
    expect(
      fetchMock.mock.calls.some(([path]) => path === "/api/user/login"),
    ).toBe(false)
  })

  it.each([" secret ", "长密码".repeat(100)])(
    "uses New API's encrypted password wire format with exact UTF-8 plaintext %#",
    async (password) => {
      vi.stubGlobal("crypto", webcrypto)
      const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
      fetchMock.mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { password_login_encryption_enabled: true },
        }),
      )
      fetchMock.mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            kid: "key-1",
            public_key: keys.publicKey.export({ type: "spki", format: "pem" }),
          },
        }),
      )
      fetchMock.mockResolvedValueOnce(
        Response.json({ success: true, data: { id: 17 } }),
      )
      fetchMock.mockResolvedValueOnce(
        Response.json({ success: true, data: { id: 17 } }),
      )
      await expect(
        invoke({ credentials: { username: "alice", password } }),
      ).resolves.toMatchObject({ status: "authenticated" })
      const body = JSON.parse(fetchMock.mock.calls[2]![1]!.body as string)
      expect(body).not.toHaveProperty("password")
      expect(body.encryption_key_id).toBe("key-1")
      const encrypted = body.password_encrypted as string
      let plaintext: Buffer
      if (encrypted.startsWith("v2.")) {
        const [, wrapped, nonce, ciphertext] = encrypted.split(".")
        const secret = privateDecrypt(
          {
            key: keys.privateKey,
            oaepHash: "sha256",
            oaepLabel: Buffer.from("password-v2"),
          },
          Buffer.from(wrapped!, "base64"),
        )
        const bytes = Buffer.from(ciphertext!, "base64")
        const decipher = createDecipheriv(
          "aes-256-gcm",
          secret,
          Buffer.from(nonce!, "base64"),
        )
        decipher.setAAD(Buffer.from("password-v2:key-1"))
        decipher.setAuthTag(bytes.subarray(-16))
        plaintext = Buffer.concat([
          decipher.update(bytes.subarray(0, -16)),
          decipher.final(),
        ])
      } else
        plaintext = privateDecrypt(
          { key: keys.privateKey, oaepHash: "sha256" },
          Buffer.from(encrypted, "base64"),
        )
      expect(plaintext.toString("utf8")).toBe(password)
    },
  )

  it("revokes only the observed modern session when a login belongs to the wrong saved identity", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: {} }))
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        data: {
          access_token: "wrong-token",
          token_type: "Bearer",
          access_expires_at: Date.now() / 1000 + 600,
          session: { sid: "wrong-sid", current: true },
          user: { id: 18 },
        },
      }),
    )
    await expect(invoke()).resolves.toEqual({ status: "identity_mismatch" })
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }))
    await new Promise((resolve) =>
      handleClearNewApiPasswordLogin(request, resolve),
    )
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/user/auth/logout",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Auth-Session": "wrong-sid" }),
      }),
    )
  })

  it("does not overwrite a newer Sub2API browser session while verification is in flight", async () => {
    localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.accessToken, "old-token")
    fetchMock.mockResolvedValueOnce(Response.json({ code: 0, data: {} }))
    fetchMock.mockResolvedValueOnce(
      Response.json({
        code: 0,
        data: {
          access_token: "owned-token",
          refresh_token: "owned-refresh",
          user: { id: 17 },
        },
      }),
    )
    fetchMock.mockImplementationOnce(async () => {
      localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.accessToken, "newer-token")
      return Response.json({ code: 0, data: { id: 17 } })
    })
    await expect(
      new Promise((resolve) => handleSub2ApiPasswordLogin(request, resolve)),
    ).resolves.toEqual({ status: "interaction_required" })
    fetchMock.mockResolvedValueOnce(Response.json({ code: 0 }))
    await new Promise((resolve) =>
      handleClearSub2ApiPasswordLogin(request, resolve),
    )
    expect(localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)).toBe(
      "newer-token",
    )
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: "owned-refresh" }),
      }),
    )
  })

  it.each([handleNewApiPasswordLogin, handleSub2ApiPasswordLogin])(
    "rejects cross-origin credential submission and returns no raw error or secrets",
    async (handler) => {
      await expect(
        new Promise((resolve) =>
          handler({ ...request, origin: "https://other.example" }, resolve),
        ),
      ).resolves.toEqual({ status: "failed" })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it("reports a lost login response as uncertain without replaying the password or trying OAuth", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: {} }))
    fetchMock.mockRejectedValueOnce(
      new Error("password=secret; upstream failure"),
    )
    await expect(invoke()).resolves.toEqual({ status: "uncertain" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(["new-api", "sub2api"] as const)(
    "preserves uncertainty when %s login succeeded but identity readback was lost",
    async (kind) => {
      const sub2 = kind === "sub2api"
      fetchMock.mockResolvedValueOnce(
        Response.json(
          sub2 ? { code: 0, data: {} } : { success: true, data: {} },
        ),
      )
      fetchMock.mockResolvedValueOnce(
        Response.json(
          sub2
            ? {
                code: 0,
                data: {
                  user: { id: 17 },
                  access_token: "issued-token",
                  refresh_token: "issued-refresh",
                },
              }
            : { success: true, data: { id: 17 } },
        ),
      )
      fetchMock.mockRejectedValueOnce(new Error("secret readback error"))
      await expect(
        new Promise((resolve) =>
          (sub2 ? handleSub2ApiPasswordLogin : handleNewApiPasswordLogin)(
            request,
            resolve,
          ),
        ),
      ).resolves.toEqual({ status: "uncertain" })
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(localStorage.length).toBe(0)
    },
  )
})
