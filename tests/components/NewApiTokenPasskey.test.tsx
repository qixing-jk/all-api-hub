import { expect, it, vi } from "vitest"

import * as content from "~/services/apiService/newApiFamily/accessTokens/content"
import { rememberVerifiedNewApiDashboardSession } from "~/services/apiService/newApiFamily/passwordUi"

it.each([
  ["wrong origin", "https://other.test", "42"],
  ["empty identity", location.origin, ""],
  ["non-string identity", location.origin, 42],
] as const)(
  "does not fetch session data for %s",
  async (_case, origin, identity) => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    await expect(
      content.prepareNewApiTokenSession(origin, identity),
    ).rejects.toThrow("INVALID_TOKEN_CONTEXT")
    expect(fetch).not.toHaveBeenCalled()
  },
)

it.each([
  ["malformed session", { session: {} }, undefined, "AUTH_SESSION_UNAVAILABLE"],
  ["missing identity", { user: {} }, undefined, "AUTH_SESSION_UNAVAILABLE"],
  [
    "wrong self identity",
    {},
    { success: true, data: { id: 99 } },
    "ACCOUNT_IDENTITY_MISMATCH",
  ],
  [
    "missing self identity",
    {},
    { success: true, data: {} },
    "AUTH_SESSION_UNAVAILABLE",
  ],
  [
    "unsuccessful self envelope",
    {},
    { success: false, data: { id: 777 } },
    "AUTH_SESSION_UNAVAILABLE",
  ],
] as const)(
  "refuses a refreshed session with %s",
  async (_case, change, self, error) => {
    const fetch = vi.fn().mockResolvedValueOnce(
      Response.json({
        success: true,
        data: {
          access_token: "test-session",
          token_type: "Bearer",
          access_expires_at: Date.now() / 1000 + 300,
          session: { sid: "fresh", current: true },
          user: { id: 777 },
          ...change,
        },
      }),
    )
    if (self) fetch.mockResolvedValueOnce(Response.json(self))
    vi.stubGlobal("fetch", fetch)
    await expect(
      content.prepareNewApiTokenSession(location.origin, "777"),
    ).rejects.toThrow(error)
    expect(fetch).toHaveBeenCalledTimes(self ? 2 : 1)
  },
)

it.each([
  [404, "SCOPED_TOKEN_UNSUPPORTED"],
  [405, "SCOPED_TOKEN_UNSUPPORTED"],
  [401, "AUTH_SESSION_UNAVAILABLE"],
  [403, "AUTH_SESSION_UNAVAILABLE"],
] as const)(
  "classifies dashboard refresh HTTP %s as %s",
  async (status, code) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      content.prepareNewApiTokenSession(location.origin, "42"),
    ).rejects.toThrow(code)
    expect(fetch).toHaveBeenCalledWith(
      "/api/user/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    )
  },
)

it("distinguishes a self response without a valid session from a different account", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        data: {
          access_token: "site-session",
          token_type: "Bearer",
          access_expires_at: Date.now() / 1000 + 300,
          session: { sid: "site-session-id", current: true },
          user: { id: 42 },
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ success: false }, { status: 403 }))
  vi.stubGlobal("fetch", fetch)
  await expect(
    content.prepareNewApiTokenSession(location.origin, "42"),
  ).rejects.toThrow("AUTH_SESSION_UNAVAILABLE")
})

it("reacquires and checks the same identity when the cached session is rejected", async () => {
  rememberVerifiedNewApiDashboardSession({
    token: "old",
    expiresAt: Date.now() / 1000 + 300,
    sessionId: "old-session",
    user: { id: 42 },
  })
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        data: {
          access_token: "renewed",
          token_type: "Bearer",
          access_expires_at: Date.now() / 1000 + 300,
          session: { sid: "new-session", current: true },
          user: { id: 42 },
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ success: true, data: { id: 42 } }))
  vi.stubGlobal("fetch", fetch)
  expect(
    (await content.prepareNewApiTokenSession(location.origin, "42")).token,
  ).toBe("renewed")
  expect(fetch).toHaveBeenCalledTimes(3)
})

it.each([42, 7])(
  "refreshes a cached session for a different account and checks the returned identity (%s)",
  async (refreshedId) => {
    rememberVerifiedNewApiDashboardSession({
      token: "previous-account",
      expiresAt: Date.now() / 1000 + 300,
      sessionId: "previous-session",
      user: { id: 7 },
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            access_token: "refreshed-account",
            token_type: "Bearer",
            access_expires_at: Date.now() / 1000 + 300,
            session: { sid: "refreshed-session", current: true },
            user: { id: refreshedId },
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, data: { id: 42 } }))
    vi.stubGlobal("fetch", fetch)
    const open = content.prepareNewApiTokenSession(location.origin, "42")
    if (refreshedId === 42) {
      await expect(open).resolves.toMatchObject({ token: "refreshed-account" })
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "/api/user/self",
        expect.objectContaining({
          headers: { Authorization: "Bearer refreshed-account" },
        }),
      )
    } else {
      await expect(open).rejects.toThrow("ACCOUNT_IDENTITY_MISMATCH")
      expect(fetch).toHaveBeenCalledTimes(1)
    }
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/user/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    )
  },
)

it("cancels only the owning Passkey request and releases the native prompt", async () => {
  let promptSignal: AbortSignal | undefined
  vi.stubGlobal("navigator", {
    credentials: {
      get: vi.fn(({ signal }: { signal: AbortSignal }) => {
        promptSignal = signal
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason))
        })
      }),
    },
  })
  const pending = content.requestNewApiTokenPasskey(
    location.origin,
    {
      challenge: "YQ",
    },
    "owned-request",
  )
  const rejected = expect(pending).rejects.toThrow()
  content.cancelNewApiTokenPasskey(location.origin, "other-request")
  content.cancelNewApiTokenPasskey("https://different.test", "owned-request")
  expect(promptSignal?.aborted).toBe(false)
  await expect(
    content.requestNewApiTokenPasskey(
      location.origin,
      { challenge: "YQ" },
      "other-request",
    ),
  ).rejects.toThrow("PASSKEY_REQUEST_BUSY")
  content.cancelNewApiTokenPasskey(location.origin, "owned-request")
  await rejected
  expect(promptSignal?.aborted).toBe(true)
})

it.each([
  ["https://different.test", { challenge: "YQ" }, "owned-request"],
  [location.origin, null, "owned-request"],
  [location.origin, "YQ", "owned-request"],
  [location.origin, {}, 5],
  [location.origin, {}, ""],
] as const)(
  "rejects a Passkey request with invalid context (%s, %s, %s)",
  async (origin, options, requestId) => {
    const prompt = vi.fn()
    vi.stubGlobal("navigator", { credentials: { get: prompt } })
    await expect(
      content.requestNewApiTokenPasskey(origin, options, requestId),
    ).rejects.toThrow("INVALID_PASSKEY_CONTEXT")
    expect(prompt).not.toHaveBeenCalled()
  },
)

it("decodes the site's binary options and encodes the browser's Passkey assertion", async () => {
  const bytes = (...values: number[]) => Uint8Array.from(values).buffer
  const prompt = vi.fn().mockResolvedValue({
    id: "test-passkey",
    rawId: bytes(251, 255),
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: bytes(97),
      authenticatorData: bytes(98),
      signature: bytes(99),
      userHandle: null,
    },
    getClientExtensionResults: () => ({ appid: false }),
  })
  vi.stubGlobal("navigator", { credentials: { get: prompt } })
  const result = await content.requestNewApiTokenPasskey(
    location.origin,
    {
      publicKey: {
        challenge: "-_8",
        allowCredentials: [{ type: "public-key", id: "Yg" }],
        rpId: location.hostname,
      },
    },
    "assertion",
  )
  expect(prompt).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      publicKey: {
        challenge: new Uint8Array([251, 255]),
        allowCredentials: [{ type: "public-key", id: new Uint8Array([98]) }],
        rpId: location.hostname,
      },
    }),
  )
  expect(result).toEqual({
    id: "test-passkey",
    rawId: "-_8",
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: "YQ",
      authenticatorData: "Yg",
      signature: "Yw",
      userHandle: null,
    },
    clientExtensionResults: { appid: false },
  })
})

it("reports a dismissed native Passkey prompt without a credential", async () => {
  vi.stubGlobal("navigator", {
    credentials: {
      get: vi
        .fn()
        .mockRejectedValue(new DOMException("Dismissed", "NotAllowedError")),
    },
  })
  await expect(
    content.requestNewApiTokenPasskey(
      location.origin,
      { challenge: "YQ" },
      "dismissed",
    ),
  ).resolves.toBeNull()
})
