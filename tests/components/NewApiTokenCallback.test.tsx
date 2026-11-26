import { expect, it, vi } from "vitest"

import {
  captureTokenOAuthCallback,
  NEW_API_TOKEN_OAUTH_MARKER,
} from "~/services/apiService/newApiFamily/accessTokens/callback"

it("leaves a site's callback untouched when its verification marker is malformed", () => {
  history.replaceState(null, "", "/oauth/github?code=site-code&state=state")
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
    }),
  )
  const send = vi
    .spyOn(browser.runtime, "sendMessage")
    .mockResolvedValue(undefined)
  captureTokenOAuthCallback()
  expect(location.search).toBe("?code=site-code&state=state")
  expect(send).not.toHaveBeenCalled()
  sessionStorage.clear()
})

it.each([
  ["invalid JSON", "{"],
  ["empty request ID", { requestId: "" }],
  ["unknown provider path", { provider: "github/callback" }],
  ["missing state", { state: "" }],
  ["different origin", { origin: "https://other.example" }],
  ["non-finite deadline", { expiresAt: "infinite" }],
  ["expired deadline", { expiresAt: 1 }],
] as const)("leaves a callback untouched for %s", (_case, change) => {
  const search = "?code=site-code&state=state"
  history.replaceState(null, "", `/oauth/github${search}`)
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    typeof change === "string"
      ? change
      : JSON.stringify({
          requestId: "request",
          provider: "github",
          state: "state",
          origin: location.origin,
          expiresAt: Date.now() + 300_000,
          ...change,
        }),
  )
  const send = vi.spyOn(browser.runtime, "sendMessage")
  captureTokenOAuthCallback()
  expect(location.search).toBe(search)
  expect(send).not.toHaveBeenCalled()
})

it("captures an owned callback once and removes its code before the site's UI can consume it", () => {
  history.replaceState(null, "", "/oauth/github?code=one-use&state=state")
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
      expiresAt: Date.now() + 300000,
    }),
  )
  const send = vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue(true)
  captureTokenOAuthCallback()
  captureTokenOAuthCallback()
  expect(location.search).toBe("")
  expect(send).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledWith({
    action: "newApiTokenOAuthCallback",
    requestId: "request",
    callback: { state: "state", code: "one-use" },
  })
})

it.each(["code=site-code", "error=access_denied"])(
  "leaves another OAuth flow alone when it returns %s",
  (result) => {
    const search = `?${result}&state=other-state`
    history.replaceState(null, "", `/oauth/github${search}`)
    const marker = JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
      expiresAt: Date.now() + 300000,
    })
    sessionStorage.setItem(NEW_API_TOKEN_OAUTH_MARKER, marker)
    const send = vi.spyOn(browser.runtime, "sendMessage")
    captureTokenOAuthCallback()
    expect(location.search).toBe(search)
    expect(sessionStorage.getItem(NEW_API_TOKEN_OAUTH_MARKER)).toBe(marker)
    expect(send).not.toHaveBeenCalled()
  },
)

it("reports an OAuth denial for the owned state as cancellation", () => {
  history.replaceState(
    null,
    "",
    "/oauth/github?error=access_denied&state=state",
  )
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
      expiresAt: Date.now() + 300000,
    }),
  )
  const send = vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue(true)
  captureTokenOAuthCallback()
  expect(send).toHaveBeenCalledWith({
    action: "newApiTokenOAuthCallback",
    requestId: "request",
    error: "OAUTH_CANCELLED",
  })
})

it("reports a missing response code only for the owned callback", () => {
  history.replaceState(null, "", "/oauth/github?state=state")
  sessionStorage.setItem(
    NEW_API_TOKEN_OAUTH_MARKER,
    JSON.stringify({
      requestId: "request",
      origin: location.origin,
      provider: "github",
      state: "state",
      expiresAt: Date.now() + 300_000,
    }),
  )
  const send = vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue(true)
  captureTokenOAuthCallback()
  expect(location.search).toBe("")
  expect(send).toHaveBeenCalledExactlyOnceWith({
    action: "newApiTokenOAuthCallback",
    requestId: "request",
    error: true,
  })
})

it("keeps the callback off the page URL while retrying delivery to its owner", async () => {
  vi.useFakeTimers()
  try {
    history.replaceState(null, "", "/oauth/github?code=once&state=state")
    sessionStorage.setItem(
      NEW_API_TOKEN_OAUTH_MARKER,
      JSON.stringify({
        requestId: "request",
        origin: location.origin,
        provider: "github",
        state: "state",
        expiresAt: Date.now() + 10_000,
      }),
    )
    const send = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockRejectedValueOnce(new Error("Temporary delivery failure"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(true)
    captureTokenOAuthCallback()
    expect(location.search).toBe("")
    await vi.advanceTimersByTimeAsync(5000)
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenLastCalledWith({
      action: "newApiTokenOAuthCallback",
      requestId: "request",
      callback: { state: "state", code: "once" },
    })
  } finally {
    vi.useRealTimers()
  }
})
