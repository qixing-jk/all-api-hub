import { expect, it, vi } from "vitest"

import * as content from "~/services/apiService/newApiFamily/accessTokens/content"
import { rememberVerifiedNewApiDashboardSession } from "~/services/apiService/newApiFamily/passwordUi"

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
  expect(promptSignal?.aborted).toBe(false)
  content.cancelNewApiTokenPasskey(location.origin, "owned-request")
  await rejected
  expect(promptSignal?.aborted).toBe(true)
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
